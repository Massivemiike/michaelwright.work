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

/** Remove the half-open interval [a, b) from column x's spans. */
function removeInterval(t: Terrain, x: number, a: number, b: number): void {
  if (b <= a) return;
  const o = x * STRIDE;
  const n = t.spanCount[x];
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const top = t.spans[o + i * 2];
    const bot = t.spans[o + i * 2 + 1];
    if (bot <= a || top >= b) {
      out.push(top, bot);
      continue;
    }
    if (top < a) out.push(top, a);
    if (bot > b) out.push(b, bot);
  }
  // More pieces than the fixed budget: keep the LOWEST MAX_SPANS (nearest the
  // floor) and drop the rest. That dirt is lost rather than poured — a
  // vanishingly rare case (8+ separate holes in one column in one shot) that
  // stays fully deterministic.
  const pieces = out.length / 2;
  const keep = Math.min(pieces, MAX_SPANS);
  const first = pieces - keep;
  for (let i = 0; i < keep; i++) {
    t.spans[o + i * 2] = out[(first + i) * 2];
    t.spans[o + i * 2 + 1] = out[(first + i) * 2 + 1];
  }
  t.spanCount[x] = keep;
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
