import { describe, it, expect } from "vitest";
import { blastDamage } from "./damage";
import { TANK_HIT_R } from "./constants";

describe("blastDamage", () => {
  const pulse = { radius: 28, damage: 40 };
  it("deals full damage when the blast overlaps the hitbox", () => {
    expect(blastDamage(pulse, 100, 100, 100, 100)).toBe(40);
    expect(blastDamage(pulse, 100, 100, 100 + TANK_HIT_R, 100)).toBe(40);
  });
  it("falls off linearly from the hitbox edge out to the blast radius", () => {
    expect(blastDamage(pulse, 100, 100, 100 + TANK_HIT_R + 14, 100)).toBe(20);
    expect(blastDamage(pulse, 100, 100, 100 + TANK_HIT_R + 28, 100)).toBe(0);
    expect(blastDamage(pulse, 100, 100, 100 + TANK_HIT_R + 100, 100)).toBe(0);
  });
  it("uses the quadratic curve when asked", () => {
    const needle = { radius: 10, damage: 110, falloff: "quadratic" as const };
    expect(blastDamage(needle, 0, 0, TANK_HIT_R + 5, 0)).toBe(82); // 110 × (100 − 25) / 100 = 82.5
  });
  it("measures true (euclidean) distance", () => {
    expect(blastDamage(pulse, 0, 0, 12, 16)).toBe(blastDamage(pulse, 0, 0, 20, 0));
    expect(blastDamage(pulse, 0, 0, 20, 0)).toBe(31); // d = 6 → 40 × 22 / 28 = 31.4
  });
});
