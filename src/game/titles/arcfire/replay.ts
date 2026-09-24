// src/game/titles/arcfire/replay.ts
//
// The Arcfire command log (spec §1.3, §7): one entry per draft pick or turn,
// in order. A 2-player log holds BOTH players' commands; a vs-AI log (Plan 2)
// holds only the human's, with the AI's regenerated during replay. Any illegal
// command rejects the whole log, and a malformed log (not an array, a
// non-object entry, an unknown `k`) is rejected the same way — replayMatch
// never throws on one. An UNFINISHED log is accepted (resume re-simulates a
// partial match, spec §6.5), so a verifier must additionally require
// state.phase === "over" (Plan 4's binding). The settings, unlike the
// commands, are trusted input: the verifier supplies them (STANDARD_SETTINGS),
// and createMatch throws a RangeError on settings it rejects instead of
// returning a result.
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
  if (!Array.isArray(r.commands)) return { ok: false, reason: "invalid_command", atIndex: 0 };
  const m = createMatch(r.seed, r.settings);
  for (let i = 0; i < r.commands.length; i++) {
    const entry: unknown = r.commands[i];
    if (typeof entry !== "object" || entry === null) return { ok: false, reason: "invalid_command", atIndex: i };
    const c = entry as ArcfireCommand;
    let res: { ok: boolean };
    if (c.k === "pick") res = applyPick(m, c.w);
    else if (c.k === "turn") res = applyTurn(m, { move: c.move, w: c.w, angle: c.angle, power: c.power });
    else return { ok: false, reason: "invalid_command", atIndex: i };
    if (!res.ok) return { ok: false, reason: "invalid_command", atIndex: i };
  }
  return { ok: true, state: m, hash: hashMatch(m) };
}
