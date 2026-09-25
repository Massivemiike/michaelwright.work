// src/game/titles/arcfire/ai/policy.ts
//
// An AI decision = a pure search + a FIXED number of match-RNG draws. The RNG
// order is normative (hashMatch folds rng.state), and it never depends on the
// tier, so a resume can skip an AI entry's draws without searching:
//   an AI draft pick consumes exactly AI_PICK_DRAWS = 1 draw:
//     nextRange(rng, k) over the k available weapons with the highest power;
//   an AI turn consumes exactly AI_TURN_DRAWS = 7 draws, after its search:
//     1 choosing among plan.choices, then 3 for the angle noise, then 3 for
//     the power noise.
// Nothing else in the AI touches the RNG.
import { nextRange } from "@/game/sim/math/rng";
import { ROSTER } from "../weapons/roster";
import type { MatchState } from "../state";
import type { TurnCommand } from "../match";
import { drawNoise } from "./noise";
import { planTurn, type Plan } from "./plan";
import { TIERS, type AiTier } from "./tiers";

export const AI_PICK_DRAWS = 1;
export const AI_TURN_DRAWS = 7;

/** The pool index the AI drafts (spec §5: by roster power; Rookie among the top 8, Veteran the top 3, Ace the best). Exactly 1 draw. */
export function aiPick(m: MatchState, tier: AiTier): number {
  const avail: number[] = [];
  for (let i = 0; i < m.pool.length; i++) if (m.poolOwner[i] === -1) avail.push(i);
  avail.sort((a, b) => ROSTER[m.pool[b]].power - ROSTER[m.pool[a]].power || a - b); // ties: pool order (= roster order)
  return avail[nextRange(m.rng, Math.min(TIERS[tier].draftTop, avail.length))];
}

/** The AI's turn command and the plan it came from. Exactly 7 draws; the command is legal by construction. */
export function aiTurn(m: MatchState, tier: AiTier): { cmd: TurnCommand; plan: Plan } {
  const t = TIERS[tier];
  const plan = planTurn(m, tier);
  const c = plan.choices[nextRange(m.rng, plan.choices.length)];
  const a = c.angle + drawNoise(m.rng, t.noiseA);
  const p = c.power + drawNoise(m.rng, t.noiseP);
  return { cmd: { move: c.move, w: c.w, angle: a < 0 ? 0 : a > 180 ? 180 : a, power: p < 0 ? 0 : p > 100 ? 100 : p }, plan };
}
