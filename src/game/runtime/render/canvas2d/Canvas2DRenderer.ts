// src/game/runtime/render/canvas2d/Canvas2DRenderer.ts
//
// Canvas2D implementation of the Renderer interface (Renderer.ts) for
// Circle TD. Drawing only: every value drawn here is read off a
// RenderSnapshot (per-frame truth) or off the title's static content
// module (@/game/titles/circle-td/content — track/tile geometry and tower
// definitions, none of which change at runtime). Nothing in this file
// mutates simulation state.
//
// This is outside the sim purity guard (src/game/sim/purity.test.ts only
// walks src/game/sim and src/game/titles/circle-td), so canvas/DOM APIs,
// Math.sin/cos, and plain floating point are all fair game here.
//
// Visual correctness (does it actually look right) is smoke-tested in a
// real browser in Task 9 — jsdom's canvas is a stub that records almost
// nothing meaningful to assert on. This file keeps the one pure,
// unit-testable behaviour (creep interpolation) delegated to
// `interpolateById` in ../Renderer.ts.
//
// 2026-09-19 visual polish pass (draw-only, no sim/gameplay change): the
// original cut read as "just shapes" on a flat void — this pass adds a
// lit-stage backdrop (cached gradients + a faint grid + vignette), a
// clearly-readable track lane with a brighter edge, filled/bordered build
// tiles, per-type tower tinting + glow + level pips, shape-coded glowing
// creeps with a danger-blending HP bar, and snappier hit bursts. The
// brand rule (see the PR/task brief) is ONE accent hue for the player
// side and ONE blue hue for the enemy side, no third "status" color — so
// all the new "distinct but on-brand" variety below comes from mixing
// each hue toward white/black (brightness/tint) and from shape, never
// from a new hue.
import type { Renderer, RendererCaps, HitEvent } from "../Renderer";
import { interpolateById } from "../Renderer";
import { computeFit, screenToWorld as sharedScreenToWorld, type Fit } from "../transform";
import type { RenderSnapshot } from "@/game/sim/engine";
import { toFloat } from "@/game/sim/math/fixed";
import { CREEP_AIR, CREEP_FAST, CREEP_HARD } from "@/game/sim/state";
import { STAGE_H, STAGE_W, TILE_SIZE, TILES, TOWERS, TRACK, TRACK_WIDTH } from "@/game/titles/circle-td/content";

interface RGB {
  r: number;
  g: number;
  b: number;
}

interface Palette {
  bgBase: string;
  bgBaseRgb: RGB;
  bgSurface: string;
  bgSurfaceRgb: RGB;
  bgElevated: string;
  bgElevatedRgb: RGB;
  borderSubtle: string;
  borderSubtleRgb: RGB;
  borderMuted: string;
  borderMutedRgb: RGB;
  accent: string;
  accentRgb: RGB;
  accentHover: string;
  accentHoverRgb: RGB;
  // Already a full `rgba(...)` CSS color string (see globals.css's
  // --color-accent-glow) — used directly as a shadowColor/fillStyle, never
  // through rgbaOf/hexToRgb.
  accentGlow: string;
  blue: string;
  blueRgb: RGB;
  textPrimary: string;
  textPrimaryRgb: RGB;
  textSecondary: string;
  textSecondaryRgb: RGB;
}

interface HitFlash {
  x: number;
  y: number;
  tx: number;
  ty: number;
  kind: number;
  ageMs: number;
}

const FALLBACK_PALETTE_HEX = {
  bgBase: "#08080C",
  bgSurface: "#0F0F15",
  bgElevated: "#16161F",
  borderSubtle: "#1F1F2E",
  borderMuted: "#27273A",
  accent: "#FF3B2F",
  accentHover: "#FF5045",
  accentGlow: "rgba(255,59,47,0.4)",
  blue: "#7FDBFF",
  textPrimary: "#F0F2F8",
  textSecondary: "#787F96",
};

const IDENTITY_TRANSFORM: Fit = { scale: 1, offsetX: 0, offsetY: 0 };

// Pure white/black — used only as MIX TARGETS for tinting/shading the
// brand's two real hues (accent, blue), never drawn as standalone colors
// of their own. See towerColorFor's comment for why this is how "5
// distinct but on-brand" tower colors get built under a one-accent-hue
// brand rule.
const WHITE: RGB = { r: 255, g: 255, b: 255 };
const BLACK: RGB = { r: 0, g: 0, b: 0 };

// How long a hit flash burst stays visible, in real milliseconds (this is a
// renderer-side visual effect timed off wall-clock frame delivery, not sim
// ticks — the sim has no notion of "how a hit should fade").
const HIT_LIFETIME_MS = 240;

// How many trailing points a FAST creep's motion trail keeps — short on
// purpose ("a short motion trail," not a comet tail). Purely decorative
// (see `reducedMotion` below, which skips this entirely).
const FAST_TRAIL_LEN = 4;

function hexToRgb(hex: string): RGB {
  const cleaned = hex.trim().replace("#", "");
  const full = cleaned.length === 3 ? cleaned.split("").map((c) => c + c).join("") : cleaned;
  const num = Number.parseInt(full, 16);
  const n = Number.isFinite(num) ? num : 0;
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function clampByte(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)));
}

function rgbaOf(c: RGB, alpha: number): string {
  return `rgba(${c.r},${c.g},${c.b},${alpha})`;
}

function shadeOf(c: RGB, factor: number): RGB {
  return { r: clampByte(c.r * factor), g: clampByte(c.g * factor), b: clampByte(c.b * factor) };
}

// Linear-interpolates two RGBs — the one color "operator" every tint/shade/
// danger-blend below is built from, so there's a single place that clamps.
function mixRgb(a: RGB, b: RGB, t: number): RGB {
  const tt = Math.max(0, Math.min(1, t));
  return {
    r: clampByte(a.r + (b.r - a.r) * tt),
    g: clampByte(a.g + (b.g - a.g) * tt),
    b: clampByte(a.b + (b.b - a.b) * tt),
  };
}

// Five on-brand tower tints (Fast/Air/Slow/Splash/Damage, TOWERS'
// declaration order), all in the accent (red) family — the brand reserves
// hue for the player side alone, so "distinct" per type comes from
// brightness/tint (mixing toward white or black) plus each type's own
// silhouette in drawTowerShape, never from a second hue.
function towerColorFor(clampedType: number, accentRgb: RGB, accentHoverRgb: RGB): RGB {
  switch (clampedType) {
    case 0: // Fast — pure accent, urgent
      return accentRgb;
    case 1: // Air — lightened tint, reads "airy"
      return mixRgb(accentRgb, WHITE, 0.32);
    case 2: // Slow — deep/heavy shade
      return mixRgb(accentRgb, BLACK, 0.3);
    case 3: // Splash — muted, between Slow and pure accent
      return mixRgb(accentRgb, BLACK, 0.12);
    default: // Damage — the hottest, most intense tower
      return accentHoverRgb;
  }
}

function readPalette(): Palette {
  const cs = getComputedStyle(document.documentElement);
  const read = (name: string, fallback: string): string => {
    const v = cs.getPropertyValue(name).trim();
    return v.length > 0 ? v : fallback;
  };
  const bgBase = read("--color-bg-base", FALLBACK_PALETTE_HEX.bgBase);
  const bgSurface = read("--color-bg-surface", FALLBACK_PALETTE_HEX.bgSurface);
  const bgElevated = read("--color-bg-elevated", FALLBACK_PALETTE_HEX.bgElevated);
  const borderSubtle = read("--color-border-subtle", FALLBACK_PALETTE_HEX.borderSubtle);
  const borderMuted = read("--color-border-muted", FALLBACK_PALETTE_HEX.borderMuted);
  const accent = read("--color-accent", FALLBACK_PALETTE_HEX.accent);
  const accentHover = read("--color-accent-hover", FALLBACK_PALETTE_HEX.accentHover);
  const accentGlow = read("--color-accent-glow", FALLBACK_PALETTE_HEX.accentGlow);
  const blue = read("--color-blue", FALLBACK_PALETTE_HEX.blue);
  const textPrimary = read("--color-text-primary", FALLBACK_PALETTE_HEX.textPrimary);
  const textSecondary = read("--color-text-secondary", FALLBACK_PALETTE_HEX.textSecondary);
  return {
    bgBase,
    bgBaseRgb: hexToRgb(bgBase),
    bgSurface,
    bgSurfaceRgb: hexToRgb(bgSurface),
    bgElevated,
    bgElevatedRgb: hexToRgb(bgElevated),
    borderSubtle,
    borderSubtleRgb: hexToRgb(borderSubtle),
    borderMuted,
    borderMutedRgb: hexToRgb(borderMuted),
    accent,
    accentRgb: hexToRgb(accent),
    accentHover,
    accentHoverRgb: hexToRgb(accentHover),
    accentGlow,
    blue,
    blueRgb: hexToRgb(blue),
    textPrimary,
    textPrimaryRgb: hexToRgb(textPrimary),
    textSecondary,
    textSecondaryRgb: hexToRgb(textSecondary),
  };
}

function fallbackPalette(): Palette {
  const f = FALLBACK_PALETTE_HEX;
  return {
    bgBase: f.bgBase,
    bgBaseRgb: hexToRgb(f.bgBase),
    bgSurface: f.bgSurface,
    bgSurfaceRgb: hexToRgb(f.bgSurface),
    bgElevated: f.bgElevated,
    bgElevatedRgb: hexToRgb(f.bgElevated),
    borderSubtle: f.borderSubtle,
    borderSubtleRgb: hexToRgb(f.borderSubtle),
    borderMuted: f.borderMuted,
    borderMutedRgb: hexToRgb(f.borderMuted),
    accent: f.accent,
    accentRgb: hexToRgb(f.accent),
    accentHover: f.accentHover,
    accentHoverRgb: hexToRgb(f.accentHover),
    accentGlow: f.accentGlow,
    blue: f.blue,
    blueRgb: hexToRgb(f.blue),
    textPrimary: f.textPrimary,
    textPrimaryRgb: hexToRgb(f.textPrimary),
    textSecondary: f.textSecondary,
    textSecondaryRgb: hexToRgb(f.textSecondary),
  };
}

// Converts a Q16.16 polyline/point-pair array (content.ts's raw geometry)
// to plain float stage-px pairs, once, at init. RenderSnapshot's own *XY
// arrays are already float px by the time they reach a Renderer (see
// packSnapshot in titles/circle-td/index.ts) — only this static geometry
// needs the Fx→float conversion here.
function toFloatPairs(fx: Int32Array): Float64Array {
  const out = new Float64Array(fx.length);
  for (let i = 0; i < fx.length; i++) out[i] = toFloat(fx[i]);
  return out;
}

function polygonPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, sides: number): void {
  for (let i = 0; i < sides; i++) {
    const a = (Math.PI * 2 * i) / sides - Math.PI / 2;
    const x = cx + r * Math.cos(a);
    const y = cy + r * Math.sin(a);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function diamondPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  ctx.moveTo(cx, cy - r);
  ctx.lineTo(cx + r, cy);
  ctx.lineTo(cx, cy + r);
  ctx.lineTo(cx - r, cy);
  ctx.closePath();
}

function nowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

export class Canvas2DRenderer implements Renderer {
  readonly caps: RendererCaps = { kind: "canvas2d", particles: false };

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private palette: Palette = fallbackPalette();
  private transform: Fit = IDENTITY_TRANSFORM;

  private trackOuterPx: Float64Array = new Float64Array(0);
  private trackInnerPx: Float64Array = new Float64Array(0);
  private tilesPx: Float64Array = new Float64Array(0);

  // Cached once in init() (STAGE_W/STAGE_H are compile-time constants, and
  // a CanvasGradient is tied to the context that created it) so the "lit
  // stage" backdrop costs one fillRect per frame, not a fresh gradient
  // allocation every frame.
  private backdropGradient: CanvasGradient | null = null;
  private vignetteGradient: CanvasGradient | null = null;

  // `prefers-reduced-motion: reduce` gate for the one purely decorative,
  // continuous-per-frame effect this file adds: the FAST creep motion
  // trail (drawTrail below). Everything else that moves is either
  // gameplay content (creep/tower positions, hit flashes — a hit flash
  // reports a real event, not ambient decoration) or has no animation at
  // all (backdrop/track/tiles are static per frame). Read once at init()
  // rather than subscribed live — the brief only asks that the setting be
  // respected, not that it retoggle mid-session.
  private reducedMotion: boolean = false;

  // Short trailing-position history per FAST creep id, rebuilt in place
  // every frame (see pruneTrails) rather than reallocated, so a long-lived
  // run with many creeps spawning/dying doesn't leak entries.
  private creepTrails: Map<number, Array<{ x: number; y: number }>> = new Map();
  // Reused Set for "which creep ids are alive this frame" (drawCreeps'
  // trail-pruning pass) — cleared and refilled each call instead of a
  // fresh Set per frame.
  private readonly frameAliveIds: Set<number> = new Set();

  private hits: HitFlash[] = [];
  private lastFrameAtMs: number | null = null;

  // Selection/hover state is a Task 6 concern (input handling); this just
  // gives Task 6 somewhere to put it without changing the Renderer
  // interface. `null` (the default) draws no range ring at all.
  private highlightTowerIndex: number | null = null;

  // Task 6: the hovered/targeted build tile (or -1) and which tower type
  // would be placed there (or -1 when nothing is armed, or when an
  // existing tower is selected instead — see highlightTowerIndex above for
  // that case, which takes priority in practice since GameClient only sets
  // one of the two at a time). Drawn as a translucent ghost + range ring in
  // drawHighlight below.
  private highlightTile: number = -1;
  private highlightTowerType: number = -1;
  // Final-review finding #2: whether the armed tower type is affordable
  // against the player's CURRENT bank — set alongside highlightTowerType by
  // setHighlight below. Defaults `true` so a hover before the first
  // setHighlight call (there shouldn't be one, but nothing depends on it)
  // never draws spuriously dimmed.
  private highlightAffordable: boolean = true;

  async init(canvas: HTMLCanvasElement): Promise<void> {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas2DRenderer: 2D canvas context unavailable");
    this.canvas = canvas;
    this.ctx = ctx;
    this.palette = readPalette();
    this.trackOuterPx = toFloatPairs(TRACK.outer);
    this.trackInnerPx = toFloatPairs(TRACK.inner);
    this.tilesPx = toFloatPairs(TILES);
    this.backdropGradient = this.makeBackdropGradient(ctx);
    this.vignetteGradient = this.makeVignetteGradient(ctx);
    this.reducedMotion =
      typeof window !== "undefined" && typeof window.matchMedia === "function"
        ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
        : false;
  }

  resize(cssW: number, cssH: number, dpr: number): void {
    const canvas = this.canvas;
    if (!canvas) return;
    const pxW = Math.round(cssW * dpr);
    const pxH = Math.round(cssH * dpr);
    canvas.width = pxW;
    canvas.height = pxH;
    // Fit math now lives in the shared transform module (see
    // ../transform.ts) so WebGpuRenderer computes the identical letterbox.
    this.transform = computeFit(pxW, pxH);
  }

  // Part of the shared Renderer interface as of final-review finding #7 —
  // see Renderer.ts's comment on the interface declaration. Task 6 wires
  // real hover/selection input to this.
  setHighlightTower(index: number | null): void {
    this.highlightTowerIndex = index;
  }

  // The placement ghost/range-preview at a hovered or targeted (not-yet-
  // built) tile. `tile: -1` clears it; `towerType: -1` draws just a plain
  // tile marker (hovering with nothing armed to place); `affordable`
  // (finding #2) dims the ghost when the armed type costs more than the
  // player's current bank — see drawHighlight below and
  // highlightAffordable's own comment.
  setHighlight(tile: number, towerType: number, affordable: boolean): void {
    this.highlightTile = tile;
    this.highlightTowerType = towerType;
    this.highlightAffordable = affordable;
  }

  // Screen (client) px -> world (stage) px; the pixel math lives in
  // ../transform.ts (shared with WebGpuRenderer).
  screenToWorld(clientX: number, clientY: number, canvas: HTMLCanvasElement): { x: number; y: number } {
    return sharedScreenToWorld(clientX, clientY, canvas, this.transform);
  }

  frame(prev: RenderSnapshot, curr: RenderSnapshot, alpha: number, hits: HitEvent[]): void {
    const ctx = this.ctx;
    const canvas = this.canvas;
    if (!ctx || !canvas) return;

    this.advanceHits(hits);

    ctx.save();
    // Reset to identity before filling the full device-pixel backing store
    // with the base surface color (this also covers the letterboxed bars
    // outside the fitted stage — the renderer doesn't rely on whatever
    // background the host page/container happens to have).
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = this.palette.bgBase;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const { scale, offsetX, offsetY } = this.transform;
    ctx.setTransform(scale, 0, 0, scale, offsetX, offsetY);

    this.drawBackdrop(ctx);
    this.drawTrack(ctx);
    this.drawTiles(ctx);
    this.drawTowers(ctx, curr);
    this.drawHighlight(ctx);
    this.drawCreeps(ctx, prev, curr, alpha);
    this.drawHits(ctx);

    ctx.restore();
  }

  destroy(): void {
    this.canvas = null;
    this.ctx = null;
    this.hits = [];
    this.lastFrameAtMs = null;
    this.creepTrails.clear();
    this.frameAliveIds.clear();
  }

  // --- backdrop ---
  //
  // "A lit stage, not a void": a cached radial gradient lifts the center of
  // the board toward bg-elevated/bg-surface before falling back to
  // bg-base at the edges, a faint grid gives the empty board some texture
  // to read scale against, and a second cached gradient vignettes the
  // corners. All three are static in world-space (STAGE_W/STAGE_H never
  // change), so the gradients are built once in init() and just re-filled
  // every frame — no per-frame gradient allocation.

  private makeBackdropGradient(ctx: CanvasRenderingContext2D): CanvasGradient {
    const cx = STAGE_W / 2;
    const cy = STAGE_H / 2;
    const r = Math.hypot(cx, cy);
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    // Map fix (2026-09-19): stop 0 used to be pure bg-elevated, the exact
    // tone drawTiles' old fill sat on top of — ~1.0 contrast at the board
    // centre, which is why tiles were invisible there until hover. Lifting
    // the centre only halfway toward bg-surface keeps "a lit stage" while
    // leaving headroom for the tile grid (drawTiles) to be the brightest
    // thing drawn on open ground, at centre AND edge alike.
    g.addColorStop(0, rgbaOf(mixRgb(this.palette.bgElevatedRgb, this.palette.bgSurfaceRgb, 0.5), 1));
    g.addColorStop(0.5, this.palette.bgSurface);
    g.addColorStop(1, this.palette.bgBase);
    return g;
  }

  private makeVignetteGradient(ctx: CanvasRenderingContext2D): CanvasGradient {
    const cx = STAGE_W / 2;
    const cy = STAGE_H / 2;
    const r = Math.hypot(cx, cy);
    const g = ctx.createRadialGradient(cx, cy, r * 0.5, cx, cy, r);
    // Pure black falloff, not a palette hue — a vignette darkens whatever
    // is under it rather than tinting it, same idea as a photographic
    // vignette; it's the one place this file draws a color that isn't
    // sourced from the theme, by design.
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(0,0,0,0.5)");
    return g;
  }

  private drawBackdrop(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = this.backdropGradient ?? this.palette.bgSurface;
    ctx.fillRect(0, 0, STAGE_W, STAGE_H);

    // Map fix (2026-09-19): the old faint structural grid (pitch
    // TILE_SIZE*2, borderSubtle@0.4) was drawn here as a depth/scale cue
    // for an otherwise-empty board. Now that drawTiles paints a real,
    // clearly-visible TILE_SIZE grid over every open area, a second grid
    // underneath it only doubles up (its 64px pitch is a multiple of the
    // tiles' own 32px lattice) and competes for attention — dropped so the
    // real buildable-tile grid is the only grid the board reads.

    if (this.vignetteGradient) {
      ctx.fillStyle = this.vignetteGradient;
      ctx.fillRect(0, 0, STAGE_W, STAGE_H);
    }
  }

  // --- static geometry ---

  // Path "width" for the stroked track polylines — imported from content.ts
  // rather than kept as a local copy so the value the renderer draws and the
  // value the geometry reasons about can never drift apart (two files
  // agreeing only by comment was how the previous geometry drifted out of
  // sync). content.ts's MIN_CLEARANCE (= TRACK_WIDTH/2 + TILE_SIZE/2) is
  // computed against this same TRACK_WIDTH, so every build tile's centre sits
  // ~TILE_SIZE/2 CLEAR of this drawn band's edge (the open-area grid model —
  // tiles no longer abut the path). The edge-highlight stroke added below is
  // a few px wider than TRACK_WIDTH — a cosmetic overshoot into the (~150px)
  // inter-loop gap; it visually abuts the nearest tiles but doesn't change
  // the clearance the geometry guarantees.
  private drawTrack(ctx: CanvasRenderingContext2D): void {
    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    // Outer vs inner lane get a brightness difference (never a hue
    // difference — no third color channel), so the two nested loops read
    // as distinct without breaking the one-accent/one-blue brand rule.
    const lanes: ReadonlyArray<{ poly: Float64Array; fill: RGB }> = [
      { poly: this.trackOuterPx, fill: this.palette.borderMutedRgb },
      { poly: this.trackInnerPx, fill: mixRgb(this.palette.borderSubtleRgb, this.palette.borderMutedRgb, 0.5) },
    ];
    const edgeColor = rgbaOf(this.palette.textSecondaryRgb, 0.22);
    const centerlineColor = rgbaOf(this.palette.textSecondaryRgb, 0.12);

    for (const lane of lanes) {
      const poly = lane.poly;
      if (poly.length < 4) continue;
      ctx.beginPath();
      ctx.moveTo(poly[0], poly[1]);
      for (let i = 2; i < poly.length; i += 2) ctx.lineTo(poly[i], poly[i + 1]);

      // Brighter, slightly-wider stroke underneath, the lane fill on top —
      // leaves a thin visible edge on both sides of the band, "the route
      // is unmistakable" per the brief.
      ctx.lineWidth = TRACK_WIDTH + 4;
      ctx.strokeStyle = edgeColor;
      ctx.stroke();

      ctx.lineWidth = TRACK_WIDTH;
      ctx.strokeStyle = rgbaOf(lane.fill, 1);
      ctx.stroke();

      // Faint dashed centerline — a directional hint, not required
      // reading (per the brief, "a plus, not required"). setLineDash is
      // reset immediately after so it never leaks into a later stroke.
      ctx.setLineDash([6, 10]);
      ctx.lineWidth = 1;
      ctx.strokeStyle = centerlineColor;
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  // Map fix (2026-09-19): the old fill (bg-elevated@0.6, half=TILE_SIZE*0.32)
  // sat at ~1.0 luminance contrast against the backdrop's own bg-elevated
  // centre stop (see makeBackdropGradient) — invisible until hover — and was
  // drawn well inside its ~32px clickable footprint. Both are fixed here:
  // half is bumped to TILE_SIZE*0.44 (~28px square, a ~4px gutter between
  // 32px-spaced cells so they still read as a grid) and the fill/border are
  // a neutral tint mixed toward text-secondary (never the accent hue — the
  // brand's one-accent rule reserves that for the hovered tile/live things),
  // tuned to measure >=3:1 WCAG contrast against the backdrop at BOTH the
  // board centre and the edge (see fix1-map-report.md for the numbers).
  private drawTiles(ctx: CanvasRenderingContext2D): void {
    const half = TILE_SIZE * 0.44;
    // Affordability signal: when a tower type is armed and unaffordable at
    // the current bank, every tile dims to read "you can't build right now"
    // — reusing state the renderer already tracks for the hover ghost
    // (setHighlight), no interface change needed.
    const armedUnaffordable = this.highlightTowerType >= 0 && !this.highlightAffordable;
    const dim = armedUnaffordable ? 0.6 : 1;
    const fillRgb = mixRgb(this.palette.bgElevatedRgb, this.palette.textSecondaryRgb, 0.9);
    ctx.fillStyle = rgbaOf(fillRgb, 0.82 * dim);
    ctx.strokeStyle = rgbaOf(this.palette.textSecondaryRgb, 0.85 * dim);
    ctx.lineWidth = 1;
    for (let i = 0; i < this.tilesPx.length; i += 2) {
      const x = this.tilesPx[i];
      const y = this.tilesPx[i + 1];
      ctx.fillRect(x - half, y - half, half * 2, half * 2);
      ctx.strokeRect(x - half, y - half, half * 2, half * 2);
    }
  }

  // --- towers ---

  private drawTowers(ctx: CanvasRenderingContext2D, curr: RenderSnapshot): void {
    for (let i = 0; i < curr.towerCount; i++) {
      const x = curr.towerXY[i * 2];
      const y = curr.towerXY[i * 2 + 1];
      const type = curr.towerType[i];
      const level = curr.towerLevel[i];
      const selected = i === this.highlightTowerIndex;
      if (selected) this.drawRangeRing(ctx, x, y, type, level);
      this.drawTowerShape(ctx, x, y, type, level, selected);
    }
  }

  // A faint fill wash plus a dashed ring reads more clearly against the
  // now-textured backdrop/track than a single thin solid stroke did.
  // setLineDash is reset before returning so it never leaks into the next
  // draw call (towers/tiles never use a dash themselves).
  private drawRangeRing(ctx: CanvasRenderingContext2D, x: number, y: number, type: number, level: number): void {
    const def = TOWERS[type];
    if (!def) return;
    const range = toFloat(def.range0 + level * def.rangeStep);

    ctx.beginPath();
    ctx.arc(x, y, range, 0, Math.PI * 2);
    ctx.fillStyle = rgbaOf(this.palette.accentRgb, 0.045);
    ctx.fill();

    ctx.setLineDash([4, 6]);
    ctx.strokeStyle = rgbaOf(this.palette.accentRgb, 0.45);
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Shape by type (Fast=circle, Air=triangle, Slow=diamond, Splash=square,
  // Damage=hexagon — matching TOWERS' declaration order in content.ts).
  // Size now factors in TOWERS[type].footprint (Splash/Damage occupy more
  // board-conceptual space even though content.ts still reserves only one
  // tile per tower — see its own footprint comment) as well as level.
  // Color comes from towerColorFor (accent-family tint/shade per type,
  // never a new hue) with a soft outer glow via shadowBlur; `selected`
  // (the placed tower currently highlighted) gets a brighter, thicker
  // outline and a stronger glow instead of a separate visual language.
  private drawTowerShape(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    type: number,
    level: number,
    selected: boolean = false
  ): void {
    const clampedType = Math.max(0, Math.min(TOWERS.length - 1, type));
    const clampedLevel = Math.max(0, Math.min(9, level));
    const def = TOWERS[clampedType];
    const footprint = def ? def.footprint : 1;
    const baseR = 7 + footprint * 2.5 + clampedType * 0.4;
    const r = baseR + clampedLevel * 0.5;
    const bodyRgb = towerColorFor(clampedType, this.palette.accentRgb, this.palette.accentHoverRgb);

    ctx.save();
    ctx.shadowColor = rgbaOf(bodyRgb, 0.7);
    ctx.shadowBlur = selected ? 20 : 11;

    ctx.beginPath();
    switch (clampedType) {
      case 0: // Fast
        ctx.arc(x, y, r, 0, Math.PI * 2);
        break;
      case 1: // Air
        ctx.moveTo(x, y - r);
        ctx.lineTo(x + r * 0.87, y + r * 0.5);
        ctx.lineTo(x - r * 0.87, y + r * 0.5);
        ctx.closePath();
        break;
      case 2: // Slow
        ctx.moveTo(x, y - r);
        ctx.lineTo(x + r, y);
        ctx.lineTo(x, y + r);
        ctx.lineTo(x - r, y);
        ctx.closePath();
        break;
      case 3: // Splash
        ctx.rect(x - r * 0.8, y - r * 0.8, r * 1.6, r * 1.6);
        break;
      default: // Damage
        polygonPath(ctx, x, y, r, 6);
        break;
    }
    ctx.fillStyle = rgbaOf(bodyRgb, 1);
    ctx.fill();

    // Crisp outline drawn without the glow blur (so it stays sharp instead
    // of doubling the fill's own glow) — brighter/thicker when selected.
    ctx.shadowBlur = 0;
    ctx.lineWidth = selected ? 2.5 : 1.25;
    ctx.strokeStyle = selected ? rgbaOf(this.palette.textPrimaryRgb, 0.95) : rgbaOf(this.palette.bgBaseRgb, 0.6);
    ctx.stroke();
    ctx.restore();

    if (clampedLevel > 0) this.drawLevelPips(ctx, x, y, r, clampedLevel);
  }

  // Level 1-9 as small pips on a fixed 9-slot ring around the tower —
  // fixed slots (not "n evenly spaced among n") so a given level always
  // lights the same clock positions as the level below it, reading like a
  // dial filling up rather than rearranging.
  private drawLevelPips(ctx: CanvasRenderingContext2D, x: number, y: number, towerR: number, level: number): void {
    const n = Math.max(0, Math.min(9, level));
    if (n <= 0) return;
    const ringR = towerR + 5;
    const pipR = 1.4;
    ctx.fillStyle = rgbaOf(this.palette.textPrimaryRgb, 0.95);
    for (let i = 0; i < n; i++) {
      const a = (Math.PI * 2 * i) / 9 - Math.PI / 2;
      ctx.beginPath();
      ctx.arc(x + ringR * Math.cos(a), y + ringR * Math.sin(a), pipR, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // --- placement ghost / hover marker (Task 6) ---

  private drawHighlight(ctx: CanvasRenderingContext2D): void {
    const tile = this.highlightTile;
    if (tile < 0 || tile * 2 + 1 >= this.tilesPx.length) return;
    const x = this.tilesPx[tile * 2];
    const y = this.tilesPx[tile * 2 + 1];
    const type = this.highlightTowerType;
    const affordable = this.highlightAffordable;
    // Matches drawTiles' half (TILE_SIZE * 0.44) so the hover ring aligns
    // exactly with the drawn tile block underneath it.
    const half = TILE_SIZE * 0.44;

    // Bright accent outline on the hovered/targeted tile — always drawn
    // (even with nothing armed), so hover itself is unmistakable; dims
    // and drops its glow when the armed type is unaffordable, same rule
    // finding #2 already applies to the ghost shape below.
    ctx.save();
    ctx.shadowColor = this.palette.accentGlow;
    ctx.shadowBlur = affordable ? 10 : 0;
    ctx.strokeStyle = rgbaOf(this.palette.accentRgb, affordable ? 0.85 : 0.35);
    ctx.lineWidth = 2;
    ctx.strokeRect(x - half, y - half, half * 2, half * 2);
    ctx.restore();

    if (type < 0) {
      // Hovered/targeted tile with no tower armed — the outline above is
      // the whole story, no ghost shape or range preview to draw.
      return;
    }
    // A would-be-placed tower always previews at level 0 (nothing to place
    // above L0), reusing the exact shape/range-ring drawing an actually
    // placed L0 tower would get, just translucent. Final-review finding #2:
    // when the armed type is UNaffordable against the current bank, the
    // ghost draws noticeably dimmer (0.16 vs. the normal 0.5) and skips
    // the range ring entirely — "this doesn't cost that much" was
    // ambiguous; "you can't place this yet" needed to read as visibly
    // different, not just a hair fainter.
    if (affordable) this.drawRangeRing(ctx, x, y, type, 0);
    ctx.save();
    ctx.globalAlpha = affordable ? 0.5 : 0.16;
    this.drawTowerShape(ctx, x, y, type, 0);
    ctx.restore();
  }

  // --- creeps ---

  private drawCreeps(ctx: CanvasRenderingContext2D, prev: RenderSnapshot, curr: RenderSnapshot, alpha: number): void {
    const creeps = interpolateById(prev, curr, alpha);
    const aliveIds = this.frameAliveIds;
    aliveIds.clear();

    for (const c of creeps) {
      aliveIds.add(c.id);
      const isAir = (c.flags & CREEP_AIR) !== 0;
      const isFast = (c.flags & CREEP_FAST) !== 0;
      const isHard = (c.flags & CREEP_HARD) !== 0;

      // HARD creeps are larger; AIR gets a small additional bump so its
      // (larger, r*1.35) diamond doesn't read smaller than a ground
      // creep's plain circle at the same baseR.
      const baseR = (isHard ? 8 : 5.5) + (isAir ? 1 : 0);

      if (isFast && !this.reducedMotion) this.drawTrail(ctx, c.id, c.x, c.y, baseR);

      // HARD gets a darker core (per the brief) — AIR is hollow, so for
      // AIR+HARD this darkens the ring stroke instead; there's no fillable
      // "core" on a hollow shape.
      const bodyRgb = isHard ? shadeOf(this.palette.blueRgb, 0.55) : this.palette.blueRgb;

      ctx.save();
      ctx.shadowColor = rgbaOf(this.palette.blueRgb, 0.6);
      ctx.shadowBlur = isFast ? 13 : 8;

      ctx.beginPath();
      if (isAir) {
        // Hollow diamond ring reads as "off the ground"; land creeps below
        // are solid filled circles. HARD gets a heavier ring line.
        diamondPath(ctx, c.x, c.y, baseR * 1.35);
        ctx.strokeStyle = rgbaOf(bodyRgb, 1);
        ctx.lineWidth = isHard ? 2.6 : 1.6;
        ctx.stroke();
      } else {
        ctx.arc(c.x, c.y, baseR, 0, Math.PI * 2);
        ctx.fillStyle = rgbaOf(bodyRgb, isFast ? 1 : 0.85);
        ctx.fill();
        if (isHard) {
          // Heavier outer ring atop the darker core fill.
          ctx.lineWidth = 2.2;
          ctx.strokeStyle = rgbaOf(this.palette.blueRgb, 0.9);
          ctx.stroke();
        }
      }
      ctx.shadowBlur = 0;

      if (isFast) {
        // Brighter hot core — a small dot mixed toward white, on top of
        // the body already drawn above, no glow of its own (kept crisp).
        ctx.beginPath();
        ctx.arc(c.x, c.y, Math.max(1.5, baseR * 0.4), 0, Math.PI * 2);
        ctx.fillStyle = rgbaOf(mixRgb(this.palette.blueRgb, WHITE, 0.6), 0.95);
        ctx.fill();
      }
      ctx.restore();

      this.drawHpBar(ctx, c.x, c.y - baseR - 6, Math.max(14, baseR * 2.4), c.hp01);
    }

    this.pruneTrails(aliveIds);
  }

  // A short fading tail behind a FAST creep, built from its own last few
  // drawn (interpolated) positions rather than touching interpolateById's
  // tested contract — history lives here, per creep id, capped at
  // FAST_TRAIL_LEN points so it's "a short motion trail," not unbounded.
  private drawTrail(ctx: CanvasRenderingContext2D, id: number, x: number, y: number, baseR: number): void {
    let pts = this.creepTrails.get(id);
    if (!pts) {
      pts = [];
      this.creepTrails.set(id, pts);
    }
    pts.push({ x, y });
    if (pts.length > FAST_TRAIL_LEN) pts.shift();
    if (pts.length < 2) return;

    for (let i = 0; i < pts.length - 1; i++) {
      const t = (i + 1) / pts.length; // 0 (oldest) -> ~1 (newest segment)
      const a = pts[i];
      const b = pts[i + 1];
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = rgbaOf(this.palette.blueRgb, 0.22 * t);
      ctx.lineWidth = Math.max(1, baseR * 0.55 * t);
      ctx.stroke();
    }
  }

  // Drops trail history for any creep id no longer alive this frame —
  // keeps creepTrails' size bounded by "currently-alive FAST creeps," not
  // "every FAST creep that ever existed this run." Deleting a Map's
  // current key mid-iteration over `.keys()` is well-defined (won't skip
  // or revisit entries), so this is a single in-place pass, no rebuild.
  private pruneTrails(aliveIds: ReadonlySet<number>): void {
    if (this.creepTrails.size === 0) return;
    for (const id of this.creepTrails.keys()) {
      if (!aliveIds.has(id)) this.creepTrails.delete(id);
    }
  }

  // Dark recessed track + a fill that blends from blue (healthy) toward
  // accent (critical) and empties as hp01 drops. This is the brand's
  // "brightness, not a status hue" rule applied to the one place a
  // green/red health bar would otherwise be reflexive: there's no green
  // in this palette, so the meter's own accent-side pull IS the danger
  // cue, on top of literally draining.
  private drawHpBar(ctx: CanvasRenderingContext2D, cx: number, topY: number, width: number, hp01: number): void {
    const h = 3;
    const x = cx - width / 2;
    const clamped = Math.max(0, Math.min(1, hp01));

    ctx.fillStyle = this.palette.bgBase;
    ctx.fillRect(x, topY, width, h);
    ctx.strokeStyle = this.palette.borderMuted;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, topY + 0.5, width - 1, h - 1);

    if (clamped <= 0) return;
    const dangerT = 1 - clamped;
    const fillRgb = mixRgb(this.palette.blueRgb, this.palette.accentRgb, dangerT * 0.85);
    ctx.fillStyle = rgbaOf(fillRgb, 1);
    ctx.fillRect(x, topY, width * clamped, h);
  }

  // --- hit flashes ---
  //
  // `hits` arrives fresh each frame() call (a future sim hit feed — still
  // unbuilt; Task 6 turned out to be pointer input/recording, not this —
  // would report only newly-occurred hits, not replay old ones), so this
  // renderer keeps its own short-lived list and ages it by real elapsed
  // wall-clock time between frame() calls. That's a rendering-only concern
  // (how a burst fades), not gameplay state. GameClient still passes
  // NO_HITS every frame (Task 5) — nothing produces a real HitEvent yet.

  private advanceHits(incoming: HitEvent[]): void {
    const now = nowMs();
    const dtMs = this.lastFrameAtMs === null ? 0 : Math.max(0, now - this.lastFrameAtMs);
    this.lastFrameAtMs = now;

    for (const h of incoming) this.hits.push({ x: h.x, y: h.y, tx: h.tx, ty: h.ty, kind: h.kind, ageMs: 0 });
    if (dtMs > 0) {
      for (const h of this.hits) h.ageMs += dtMs;
    }
    if (this.hits.length > 0) {
      this.hits = this.hits.filter((h) => h.ageMs < HIT_LIFETIME_MS);
    }
  }

  // A bright, fast-fading bloom (shadowBlur core dot) plus the original
  // expanding ring — "make them visible/snappy," per the brief, rather
  // than the previous thin ring alone.
  private drawHits(ctx: CanvasRenderingContext2D): void {
    if (this.hits.length === 0) return;
    for (const h of this.hits) {
      const t = h.ageMs / HIT_LIFETIME_MS; // 0 (just happened) -> 1 (expired)
      const inv = Math.max(0, 1 - t);
      if (inv <= 0) continue;

      // Tower->creep tracer beam: snaps out, fades fast (gone by ~35% of the
      // burst). accentHover reads over the dark board and against blue creeps.
      const beamInv = t >= 0.35 ? 0 : 1 - t / 0.35;
      if (beamInv > 0 && (h.tx !== h.x || h.ty !== h.y)) {
        ctx.save();
        ctx.shadowColor = this.palette.accentGlow;
        ctx.shadowBlur = 8 * beamInv;
        ctx.strokeStyle = rgbaOf(this.palette.accentHoverRgb, 0.85 * beamInv);
        ctx.lineWidth = 1 + 2 * beamInv;
        ctx.beginPath();
        ctx.moveTo(h.x, h.y);
        ctx.lineTo(h.tx, h.ty);
        ctx.stroke();
        ctx.restore();
      }

      // Impact at the struck creep: white-hot core (glow) + expanding ring.
      ctx.save();
      ctx.shadowColor = this.palette.accentGlow;
      ctx.shadowBlur = 16 * inv;
      ctx.beginPath();
      ctx.arc(h.tx, h.ty, 1 + 2.5 * inv, 0, Math.PI * 2);
      ctx.fillStyle = rgbaOf(this.palette.textPrimaryRgb, inv);
      ctx.fill();
      ctx.restore();

      ctx.beginPath();
      ctx.arc(h.tx, h.ty, 3 + t * 12, 0, Math.PI * 2); // outward burst at the creep
      ctx.strokeStyle = rgbaOf(this.palette.accentRgb, inv * 0.9);
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }
}
