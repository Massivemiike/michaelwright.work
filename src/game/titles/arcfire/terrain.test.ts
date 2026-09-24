import { describe, it, expect } from "vitest";
import { makeRng, nextRange } from "@/game/sim/math/rng";
import {
  makeTerrain, generateTerrain, isSolid, carveCircle, settle, spansFromHeight, cloneTerrain,
  addInterval, removeInterval, carveCapsule, groundBelow, surfaceTop, type Terrain,
} from "./terrain";
import { idiv } from "./imath";
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

/** Column x's spans as [top, bottom] pairs. */
function spansOf(t: Terrain, x: number): number[][] {
  const out: number[][] = [];
  for (let i = 0; i < t.spanCount[x]; i++) out.push([t.spans[x * MAX_SPANS * 2 + i * 2], t.spans[x * MAX_SPANS * 2 + i * 2 + 1]]);
  return out;
}

/** An empty column (no spans) at x on flat ground y. */
function withEmptyColumn(y: number, x: number): Terrain {
  const t = flat(y);
  t.height[x] = WORLD_H;
  spansFromHeight(t);
  return t;
}

describe("groundBelow / surfaceTop", () => {
  it("finds the first solid y at or below y, through holes, down to the floor", () => {
    const t = flat(300);
    expect(groundBelow(t, 600, 100)).toBe(300);
    expect(groundBelow(t, 600, 350)).toBe(350); // already inside the ground
    carveCircle(t, 600, 360, 10); // hole 350..370 under a 50 px roof
    expect(groundBelow(t, 600, 355)).toBe(371);
    expect(groundBelow(withEmptyColumn(300, 9), 9, 100)).toBe(WORLD_H);
  });
  it("surfaceTop is the top of the highest span, or WORLD_H for an empty column", () => {
    const t = flat(300);
    expect(surfaceTop(t, 600)).toBe(300);
    carveCircle(t, 600, 360, 10);
    expect(surfaceTop(t, 600)).toBe(300);
    expect(surfaceTop(withEmptyColumn(300, 9), 9)).toBe(WORLD_H);
  });
});

describe("addInterval", () => {
  it("merges touching dirt into one span", () => {
    const t = flat(300);
    addInterval(t, 600, 290, 300);
    expect(spansOf(t, 600)).toEqual([[290, 500]]);
  });
  it("adds a floating span that settle then drops onto the ground", () => {
    const t = flat(400);
    addInterval(t, 600, 100, 150);
    expect(spansOf(t, 600)).toEqual([[100, 150], [400, 500]]);
    const r = settle(t);
    expect(r.heights[600]).toBe(350);
    expect(r.falls).toContainEqual({ x: 600, top: 100, bottom: 150, fall: 250 });
  });
  it("clamps to [0, WORLD_H)", () => {
    const t = withEmptyColumn(300, 9);
    addInterval(t, 9, -30, 20);
    addInterval(t, 9, 480, 600);
    expect(spansOf(t, 9)).toEqual([[0, 20], [480, 500]]);
  });
  it("never loses dirt: a 9th span merges with the span below it, or with the one above when none is below", () => {
    const t = withEmptyColumn(300, 9);
    for (let k = 0; k < 8; k++) addInterval(t, 9, 10 + 20 * k, 20 + 20 * k); // [10,20) [30,40) ... [150,160)
    expect(t.spanCount[9]).toBe(8);
    addInterval(t, 9, 0, 5); // above them all: closes the gap to [10,20)
    expect(spansOf(t, 9)[0]).toEqual([0, 20]);
    expect(t.spanCount[9]).toBe(8);
    addInterval(t, 9, 170, 175); // below them all: closes the gap to [150,160)
    expect(spansOf(t, 9)[7]).toEqual([150, 175]);
    expect(t.spanCount[9]).toBe(8);
    const u = withEmptyColumn(300, 9);
    for (let k = 0; k < 8; k++) addInterval(u, 9, 10 + 20 * k, 20 + 20 * k);
    addInterval(u, 9, 84, 86); // between [70,80) and [90,100), touching neither: extended DOWN to absorb [90,100)
    expect(spansOf(u, 9)).toEqual([[10, 20], [30, 40], [50, 60], [70, 80], [84, 100], [110, 120], [130, 140], [150, 160]]);
  });
  it("is a union against a pixel model (300 random columns × 14 random adds / removes)", () => {
    const rng = makeRng(20260923);
    const x = 600;
    const bad: string[] = [];
    let overflows = 0;
    for (let col = 0; col < 300; col++) {
      const t = flat(200 + nextRange(rng, 300));
      for (let op = 0; op < 14; op++) {
        const want = new Uint8Array(WORLD_H);
        for (let y = 0; y < WORLD_H; y++) want[y] = isSolid(t, x, y) ? 1 : 0;
        const a = nextRange(rng, WORLD_H + 40) - 20;
        const b = a + 1 + nextRange(rng, 30);
        const add = nextRange(rng, 2) === 0;
        if (add) addInterval(t, x, a, b);
        else removeInterval(t, x, a, b);
        for (let y = Math.max(0, a); y < Math.min(WORLD_H, b); y++) want[y] = add ? 1 : 0;
        let runs = 0; // spans in the exact union / difference
        for (let y = 0; y < WORLD_H; y++) if (want[y] && (y === 0 || !want[y - 1])) runs++;
        if (runs > MAX_SPANS) overflows++;
        for (let y = 0; y < WORLD_H; y++) {
          const got = isSolid(t, x, y) ? 1 : 0;
          // exact when it fits; on overflow addInterval never loses dirt, and removeInterval keeps Plan 1's drop-the-top rule
          const ok = runs <= MAX_SPANS ? got === want[y] : add ? got >= want[y] : got <= want[y];
          if (!ok) bad.push(`column ${col} op ${op}: y ${y} is ${got}, want ${want[y]}`);
        }
        const s = spansOf(t, x);
        if (s.length > MAX_SPANS) bad.push(`column ${col} op ${op}: ${s.length} spans`);
        for (let i = 0; i < s.length; i++) {
          // ordered, disjoint and non-touching
          if (s[i][0] >= s[i][1] || (i > 0 && s[i][0] <= s[i - 1][1])) bad.push(`column ${col} op ${op}: ${JSON.stringify(s)}`);
        }
      }
    }
    expect(bad).toEqual([]);
    expect(overflows).toBeGreaterThan(0); // the overflow rules were exercised
  });
});

describe("carveCapsule", () => {
  it("equals carveCircle exactly at zero length", () => {
    const a = flat(300);
    const b = flat(300);
    carveCapsule(a, 600, 310, 600, 310, 12);
    carveCircle(b, 600, 310, 12);
    expect(Array.from(a.spanCount)).toEqual(Array.from(b.spanCount));
    expect(Array.from(a.spans)).toEqual(Array.from(b.spans));
  });
  it("equals the brute-force union of discs on every <= 1 px sample (60 random segments, r 1..8)", () => {
    const rng = makeRng(7);
    for (let k = 0; k < 60; k++) {
      const x0 = nextRange(rng, WORLD_W);
      const y0 = 250 + nextRange(rng, 260);
      const x1 = Math.min(WORLD_W - 1, Math.max(0, x0 + nextRange(rng, 241) - 120));
      const y1 = 250 + nextRange(rng, 260);
      const r = 1 + nextRange(rng, 8);
      const cap = flat(300);
      const discs = flat(300);
      carveCapsule(cap, x0, y0, x1, y1, r);
      const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
      for (let i = 0; i <= n; i++) carveCircle(discs, x0 + idiv((x1 - x0) * i, n), y0 + idiv((y1 - y0) * i, n), r);
      for (let x = Math.max(0, Math.min(x0, x1) - r - 1); x <= Math.min(WORLD_W - 1, Math.max(x0, x1) + r + 1); x++) {
        expect(spansOf(cap, x), `segment ${k} column ${x}`).toEqual(spansOf(discs, x));
      }
    }
  });
});
