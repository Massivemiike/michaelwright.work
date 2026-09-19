// src/game/sim/math/rng.test.ts
import { describe, it, expect } from "vitest";
import { makeRng, nextU32, nextRange } from "./rng";

describe("mulberry32 PRNG", () => {
  it("is deterministic for a given seed", () => {
    const a = makeRng(12345);
    const b = makeRng(12345);
    const seqA = [nextU32(a), nextU32(a), nextU32(a)];
    const seqB = [nextU32(b), nextU32(b), nextU32(b)];
    expect(seqA).toEqual(seqB);
  });
  it("differs across seeds", () => {
    expect(nextU32(makeRng(1))).not.toBe(nextU32(makeRng(2)));
  });
  it("nextRange stays in bounds", () => {
    const r = makeRng(7);
    for (let i = 0; i < 1000; i++) {
      const v = nextRange(r, 5);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(5);
    }
  });
  it("produces integers only", () => {
    const r = makeRng(99);
    const v = nextU32(r);
    expect(Number.isInteger(v)).toBe(true);
  });
});
