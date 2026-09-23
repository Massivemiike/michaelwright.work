import { describe, it, expect } from "vitest";
import { makeRng } from "@/game/sim/math/rng";
import { drawPool, pickerAt } from "./draft";
import { ROSTER } from "./weapons/roster";
import type { WeaponDef, Tag } from "./weapons/types";

const fakeRoster = (tags: Tag[]): WeaponDef[] =>
  tags.map((tag, i) => ({
    id: `w${i}`, name: `W${i}`, tag, tier: 1, power: 10,
    launch: { kind: "shell" },
    stage: { on: "impact", effects: [{ blast: { radius: 10, damage: 10 } }] },
  }));

describe("drawPool", () => {
  // index 3 is the only SPLIT, index 5 the only DIRT
  const roster = fakeRoster(["BLAST", "BLAST", "BLAST", "SPLIT", "BLAST", "DIRT", "BLAST", "BLAST", "BLAST", "BLAST"]);

  it("returns `size` distinct in-range roster indices, ascending", () => {
    const pool = drawPool(makeRng(1), roster, 6, []);
    expect(pool.length).toBe(6);
    expect(new Set(pool).size).toBe(6);
    expect([...pool].sort((a, b) => a - b)).toEqual(pool);
    for (const i of pool) {
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(roster.length);
    }
  });
  it("always includes one weapon of each guaranteed tag", () => {
    for (let seed = 0; seed < 50; seed++) {
      const pool = drawPool(makeRng(seed), roster, 4, ["SPLIT", "DIRT"]);
      expect(pool).toContain(3);
      expect(pool).toContain(5);
    }
  });
  it("is deterministic per seed", () => {
    expect(drawPool(makeRng(9), roster, 5, ["DIRT"])).toEqual(drawPool(makeRng(9), roster, 5, ["DIRT"]));
  });
  it("skips a guaranteed tag the roster doesn't have", () => {
    expect(drawPool(makeRng(2), roster, 3, ["BEAM"]).length).toBe(3);
  });
  it("refuses a pool bigger than the roster", () => {
    expect(() => drawPool(makeRng(1), ROSTER, ROSTER.length + 1, [])).toThrow(RangeError);
  });
});

describe("pickerAt", () => {
  it("alternates, starting with the first picker", () => {
    expect([0, 1, 2, 3].map((n) => pickerAt(1, n))).toEqual([1, 0, 1, 0]);
    expect([0, 1, 2, 3].map((n) => pickerAt(0, n))).toEqual([0, 1, 0, 1]);
  });
});
