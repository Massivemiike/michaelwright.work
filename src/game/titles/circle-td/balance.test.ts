import { describe, it, expect } from "vitest";
import {
  hp,
  interest,
  bounty,
  BOUNTY_CAP,
  waveFlags,
  deriveOffsets,
  type Offsets,
} from "./balance";
import { CREEP_FAST, CREEP_AIR, CREEP_HARD } from "@/game/sim/state";
import { makeRng, nextRange } from "@/game/sim/math/rng";

describe("balance", () => {
  const O: Offsets = { offFast: 0, offAir: 0, offHard: 0 };

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
  it("deriveOffsets samples Fast(5) then Air(7) then Hard(9)", () => {
    const a = makeRng(42);
    const expected = {
      offFast: nextRange(a, 5),
      offAir: nextRange(a, 7),
      offHard: nextRange(a, 9),
    };
    expect(deriveOffsets(makeRng(42))).toEqual(expected);
  });
  it("interest is 5% early (cap inert), capped late", () => {
    // early: small bank, cap does not bite
    expect(interest(1000, 5, O)).toBe(50);
    // late: huge bank, payout limited by α·waveHP, far below 5%
    const capped = interest(1_000_000_000, 150, O);
    expect(capped).toBeLessThan(1_000_000_000 * 0.05);
  });
  it("bounty scales with the killed creep's own maxHp (Task 3), flattened by BOUNTY_CAP", () => {
    expect(bounty(10)).toBeGreaterThanOrEqual(1);
    expect(bounty(200)).toBeGreaterThan(bounty(10));
    // In the UNCAPPED region (small maxHp, floor(maxHp/5) below BOUNTY_CAP),
    // the by-maxHp property still holds: a creep with 2x maxHp pays ~2x — a
    // Hard creep is worth ~2x a Normal from the same wave.
    expect(bounty(50)).toBe(10); // floor(50/5), well under the cap
    expect(bounty(100)).toBe(20); // floor(100/5), still under the cap
    expect(bounty(100)).toBeGreaterThanOrEqual(2 * bounty(50) - 1);
    expect(bounty(100)).toBeLessThanOrEqual(2 * bounty(50) + 1);
    // The per-kill cap (BOUNTY_CAP) flattens the LATE game: a huge-maxHp
    // creep never pays more than the cap — this is what kills the old glut
    // (an uncapped late kill paid floor(~18000/5)=3600). The cap is still a
    // pure function of the killed creep's OWN maxHp, so the late-kill
    // arbitrage the by-maxHp bounty fixed stays fixed.
    expect(bounty(1_000_000)).toBe(BOUNTY_CAP);
    expect(bounty(5 * BOUNTY_CAP)).toBe(BOUNTY_CAP); // exactly at the knee
  });
});
