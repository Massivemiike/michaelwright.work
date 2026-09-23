// src/game/sim/title.ts
//
// The title-agnostic engine contract. The verification core (verify.ts), the
// registry and the scores route only ever see a TitleDef: a slug, a sim
// version, and a pure replay() that re-runs a submitted command log and
// returns the authoritative result. Each title owns its command format, its
// state and its replay loop behind that one function. Type-only file.

export interface ReplayInput<Cmd> {
  seed: number;
  mode: "daily" | "free";
  commands: readonly Cmd[];
}

/**
 * The authoritative result of a replay. `stat` is the title's secondary
 * leaderboard stat, stored in the `wave` column: Circle TD's wave, Arcfire's
 * points.
 */
export interface ReplayOutcome {
  score: number;
  stat: number;
  hash: string;
}

export type ReplayRejection = "invalid_command_shape" | "invalid_command" | "not_a_win" | "too_long";

/** Bounds the verifier imposes on a replay. maxTicks caps a tick-driven title's run length. */
export interface ReplayLimits {
  maxTicks: number;
}

export interface TitleDef<Cmd = unknown> {
  readonly slug: string;
  readonly simVersion: number;
  // Method syntax on purpose: its parameters are checked bivariantly, which
  // is what lets a TitleDef<Command> sit in the registry's Record<string, TitleDef>.
  replay(input: ReplayInput<Cmd>, limits: ReplayLimits): ReplayOutcome | { rejected: ReplayRejection };
}
