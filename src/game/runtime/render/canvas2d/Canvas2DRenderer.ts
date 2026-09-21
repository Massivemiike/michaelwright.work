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
import { loadAtlas } from "../loadAtlas";
import { hasFrame, TEX_TOWER_SCALE, TEX_CREEP_SCALE, type AtlasManifest, type Frame } from "../atlas";
import { spawnDeathBurst, spawnMuzzle, advanceParticles, particleDraw, type Particle, type ParticleTint } from "../particles";
import type { RenderSnapshot } from "@/game/sim/engine";
import { toFloat } from "@/game/sim/math/fixed";
import { CREEP_AIR, CREEP_FAST, CREEP_HARD } from "@/game/sim/state";
import { STAGE_H, STAGE_W, TILE_SIZE, TILES, TOWERS, TRACK, TRACK_WIDTH } from "@/game/titles/circle-td/content";
import { towerFrame, creepFrame } from "@/game/titles/circle-td/sprites";

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

// Hard cap on live FX particles (death bursts + muzzle flashes) — bounds the
// per-frame textured-blit cost. A death burst is 6-8 particles.
const MAX_PARTICLES = 400;

// How many trailing points a FAST creep's motion trail keeps — short on
// purpose ("a short motion trail," not a comet tail). Purely decorative
// (see `reducedMotion` below, which skips this entirely).
const FAST_TRAIL_LEN = 4;

// --- Backdrop tunables (Phase 2 board art, S1 · Backdrop & ambiance) ---
//
// The magnitudes the controller tunes by eye. Both backends read the SAME
// intent: the WebGPU twin mirrors CENTER_LIFT/EDGE_DEEPEN when it uploads the
// backdrop color uniforms (WebGpuRenderer.ts) and mirrors VIGNETTE/GRID_* as
// WGSL consts (webgpu/shaders.ts BACKDROP_WGSL). Keep the numbers in sync
// across those three places or the two backends drift apart.
//
// How far the board centre is lifted toward bg-elevated (0 = a flat bg-surface
// floor, 1 = full bg-elevated). Higher reads as a more clearly "lit stage".
const BACKDROP_CENTER_LIFT = 0.7;
// How far the board EDGE is pushed past bg-base toward black (0 = plain
// bg-base, 1 = black). Deepens the radial falloff so focus pulls to centre.
const BACKDROP_EDGE_DEEPEN = 0.35;
// Peak darkening alpha at the extreme corners — a photographic vignette (pure
// black, darkens rather than tints; see makeVignetteGradient's rationale).
const BACKDROP_VIGNETTE_ALPHA = 0.62;
// Faint structural grid: pitch in stage px and its whisper-low line alpha
// (spec S1: ~0.06-0.12, kept well under the build-tile grid so it never
// competes). Drawn in the neutral border-subtle tone between floor & vignette.
const BACKDROP_GRID_PITCH = 32;
const BACKDROP_GRID_ALPHA = 0.09;

// Track lane tunables (Phase 2 board art, S2) — mirror the WebGPU twin
// (WebGpuRenderer.ts TRACK_*). Each loop reads as a recessed dark channel with
// a thin bright NEUTRAL neon rim that blooms (brighter OUTER, dimmer INNER)
// plus a faint center light-strip. Colors are brightness steps of the
// border/text neutrals (mix(borderMuted -> textPrimary)) — NEVER the enemy
// blue, NEVER a new hue. The rim glow is a shadowBlur bloom whose brightness
// tracks the (brighter OUTER) rim color. NOTE: TRACK_EDGE_MIX_* deliberately
// differ from the WebGPU twin — see the note on those consts below.
const TRACK_EDGE_PX = 3; // visible bright rim width on each side of the channel
const TRACK_CENTER_PX = 2; // faint center light-strip width
const TRACK_EDGE_GLOW = 8; // shadowBlur px for the rim bloom (both loops)
const TRACK_CENTER_GLOW = 3; // shadowBlur px for the faint center strip
// DELIBERATELY brighter than the WebGPU twin (0.72/0.45): Canvas2D adds glow via
// shadowBlur (which spreads but doesn't brighten the stroke core), whereas the
// WebGPU rim gets additive emissive bloom. The higher base here compensates so
// both land at the same perceived rim brightness. Keep the OTHER TRACK_* in sync.
const TRACK_EDGE_MIX_OUTER = 0.85; // borderMuted -> textPrimary for OUTER rim
const TRACK_EDGE_MIX_INNER = 0.55; // borderMuted -> textPrimary for INNER rim
const TRACK_DARK_MIX = 0.2; // bgBase -> black for the recessed lane
const TRACK_CENTER_MIX = 0.35; // borderMuted -> textPrimary for center strip
const TRACK_EDGE_ALPHA = 0.95; // rim stroke + glow alpha
const TRACK_CENTER_ALPHA = 0.5; // center strip alpha (faint)

// Build-tile HUD-pad tunables (Phase 2 board art, S3) — mirror the WebGPU twin
// (WebGpuRenderer.ts TILE_*). Each buildable tile is an inset ROUNDED pad: a
// fill a step above the floor, a thin raised top-edge highlight, and a thin
// rounded border, with the dark inter-tile gutter kept (half = TILE_SIZE*0.44)
// so they read as a grid. Neutral brightness steps only (NEVER a hue). The
// corner radius (TILE_CORNER_FRAC, fraction of half) mirrors the WGSL
// sdRoundBox r=0.30 — keep the two in sync. Keep the rest in sync with the
// WebGPU twin or the two backends drift apart.
const TILE_CORNER_FRAC = 0.3; // roundRect corner radius as a fraction of half (mirrors WGSL sdRoundBox r=0.30)
const TILE_FILL_MIX = 0.9; // bgElevated -> textSecondary for the pad fill
const TILE_FILL_LIFT = 0.06; // then nudge the fill toward textPrimary (raised)
const TILE_FILL_ALPHA = 0.82; // pad fill alpha
const TILE_BORDER_ALPHA = 0.85; // rounded border alpha
const TILE_BORDER_PX = 1; // rounded border stroke width
const TILE_HILITE_MIX = 0.5; // fill -> textPrimary for the top-edge highlight
const TILE_HILITE_ALPHA = 0.5; // top-highlight alpha (subtle, low)
const TILE_HILITE_WIDTH_FRAC = 0.68; // highlight bar half-width as a fraction of half (clears the rounded corners)
const TILE_HILITE_HALF_Y = 1; // highlight bar half-height (px) — a thin line
const TILE_HILITE_OFFSET_PX = 3; // highlight bar centre, px below the pad's top edge

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
  // The faint structural grid, built once as a single Path2D of stage-space
  // 32px lines (see makeBackdropGrid) and just re-stroked each frame — no
  // per-frame path allocation, same "build once in init" model as the two
  // gradients above.
  private backdropGrid: Path2D | null = null;

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

  // Textured FX particles (death bursts + muzzle flashes) — render-only, shared
  // pure logic in ../particles.ts. `lastCreepPos` maps a live creep id to its
  // last-seen world position for render-rate-independent death detection (an id
  // present last render but gone this render died — see stepParticles).
  private particles: Particle[] = [];
  private lastCreepPos: Map<number, [number, number]> = new Map();

  // Sprite atlas (Phase 1 texture art), loaded async at init. Null until it
  // resolves (and forever on any failure) => the SDF drawing below is used as
  // the fallback. `tintCanvas`/`tintCtx` are a single reusable offscreen used
  // to multiply-tint each frame before blitting it to the main context (see
  // tintedFrame) — allocated lazily on first textured draw, never per frame.
  private atlasBitmap: ImageBitmap | null = null;
  private atlasManifest: AtlasManifest | null = null;
  private tintCanvas: HTMLCanvasElement | null = null;
  private tintCtx: CanvasRenderingContext2D | null = null;

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
    this.backdropGrid = this.makeBackdropGrid();
    this.reducedMotion =
      typeof window !== "undefined" && typeof window.matchMedia === "function"
        ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
        : false;

    // Kick the atlas load WITHOUT awaiting — init must not block on the
    // network; the game draws SDF shapes until (and unless) this resolves.
    // If the renderer was destroyed before it resolves (this.ctx cleared),
    // drop the decoded bitmap instead of stashing it on a dead renderer.
    void loadAtlas(
      "/games/circle-td/sprites/atlas.png",
      "/games/circle-td/sprites/atlas.json"
    ).then((res) => {
      if (!res) return;
      if (this.ctx) {
        this.atlasBitmap = res.bitmap;
        this.atlasManifest = res.manifest;
      } else {
        res.bitmap.close?.();
      }
    });
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

    // One wall-clock dt shared by hit flashes and particles (both age off real
    // elapsed time between frame() calls, not sim ticks).
    const now = nowMs();
    const dtMs = this.lastFrameAtMs === null ? 0 : Math.max(0, now - this.lastFrameAtMs);
    this.lastFrameAtMs = now;
    this.advanceHits(hits, dtMs);
    this.stepParticles(curr, hits, dtMs);

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
    this.drawParticles(ctx);

    ctx.restore();
  }

  destroy(): void {
    this.canvas = null;
    this.ctx = null;
    this.hits = [];
    this.lastFrameAtMs = null;
    this.particles = [];
    this.lastCreepPos.clear();
    this.creepTrails.clear();
    this.frameAliveIds.clear();
    // Release the decoded atlas + the reusable tint offscreen (guard nulls;
    // the load may never have resolved). Clearing ctx above also makes the
    // in-flight loadAtlas().then drop its bitmap instead of stashing it here.
    this.atlasBitmap?.close?.();
    this.atlasBitmap = null;
    this.atlasManifest = null;
    this.tintCanvas = null;
    this.tintCtx = null;
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
    // Phase 2 (S1): deepen the lit-stage floor and pull focus to centre. The
    // centre lifts BACKDROP_CENTER_LIFT of the way from bg-surface toward
    // bg-elevated (a stronger centre-lift than the old halfway stop), holds
    // bg-surface at the mid ring, then falls to bg-base pushed BACKDROP_EDGE_
    // DEEPEN toward black at the rim (a darker edge than plain bg-base). The
    // ceiling stays at bg-elevated — the tile grid (a later task) is drawn far
    // brighter (toward text-secondary), so it still reads as the brightest
    // thing on open ground at both centre and edge.
    g.addColorStop(0, rgbaOf(mixRgb(this.palette.bgSurfaceRgb, this.palette.bgElevatedRgb, BACKDROP_CENTER_LIFT), 1));
    g.addColorStop(0.5, this.palette.bgSurface);
    g.addColorStop(1, rgbaOf(mixRgb(this.palette.bgBaseRgb, BLACK, BACKDROP_EDGE_DEEPEN), 1));
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
    // sourced from the theme, by design. Phase 2 (S1) strengthens the peak
    // corner darkening via BACKDROP_VIGNETTE_ALPHA (up from the old 0.5).
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, `rgba(0,0,0,${BACKDROP_VIGNETTE_ALPHA})`);
    return g;
  }

  // Faint structural grid, built once (STAGE_W/STAGE_H are compile-time
  // constants) as a single Path2D of BACKDROP_GRID_PITCH-spaced lines and just
  // re-stroked every frame in drawBackdrop — no per-frame path building, the
  // same "build once in init()" model the two gradients above use. Path2D is a
  // browser API; guard so the jsdom test path (where init() already threw on
  // the null 2D context before reaching here) and any exotic embedding without
  // Path2D degrade to "no grid" rather than throwing.
  private makeBackdropGrid(): Path2D | null {
    if (typeof Path2D === "undefined") return null;
    const path = new Path2D();
    for (let x = BACKDROP_GRID_PITCH; x < STAGE_W; x += BACKDROP_GRID_PITCH) {
      path.moveTo(x, 0);
      path.lineTo(x, STAGE_H);
    }
    for (let y = BACKDROP_GRID_PITCH; y < STAGE_H; y += BACKDROP_GRID_PITCH) {
      path.moveTo(0, y);
      path.lineTo(STAGE_W, y);
    }
    return path;
  }

  private drawBackdrop(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = this.backdropGradient ?? this.palette.bgSurface;
    ctx.fillRect(0, 0, STAGE_W, STAGE_H);

    // Phase 2 (S1): a whisper-faint 32px structural grid, drawn between the
    // floor and the vignette — arena texture to read scale against, kept well
    // below the build-tile grid (BACKDROP_GRID_ALPHA ~0.09) so it never
    // competes. Neutral border-subtle tone only (no hue). Cached as a Path2D
    // in makeBackdropGrid and just re-stroked here, so it costs one stroke per
    // frame, not a rebuilt path; the vignette below then darkens it too.
    if (this.backdropGrid) {
      ctx.save();
      ctx.strokeStyle = rgbaOf(this.palette.borderSubtleRgb, BACKDROP_GRID_ALPHA);
      ctx.lineWidth = 1;
      ctx.stroke(this.backdropGrid);
      ctx.restore();
    }

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
  // tiles no longer abut the path). The rim bloom below spreads a few px past
  // TRACK_WIDTH — a cosmetic glow into the (~150px) inter-loop gap; it doesn't
  // change the clearance the geometry guarantees.
  //
  // Phase 2 (S2): each loop is drawn as a RECESSED DARK CHANNEL with a thin
  // bright NEUTRAL neon rim that blooms plus a faint center light-strip — the
  // Canvas2D twin of the WebGPU three-band track (trackBands.ts). Same
  // mechanism per loop, in the same draw order the WebGPU vertex list uses:
  //   1. bright rim stroke at full TRACK_WIDTH, with a shadowBlur glow (the
  //      bloom). Its color is the brighter OUTER / dimmer INNER neutral step,
  //      so — like the WebGPU rim feeding its bloom pass — the OUTER loop glows
  //      brighter than the INNER at the same blur radius.
  //   2. the dark recessed lane stroked ON TOP at TRACK_WIDTH - 2*EDGE_PX,
  //      glow off, leaving an EDGE_PX bright rim on each side.
  //   3. a faint thin center strip.
  // shadowBlur and lineDash are reset before returning so no glow/dash leaks
  // into drawTiles or any later stroke this frame.
  private drawTrack(ctx: CanvasRenderingContext2D): void {
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.setLineDash([]);

    // Neutral brightness steps of the border/text family (never a hue). OUTER's
    // rim is a brighter step than INNER's — the depth hierarchy is brightness
    // only, matching the WebGPU twin's per-loop rim mix ratios.
    const rimOuter = mixRgb(this.palette.borderMutedRgb, this.palette.textPrimaryRgb, TRACK_EDGE_MIX_OUTER);
    const rimInner = mixRgb(this.palette.borderMutedRgb, this.palette.textPrimaryRgb, TRACK_EDGE_MIX_INNER);
    const darkLane = mixRgb(this.palette.bgBaseRgb, BLACK, TRACK_DARK_MIX);
    const centerCol = mixRgb(this.palette.borderMutedRgb, this.palette.textPrimaryRgb, TRACK_CENTER_MIX);

    const lanes: ReadonlyArray<{ poly: Float64Array; rim: RGB }> = [
      { poly: this.trackOuterPx, rim: rimOuter },
      { poly: this.trackInnerPx, rim: rimInner },
    ];

    for (const lane of lanes) {
      const poly = lane.poly;
      if (poly.length < 4) continue;
      ctx.beginPath();
      ctx.moveTo(poly[0], poly[1]);
      for (let i = 2; i < poly.length; i += 2) ctx.lineTo(poly[i], poly[i + 1]);

      // 1. Bright rim (full width) + bloom. shadowColor tracks the rim color,
      //    so the brighter OUTER rim glows brighter than the INNER at the same
      //    blur radius — the Canvas2D echo of "brighter color => more bloom".
      ctx.lineWidth = TRACK_WIDTH;
      ctx.strokeStyle = rgbaOf(lane.rim, TRACK_EDGE_ALPHA);
      ctx.shadowBlur = TRACK_EDGE_GLOW;
      ctx.shadowColor = rgbaOf(lane.rim, TRACK_EDGE_ALPHA);
      ctx.stroke();

      // 2. Dark recessed lane on top (glow off), leaving an EDGE_PX rim visible.
      ctx.shadowBlur = 0;
      ctx.lineWidth = Math.max(1, TRACK_WIDTH - 2 * TRACK_EDGE_PX);
      ctx.strokeStyle = rgbaOf(darkLane, 1);
      ctx.stroke();

      // 3. Faint thin center strip — a subtle center/direction cue, gently lit.
      ctx.lineWidth = TRACK_CENTER_PX;
      ctx.strokeStyle = rgbaOf(centerCol, TRACK_CENTER_ALPHA);
      ctx.shadowBlur = TRACK_CENTER_GLOW;
      ctx.shadowColor = rgbaOf(centerCol, TRACK_CENTER_ALPHA);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // Belt-and-braces: no glow leaks into drawTiles / drawTowers this frame.
    ctx.shadowBlur = 0;
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
  //
  // Phase 2 (S3): the tiles become inset ROUNDED HUD-PADS — a roundRect fill a
  // step above the floor, a thin raised top-edge highlight line, and a thin
  // rounded border — the Canvas2D twin of the WebGPU three-sprite pad
  // (WebGpuRenderer tile loop: SHAPE_ROUND_SQUARE fill + top-highlight
  // SHAPE_SQUARE + SHAPE_ROUND_SQUARE_LINE border). half (TILE_SIZE*0.44) is
  // unchanged so the ~4px inter-tile gutter still reads as a grid; the corner
  // radius (TILE_CORNER_FRAC*half) mirrors the WGSL sdRoundBox r. Colors are
  // neutral brightness steps (never a hue). roundRect is used when available,
  // falling back to square rects on any context that lacks it (never a throw).
  private drawTiles(ctx: CanvasRenderingContext2D): void {
    const half = TILE_SIZE * 0.44;
    const radius = half * TILE_CORNER_FRAC;
    const hasRoundRect = typeof ctx.roundRect === "function";
    // Affordability signal: when a tower type is armed and unaffordable at
    // the current bank, every tile dims to read "you can't build right now"
    // — reusing state the renderer already tracks for the hover ghost
    // (setHighlight), no interface change needed.
    const armedUnaffordable = this.highlightTowerType >= 0 && !this.highlightAffordable;
    const dim = armedUnaffordable ? 0.6 : 1;
    // Fill: bg-elevated toward text-secondary, then a touch toward text-primary
    // for a lifted/raised read. Highlight: that fill mixed further toward
    // text-primary. Border: text-secondary.
    const fillRgb = mixRgb(mixRgb(this.palette.bgElevatedRgb, this.palette.textSecondaryRgb, TILE_FILL_MIX), this.palette.textPrimaryRgb, TILE_FILL_LIFT);
    const hiliteRgb = mixRgb(fillRgb, this.palette.textPrimaryRgb, TILE_HILITE_MIX);
    const fillStyle = rgbaOf(fillRgb, TILE_FILL_ALPHA * dim);
    const strokeStyle = rgbaOf(this.palette.textSecondaryRgb, TILE_BORDER_ALPHA * dim);
    const hiliteStyle = rgbaOf(hiliteRgb, TILE_HILITE_ALPHA * dim);
    const hiliteHalfX = half * TILE_HILITE_WIDTH_FRAC;
    for (let i = 0; i < this.tilesPx.length; i += 2) {
      const x = this.tilesPx[i];
      const y = this.tilesPx[i + 1];
      // Rounded fill.
      ctx.fillStyle = fillStyle;
      if (hasRoundRect) {
        ctx.beginPath();
        ctx.roundRect(x - half, y - half, half * 2, half * 2, radius);
        ctx.fill();
      } else {
        ctx.fillRect(x - half, y - half, half * 2, half * 2);
      }
      // Thin raised top-edge highlight (short flat bar just inside the top edge).
      ctx.fillStyle = hiliteStyle;
      ctx.fillRect(x - hiliteHalfX, y - half + TILE_HILITE_OFFSET_PX - TILE_HILITE_HALF_Y, hiliteHalfX * 2, TILE_HILITE_HALF_Y * 2);
      // Rounded border.
      ctx.strokeStyle = strokeStyle;
      ctx.lineWidth = TILE_BORDER_PX;
      if (hasRoundRect) {
        ctx.beginPath();
        ctx.roundRect(x - half, y - half, half * 2, half * 2, radius);
        ctx.stroke();
      } else {
        ctx.strokeRect(x - half, y - half, half * 2, half * 2);
      }
    }
  }

  // --- sprite atlas (Phase 1 texture art) ---

  // Renders one atlas frame, multiply-tinted by `tint`, into the reusable
  // offscreen and returns it (caller blits it scaled to the unit's on-screen
  // size). Tint approach that preserves BOTH luminance and transparency:
  //   1. draw the frame (white shape on transparent)
  //   2. 'multiply' the flat tint over it — colors the shape, but also floods
  //      the transparent background with opaque tint
  //   3. 'destination-in' the frame again — keeps the tinted pixels only where
  //      the sprite has alpha, restoring transparency (and its AA edge)
  // 'multiply' (not 'source-atop') is used so real Kenney art's internal
  // shading survives later; on the white placeholder it just yields the flat
  // tint. Returns null if the offscreen 2D context is unavailable.
  private tintedFrame(frame: Frame, tint: RGB): HTMLCanvasElement | null {
    const bitmap = this.atlasBitmap;
    if (!bitmap) return null;
    let tc = this.tintCanvas;
    if (!tc) {
      tc = document.createElement("canvas");
      this.tintCanvas = tc;
      this.tintCtx = tc.getContext("2d");
    }
    const tctx = this.tintCtx;
    if (!tctx) return null;
    if (tc.width !== frame.w || tc.height !== frame.h) {
      tc.width = frame.w;
      tc.height = frame.h;
    }
    tctx.globalCompositeOperation = "source-over";
    tctx.clearRect(0, 0, frame.w, frame.h);
    tctx.drawImage(bitmap, frame.x, frame.y, frame.w, frame.h, 0, 0, frame.w, frame.h);
    tctx.globalCompositeOperation = "multiply";
    tctx.fillStyle = rgbaOf(tint, 1);
    tctx.fillRect(0, 0, frame.w, frame.h);
    tctx.globalCompositeOperation = "destination-in";
    tctx.drawImage(bitmap, frame.x, frame.y, frame.w, frame.h, 0, 0, frame.w, frame.h);
    tctx.globalCompositeOperation = "source-over";
    return tc;
  }

  // The frame for a unit if the atlas is loaded AND actually has it, else null
  // — the single gate every textured-draw path checks before falling back to
  // its SDF drawing.
  private frameFor(name: string): Frame | null {
    const m = this.atlasManifest;
    if (!this.atlasBitmap || !m || !hasFrame(m, name)) return null;
    return m.frames[name];
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

    // Textured path: blit the tinted atlas frame scaled to the shape's
    // diameter (2r), keeping the same accent-family tint + glow the SDF path
    // uses. globalAlpha (set by the caller for the placement ghost) still
    // applies to drawImage, so the ghost preview gets the sprite too. Level
    // pips still draw on top. Falls through to the SDF shape below on any miss.
    const towerF = this.frameFor(towerFrame(clampedType));
    if (towerF) {
      const tinted = this.tintedFrame(towerF, bodyRgb);
      if (tinted) {
        // Textured sprites read larger than the SDF body (art has padding).
        const tr = r * TEX_TOWER_SCALE;
        ctx.save();
        ctx.shadowColor = rgbaOf(bodyRgb, 0.7);
        ctx.shadowBlur = selected ? 20 : 11;
        ctx.drawImage(tinted, x - tr, y - tr, tr * 2, tr * 2);
        ctx.restore();
        if (clampedLevel > 0) this.drawLevelPips(ctx, x, y, tr, clampedLevel);
        return;
      }
    }

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

      // Textured path: only the BODY becomes a tinted atlas sprite (the hp bar
      // below stays SDF). Sized to the same footprint the SDF body uses (air
      // is the larger diamond, baseR*1.35). Falls back to the SDF body block
      // on any miss.
      const creepF = this.frameFor(creepFrame(c.flags));
      const tinted = creepF ? this.tintedFrame(creepF, bodyRgb) : null;
      // Drawn body radius: textured sprites read larger (art has padding);
      // also drives the hp-bar offset so the bar clears the larger art.
      const drawnHalf = tinted ? (isAir ? baseR * 1.35 : baseR) * TEX_CREEP_SCALE : baseR;
      if (tinted) {
        ctx.save();
        ctx.shadowColor = rgbaOf(this.palette.blueRgb, 0.6);
        ctx.shadowBlur = isFast ? 13 : 8;
        // Rotate the sprite to face travel: the art points "up" (-y), so add
        // pi/2 to the heading (0 = +x).
        ctx.translate(c.x, c.y);
        ctx.rotate(c.heading + Math.PI / 2);
        ctx.drawImage(tinted, -drawnHalf, -drawnHalf, drawnHalf * 2, drawnHalf * 2);
        ctx.restore();
      } else {
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
      }

      this.drawHpBar(ctx, c.x, c.y - drawnHalf - 5, Math.max(14, drawnHalf * 1.8), c.hp01);
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

  // `dtMs` (wall-clock ms since the last frame) is computed once in frame() and
  // shared with stepParticles so both effects age off the exact same clock.
  private advanceHits(incoming: HitEvent[], dtMs: number): void {
    for (const h of incoming) this.hits.push({ x: h.x, y: h.y, tx: h.tx, ty: h.ty, kind: h.kind, ageMs: 0 });
    if (dtMs > 0) {
      for (const h of this.hits) h.ageMs += dtMs;
    }
    if (this.hits.length > 0) {
      this.hits = this.hits.filter((h) => h.ageMs < HIT_LIFETIME_MS);
    }
  }

  // Whether the atlas is loaded AND carries all four FX frames — the gate for
  // spawning/drawing particles (else the SDF fallback draws none).
  private fxReady(): boolean {
    return (
      this.frameFor("fx-glow") !== null && this.frameFor("fx-star") !== null &&
      this.frameFor("fx-muzzle") !== null && this.frameFor("fx-smoke") !== null
    );
  }

  // Spawns death bursts + muzzle flashes and ages the list by `dtMs`. Death
  // detection is render-rate-independent (see the WebGPU twin's comment):
  // prev/curr are stable between sim ticks, so an id in lastCreepPos (rebuilt
  // each render from curr) but absent from curr this render died — spawn one
  // burst at its last position, then rebuild the map so it never re-spawns.
  // Skipped on gameOver so the end-of-run wipe doesn't fire dozens at once.
  private stepParticles(curr: RenderSnapshot, hits: HitEvent[], dtMs: number): void {
    if (!this.fxReady()) return;

    if (!curr.gameOver) {
      const currIds = new Set<number>();
      for (let i = 0; i < curr.creepCount; i++) currIds.add(curr.creepId[i]);
      for (const [id, pos] of this.lastCreepPos) {
        if (!currIds.has(id) && this.particles.length < MAX_PARTICLES) {
          this.particles.push(...spawnDeathBurst(pos[0], pos[1]));
        }
      }
    }

    this.lastCreepPos.clear();
    for (let i = 0; i < curr.creepCount; i++) {
      this.lastCreepPos.set(curr.creepId[i], [curr.creepXY[i * 2], curr.creepXY[i * 2 + 1]]);
    }

    // Muzzle flash per incoming hit: fx-muzzle art points "up" (-y), so aim it
    // along the tower->creep vector with +pi/2 (0 = +x).
    for (const h of hits) {
      if (this.particles.length >= MAX_PARTICLES) break;
      const ang = Math.atan2(h.ty - h.y, h.tx - h.x) + Math.PI / 2;
      this.particles.push(...spawnMuzzle(h.x, h.y, ang));
    }

    this.particles = advanceParticles(this.particles, dtMs);
    if (this.particles.length > MAX_PARTICLES) this.particles.length = MAX_PARTICLES;
  }

  // Maps a particle's `tint` to a concrete palette RGB (0..255). Mirrors the
  // WebGPU mapping so both backends read on-brand.
  private particleTint(tint: ParticleTint): RGB {
    const p = this.palette;
    switch (tint) {
      case "core": return mixRgb(p.accentHoverRgb, WHITE, 0.4); // white-hot flash center
      case "spark": return p.textPrimaryRgb;                    // white sparks
      case "smoke": return mixRgb(p.textSecondaryRgb, p.blueRgb, 0.35); // desaturated grey/blue
      case "muzzle": return p.accentHoverRgb;                   // hot muzzle flame
    }
  }

  // Draws each live particle as a tinted atlas frame with ADDITIVE blending
  // ("lighter"), so overlapping glows/sparks accumulate like the WebGPU bloom.
  // World-space (called inside the fitted transform, after drawHits). Any frame
  // that fails to resolve/tint is simply skipped.
  private drawParticles(ctx: CanvasRenderingContext2D): void {
    if (this.particles.length === 0) return;
    for (const p of this.particles) {
      const f = this.frameFor(p.frame);
      if (!f) continue;
      const t = p.lifeMs > 0 ? p.ageMs / p.lifeMs : 1;
      const d = particleDraw(p, t);
      if (d.alpha <= 0) continue;
      const tinted = this.tintedFrame(f, this.particleTint(p.tint));
      if (!tinted) continue;
      const size = d.size;
      ctx.save();
      ctx.globalAlpha = d.alpha;
      ctx.globalCompositeOperation = "lighter";
      ctx.translate(p.x, p.y);
      ctx.rotate(d.rot);
      ctx.drawImage(tinted, -size, -size, size * 2, size * 2);
      ctx.restore();
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
