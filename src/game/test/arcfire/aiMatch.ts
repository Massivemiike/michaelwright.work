// src/game/test/arcfire/aiMatch.ts
//
// One whole AI-vs-AI match, recorded shot by shot: what the tier-separation
// sweep and the balance harness play (bundled into sweep.entry.ts). Pure and
// deterministic: a match is a function of (seed, tiers, draft, settings). The
// "random" draft makes every pick with one match-RNG draw over the free pool
// slots (the same count as aiPick), so the harness measures weapons without
// reading the `power` it is about to write. Every AI turn is checked legal and
// within its tier's sim budget, so every sweep decision is also a test. `now`
// (test code may read a clock) times each decision into ShotRecord.ms: the one
// field that is not a function of the seed, and nothing judged reads it.
import { nextRange } from "@/game/sim/math/rng";
import { applyPick, applyTurn, createMatch, toAct } from "@/game/titles/arcfire/match";
import { STANDARD_SETTINGS, cloneMatch, type MatchSettings } from "@/game/titles/arcfire/state";
import { aiPick, aiTurn } from "@/game/titles/arcfire/ai/policy";
import { TIERS, tierBudget, type AiTier } from "@/game/titles/arcfire/ai/tiers";
import type { AiReason } from "@/game/titles/arcfire/ai/search";

export interface ShotRecord {
  p: number; // the shooter
  w: number; // roster index fired
  sd: boolean; // a sudden-death shot (Pulse): excluded from the per-weapon figures
  pts: number; // points it scored
  gift: number; // points it gifted by self-damage
  move: number;
  reason: AiReason;
  reply: number; // the DIRT rule's estimates (-1: not made)
  replyDirt: number;
  sims: number;
  probes: number;
  ms: number; // the decision's wall time (aiTurn), by the injected clock: informational only
}

export interface MatchRecord {
  seed: number;
  tiers: [AiTier, AiTier];
  firstPicker: number;
  pool: number[]; // the draft pool (roster indices)
  hands: [number[], number[]]; // each player's drafted weapons
  scores: [number, number];
  winner: number; // 0, 1, or 2 for a draw
  shots: ShotRecord[];
}

export function playAiMatch(
  seed: number, tiers: readonly [AiTier, AiTier], draft: "power" | "random", settings: MatchSettings = STANDARD_SETTINGS, now: () => number = () => 0,
): MatchRecord {
  const m = createMatch(seed, settings);
  const shots: ShotRecord[] = [];
  let hands: [number[], number[]] = [[], []];
  while (m.phase !== "over") {
    const p = toAct(m);
    if (m.phase === "draft") {
      let w: number;
      if (draft === "power") w = aiPick(m, tiers[p]);
      else {
        const free: number[] = [];
        for (let i = 0; i < m.pool.length; i++) if (m.poolOwner[i] === -1) free.push(i);
        w = free[nextRange(m.rng, free.length)];
      }
      if (!applyPick(m, w).ok) throw new Error(`seed ${seed}: illegal pick`);
      if (m.phase !== "draft") hands = [m.hands[0].slice(), m.hands[1].slice()];
      continue;
    }
    const sd = m.phase === "suddenDeath";
    const before = [m.scores[0], m.scores[1]];
    const t0 = now();
    const { cmd, plan } = aiTurn(m, tiers[p]);
    const ms = now() - t0;
    if (plan.stats.sims > tierBudget(TIERS[tiers[p]])) throw new Error(`seed ${seed}: ${plan.stats.sims} sims over the ${tiers[p]} budget`);
    if (!applyTurn(cloneMatch(m), cmd).ok || !applyTurn(m, cmd).ok) throw new Error(`seed ${seed}: illegal AI turn ${JSON.stringify(cmd)}`);
    const s = plan.stats;
    shots.push({
      p, w: cmd.w, sd, pts: m.scores[p] - before[p], gift: m.scores[1 - p] - before[1 - p], move: cmd.move,
      reason: s.reason, reply: s.reply, replyDirt: s.replyDirt, sims: s.sims, probes: s.probes, ms,
    });
  }
  return {
    seed, tiers: [tiers[0], tiers[1]], firstPicker: m.firstPicker, pool: m.pool.slice(), hands,
    scores: [m.scores[0], m.scores[1]], winner: m.winner, shots,
  };
}
