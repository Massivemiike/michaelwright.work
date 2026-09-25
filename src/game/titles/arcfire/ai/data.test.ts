// src/game/titles/arcfire/ai/data.test.ts — Plan 2B T4: the tier table, the noise, the weapon models
import { describe, it, expect } from "vitest";
import { makeRng } from "@/game/sim/math/rng";
import { ROSTER, ROSTER_INDEX } from "../weapons/roster";
import { rngAfter } from "@/game/test/arcfire/fixtures";
import { drawNoise, kernelTotal, noiseKernel } from "./noise";
import { dealsDamage, probeModelOf } from "./model";
import { TIERS, tierBudget } from "./tiers";

describe("tiers", () => {
  it("budgets are the spec's fixed sim counts", () => {
    expect([TIERS.rookie, TIERS.veteran, TIERS.ace].map(tierBudget)).toEqual([300, 1500, 4000]);
  });
});

describe("noise (a seeded sum of 3 uniform integers)", () => {
  it("has the exact kernels", () => {
    expect(Array.from(noiseKernel(0))).toEqual([1]);
    expect(Array.from(noiseKernel(1))).toEqual([1, 1, 1]);
    expect(Array.from(noiseKernel(2))).toEqual([1, 2, 3, 2, 1]);
    expect(Array.from(noiseKernel(3))).toEqual([1, 3, 6, 7, 6, 3, 1]);
    for (const [b, total] of [[6, 125], [8, 245]]) {
      const k = Array.from(noiseKernel(b));
      expect(k.length).toBe(2 * b + 1);
      expect(kernelTotal(noiseKernel(b))).toBe(total);
      expect(k).toEqual(k.slice().reverse());
    }
  });
  it("draws exactly 3 values and spans exactly +-bound", () => {
    for (const bound of [1, 2, 3, 6, 8]) {
      const rng = makeRng(bound);
      const seen = new Set<number>();
      for (let i = 0; i < 20000; i++) {
        const before = rng.state;
        const v = drawNoise(rng, bound);
        expect(rng.state).toBe(rngAfter(before, 3));
        seen.add(v);
      }
      expect(Math.min(...seen)).toBe(0 - bound);
      expect(Math.max(...seen)).toBe(bound);
      expect(seen.size).toBe(2 * bound + 1);
    }
  }, 30_000);
});

describe("weapon models", () => {
  it("dealsDamage is false exactly for the DIRT weapons, and a cyclic def terminates", () => {
    expect(ROSTER.filter((w) => !dealsDamage(w)).map((w) => w.id)).toEqual(["rampart", "bastion", "leveler"]);
    const loop = { on: "impact" as const, effects: [] as never[] };
    (loop.effects as unknown[]).push({ split: { count: 1, spreadDeg: 0, speedPct: 50, from: "up", child: loop } });
    expect(dealsDamage({ ...ROSTER[0], stage: loop })).toBe(false);
  });
  it("the roster flies 12 distinct probe models", () => {
    expect(new Set(ROSTER.map((w) => probeModelOf(w).key)).size).toBe(12);
    expect(probeModelOf(ROSTER[ROSTER_INDEX.hydra]).key).toBe(probeModelOf(ROSTER[ROSTER_INDEX.barrage]).key);
  });
});
