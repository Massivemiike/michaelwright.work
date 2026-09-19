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
import type { Renderer, RendererCaps, HitEvent } from "../Renderer";
import { interpolateById } from "../Renderer";
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
  bgSurface: string;
  borderSubtle: string;
  accent: string;
  accentRgb: RGB;
  blue: string;
  blueRgb: RGB;
}

interface Transform {
  scale: number;
  offsetX: number;
  offsetY: number;
}

interface HitFlash {
  x: number;
  y: number;
  kind: number;
  ageMs: number;
}

const FALLBACK_PALETTE_HEX = {
  bgBase: "#08080C",
  bgSurface: "#0F0F15",
  borderSubtle: "#1F1F2E",
  accent: "#FF3B2F",
  blue: "#7FDBFF",
};

const IDENTITY_TRANSFORM: Transform = { scale: 1, offsetX: 0, offsetY: 0 };

// Path "width" for the stroked track polylines — imported from content.ts
// (final-review finding #5) rather than kept as a local copy: half of it
// (TILE_SIZE) matches content.ts's FLANK_OFFSET so a buildable tile's near
// edge sits right against the drawn track edge, AND content.ts's own
// OUTER/INNER ring-to-ring gap is sized directly off this same constant —
// two files agreeing by comment was how the previous geometry drifted out
// of sync in the first place.

// How long a hit flash burst stays visible, in real milliseconds (this is a
// renderer-side visual effect timed off wall-clock frame delivery, not sim
// ticks — the sim has no notion of "how a hit should fade").
const HIT_LIFETIME_MS = 240;

function hexToRgb(hex: string): RGB {
  const cleaned = hex.trim().replace("#", "");
  const full = cleaned.length === 3 ? cleaned.split("").map((c) => c + c).join("") : cleaned;
  const num = Number.parseInt(full, 16);
  const n = Number.isFinite(num) ? num : 0;
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbaOf(c: RGB, alpha: number): string {
  return `rgba(${c.r},${c.g},${c.b},${alpha})`;
}

function shadeOf(c: RGB, factor: number): RGB {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return { r: clamp(c.r * factor), g: clamp(c.g * factor), b: clamp(c.b * factor) };
}

function readPalette(): Palette {
  const cs = getComputedStyle(document.documentElement);
  const read = (name: string, fallback: string): string => {
    const v = cs.getPropertyValue(name).trim();
    return v.length > 0 ? v : fallback;
  };
  const accent = read("--color-accent", FALLBACK_PALETTE_HEX.accent);
  const blue = read("--color-blue", FALLBACK_PALETTE_HEX.blue);
  return {
    bgBase: read("--color-bg-base", FALLBACK_PALETTE_HEX.bgBase),
    bgSurface: read("--color-bg-surface", FALLBACK_PALETTE_HEX.bgSurface),
    borderSubtle: read("--color-border-subtle", FALLBACK_PALETTE_HEX.borderSubtle),
    accent,
    accentRgb: hexToRgb(accent),
    blue,
    blueRgb: hexToRgb(blue),
  };
}

function fallbackPalette(): Palette {
  return {
    ...FALLBACK_PALETTE_HEX,
    accentRgb: hexToRgb(FALLBACK_PALETTE_HEX.accent),
    blueRgb: hexToRgb(FALLBACK_PALETTE_HEX.blue),
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

function nowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

export class Canvas2DRenderer implements Renderer {
  readonly caps: RendererCaps = { kind: "canvas2d", particles: false };

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private palette: Palette = fallbackPalette();
  private transform: Transform = IDENTITY_TRANSFORM;

  private trackOuterPx: Float64Array = new Float64Array(0);
  private trackInnerPx: Float64Array = new Float64Array(0);
  private tilesPx: Float64Array = new Float64Array(0);

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

  async init(canvas: HTMLCanvasElement): Promise<void> {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas2DRenderer: 2D canvas context unavailable");
    this.canvas = canvas;
    this.ctx = ctx;
    this.palette = readPalette();
    this.trackOuterPx = toFloatPairs(TRACK.outer);
    this.trackInnerPx = toFloatPairs(TRACK.inner);
    this.tilesPx = toFloatPairs(TILES);
  }

  resize(cssW: number, cssH: number, dpr: number): void {
    const canvas = this.canvas;
    if (!canvas) return;
    const pxW = Math.round(cssW * dpr);
    const pxH = Math.round(cssH * dpr);
    canvas.width = pxW;
    canvas.height = pxH;

    // One matrix does both jobs at once: scaling world (stage-px) units up
    // to device pixels, AND fitting the sim's fixed STAGE_W x STAGE_H box
    // into whatever aspect ratio the canvas got, letterboxed and centered.
    // Drawing code below works entirely in world-space stage px and never
    // touches dpr directly.
    const scale = pxW > 0 && pxH > 0 ? Math.min(pxW / STAGE_W, pxH / STAGE_H) : 1;
    const offsetX = (pxW - STAGE_W * scale) / 2;
    const offsetY = (pxH - STAGE_H * scale) / 2;
    this.transform = { scale, offsetX, offsetY };
  }

  // Renderer-specific extra, not part of the shared Renderer interface (see
  // Renderer.ts's comment on RendererCaps/Renderer — WebGPU would need its
  // own equivalent, not necessarily this exact method). Task 6 wires real
  // hover/selection input to this.
  setHighlightTower(index: number | null): void {
    this.highlightTowerIndex = index;
  }

  // Task 6's other extra: the placement ghost/range-preview at a hovered or
  // targeted (not-yet-built) tile. `tile: -1` clears it; `towerType: -1`
  // draws just a plain tile marker (hovering with nothing armed to place).
  // Kept off the shared Renderer interface for the same reason as
  // setHighlightTower above.
  setHighlight(tile: number, towerType: number): void {
    this.highlightTile = tile;
    this.highlightTowerType = towerType;
  }

  // Inverse of resize()'s world->device-px transform. rect.* is CSS px;
  // canvas.width/height is the device-pixel backing store resize() sized —
  // dividing by rect.width/height and multiplying by clientX/Y's
  // canvas-relative offset undoes both the dpr scale-up AND any CSS
  // stretching of the element beyond its backing store, exactly reversing
  // the two steps frame()'s ctx.setTransform(scale, 0, 0, scale, offsetX,
  // offsetY) plus the browser's own canvas-to-CSS-box stretch apply when
  // going the other direction.
  screenToWorld(clientX: number, clientY: number, canvas: HTMLCanvasElement): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect();
    const { scale, offsetX, offsetY } = this.transform;
    if (scale <= 0 || rect.width <= 0 || rect.height <= 0) {
      return { x: 0, y: 0 };
    }
    const deviceX = (clientX - rect.left) * (canvas.width / rect.width);
    const deviceY = (clientY - rect.top) * (canvas.height / rect.height);
    return { x: (deviceX - offsetX) / scale, y: (deviceY - offsetY) / scale };
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
  }

  // --- static geometry ---

  private drawTrack(ctx: CanvasRenderingContext2D): void {
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.lineWidth = TRACK_WIDTH;
    ctx.strokeStyle = this.palette.bgSurface;
    for (const poly of [this.trackOuterPx, this.trackInnerPx]) {
      if (poly.length < 4) continue;
      ctx.beginPath();
      ctx.moveTo(poly[0], poly[1]);
      for (let i = 2; i < poly.length; i += 2) ctx.lineTo(poly[i], poly[i + 1]);
      ctx.stroke();
    }
  }

  private drawTiles(ctx: CanvasRenderingContext2D): void {
    ctx.strokeStyle = this.palette.borderSubtle;
    ctx.lineWidth = 1;
    const half = TILE_SIZE * 0.32;
    for (let i = 0; i < this.tilesPx.length; i += 2) {
      const x = this.tilesPx[i];
      const y = this.tilesPx[i + 1];
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
      if (i === this.highlightTowerIndex) this.drawRangeRing(ctx, x, y, type, level);
      this.drawTowerShape(ctx, x, y, type, level);
    }
  }

  private drawRangeRing(ctx: CanvasRenderingContext2D, x: number, y: number, type: number, level: number): void {
    const def = TOWERS[type];
    if (!def) return;
    const range = toFloat(def.range0 + level * def.rangeStep);
    ctx.beginPath();
    ctx.arc(x, y, range, 0, Math.PI * 2);
    ctx.strokeStyle = rgbaOf(this.palette.accentRgb, 0.35);
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // Shape by type (Fast=circle, Air=triangle, Slow=diamond, Splash=square,
  // Damage=hexagon — matching TOWERS' declaration order in content.ts),
  // size and a brighter outline scaling with level.
  private drawTowerShape(ctx: CanvasRenderingContext2D, x: number, y: number, type: number, level: number): void {
    const clampedType = Math.max(0, Math.min(4, type));
    const clampedLevel = Math.max(0, Math.min(9, level));
    const baseR = 9 + clampedType * 1.5;
    const r = baseR + clampedLevel * 0.6;

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
    ctx.fillStyle = this.palette.accent;
    ctx.fill();

    if (clampedLevel > 0) {
      ctx.lineWidth = 1 + clampedLevel * 0.15;
      ctx.strokeStyle = rgbaOf(this.palette.accentRgb, 0.6);
      ctx.stroke();
    }
  }

  // --- placement ghost / hover marker (Task 6) ---

  private drawHighlight(ctx: CanvasRenderingContext2D): void {
    const tile = this.highlightTile;
    if (tile < 0 || tile * 2 + 1 >= this.tilesPx.length) return;
    const x = this.tilesPx[tile * 2];
    const y = this.tilesPx[tile * 2 + 1];
    const type = this.highlightTowerType;
    if (type < 0) {
      // Hovered/targeted tile with no tower armed — a plain marker square,
      // no ghost shape or range preview to draw.
      const half = TILE_SIZE * 0.42;
      ctx.strokeStyle = rgbaOf(this.palette.accentRgb, 0.5);
      ctx.lineWidth = 2;
      ctx.strokeRect(x - half, y - half, half * 2, half * 2);
      return;
    }
    // A would-be-placed tower always previews at level 0 (nothing to place
    // above L0), reusing the exact shape/range-ring drawing an actually
    // placed L0 tower would get, just translucent.
    this.drawRangeRing(ctx, x, y, type, 0);
    ctx.save();
    ctx.globalAlpha = 0.45;
    this.drawTowerShape(ctx, x, y, type, 0);
    ctx.restore();
  }

  // --- creeps ---

  private drawCreeps(ctx: CanvasRenderingContext2D, prev: RenderSnapshot, curr: RenderSnapshot, alpha: number): void {
    const creeps = interpolateById(prev, curr, alpha);
    for (const c of creeps) {
      const isAir = (c.flags & CREEP_AIR) !== 0;
      const isFast = (c.flags & CREEP_FAST) !== 0;
      const isHard = (c.flags & CREEP_HARD) !== 0;

      const baseR = isHard ? 7.5 : 5;
      const fillAlpha = isFast ? 1 : 0.8;
      const color = isHard ? shadeOf(this.palette.blueRgb, 0.55) : this.palette.blueRgb;

      ctx.beginPath();
      if (isAir) {
        // Hollow diamond ring reads as "off the ground"; land creeps below
        // are solid filled circles.
        const r = baseR * 1.3;
        ctx.moveTo(c.x, c.y - r);
        ctx.lineTo(c.x + r, c.y);
        ctx.lineTo(c.x, c.y + r);
        ctx.lineTo(c.x - r, c.y);
        ctx.closePath();
        ctx.strokeStyle = rgbaOf(color, fillAlpha);
        ctx.lineWidth = 1.5;
        ctx.stroke();
      } else {
        ctx.arc(c.x, c.y, baseR, 0, Math.PI * 2);
        ctx.fillStyle = rgbaOf(color, fillAlpha);
        ctx.fill();
      }

      this.drawHpBar(ctx, c.x, c.y - baseR - 5, baseR * 2, c.hp01);
    }
  }

  private drawHpBar(ctx: CanvasRenderingContext2D, cx: number, topY: number, width: number, hp01: number): void {
    const h = 2;
    const x = cx - width / 2;
    const clamped = Math.max(0, Math.min(1, hp01));
    ctx.fillStyle = this.palette.borderSubtle;
    ctx.fillRect(x, topY, width, h);
    ctx.fillStyle = this.palette.blue;
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

    for (const h of incoming) this.hits.push({ x: h.x, y: h.y, kind: h.kind, ageMs: 0 });
    if (dtMs > 0) {
      for (const h of this.hits) h.ageMs += dtMs;
    }
    if (this.hits.length > 0) {
      this.hits = this.hits.filter((h) => h.ageMs < HIT_LIFETIME_MS);
    }
  }

  private drawHits(ctx: CanvasRenderingContext2D): void {
    if (this.hits.length === 0) return;
    for (const h of this.hits) {
      const t = h.ageMs / HIT_LIFETIME_MS; // 0 (just happened) -> 1 (expired)
      const r = 3 + t * 10; // small outward burst
      ctx.beginPath();
      ctx.arc(h.x, h.y, r, 0, Math.PI * 2);
      ctx.strokeStyle = rgbaOf(this.palette.accentRgb, Math.max(0, 1 - t));
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }
}
