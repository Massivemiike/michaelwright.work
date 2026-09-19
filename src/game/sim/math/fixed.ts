// src/game/sim/math/fixed.ts
import type { Fx } from "../types";

export const SCALE = 65536;

export const fromInt = (n: number): Fx => Math.trunc(n) * SCALE;
export const fromFloat = (n: number): Fx => Math.trunc(n * SCALE);
export const toInt = (f: Fx): number => Math.trunc(f / SCALE);
export const toFloat = (f: Fx): number => f / SCALE;

// Requires |a*b| < 2^53. Callers keep one operand small (a fraction/scalar).
export const mul = (a: Fx, b: Fx): Fx => Math.trunc((a * b) / SCALE);

// Requires |a| < 2^37 so a*SCALE stays exact.
export const div = (a: Fx, b: Fx): Fx => Math.trunc((a * SCALE) / b);

export const clamp = (f: Fx, lo: Fx, hi: Fx): Fx =>
  f < lo ? lo : f > hi ? hi : f;

// Deterministic fixed-point sqrt via integer Newton's method on the
// scaled value. sqrt(f/SCALE)*SCALE = sqrt(f*SCALE). f*SCALE must be < 2^53,
// i.e. f < 2^37 — always true for in-game distances.
export const sqrt = (f: Fx): Fx => {
  if (f <= 0) return 0;
  const n = f * SCALE; // exact for f < 2^37
  let x = Math.trunc(Math.sqrt(n)); // seed with IEEE sqrt (exact-enough seed)
  // one Newton refinement using only integer ops to remove any engine drift
  if (x > 0) x = Math.trunc((x + Math.trunc(n / x)) / 2);
  return x;
};
