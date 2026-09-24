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

/** The pixel containing a Q16.16 coordinate: floor, so x in (-1, 0) is column -1, off the world. Exact: f / 65536 is exact in binary64. */
export const floorPx = (f: number): number => Math.floor(f / 65536);

/** ceil(a / b) for integers a >= 0 and b >= 1. */
export const ceilDiv = (a: number, b: number): number => idiv(a + b - 1, b);
