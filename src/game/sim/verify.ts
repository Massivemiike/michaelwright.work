// src/game/sim/verify.ts
//
// The pure verification core for the replay-verified leaderboard. Kept free
// of next/zod/browser/clock tokens so it stays under the sim purity guard
// (src/game/sim/purity.test.ts) and is unit-testable in isolation. The HTTP
// shell (src/app/api/games/scores/route.ts) owns everything impure: body
// parsing, payload size, IP rate limiting, the current clock, and the DB.
// Clock-derived daily-seed authority is injected as `acceptableSeeds` so
// this core never constructs a Date.
//
// Trust model: the server IGNORES any client-claimed score. verifyScore
// RECOMPUTES the run with runReplay and returns those authoritative values;
// the route inserts result.score / result.wave, never a client figure.
import { runReplay, type Command, type Replay } from "./replay";
import type { TitleDef } from "./title";

export const MAX_VERIFY_TICKS = 5_000_000; // matches replay.ts CEILING; the DoS bound is run LENGTH, not command count
export const MAX_VERIFY_COMMANDS = 20_000;

export interface VerifyInput {
  gameSlug: string;
  simVersion: number;
  seed: number;
  mode: "daily" | "free";
  commands: Command[];
}

export interface VerifyOptions {
  title: TitleDef;
  expectedSimVersion: number;
  acceptableSeeds: readonly number[] | null;
  maxCommands?: number;
  maxTicks?: number;
}

export type VerifyRejection =
  | "sim_version_mismatch"
  | "wrong_mode"
  | "too_many_commands"
  | "invalid_command_shape"
  | "bad_seed";

export type VerifyResult =
  | { ok: true; score: number; wave: number; hash: string; maxTowerLevel: number }
  | { ok: false; reason: VerifyRejection };

export function verifyScore(input: VerifyInput, opts: VerifyOptions): VerifyResult {
  const maxCommands = opts.maxCommands ?? MAX_VERIFY_COMMANDS;
  const maxTicks = opts.maxTicks ?? MAX_VERIFY_TICKS;

  // --- All limits enforced BEFORE building or ticking a sim ---
  if (input.simVersion !== opts.expectedSimVersion) return { ok: false, reason: "sim_version_mismatch" };
  if (input.mode !== "daily") return { ok: false, reason: "wrong_mode" }; // free play is local-only/unranked
  if (input.commands.length > maxCommands) return { ok: false, reason: "too_many_commands" };
  for (const cmd of input.commands) {
    if (!Number.isInteger(cmd.tick) || cmd.tick < 0 || cmd.tick >= maxTicks) {
      return { ok: false, reason: "invalid_command_shape" };
    }
  }
  if (opts.acceptableSeeds && !opts.acceptableSeeds.includes(input.seed)) {
    return { ok: false, reason: "bad_seed" };
  }

  // --- Recompute (server-authoritative). runReplay is bounded by maxTicks;
  // applyCommand no-ops any illegal command, so a hostile log can't crash. ---
  const replay: Replay = {
    seed: input.seed,
    simVersion: input.simVersion,
    mode: input.mode,
    commands: input.commands,
  };
  const result = runReplay(replay, opts.title, maxTicks);
  return { ok: true, score: result.score, wave: result.wave, hash: result.hash, maxTowerLevel: result.maxTowerLevel };
}
