// src/game/titles/circle-td/content.test.ts
import { describe, it, expect } from "vitest";
import {
  TOWERS, TARGET_AIR, TARGET_LAND, TARGET_BOTH, trackLength, posAt, TRACK,
  TILES, TILE_COUNT, TILE_SIZE,
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
});
