// src/game/test/arcfire/vsaiGolden.ts
//
// The vs-AI goldens' scripted human, and live play against the AI. The human
// (player 0) is deliberately simple and independent of the AI search: it
// drafts the highest free pool slot, and each turn fires the best command of a
// fixed grid over its hand (angles 20..75 step 5, powers 40..100 step 5),
// found on cloneMatch copies, the first best on a tie; its third battle shot
// moves one step toward the enemy when that is legal. It never touches the
// live match's RNG, so replaying its commands alone must regenerate exactly
// the match it played: the leaderboard's core guarantee.
import { applyTurn, createMatch } from "@/game/titles/arcfire/match";
import { moveTarget } from "@/game/titles/arcfire/tanks";
import { cloneMatch, type MatchSettings, type MatchState } from "@/game/titles/arcfire/state";
import { applyCommand, type ArcfireCommand } from "@/game/titles/arcfire/replay";
import { SUDDEN_DEATH_WEAPON } from "@/game/titles/arcfire/constants";
import { HUMAN, advanceAi } from "@/game/titles/arcfire/vsai";
import type { AiTier } from "@/game/titles/arcfire/ai/tiers";

/** The scripted human's command for the state it is to act in. */
export function goldenHuman(m: MatchState): ArcfireCommand {
  if (m.phase === "draft") {
    let w = m.poolOwner.length - 1;
    while (m.poolOwner[w] !== -1) w--;
    return { k: "pick", w };
  }
  const battleShot = m.phase === "battle" ? (m.shotsFired - (m.firstPicker === HUMAN ? 1 : 0)) >> 1 : -1; // the human's own shot number
  const move: -1 | 0 | 1 = battleShot === 2 && moveTarget(m, HUMAN, 1) !== -1 ? 1 : 0;
  const hand = m.phase === "suddenDeath" ? [SUDDEN_DEATH_WEAPON] : m.hands[HUMAN];
  let best: ArcfireCommand | null = null;
  let bestV = 0;
  for (const w of hand) {
    for (let angle = 20; angle <= 75; angle += 5) {
      for (let power = 40; power <= 100; power += 5) {
        const c = cloneMatch(m);
        if (!applyTurn(c, { move, w, angle, power }).ok) continue;
        const v = c.scores[HUMAN] - m.scores[HUMAN] - (c.scores[1 - HUMAN] - m.scores[1 - HUMAN]);
        if (best === null || v > bestV) {
          best = { k: "turn", move, w, angle, power };
          bestV = v;
        }
      }
    }
  }
  return best!;
}

/** A live vs-AI match: the human's commands (the submission), the full log (the resume blob), the AI's turns, the final state. */
export interface LivePlay { commands: ArcfireCommand[]; log: ArcfireCommand[]; aiTurns: ArcfireCommand[]; state: MatchState }

/** Play a whole vs-AI match live: the AI acts whenever it is its move (vsai.ts), `human` otherwise. */
export function playVsAi(seed: number, settings: MatchSettings, tier: AiTier, human: (m: MatchState) => ArcfireCommand = goldenHuman): LivePlay {
  const m = createMatch(seed, settings);
  const commands: ArcfireCommand[] = [];
  const log: ArcfireCommand[] = [];
  const aiTurns: ArcfireCommand[] = [];
  const record = (): void => {
    for (const a of advanceAi(m, tier)) {
      const c: ArcfireCommand = a.k === "pick" ? { k: "pick", w: a.w } : { k: "turn", ...a.cmd };
      log.push(c);
      if (c.k === "turn") aiTurns.push(c);
    }
  };
  record();
  while (m.phase !== "over") {
    const c = human(m);
    if (!applyCommand(m, c).ok) throw new Error(`the scripted human sent an illegal command: ${JSON.stringify(c)}`);
    commands.push(c);
    log.push(c);
    record();
  }
  return { commands, log, aiTurns, state: m };
}
