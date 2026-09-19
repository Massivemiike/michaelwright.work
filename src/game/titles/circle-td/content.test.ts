// src/game/titles/circle-td/content.test.ts
import { describe, it, expect } from "vitest";
import { TOWERS, TARGET_AIR, TARGET_LAND, trackLength, posAt, TRACK } from "./content";
import { fromInt } from "@/game/sim/math/fixed";

describe("Circle TD content", () => {
  it("has five towers with sourced costs", () => {
    expect(TOWERS).toHaveLength(5);
    expect(TOWERS[0].cost).toBe(50);   // Fast   SOURCED
    expect(TOWERS[1].cost).toBe(45);   // Air    SOURCED
    expect(TOWERS[3].cost).toBe(125);  // Splash SOURCED
    expect(TOWERS[4].cost).toBe(260);  // Damage SOURCED
  });
  it("encodes target restrictions", () => {
    expect(TOWERS[1].targets).toBe(TARGET_AIR);   // Air: air only
    expect(TOWERS[4].targets).toBe(TARGET_LAND);  // Damage: land only
  });
  it("track loops: posAt wraps past the end", () => {
    const len = trackLength(TRACK.outer);
    const a = posAt(TRACK.outer, 0);
    const b = posAt(TRACK.outer, len); // full loop returns to start
    expect(Math.abs(a.x - b.x)).toBeLessThan(fromInt(1));
    expect(Math.abs(a.y - b.y)).toBeLessThan(fromInt(1));
  });
});
