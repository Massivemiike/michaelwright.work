// src/game/titles/arcfire/ai/search.ts
//
// One weapon's search (spec §5 steps 1-2), under a fixed allowance of full
// resolves ("sims"):
//   1. its probe model's landing grid from the shooter's position (probe.ts);
//   2. refine centres: each angle row's aim that lands nearest the enemy,
//      rows in (distance, cell) order and at least one refine box apart, so
//      the boxes spread along the whole firing-solution curve (direct shots
//      and lobs); Rookie has no box, so its centres are single cells;
//   3. every cell of each centre's refine box, in order, fully resolved on a
//      scratch copy (copyMatchInto + resolveTurnPoints), each (angle, power)
//      at most once, until the allowance is spent;
//   4. the answer: the best value at an exact aim, or (a noise-aware tier)
//      the best expected value under the tier's own noise over the aims whose
//      whole noise support was resolved, compared with the best exact aim's
//      expected value when its support is resolved (completing it only if the
//      share still has room, which it seldom has: the boxes spend it).
// A candidate's value is points to the enemy minus points gifted by
// self-damage (spec §5). Pure with respect to the match: nothing here writes
// the searched state or draws from its RNG. Every comparison is a strict >
// in a fixed order, so ties keep the earlier candidate. Integer math only.
import { fromInt } from "@/game/sim/math/fixed";
import { cloneMatch, copyMatchInto, type MatchState } from "../state";
import { resolveTurnPoints } from "../resolve";
import { spansFromHeight } from "../terrain";
import { hitCircles, moveTarget } from "../tanks";
import { ROSTER } from "../weapons/roster";
import { idiv } from "../imath";
import { STEPS_PER_SEC, TANK_HIT_DY } from "../constants";
import { probeModelOf, type ProbeModel } from "./model";
import { landingGrid, type Grid, type ProbeBoard } from "./probe";
import { kernelTotal, noiseKernel } from "./noise";
import type { TierSpec } from "./tiers";

/** A candidate command and its worth: ev = value x ctx.scale (the expected value under noise for a noise-aware tier), raw = the value at exactly this aim. */
export interface Cand {
  w: number; // roster index
  move: -1 | 0 | 1;
  angle: number;
  power: number;
  ev: number;
  raw: number;
}

export type AiReason = "random" | "best" | "move" | "saveT3" | "dirt" | "forcedDirt" | "inertOnly";

/** What one AI decision cost and why it chose: counts only, never a clock. */
export interface AiStats {
  sims: number; // full resolves: never above the tier's budget
  probes: number; // probe flights
  staySims: number;
  moveSims: number;
  dirtSims: number;
  reply: number; // the enemy's estimated best reply to the offensive pick (-1: not estimated)
  replyDirt: number; // ... after the best DIRT option (-1: none tried)
  reason: AiReason;
}

export interface SearchCtx {
  m: MatchState; // the state searched: never written
  t: TierSpec;
  me: number;
  foe: number;
  base: MatchState; // m's scratch copy with spans built: every probe of this decision flies over it
  windStep: number;
  ka: Int32Array; // the angle noise kernel ([1] when the tier is not noise-aware)
  kp: Int32Array; // the power noise kernel ([1] likewise)
  scale: number; // the kernels' combined total: every ev is points x scale
  stats: AiStats;
  grids: Map<string, Grid>; // (side, model key) -> landing grid; get/set only, never iterated
}

// --- module scratch: the AI runs one decision at a time on its thread (worker or verifier), and never re-enters

const SLOTS: (MatchState | null)[] = [null, null, null];
export const BASE_SLOT = 0; // the probe board of a decision
export const RESOLVE_SLOT = 1; // every candidate resolve
export const POST_SLOT = 2; // a board after the AI's own shot (the DIRT rule)

/** A reused scratch match holding a copy of src (spans stale until a resolve or spansFromHeight). */
export function scratch(slot: number, src: MatchState): MatchState {
  const s = SLOTS[slot];
  if (s === null) {
    const c = cloneMatch(src);
    SLOTS[slot] = c;
    return c;
  }
  copyMatchInto(s, src);
  return s;
}

const CELLS = 181 * 101; // every (angle, power) a command can name: key a * 101 + p
const VALS = new Int32Array(CELLS); // the value of each resolved aim of the current weapon ...
const STAMP = new Int32Array(CELLS); // ... valid while STAMP[key] === GEN
const ORDER = new Int32Array(CELLS); // the keys resolved for the current weapon, in resolution order
let GEN = 0;
let COUNT = 0;

/** A fresh generation: forget every value (the stamp wraps before 2^31, so decisions never depend on history). */
function newWeapon(): void {
  GEN++;
  if (GEN > 0x3fffffff) {
    STAMP.fill(0);
    GEN = 1;
  }
  COUNT = 0;
}

export const newStats = (): AiStats => ({
  sims: 0, probes: 0, staySims: 0, moveSims: 0, dirtSims: 0, reply: -1, replyDirt: -1, reason: "best",
});

export function makeCtx(m: MatchState, t: TierSpec, stats: AiStats): SearchCtx {
  const base = scratch(BASE_SLOT, m);
  spansFromHeight(base.terrain);
  const ka = noiseKernel(t.noiseAware ? t.noiseA : 0);
  const kp = noiseKernel(t.noiseAware ? t.noiseP : 0);
  return {
    m, t, me: m.shooter, foe: 1 - m.shooter, base, windStep: idiv(fromInt(m.wind), STEPS_PER_SEC),
    ka, kp, scale: kernelTotal(ka) * kernelTotal(kp), stats, grids: new Map(),
  };
}

/** The probe board with the shooter where it stands (side 0) or after a legal one-step move to `side`. */
export function boardAt(ctx: SearchCtx, side: -1 | 0 | 1): ProbeBoard {
  const b = ctx.base;
  const tanks = hitCircles(b);
  if (side !== 0) {
    const nx = moveTarget(b, ctx.me, side);
    tanks[ctx.me] = { x: nx, y: b.terrain.height[nx] - TANK_HIT_DY };
  }
  return { t: b.terrain, tanks, me: ctx.me, windStep: ctx.windStep };
}

/** The tier's landing grid for `model` from `side`, flown once per decision. */
export function gridFor(ctx: SearchCtx, side: -1 | 0 | 1, model: ProbeModel): Grid {
  const key = `${side}|${model.key}`;
  let g = ctx.grids.get(key);
  if (g === undefined) {
    g = landingGrid(boardAt(ctx, side), model, ctx.t, ctx.stats);
    ctx.grids.set(key, g);
  }
  return g;
}

/** Resolve one candidate on the scratch copy: points scored minus points gifted (spec §5). */
export function valueOf(ctx: SearchCtx, from: MatchState, w: number, move: -1 | 0 | 1, angle: number, power: number): number {
  const r = scratch(RESOLVE_SLOT, from);
  const shooter = r.shooter;
  const pts = resolveTurnPoints(r, { move, weapon: w, angle, power });
  ctx.stats.sims++;
  return pts[shooter] - pts[1 - shooter];
}

/** The grid's cells in (metric, cell) order: every cell (perCell), or each angle row's nearest cell with rows at least `gap` apart. */
export function centres(g: Grid, gap: number, perCell: boolean): number[] {
  const np = g.powers.length;
  const cand: number[] = [];
  for (let i = 0; i < g.angles.length; i++) {
    if (perCell) {
      for (let j = 0; j < np; j++) cand.push(i * np + j);
      continue;
    }
    let bc = i * np;
    for (let j = 1; j < np; j++) if (g.metric[i * np + j] < g.metric[bc]) bc = i * np + j;
    cand.push(bc);
  }
  cand.sort((x, y) => g.metric[x] - g.metric[y] || x - y);
  if (perCell || gap <= 1) return cand;
  const out: number[] = [];
  for (const c of cand) {
    const row = idiv(c, np);
    let ok = true;
    for (const o of out) {
      const d = idiv(o, np) - row;
      if (d < gap && d > 0 - gap) {
        ok = false;
        break;
      }
    }
    if (ok) out.push(c);
  }
  return out;
}

const clampA = (a: number): number => (a < 0 ? 0 : a > 180 ? 180 : a);
const clampP = (p: number): number => (p < 0 ? 0 : p > 100 ? 100 : p);

/** The value at (a, p) if resolved for the current weapon, else null. */
function known(a: number, p: number): number | null {
  const k = a * 101 + p;
  return STAMP[k] === GEN ? VALS[k] : null;
}

/** The expected value x scale of aiming at (a, p) under the tier's noise (clamped as the command is), or null while its support is not all resolved. A beam ignores power: all its power weight sits on p. */
function evAt(ctx: SearchCtx, a: number, p: number, beam: boolean): number | null {
  const ka = ctx.ka;
  const kp = ctx.kp;
  const na = (ka.length - 1) >> 1;
  const np = (kp.length - 1) >> 1;
  let sum = 0;
  for (let i = 0; i < ka.length; i++) {
    const aa = clampA(a + i - na);
    for (let j = 0; j < kp.length; j++) {
      const v = known(aa, beam ? p : clampP(p + j - np));
      if (v === null) return null;
      sum += ka[i] * kp[j] * v;
    }
  }
  return sum;
}

/** Resolve (a, p) for weapon w if it is new and the allowance has room; true when it was resolved. */
function tryResolve(ctx: SearchCtx, w: number, move: -1 | 0 | 1, a: number, p: number, left: { n: number }): boolean {
  if (a < 0 || a > 180 || p < 0 || p > 100) return false;
  const k = a * 101 + p;
  if (STAMP[k] === GEN || left.n <= 0) return false;
  left.n--;
  VALS[k] = valueOf(ctx, ctx.m, w, move, a, p);
  STAMP[k] = GEN;
  ORDER[COUNT++] = k;
  return true;
}

/** Weapon w's best candidate after `move` (the move is part of every resolve), spending at most `share` sims. */
export function searchWeapon(ctx: SearchCtx, w: number, move: -1 | 0 | 1, share: number): Cand {
  const t = ctx.t;
  const model = probeModelOf(ROSTER[w]);
  const beam = model.beam !== null;
  const g = gridFor(ctx, move, model);
  const rA = t.refineA;
  const rP = beam ? 0 : t.refineP;
  const perCell = t.refineA === 0 && t.refineP === 0;
  const cs = centres(g, perCell ? 0 : idiv(2 * rA + t.angleStep, t.angleStep), perCell); // ceil((2 rA + 1) / angleStep) rows: the boxes never overlap
  const left = { n: share };
  newWeapon();
  for (const c of cs) {
    if (left.n <= 0) break;
    const a0 = g.angles[idiv(c, g.powers.length)];
    const p0 = g.powers[c % g.powers.length];
    for (let da = 0 - rA; da <= rA; da++) for (let dp = 0 - rP; dp <= rP; dp++) tryResolve(ctx, w, move, a0 + da, p0 + dp, left);
  }
  if (COUNT === 0) { // nothing resolved (a zero allowance): the nearest aim, unscored
    const c = cs[0];
    return { w, move, angle: g.angles[idiv(c, g.powers.length)], power: g.powers[c % g.powers.length], ev: 0, raw: 0 };
  }
  // the best exact aim (the first of equals)
  let top = ORDER[0];
  for (let i = 1; i < COUNT; i++) if (VALS[ORDER[i]] > VALS[top]) top = ORDER[i];
  const ta = idiv(top, 101);
  const tp = top % 101;
  if (!t.noiseAware) return { w, move, angle: ta, power: tp, ev: VALS[top] * ctx.scale, raw: VALS[top] };
  // noise-aware: the best expected value among aims whose support is resolved
  let best: Cand | null = null;
  const n = COUNT;
  for (let i = 0; i < n; i++) {
    const k = ORDER[i];
    const ev = evAt(ctx, idiv(k, 101), k % 101, beam);
    if (ev !== null && (best === null || ev > best.ev)) best = { w, move, angle: idiv(k, 101), power: k % 101, ev, raw: VALS[k] };
  }
  // the best exact aim's own EV: compared when its support is resolved (completed first only if the allowance still has room)
  if (best === null || best.angle !== ta || best.power !== tp) {
    const na = (ctx.ka.length - 1) >> 1;
    const np = beam ? 0 : (ctx.kp.length - 1) >> 1;
    let missing = 0;
    for (let i = 0 - na; i <= na; i++) {
      for (let j = 0 - np; j <= np; j++) if (known(clampA(ta + i), clampP(tp + j)) === null) missing++;
    }
    if (missing <= left.n) {
      for (let i = 0 - na; i <= na; i++) for (let j = 0 - np; j <= np; j++) tryResolve(ctx, w, move, clampA(ta + i), clampP(tp + j), left);
      const ev = evAt(ctx, ta, tp, beam);
      if (ev !== null && (best === null || ev > best.ev)) best = { w, move, angle: ta, power: tp, ev, raw: VALS[top] };
    }
  }
  return best ?? { w, move, angle: ta, power: tp, ev: VALS[top] * ctx.scale, raw: VALS[top] };
}
