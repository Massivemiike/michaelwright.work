// src/game/titles/arcfire/imath.ts
//
// Small integer helpers for the Arcfire sim. Engine-exact: Math.sqrt is
// IEEE-754 correctly rounded (identical in every engine) and isqrt's loops
// correct its seed to the exact floor; Math.trunc of an integer quotient below
// 2^53 is exact.

/** floor(sqrt(n)) for an integer n >= 0 (0 for n <= 0). */
export function isqrt(n: number): number {
  if (n <= 0) return 0;
  let x = Math.trunc(Math.sqrt(n));
  while (x * x > n) x--;
  while ((x + 1) * (x + 1) <= n) x++;
  return x;
}

export const clampInt = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

/** Integer division rounding toward zero. */
export const idiv = (a: number, b: number): number => Math.trunc(a / b);
