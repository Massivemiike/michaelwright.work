// src/game/titles/arcfire/ai/noise.ts
//
// Aim noise (spec §5): "a seeded sum of 3 uniform integers" from the MATCH
// RNG. Part i is uniform on [-a_i, a_i] with a_i = floor((bound + i) / 3), so
// the three half-ranges sum to the bound and |noise| <= bound:
//   bound 1 (Ace):     parts 0, 0, 1  -> uniform on -1..1
//   bound 2 (Veteran): parts 0, 1, 1  -> weights 1 2 3 2 1 (of 9)
//   bound 3 (Veteran): parts 1, 1, 1  -> weights 1 3 6 7 6 3 1 (of 27)
//   bound 6 (Rookie):  parts 2, 2, 2  -> a bell over -6..6 (of 125)
//   bound 8 (Rookie):  parts 2, 3, 3  -> a bell over -8..8 (of 245)
// Every call draws exactly 3 values (a part of 0 still draws nextRange(rng,
// 1)), so the RNG order never depends on the tier. noiseKernel is the exact
// integer distribution the noise-aware search ranks aims by.
import { nextRange, type Rng } from "@/game/sim/math/rng";
import { idiv } from "../imath";

/** The half-range of part i (0..2) of a noise of maximum `bound`. */
export const noisePart = (bound: number, i: number): number => idiv(bound + i, 3);

/** One noise value of maximum `bound`: exactly three draws from rng. */
export function drawNoise(rng: Rng, bound: number): number {
  let n = 0;
  for (let i = 0; i < 3; i++) {
    const a = noisePart(bound, i);
    n += nextRange(rng, 2 * a + 1) - a;
  }
  return n;
}

/** The exact distribution of drawNoise(rng, bound): integer weights for -bound..bound, summing to the product of (2 a_i + 1). */
export function noiseKernel(bound: number): Int32Array {
  let k = new Int32Array(1);
  k[0] = 1;
  for (let i = 0; i < 3; i++) {
    const a = noisePart(bound, i);
    const next = new Int32Array(k.length + 2 * a);
    for (let j = 0; j < k.length; j++) for (let d = 0; d <= 2 * a; d++) next[j + d] += k[j];
    k = next;
  }
  return k;
}

/** The sum of a kernel's weights (its denominator). */
export function kernelTotal(k: Int32Array): number {
  let s = 0;
  for (let i = 0; i < k.length; i++) s += k[i];
  return s;
}
