import { describe, it, expect } from "vitest";
import { hp, interest, bounty, waveFlags, ALPHA } from "./balance";
import { CREEP_FAST, CREEP_AIR, CREEP_HARD } from "@/game/sim/state";

describe("balance", () => {
  it("HP curve matches sourced values", () => {
    expect(hp(1)).toBe(8); // SOURCED
    expect(hp(2)).toBe(Math.floor(1.5 * 4 + 43 - 16)); // 33
  });
  it("wave flags follow the perturbed schedule (offsets 0)", () => {
    expect(waveFlags(5, 0, 0, 0) & CREEP_FAST).toBe(CREEP_FAST);
    expect(waveFlags(7, 0, 0, 0) & CREEP_AIR).toBe(CREEP_AIR);
    expect(waveFlags(9, 0, 0, 0) & CREEP_HARD).toBe(CREEP_HARD);
    expect(waveFlags(1, 0, 0, 0)).toBe(0);
  });
  it("interest is 5% early (cap inert), capped late", () => {
    // early: small bank, cap does not bite
    expect(interest(1000, 5, { offFast: 0, offAir: 0, offHard: 0 } as any)).toBe(
      50
    );
    // late: huge bank, payout limited by α·waveHP, far below 5%
    const capped = interest(1_000_000_000, 150, {
      offFast: 0,
      offAir: 0,
      offHard: 0,
    } as any);
    expect(capped).toBeLessThan(1_000_000_000 * 0.05);
  });
  it("bounty scales with HP", () => {
    expect(bounty(10)).toBeGreaterThanOrEqual(1);
    expect(bounty(200)).toBeGreaterThan(bounty(10));
  });
});
