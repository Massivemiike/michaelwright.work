// src/game/titles/circle-td/balance-config.test.ts
//
// Plan-1 addendum (§5.4 tuning): the three balance constants (startBank,
// gamma, alphaBp) are overridable per-sim via SimConfig.balance, so an
// upcoming headless sweep can vary them. Backward compatibility (no
// override -> byte-identical behavior) is guarded separately by the golden
// determinism gate (src/game/test/determinism.test.ts) — this file only
// proves the override plumbing itself.
import { describe, it, expect } from "vitest";
import { makeSim } from "./index";
import { START_BANK } from "./content";
import { GAMMA, ALPHA_BP, bounty, interest, type Offsets } from "./balance";

describe("balance overrides (SimConfig.balance)", () => {
  it("overrides startBank when provided", () => {
    const sim = makeSim({ seed: 1, mode: "free", balance: { startBank: 1000 } });
    expect(sim.state.bank).toBe(1000);
  });

  it("preserves sourced defaults when no override is given", () => {
    const sim = makeSim({ seed: 1, mode: "free" });
    expect(sim.state.bank).toBe(START_BANK);
    expect(sim.state.gamma).toBe(GAMMA);
    expect(sim.state.alphaBp).toBe(ALPHA_BP);
  });

  it("carries gamma/alphaBp overrides onto state", () => {
    const sim = makeSim({ seed: 1, mode: "free", balance: { gamma: 100, alphaBp: 50 } });
    expect(sim.state.gamma).toBe(100);
    expect(sim.state.alphaBp).toBe(50);
  });

  it("a smaller gamma raises bounty for the same wave", () => {
    // Compares two explicit gamma values rather than the module default vs
    // a hardcoded override — the default itself is a tuned INVENTED value
    // (see balance.ts) that can be retuned again, and pinning this test to
    // "bigger than whatever GAMMA currently is" would silently invert
    // (bounty(wave, 50) was a smaller gamma than the old default 400, but
    // is now LARGER than the tuned default 20 — exactly what broke here
    // when §5.4's sweep changed GAMMA). Testing bounty()'s own monotonic
    // relationship directly is what should never need re-tuning.
    const wave = 20;
    expect(bounty(wave, 10)).toBeGreaterThan(bounty(wave, 100));
  });

  it("a smaller alphaBp lowers the interest cap for the same bank/wave", () => {
    const O: Offsets = { offFast: 0, offAir: 0, offHard: 0 };
    const bank = 1_000_000_000;
    const wave = 150;
    const defaultInterest = interest(bank, wave, O);
    const overriddenInterest = interest(bank, wave, O, 50);
    expect(overriddenInterest).toBeLessThan(defaultInterest);
  });
});
