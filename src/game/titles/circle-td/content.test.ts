// src/game/titles/circle-td/content.test.ts
import { describe, it, expect } from "vitest";
import {
  TOWERS, TARGET_AIR, TARGET_LAND, TARGET_BOTH, trackLength, posAt, TRACK,
  TILES, TILE_COUNT, TILE_SIZE, TRACK_WIDTH,
} from "./content";
import { fromInt, toFloat } from "@/game/sim/math/fixed";

describe("Circle TD content", () => {
  it("has five towers with sourced costs", () => {
    expect(TOWERS).toHaveLength(5);
    expect(TOWERS[0].cost).toBe(50);   // Fast   SOURCED
    expect(TOWERS[1].cost).toBe(45);   // Air    SOURCED
    expect(TOWERS[2].cost).toBe(45);   // Slow   SOURCED
    expect(TOWERS[3].cost).toBe(125);  // Splash SOURCED
    expect(TOWERS[4].cost).toBe(260);  // Damage SOURCED
  });
  it("encodes target restrictions", () => {
    expect(TOWERS[1].targets).toBe(TARGET_AIR);   // Air: air only
    expect(TOWERS[2].targets).toBe(TARGET_BOTH);  // Slow: both
    expect(TOWERS[4].targets).toBe(TARGET_LAND);  // Damage: land only
  });
  it("L9 damage/range match sourced endpoints; Slow's slow% is a non-uniform table", () => {
    // dmg0 + 9*dmgStep and range0 + 9*rangeStep at the top level (L9), per tower.
    const l9 = [
      { dmg: 81,   range: 213 },  // Fast
      { dmg: 162,  range: 261 },  // Air
      { dmg: 1,    range: 213 },  // Slow
      { dmg: 384,  range: 145 },  // Splash
      { dmg: 2293, range: 179 },  // Damage
    ];
    l9.forEach(({ dmg, range }, i) => {
      const t = TOWERS[i];
      expect(t.dmg0 + 9 * t.dmgStep).toBe(dmg);
      expect(t.range0 + 9 * t.rangeStep).toBe(fromInt(range));
    });
    // Slow's slow% is SOURCED as a per-level table, not base+step: +3 for the
    // first 7 steps, then +4, +4 — no uniform step reaches the L9 value (89).
    expect(TOWERS[2].slowPct[8]).toBe(85);
    expect(TOWERS[2].slowPct[9]).toBe(89);
  });
  it("track loops: posAt wraps past the end", () => {
    const len = trackLength(TRACK.outer);
    const a = posAt(TRACK.outer, 0);
    const b = posAt(TRACK.outer, len); // full loop returns to start
    expect(Math.abs(a.x - b.x)).toBeLessThan(fromInt(1));
    expect(Math.abs(a.y - b.y)).toBeLessThan(fromInt(1));
  });
  it("posAt interpolates partway along a segment", () => {
    // First outer-track segment; a distance of exactly half its length should
    // land on the segment's midpoint (exercises the mul/div fractional path,
    // catching a swapped mul/div or a scaling bug that dist=0/dist=len can't).
    const x0 = TRACK.outer[0], y0 = TRACK.outer[1];
    const x1 = TRACK.outer[2], y1 = TRACK.outer[3];
    const half = (Math.abs(x1 - x0) + Math.abs(y1 - y0)) / 2;
    const mid = posAt(TRACK.outer, half);
    expect(mid.x).toBe((x0 + x1) / 2);
    expect(mid.y).toBe((y0 + y1) / 2);
  });

  // --- Task 2: real spiral geometry + flanking tiles ---

  it("inner track loops too: posAt wraps past the end", () => {
    const len = trackLength(TRACK.inner);
    const a = posAt(TRACK.inner, 0);
    const b = posAt(TRACK.inner, len);
    expect(Math.abs(a.x - b.x)).toBeLessThan(fromInt(1));
    expect(Math.abs(a.y - b.y)).toBeLessThan(fromInt(1));
  });

  it("every track segment (both tracks, including the closing edge) is axis-aligned", () => {
    // Real-spiral requirement: no diagonal ring-to-ring or closing-edge
    // shortcut (unlike Plan 1's placeholder) — Manhattan segLen is always
    // exactly Euclidean because every segment has dx===0 or dy===0.
    for (const poly of [TRACK.outer, TRACK.inner]) {
      const n = poly.length / 2;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const dx = poly[j * 2] - poly[i * 2];
        const dy = poly[j * 2 + 1] - poly[i * 2 + 1];
        expect(dx === 0 || dy === 0).toBe(true);
      }
    }
  });

  it("tile count is in a sane range (flanking cells, not an all-board grid)", () => {
    expect(TILE_COUNT).toBeGreaterThanOrEqual(120);
    expect(TILE_COUNT).toBeLessThanOrEqual(400);
  });

  // Axis-aligned point-to-segment distance (float px) — every track segment
  // is horizontal or vertical by construction.
  function pointSegDist(px: number, py: number, x0: number, y0: number, x1: number, y1: number): number {
    let cx: number, cy: number;
    if (y0 === y1) {
      const lo = Math.min(x0, x1), hi = Math.max(x0, x1);
      cx = px < lo ? lo : px > hi ? hi : px;
      cy = y0;
    } else {
      const lo = Math.min(y0, y1), hi = Math.max(y0, y1);
      cx = x0;
      cy = py < lo ? lo : py > hi ? hi : py;
    }
    const dx = px - cx, dy = py - cy;
    return Math.sqrt(dx * dx + dy * dy);
  }

  it("no tile sits ON the path (either track)", () => {
    // A tile "on" the path means within less than half a tile of some
    // segment's centreline — well under the generator's own flank offset.
    const minOnPathDist = TILE_SIZE / 2;
    for (const poly of [TRACK.outer, TRACK.inner]) {
      const n = poly.length / 2;
      for (let ti = 0; ti < TILE_COUNT; ti++) {
        const tx = toFloat(TILES[ti * 2]), ty = toFloat(TILES[ti * 2 + 1]);
        for (let i = 0; i < n; i++) {
          const j = (i + 1) % n;
          const x0 = poly[i * 2], y0 = poly[i * 2 + 1];
          const x1 = poly[j * 2], y1 = poly[j * 2 + 1];
          if (x0 === x1 && y0 === y1) continue; // zero-length wrap edge
          const d = pointSegDist(tx, ty, toFloat(x0), toFloat(y0), toFloat(x1), toFloat(y1));
          expect(d).toBeGreaterThanOrEqual(minOnPathDist);
        }
      }
    }
  });

  it("every tile flanks the track: within ~1.5*TILE_SIZE of some point on some path segment", () => {
    const maxFlankDist = TILE_SIZE * 1.5;
    const step = fromInt(8);
    for (let ti = 0; ti < TILE_COUNT; ti++) {
      const tx = TILES[ti * 2], ty = TILES[ti * 2 + 1];
      let best = Infinity;
      for (const poly of [TRACK.outer, TRACK.inner]) {
        const total = trackLength(poly);
        for (let d = 0; d <= total; d += step) {
          const p = posAt(poly, d);
          const dx = toFloat(p.x - tx), dy = toFloat(p.y - ty);
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < best) best = dist;
        }
      }
      expect(best).toBeLessThanOrEqual(maxFlankDist);
    }
  });

  // --- Final-review findings #4/#5: nested-not-interleaved loops, and
  // non-overlapping build tiles ---

  it("finding #5: INNER's bounding box sits strictly inside OUTER's (genuinely nested)", () => {
    const bbox = (poly: Int32Array) => {
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (let i = 0; i < poly.length; i += 2) {
        const x = toFloat(poly[i]), y = toFloat(poly[i + 1]);
        minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      }
      return { minX, maxX, minY, maxY };
    };
    const outer = bbox(TRACK.outer);
    const inner = bbox(TRACK.inner);
    expect(inner.minX).toBeGreaterThan(outer.minX);
    expect(inner.maxX).toBeLessThan(outer.maxX);
    expect(inner.minY).toBeGreaterThan(outer.minY);
    expect(inner.maxY).toBeLessThan(outer.maxY);
  });

  it("finding #5: OUTER and INNER never touch/cross, and stay >= TRACK_WIDTH + 2*TILE_SIZE apart", () => {
    // Dense point sampling (every ~2px) along both loops, checked pairwise —
    // the review's own measurement method (rings interleaving, crossing
    // counts) reduces to "the two loops' minimum separation is 0"; this
    // asserts the fixed geometry's separation is not just positive but
    // actually wide enough for a lane + flanking tiles on each side.
    const minGap = TRACK_WIDTH + 2 * TILE_SIZE; // plain px, per the review's own rule
    const step = fromInt(4);
    const outerLen = trackLength(TRACK.outer);
    const innerLen = trackLength(TRACK.inner);
    const outerPts: { x: number; y: number }[] = [];
    for (let d = 0; d <= outerLen; d += step) outerPts.push(posAt(TRACK.outer, d));
    let minDist = Infinity;
    for (let d = 0; d <= innerLen; d += step) {
      const p2 = posAt(TRACK.inner, d);
      for (const p1 of outerPts) {
        const dx = toFloat(p1.x - p2.x), dy = toFloat(p1.y - p2.y);
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < minDist) minDist = dist;
      }
    }
    expect(minDist).toBeGreaterThanOrEqual(minGap);
  });

  it("finding #5: neither loop self-crosses, and the two loops never cross each other", () => {
    // Axis-aligned segments: a bounding-box overlap test exactly detects
    // intersection/overlap/touching in every case (perpendicular, parallel,
    // and collinear-overlapping) — see content.ts's own pointSegDistSq for
    // the same axis-aligned assumption used elsewhere in this file.
    function segsOf(poly: Int32Array): Array<[number, number, number, number]> {
      const segs: Array<[number, number, number, number]> = [];
      const n = poly.length / 2;
      for (let i = 0; i < n - 1; i++) {
        const x0 = toFloat(poly[i * 2]), y0 = toFloat(poly[i * 2 + 1]);
        const x1 = toFloat(poly[(i + 1) * 2]), y1 = toFloat(poly[(i + 1) * 2 + 1]);
        if (x0 === x1 && y0 === y1) continue; // the zero-length wrap edge
        segs.push([x0, y0, x1, y1]);
      }
      return segs;
    }
    const rangesOverlap = (a0: number, a1: number, b0: number, b1: number) =>
      Math.max(Math.min(a0, a1), Math.min(b0, b1)) <= Math.min(Math.max(a0, a1), Math.max(b0, b1));
    const segsIntersect = (a: readonly number[], b: readonly number[]) =>
      rangesOverlap(a[0], a[2], b[0], b[2]) && rangesOverlap(a[1], a[3], b[1], b[3]);

    const outerSegs = segsOf(TRACK.outer);
    const innerSegs = segsOf(TRACK.inner);

    // Self-crossing: every pair of NON-adjacent segments (adjacent segments,
    // and the first/last pair which close the loop, legitimately share an
    // endpoint) must not intersect at all.
    for (const segs of [outerSegs, innerSegs]) {
      for (let i = 0; i < segs.length; i++) {
        for (let j = i + 1; j < segs.length; j++) {
          if (j === i + 1) continue;
          if (i === 0 && j === segs.length - 1) continue;
          expect(segsIntersect(segs[i], segs[j])).toBe(false);
        }
      }
    }

    // Cross-crossing: no OUTER segment may touch any INNER segment.
    for (const a of outerSegs) {
      for (const b of innerSegs) {
        expect(segsIntersect(a, b)).toBe(false);
      }
    }
  });

  it("finding #4: no two tiles are closer than ~0.75*TILE_SIZE (minimum pairwise centre spacing)", () => {
    const minSpacing = TILE_SIZE * 0.75;
    let minDist = Infinity;
    for (let i = 0; i < TILE_COUNT; i++) {
      for (let j = i + 1; j < TILE_COUNT; j++) {
        const dx = toFloat(TILES[i * 2] - TILES[j * 2]);
        const dy = toFloat(TILES[i * 2 + 1] - TILES[j * 2 + 1]);
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < minDist) minDist = dist;
      }
    }
    expect(minDist).toBeGreaterThanOrEqual(minSpacing);
  });

  it("finding #5: build tiles exist in the board's centre region (inside INNER's ring)", () => {
    // A tile "in the centre region" is one that falls inside INNER's own
    // bounding box — i.e. flanking INNER's ring from the interior, the
    // region the old interleaved geometry painted over entirely.
    const bbox = (poly: Int32Array) => {
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (let i = 0; i < poly.length; i += 2) {
        const x = toFloat(poly[i]), y = toFloat(poly[i + 1]);
        minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      }
      return { minX, maxX, minY, maxY };
    };
    const inner = bbox(TRACK.inner);
    let centreTiles = 0;
    for (let ti = 0; ti < TILE_COUNT; ti++) {
      const tx = toFloat(TILES[ti * 2]), ty = toFloat(TILES[ti * 2 + 1]);
      if (tx > inner.minX && tx < inner.maxX && ty > inner.minY && ty < inner.maxY) centreTiles++;
    }
    expect(centreTiles).toBeGreaterThan(0);
  });
});
