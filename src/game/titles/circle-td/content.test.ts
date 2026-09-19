// src/game/titles/circle-td/content.test.ts
import { describe, it, expect } from "vitest";
import { TOWERS, TARGET_AIR, TARGET_LAND, TARGET_BOTH, trackLength, posAt, TRACK } from "./content";
import { fromInt } from "@/game/sim/math/fixed";

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
});
