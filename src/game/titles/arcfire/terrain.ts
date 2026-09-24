// src/game/titles/arcfire/terrain.ts
//
// Column terrain with collapsing dirt (spec §3.1). Between turns the terrain
// IS a heightfield: height[x] is the surface y of column x (y-down; solid from
// height[x] down to the floor at WORLD_H). During a shot each column may hold
// several solid spans — tunnels, overhangs, floating dirt — so projectiles
// collide with the real shape. settle() then drops every floating span onto
// the stack below it, which always collapses a column back to a single span,
// i.e. back to a heightfield. Integer px throughout.
import { nextRange, type Rng } from "@/game/sim/math/rng";
import {
  WORLD_W, WORLD_H, MAX_SPANS, TERRAIN_MIN_Y, TERRAIN_MAX_Y, TERRAIN_CTRL_MIN_Y, TERRAIN_CTRL_MAX_Y,
  TERRAIN_CTRL_STEP, TERRAIN_BLUR_R, TERRAIN_BLUR_PASSES, SPAWN_X, SPAWN_FLAT,
} from "./constants";
import { isqrt, clampInt, idiv } from "./imath";

export interface Terrain {
  height: Int32Array; // [WORLD_W] settled surface y per column
  spanCount: Int32Array; // [WORLD_W] live spans per column during a shot
  spans: Int32Array; // [WORLD_W * MAX_SPANS * 2] (top, bottom) pairs; top < bottom; ordered top-down
}

export interface SettleFall {
  x: number;
  top: number; // the span's top before it fell
  bottom: number; // the span's bottom before it fell
  fall: number; // px it dropped
}

export interface SettleResult {
  heights: Int32Array; // the new heightfield
  falls: SettleFall[]; // every span that moved, for the pour animation
}

const STRIDE = MAX_SPANS * 2;

// Scratch for the column edits: one column's pieces, at most MAX_SPANS + 1 of
// them. Module-level so an edit allocates nothing; the sim is single-threaded
// and no edit re-enters another.
const PIECES = new Int32Array(2 * (MAX_SPANS + 1));

export function makeTerrain(): Terrain {
  return {
    height: new Int32Array(WORLD_W),
    spanCount: new Int32Array(WORLD_W),
    spans: new Int32Array(WORLD_W * STRIDE),
  };
}

export function cloneTerrain(t: Terrain): Terrain {
  return { height: t.height.slice(), spanCount: t.spanCount.slice(), spans: t.spans.slice() };
}

/** Rebuild the in-shot spans from the settled heightfield: one span per column. */
export function spansFromHeight(t: Terrain): void {
  for (let x = 0; x < WORLD_W; x++) {
    if (t.height[x] >= WORLD_H) {
      t.spanCount[x] = 0;
      continue;
    }
    const o = x * STRIDE;
    t.spanCount[x] = 1;
    t.spans[o] = t.height[x];
    t.spans[o + 1] = WORLD_H;
  }
}

/** Seeded rolling hills: random control points, linear interpolation, box blur, clamp, then flatten both spawn pads. */
export function generateTerrain(t: Terrain, rng: Rng): void {
  const lo = TERRAIN_CTRL_MIN_Y;
  const hi = TERRAIN_CTRL_MAX_Y;
  const nCtrl = idiv(WORLD_W, TERRAIN_CTRL_STEP) + 1;
  const ctrl = new Int32Array(nCtrl);
  for (let i = 0; i < nCtrl; i++) ctrl[i] = lo + nextRange(rng, hi - lo + 1);
  const h = new Int32Array(WORLD_W);
  for (let x = 0; x < WORLD_W; x++) {
    const i = Math.min(nCtrl - 2, idiv(x, TERRAIN_CTRL_STEP));
    const u = x - i * TERRAIN_CTRL_STEP;
    h[x] = ctrl[i] + idiv((ctrl[i + 1] - ctrl[i]) * u, TERRAIN_CTRL_STEP);
  }
  for (let p = 0; p < TERRAIN_BLUR_PASSES; p++) boxBlur(h, TERRAIN_BLUR_R);
  for (let x = 0; x < WORLD_W; x++) h[x] = clampInt(h[x], TERRAIN_MIN_Y, TERRAIN_MAX_Y);
  for (const sx of SPAWN_X) {
    const level = h[sx];
    for (let x = sx - SPAWN_FLAT; x <= sx + SPAWN_FLAT; x++) h[x] = level;
  }
  t.height.set(h);
  spansFromHeight(t);
}

function boxBlur(h: Int32Array, r: number): void {
  const src = h.slice();
  for (let x = 0; x < WORLD_W; x++) {
    let sum = 0;
    for (let k = x - r; k <= x + r; k++) sum += src[k < 0 ? 0 : k >= WORLD_W ? WORLD_W - 1 : k];
    h[x] = idiv(sum, 2 * r + 1);
  }
}

/** Is (x, y) solid? Columns outside the world are empty; everything at or below the floor is solid. */
export function isSolid(t: Terrain, x: number, y: number): boolean {
  if (x < 0 || x >= WORLD_W) return false;
  if (y >= WORLD_H) return true;
  const o = x * STRIDE;
  const n = t.spanCount[x];
  for (let i = 0; i < n; i++) {
    if (y >= t.spans[o + i * 2] && y < t.spans[o + i * 2 + 1]) return true;
  }
  return false;
}

/** The first solid y at or below y in column x (WORLD_H when nothing is: the floor). x must be in the world. */
export function groundBelow(t: Terrain, x: number, y: number): number {
  const o = x * STRIDE;
  const n = t.spanCount[x];
  for (let i = 0; i < n; i++) {
    const top = t.spans[o + i * 2];
    if (t.spans[o + i * 2 + 1] > y) return top > y ? top : y;
  }
  return y > WORLD_H ? y : WORLD_H;
}

/** The top of column x's highest span (WORLD_H if the column is empty). x must be in the world. */
export function surfaceTop(t: Terrain, x: number): number {
  return t.spanCount[x] > 0 ? t.spans[x * STRIDE] : WORLD_H;
}

/** Remove a solid disc of radius r centred on (cx, cy) from the in-shot spans. */
export function carveCircle(t: Terrain, cx: number, cy: number, r: number): void {
  const r2 = r * r;
  const x0 = Math.max(0, cx - r);
  const x1 = Math.min(WORLD_W - 1, cx + r);
  for (let x = x0; x <= x1; x++) {
    const dx = x - cx;
    const dy = isqrt(r2 - dx * dx);
    removeInterval(t, x, cy - dy, cy + dy + 1);
  }
}

/** Write `pieces` (top, bottom) pairs from PIECES into column x, keeping the LOWEST MAX_SPANS. */
function writeColumn(t: Terrain, x: number, pieces: number): void {
  const o = x * STRIDE;
  const keep = pieces < MAX_SPANS ? pieces : MAX_SPANS;
  const first = pieces - keep;
  for (let i = 0; i < keep; i++) {
    t.spans[o + i * 2] = PIECES[(first + i) * 2];
    t.spans[o + i * 2 + 1] = PIECES[(first + i) * 2 + 1];
  }
  t.spanCount[x] = keep;
}

/**
 * Remove the half-open interval [a, b) from column x's spans. More pieces than
 * MAX_SPANS (8+ separate holes in one column in one shot): keep the LOWEST
 * MAX_SPANS and drop the top one — Plan 1's rule, deterministic and rare.
 */
export function removeInterval(t: Terrain, x: number, a: number, b: number): void {
  if (b <= a) return;
  const o = x * STRIDE;
  const n = t.spanCount[x];
  let p = 0;
  for (let i = 0; i < n; i++) {
    const top = t.spans[o + i * 2];
    const bot = t.spans[o + i * 2 + 1];
    if (bot <= a || top >= b) {
      PIECES[p++] = top;
      PIECES[p++] = bot;
      continue;
    }
    if (top < a) {
      PIECES[p++] = top;
      PIECES[p++] = a;
    }
    if (bot > b) {
      PIECES[p++] = b;
      PIECES[p++] = bot;
    }
  }
  writeColumn(t, x, p / 2);
}

/**
 * Add solid [a, b) to column x (a union), clamped to [0, WORLD_H). Spans stay
 * ordered top-down, disjoint and non-touching. Never loses dirt: if the new
 * piece would be a 9th span, it is extended down to absorb the span below it
 * (or, with none below, up to absorb the span above) — dirt lands on dirt.
 */
export function addInterval(t: Terrain, x: number, a: number, b: number): void {
  if (a < 0) a = 0;
  if (b > WORLD_H) b = WORLD_H;
  if (b <= a) return;
  const o = x * STRIDE;
  const n = t.spanCount[x];
  let p = 0;
  let at = -1; // piece index of the new interval
  for (let i = 0; i < n; i++) {
    const top = t.spans[o + i * 2];
    const bot = t.spans[o + i * 2 + 1];
    if (bot < a) { // wholly above, not touching
      PIECES[p++] = top;
      PIECES[p++] = bot;
      continue;
    }
    if (top > b) { // wholly below, not touching
      if (at < 0) {
        at = p / 2;
        PIECES[p++] = a;
        PIECES[p++] = b;
      }
      PIECES[p++] = top;
      PIECES[p++] = bot;
      continue;
    }
    if (top < a) a = top; // overlapping or touching: absorb it into the new interval
    if (bot > b) b = bot;
  }
  if (at < 0) {
    at = p / 2;
    PIECES[p++] = a;
    PIECES[p++] = b;
  }
  let pieces = p / 2;
  if (pieces > MAX_SPANS) {
    // Close the gap on one side of the new piece: below it if there is a span below, else above it.
    const j = at + 1 < pieces ? at : at - 1; // merge pieces j and j + 1
    PIECES[j * 2 + 1] = PIECES[(j + 1) * 2 + 1];
    for (let k = j + 1; k < pieces - 1; k++) {
      PIECES[k * 2] = PIECES[(k + 1) * 2];
      PIECES[k * 2 + 1] = PIECES[(k + 1) * 2 + 1];
    }
    pieces--;
  }
  writeColumn(t, x, pieces);
}

// Scratch for carveCapsule: per-column [lo, hi) bounds over the columns it touches.
const CAP_LO = new Int32Array(WORLD_W);
const CAP_HI = new Int32Array(WORLD_W);

/**
 * Remove a capsule — the union of radius-r discs centred on every <= 1 px
 * sample of the integer segment (x0, y0) -> (x1, y1) — from the spans. One
 * removeInterval per column: consecutive samples are <= 1 px apart, so each
 * column's section of the union is a single interval. A zero-length capsule
 * is exactly carveCircle.
 */
export function carveCapsule(t: Terrain, x0: number, y0: number, x1: number, y1: number, r: number): void {
  if (r < 0) return;
  const left = Math.max(0, Math.min(x0, x1) - r);
  const right = Math.min(WORLD_W - 1, Math.max(x0, x1) + r);
  if (right < left) return;
  for (let c = left; c <= right; c++) {
    CAP_LO[c] = 2147483647;
    CAP_HI[c] = -2147483648;
  }
  const half = new Int32Array(r + 1); // half[d] = the disc's half-height d columns from its centre
  for (let d = 0; d <= r; d++) half[d] = isqrt(r * r - d * d);
  const dx = x1 - x0;
  const dy = y1 - y0;
  const n = Math.max(Math.abs(dx), Math.abs(dy), 1);
  for (let i = 0; i <= n; i++) {
    const sx = x0 + idiv(dx * i, n);
    const sy = y0 + idiv(dy * i, n);
    const c0 = Math.max(left, sx - r);
    const c1 = Math.min(right, sx + r);
    for (let c = c0; c <= c1; c++) {
      const h = half[c < sx ? sx - c : c - sx];
      if (sy - h < CAP_LO[c]) CAP_LO[c] = sy - h;
      if (sy + h + 1 > CAP_HI[c]) CAP_HI[c] = sy + h + 1;
    }
  }
  for (let c = left; c <= right; c++) if (CAP_LO[c] < CAP_HI[c]) removeInterval(t, c, CAP_LO[c], CAP_HI[c]);
}

/**
 * Drop every floating span straight down onto the stack below it. All solid
 * material in a column ends up as ONE span resting on the floor, so the new
 * surface is WORLD_H minus the column's total solid length. `collect = false`
 * skips building `falls` (the quiet resolve path); the terrain is identical.
 */
export function settle(t: Terrain, collect = true): SettleResult {
  const falls: SettleFall[] = [];
  for (let x = 0; x < WORLD_W; x++) {
    const o = x * STRIDE;
    let stackTop = WORLD_H;
    for (let i = t.spanCount[x] - 1; i >= 0; i--) {
      const top = t.spans[o + i * 2];
      const bot = t.spans[o + i * 2 + 1];
      if (collect && stackTop > bot) falls.push({ x, top, bottom: bot, fall: stackTop - bot });
      stackTop -= bot - top;
    }
    t.height[x] = stackTop;
  }
  spansFromHeight(t);
  return { heights: t.height.slice(), falls };
}
