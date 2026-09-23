import { describe, it, expect } from "vitest";
import { makeRng } from "@/game/sim/math/rng";
import { makeTerrain, generateTerrain, isSolid, carveCircle, settle, spansFromHeight, cloneTerrain } from "./terrain";
import { WORLD_W, WORLD_H, TERRAIN_MIN_Y, TERRAIN_MAX_Y, SPAWN_X, SPAWN_FLAT, MAX_SPANS } from "./constants";

function flat(y: number) {
  const t = makeTerrain();
  t.height.fill(y);
  spansFromHeight(t);
  return t;
}

describe("generateTerrain", () => {
  it("is deterministic per seed and differs across seeds", () => {
    const a = makeTerrain(), b = makeTerrain(), c = makeTerrain();
    generateTerrain(a, makeRng(7));
    generateTerrain(b, makeRng(7));
    generateTerrain(c, makeRng(8));
    expect(Array.from(a.height)).toEqual(Array.from(b.height));
    expect(Array.from(a.height)).not.toEqual(Array.from(c.height));
  });
  it("stays within bounds and flattens both spawn pads", () => {
    const t = makeTerrain();
    generateTerrain(t, makeRng(123));
    for (let x = 0; x < WORLD_W; x++) {
      expect(t.height[x]).toBeGreaterThanOrEqual(TERRAIN_MIN_Y);
      expect(t.height[x]).toBeLessThanOrEqual(TERRAIN_MAX_Y);
    }
    for (const sx of SPAWN_X) {
      for (let x = sx - SPAWN_FLAT; x <= sx + SPAWN_FLAT; x++) expect(t.height[x]).toBe(t.height[sx]);
    }
  });
});

describe("isSolid", () => {
  it("treats the floor as solid and off-world columns as empty", () => {
    const t = flat(300);
    expect(isSolid(t, 10, 299)).toBe(false);
    expect(isSolid(t, 10, 300)).toBe(true);
    expect(isSolid(t, 10, WORLD_H + 5)).toBe(true);
    expect(isSolid(t, -1, 400)).toBe(false);
    expect(isSolid(t, WORLD_W, 400)).toBe(false);
  });
});

describe("carve + settle", () => {
  it("a surface crater lowers the ground and nothing falls", () => {
    const t = flat(300);
    carveCircle(t, 600, 300, 20);
    expect(isSolid(t, 600, 300)).toBe(false);
    const r = settle(t);
    expect(r.heights[600]).toBe(321); // the disc reached y=320, so solid resumes at 321
    expect(r.heights[500]).toBe(300);
    expect(r.falls).toEqual([]);
  });
  it("an undercut collapses: the roof pours into the hole", () => {
    const t = flat(300);
    carveCircle(t, 600, 360, 10); // hole 350..370 under a 50px roof
    expect(isSolid(t, 600, 320)).toBe(true); // the roof still stands mid-shot
    expect(isSolid(t, 600, 360)).toBe(false);
    const r = settle(t);
    expect(r.heights[600]).toBe(321); // the column lost 21px of dirt
    expect(r.falls).toContainEqual({ x: 600, top: 300, bottom: 350, fall: 21 });
  });
  it("keeps at most MAX_SPANS spans per column, deterministically", () => {
    const carveMany = () => {
      const t = flat(100);
      for (let k = 0; k < MAX_SPANS + 3; k++) carveCircle(t, 50, 120 + k * 30, 5);
      return t;
    };
    const t = carveMany();
    expect(t.spanCount[50]).toBeLessThanOrEqual(MAX_SPANS);
    expect(Array.from(settle(t).heights)).toEqual(Array.from(settle(carveMany()).heights));
  });
  it("cloneTerrain is independent of the original", () => {
    const t = flat(300);
    const c = cloneTerrain(t);
    carveCircle(c, 600, 300, 20);
    settle(c);
    expect(t.height[600]).toBe(300);
  });
});
