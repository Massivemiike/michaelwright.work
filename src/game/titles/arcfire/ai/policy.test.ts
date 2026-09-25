// src/game/titles/arcfire/ai/policy.test.ts — Plan 2B T7: the only RNG draws (the turn policy and the draft AI)
import { describe, it, expect } from "vitest";
import { applyPick, applyTurn, createMatch } from "../match";
import { STANDARD_SETTINGS, cloneMatch } from "../state";
import { ROSTER } from "../weapons/roster";
import { corpusState, rngAfter } from "@/game/test/arcfire/fixtures";
import { planTurn } from "./plan";
import { AI_TURN_DRAWS, aiPick, aiTurn } from "./policy";

describe("the policy", () => {
  it("draws exactly 7 values after its search, decides the same on clones, and fires a legal command", () => {
    const m = corpusState(11, 9);
    for (const tier of ["rookie", "veteran", "ace"] as const) {
      const plan = planTurn(m, tier);
      const x = cloneMatch(m);
      const y = cloneMatch(m);
      const cx = aiTurn(x, tier);
      const cy = aiTurn(y, tier);
      expect(cx.cmd).toEqual(cy.cmd);
      expect(cx.plan.stats).toEqual(cy.plan.stats);
      expect(cx.plan.stats).toEqual(plan.stats);
      expect(x.rng.state).toBe(rngAfter(m.rng.state, AI_TURN_DRAWS));
      expect(applyTurn(cloneMatch(m), cx.cmd).ok).toBe(true);
    }
  }, 120_000);
});

describe("the draft AI", () => {
  it("takes the top by power (Ace), stays within its top N, and always draws exactly once", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const m = createMatch(seed, STANDARD_SETTINGS);
      const byPower = m.pool.map((_, i) => i).sort((a, b) => ROSTER[m.pool[b]].power - ROSTER[m.pool[a]].power || a - b);
      for (const [tier, top] of [["rookie", 8], ["veteran", 3], ["ace", 1]] as const) {
        const c = cloneMatch(m);
        const w = aiPick(c, tier);
        expect(byPower.slice(0, top)).toContain(w);
        expect(c.rng.state).toBe(rngAfter(m.rng.state, 1));
        expect(applyPick(c, w).ok).toBe(true);
      }
    }
  }, 30_000);
});
