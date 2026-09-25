// src/game/titles/arcfire/ai/plan.ts
//
// The AI turn search (spec §5), RNG-free: planTurn(m, tier) never writes m
// and never draws from m.rng, so hints, previews and tests can call it
// freely; policy.ts draws the choice and the noise afterwards.
//   1. every damaging weapon in hand, from where the tank stands, with an
//      equal share of the tier's stationary budget (search.ts);
//   2. Rookie: its choices are the pickTop best by value (DIRT at 0);
//   3. moves (Veteran while its best is below moveBelow, Ace always): the
//      best `movers` weapons re-searched from each legal side, re-probed from
//      the moved tank; a move must gain moveGain points;
//   4. the offensive pick: the best value, then Ace's tier-3 saving;
//   5. DIRT (Ace, holding DIRT, in battle): when the enemy's estimated best
//      reply to the pick is >= DIRT_THREAT and a build cuts it by >= DIRT_GAIN.
// Every weapon in a hand is fired exactly once, so saving a tier-3 weapon or
// building a wall only reorders shots: the rules decide WHEN, not whether.
import { copyMatchInto, type MatchState } from "../state";
import { resolveTurnPoints } from "../resolve";
import { hitCircles, moveTarget } from "../tanks";
import { ROSTER } from "../weapons/roster";
import { idiv } from "../imath";
import { SUDDEN_DEATH_WEAPON, WORLD_W } from "../constants";
import { dealsDamage, probeModelOf } from "./model";
import { FAR, LAND_TERRAIN, landingGrid, type Grid, type ProbeBoard } from "./probe";
import {
  POST_SLOT, gridFor, makeCtx, newStats, scratch, searchWeapon, valueOf,
  type AiStats, type Cand, type SearchCtx,
} from "./search";
import {
  BUDGET_HAND, DIRT_FRONT, DIRT_GAIN, DIRT_THREAT, THREAT_AIMS, TIERS, type AiTier, type TierSpec,
} from "./tiers";

export interface Plan {
  choices: Cand[]; // policy.ts draws one uniformly: Rookie's top pickTop, otherwise exactly one
  ranked: Cand[]; // every weapon in hand from where the tank stands, best first (DIRT at 0)
  stats: AiStats;
}

/** Candidates best first: ev descending, then the lower tier (an equal shot spends the cheaper weapon), then roster index. */
export const byValue = (a: Cand, b: Cand): number => b.ev - a.ev || ROSTER[a.w].tier - ROSTER[b.w].tier || a.w - b.w;

/** The offensive pick: the first best ev; a saveTier3 tier then fires a tier-3 pick only if it beats the best other weapon (ev > 0) strictly and by >= 20%. */
export function chooseOffence(cands: readonly Cand[], t: TierSpec): { pick: Cand | null; saved: boolean } {
  let pick: Cand | null = null;
  for (const c of cands) if (pick === null || c.ev > pick.ev) pick = c;
  if (pick === null || !t.saveTier3 || ROSTER[pick.w].tier !== 3) return { pick, saved: false };
  let alt: Cand | null = null;
  for (const c of cands) if (ROSTER[c.w].tier !== 3 && c.ev > 0 && (alt === null || c.ev > alt.ev)) alt = c;
  if (alt === null || (pick.ev > alt.ev && pick.ev * 5 >= alt.ev * 6)) return { pick, saved: false };
  return { pick: alt, saved: true };
}

/** The first grid cell (in cell order) whose terrain landing is nearest column x: a DIRT placement aim. */
function aimNear(g: Grid, x: number): number {
  let bc = 0;
  let bd = FAR;
  for (let c = 0; c < g.metric.length; c++) {
    if (g.kind[c] !== LAND_TERRAIN) continue;
    const d = g.x[c] < x ? x - g.x[c] : g.x[c] - x;
    if (d < bd) {
      bd = d;
      bc = c;
    }
  }
  return bc;
}

const cellCand = (g: Grid, w: number, c: number): Cand => ({
  w, move: 0, angle: g.angles[idiv(c, g.powers.length)], power: g.powers[c % g.powers.length], ev: 0, raw: 0,
});

/**
 * The enemy's best reply on `post` (a board after the AI's shot, spans built, post.shooter = the enemy):
 * each damaging enemy weapon at its THREAT_AIMS nearest aims on Rookie's grid, fully resolved; at most
 * `allowance` sims. An estimate, deliberately cheap: it decides only whether a wall is worth building.
 */
function threat(ctx: SearchCtx, post: MatchState, allowance: number): number {
  const foe = post.shooter;
  const board: ProbeBoard = { t: post.terrain, tanks: hitCircles(post), me: foe, windStep: ctx.windStep };
  const grids = new Map<string, Grid>();
  let best = 0;
  let spent = 0;
  for (const w of post.hands[foe]) {
    if (!dealsDamage(ROSTER[w])) continue;
    const model = probeModelOf(ROSTER[w]);
    let g = grids.get(model.key);
    if (g === undefined) {
      g = landingGrid(board, model, TIERS.rookie, ctx.stats);
      grids.set(model.key, g);
    }
    const taken: number[] = [];
    for (let k = 0; k < THREAT_AIMS; k++) {
      let bc = -1;
      for (let c = 0; c < g.metric.length; c++) {
        if (taken.includes(c)) continue;
        if (bc < 0 || g.metric[c] < g.metric[bc]) bc = c;
      }
      if (bc < 0 || g.metric[bc] >= FAR || spent >= allowance) break;
      taken.push(bc);
      spent++;
      const v = valueOf(ctx, post, w, 0, g.angles[idiv(bc, g.powers.length)], g.powers[bc % g.powers.length]);
      if (v > best) best = v;
    }
  }
  ctx.stats.dirtSims += spent;
  return best;
}

/** Resolve `c` for the AI on the post-shot scratch and hand that board to the enemy. */
function afterShot(ctx: SearchCtx, c: Cand): MatchState {
  const post = scratch(POST_SLOT, ctx.m);
  resolveTurnPoints(post, { move: c.move, weapon: c.w, angle: c.angle, power: c.power });
  ctx.stats.sims++;
  ctx.stats.dirtSims++;
  post.shooter = ctx.foe;
  return post;
}

/** Search the turn of m.shooter at `tier`. Pure with respect to m (and m.rng). */
export function planTurn(m: MatchState, tier: AiTier): Plan {
  return planWith(m, TIERS[tier]);
}

export function planWith(m: MatchState, t: TierSpec): Plan {
  const stats = newStats();
  const ctx = makeCtx(m, t, stats);
  const me = ctx.me;
  const hand = m.phase === "suddenDeath" ? [SUDDEN_DEATH_WEAPON] : m.hands[me].slice();
  const offence = hand.filter((w) => dealsDamage(ROSTER[w]));
  const inert = hand.filter((w) => !dealsDamage(ROSTER[w]));

  // 1. every damaging weapon from where the tank stands, an equal fixed share each
  const share = idiv(t.stay, hand.length > BUDGET_HAND ? hand.length : BUDGET_HAND);
  const per: Cand[] = [];
  for (const w of offence) per.push(searchWeapon(ctx, w, 0, share));
  stats.staySims = stats.sims;
  per.sort(byValue);
  const ranked = per.slice();
  for (const w of inert) { // DIRT: worth 0 as an attack, aimed at its nearest landing to the enemy
    const g = gridFor(ctx, 0, probeModelOf(ROSTER[w]));
    let bc = 0;
    for (let c = 1; c < g.metric.length; c++) if (g.metric[c] < g.metric[bc]) bc = c;
    ranked.push(cellCand(g, w, bc));
  }
  ranked.sort(byValue);

  // 2. Rookie: uniform among its pickTop best (policy.ts draws)
  if (t.pickTop > 1) {
    stats.reason = "random";
    return { choices: ranked.slice(0, Math.min(t.pickTop, ranked.length)), ranked, stats };
  }

  // 3. moves: the best weapons again from each legal side, re-probed from the moved tank
  let bestMove: Cand | null = null;
  const stayBest = per.length > 0 ? per[0] : null;
  if (t.moveEach > 0 && stayBest !== null && stayBest.ev < t.moveBelow * ctx.scale) {
    const movers = per.slice(0, Math.min(t.movers, per.length));
    const mshare = idiv(t.moveEach, movers.length);
    const before = stats.sims;
    for (const d of [-1, 1] as const) {
      if (moveTarget(m, me, d) === -1) continue;
      for (const c of movers) {
        const r = searchWeapon(ctx, c.w, d, mshare);
        if (bestMove === null || r.ev > bestMove.ev) bestMove = r;
      }
    }
    stats.moveSims = stats.sims - before;
  }
  const cands = per.slice();
  const moved = bestMove !== null && stayBest !== null && bestMove.ev >= stayBest.ev + t.moveGain * ctx.scale;
  if (moved && bestMove !== null) cands.unshift(bestMove); // first: it wins an ev tie

  // 4. the offensive pick
  const chosen = chooseOffence(cands, t);
  let pick = chosen.pick;
  stats.reason = chosen.saved ? "saveT3" : pick !== null && pick.move !== 0 ? "move" : "best";

  // 5. DIRT: when the enemy's best reply to the pick is big and a build cuts it (or when only DIRT is left)
  if (t.dirt > 0 && m.phase === "battle" && inert.length > 0) {
    const options: Cand[] = [];
    const dir = m.tankX[ctx.foe] > m.tankX[me] ? 1 : -1;
    const spots = [m.tankX[me] + dir * DIRT_FRONT, (m.tankX[me] + m.tankX[ctx.foe]) >> 1];
    for (const w of inert.slice(0, 2)) {
      const g = gridFor(ctx, 0, probeModelOf(ROSTER[w]));
      for (const x of spots) options.push(cellCand(g, w, aimNear(g, x < 0 ? 0 : x > WORLD_W - 1 ? WORLD_W - 1 : x)));
    }
    const each = idiv(t.dirt, options.length + 1) - 1; // each estimate's allowance: the resolve before it is the 1
    let r0 = DIRT_THREAT; // with no offensive weapon left, DIRT is forced
    if (pick !== null) {
      r0 = threat(ctx, afterShot(ctx, pick), each);
      stats.reply = r0;
    }
    if (r0 >= DIRT_THREAT) {
      let bestD: Cand | null = null;
      let bestR = 0;
      for (const o of options) {
        const r = threat(ctx, afterShot(ctx, o), each);
        if (bestD === null || r < bestR) {
          bestD = o;
          bestR = r;
        }
      }
      stats.replyDirt = bestD === null ? -1 : bestR;
      if (bestD !== null && (pick === null || r0 - bestR >= DIRT_GAIN)) {
        stats.reason = pick === null ? "forcedDirt" : "dirt";
        pick = bestD;
      }
    }
  }
  if (pick === null) { // only DIRT in hand and no DIRT decision: fire the best-ranked
    stats.reason = "inertOnly";
    pick = ranked[0];
  }
  return { choices: [pick], ranked, stats };
}
