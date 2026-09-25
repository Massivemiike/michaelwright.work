// src/game/titles/arcfire/replay.ts
//
// The Arcfire command log (spec §1.3, §7): one entry per draft pick or turn,
// in order. A 2-player log holds BOTH players' commands and replays here; a
// vs-AI log holds only the human's and replays in vsai.ts (replayVsAi), which
// regenerates every AI pick and shot. Both apply entries with applyCommand. Any illegal
// command rejects the whole log, and a malformed log (not an array, a
// non-object entry, an unknown `k`) is rejected the same way — replayMatch
// never throws on any JSON value (plain data properties). An UNFINISHED
// log is accepted (resume re-simulates a partial match, spec §6.5), so a
// verifier must additionally require state.phase === "over" (Plan 4's
// binding). The settings, unlike the
// commands, are trusted input: the verifier supplies them (STANDARD_SETTINGS),
// and createMatch throws a RangeError on settings it rejects instead of
// returning a result.
import { createMatch, applyPick, applyTurn } from "./match";
import { hashMatch } from "./hash";
import type { MatchSettings, MatchState } from "./state";
import type { Timeline } from "./timeline";

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

export type CommandResult = { ok: true; timeline: Timeline | null } | { ok: false };

/** Apply one log entry for whoever is to act (a pick has no Timeline). Never throws on any JSON value (plain data properties): a malformed entry is { ok: false } and changes nothing. */
export function applyCommand(m: MatchState, entry: unknown): CommandResult {
  if (typeof entry !== "object" || entry === null) return { ok: false };
  const c = entry as ArcfireCommand;
  if (c.k === "pick") return applyPick(m, c.w).ok ? { ok: true, timeline: null } : { ok: false };
  if (c.k === "turn") {
    const r = applyTurn(m, { move: c.move, w: c.w, angle: c.angle, power: c.power });
    return r.ok ? { ok: true, timeline: r.timeline } : { ok: false };
  }
  return { ok: false };
}

/** Replay a 2-player command log from a fresh match. */
export function replayMatch(r: ArcfireReplay): ReplayMatchResult {
  if (!Array.isArray(r.commands)) return { ok: false, reason: "invalid_command", atIndex: 0 };
  const m = createMatch(r.seed, r.settings);
  for (let i = 0; i < r.commands.length; i++) {
    if (!applyCommand(m, r.commands[i]).ok) return { ok: false, reason: "invalid_command", atIndex: i };
  }
  return { ok: true, state: m, hash: hashMatch(m) };
}
