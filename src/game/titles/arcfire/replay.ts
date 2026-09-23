// src/game/titles/arcfire/replay.ts
//
// The Arcfire command log (spec §1.3, §7): one entry per draft pick or turn,
// in order. A 2-player log holds BOTH players' commands; a vs-AI log (Plan 2)
// holds only the human's, with the AI's regenerated during replay. Any illegal
// command rejects the whole log.
import { createMatch, applyPick, applyTurn } from "./match";
import { hashMatch } from "./hash";
import type { MatchSettings, MatchState } from "./state";

export type ArcfireCommand =
  | { k: "pick"; w: number } // w = pool index
  | { k: "turn"; move: -1 | 0 | 1; w: number; angle: number; power: number }; // w = roster index

export interface ArcfireReplay {
  seed: number;
  settings: MatchSettings;
  commands: readonly ArcfireCommand[];
}

export type ReplayMatchResult =
  | { ok: true; state: MatchState; hash: string }
  | { ok: false; reason: "invalid_command"; atIndex: number };

/** Replay a 2-player command log from a fresh match. */
export function replayMatch(r: ArcfireReplay): ReplayMatchResult {
  const m = createMatch(r.seed, r.settings);
  for (let i = 0; i < r.commands.length; i++) {
    const c = r.commands[i];
    const res = c.k === "pick"
      ? applyPick(m, c.w)
      : applyTurn(m, { move: c.move, w: c.w, angle: c.angle, power: c.power });
    if (!res.ok) return { ok: false, reason: "invalid_command", atIndex: i };
  }
  return { ok: true, state: m, hash: hashMatch(m) };
}
