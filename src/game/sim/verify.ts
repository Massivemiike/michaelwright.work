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
// Title-agnostic: the run itself is delegated to the title's replay(). Trust
// model: the server IGNORES any client-claimed score. verifyScore RECOMPUTES
// the run and returns the authoritative values; the route inserts
// result.score / result.stat, never a client figure.
import type { ReplayRejection, TitleDef } from "./title";

export const MAX_VERIFY_TICKS = 5_000_000; // the DoS bound is run LENGTH, not command count
export const MAX_VERIFY_COMMANDS = 20_000;

export interface VerifyInput {
  gameSlug: string;
  simVersion: number;
  seed: number;
  mode: "daily" | "free";
  commands: readonly unknown[];
}

export interface VerifyOptions {
  title: TitleDef;
  acceptableSeeds: readonly number[] | null;
  maxCommands?: number;
  maxTicks?: number;
}

export type VerifyRejection =
  | "sim_version_mismatch"
  | "wrong_mode"
  | "too_many_commands"
  | "bad_seed"
  | ReplayRejection;

export type VerifyResult =
  | { ok: true; score: number; stat: number; hash: string }
  | { ok: false; reason: VerifyRejection };

export function verifyScore(input: VerifyInput, opts: VerifyOptions): VerifyResult {
  const maxCommands = opts.maxCommands ?? MAX_VERIFY_COMMANDS;
  const maxTicks = opts.maxTicks ?? MAX_VERIFY_TICKS;

  // --- Cheap limits first, BEFORE the title builds or runs a sim ---
  if (input.simVersion !== opts.title.simVersion) return { ok: false, reason: "sim_version_mismatch" };
  if (input.mode !== "daily") return { ok: false, reason: "wrong_mode" }; // free play is local-only/unranked
  if (input.commands.length > maxCommands) return { ok: false, reason: "too_many_commands" };
  if (opts.acceptableSeeds && !opts.acceptableSeeds.includes(input.seed)) {
    return { ok: false, reason: "bad_seed" };
  }

  // --- Recompute (server-authoritative). The title validates its own
  // command shapes, then runs bounded by maxTicks. ---
  const out = opts.title.replay({ seed: input.seed, mode: input.mode, commands: input.commands }, { maxTicks });
  if ("rejected" in out) return { ok: false, reason: out.rejected };
  return { ok: true, score: out.score, stat: out.stat, hash: out.hash };
}
