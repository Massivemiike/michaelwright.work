// src/game/sim/math/rng.ts
export interface Rng { state: number }

export const makeRng = (seed: number): Rng => ({ state: seed | 0 });

export const nextU32 = (r: Rng): number => {
  r.state = (r.state + 0x6d2b79f5) | 0;
  let t = Math.imul(r.state ^ (r.state >>> 15), 1 | r.state);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return (t ^ (t >>> 14)) >>> 0;
};

// Unbiased-enough modulo for game use (n is always small).
export const nextRange = (r: Rng, n: number): number => {
  if (n <= 0) throw new RangeError("nextRange: n must be > 0");
  return nextU32(r) % n;
};
