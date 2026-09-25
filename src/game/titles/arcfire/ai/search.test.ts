// src/game/titles/arcfire/ai/search.test.ts — Plan 2B T6: the RNG-free search and the choice rules
import { describe, it, expect } from "vitest";
import { cloneMatch } from "../state";
import { hashMatch } from "../hash";
import { resolveTurn } from "../resolve";
import { ROSTER, ROSTER_INDEX } from "../weapons/roster";
import { battleBoards, corpusState } from "@/game/test/arcfire/fixtures";
import { byValue, chooseOffence, planTurn } from "./plan";
import { TIERS, tierBudget } from "./tiers";
import type { Cand } from "./search";

describe("the search", () => {
  it("never writes the match or its RNG, stays within its budget, and plans the same on a clone", () => {
    const m = corpusState(11, 9);
    for (const tier of ["rookie", "veteran", "ace"] as const) {
      const hash = hashMatch(m);
      const a = planTurn(m, tier);
      expect(hashMatch(m)).toBe(hash);
      expect(planTurn(cloneMatch(m), tier)).toEqual(a);
      expect(a.stats.sims).toBeLessThanOrEqual(tierBudget(TIERS[tier]));
    }
  }, 120_000);
  it("finds the Hailstorm cone: a Veteran with only Hailstorm scores on every board", () => {
    for (const b of battleBoards().filter((x) => x.wind === 0)) {
      const m = cloneMatch(b);
      m.hands[m.shooter] = [ROSTER_INDEX.hailstorm];
      const c = planTurn(m, "veteran").choices[0];
      const tl = resolveTurn(cloneMatch(m), { move: c.move, weapon: c.w, angle: c.angle, power: c.power });
      expect(tl.points[m.shooter]).toBeGreaterThan(0);
    }
  }, 60_000);
});

const cand = (id: string, ev: number): Cand => ({ w: ROSTER_INDEX[id], move: 0, angle: 45, power: 60, ev, raw: ev });

describe("the choice rules", () => {
  it("Ace saves a tier-3 weapon unless it beats the best other by >= 20%, strictly", () => {
    expect(chooseOffence([cand("nova", 100), cand("pulse2", 83)], TIERS.ace).pick!.w).toBe(ROSTER_INDEX.nova); // 500 >= 498
    const saved = chooseOffence([cand("nova", 100), cand("pulse2", 84)], TIERS.ace); // 500 < 504
    expect([saved.pick!.w, saved.saved]).toEqual([ROSTER_INDEX.pulse2, true]);
    expect(chooseOffence([cand("nova", 0), cand("pulse2", 0)], TIERS.ace).pick!.w).toBe(ROSTER_INDEX.nova); // no alternative with ev > 0
    expect(chooseOffence([cand("nova", 90), cand("swarm", 80)], TIERS.ace).pick!.w).toBe(ROSTER_INDEX.nova); // only tier 3
    expect(chooseOffence([cand("nova", 100), cand("pulse2", 84)], TIERS.veteran).pick!.w).toBe(ROSTER_INDEX.nova); // Veteran never saves
    expect(chooseOffence([cand("pulse", 40), cand("tumbler", 40)], TIERS.veteran).pick!.w).toBe(ROSTER_INDEX.pulse); // the first of equals
  });
  it("ranks by ev, then the lower tier, then roster index", () => {
    const r = [cand("nova", 60), cand("pulse2", 60), cand("tumbler", 60), cand("pulse", 70)].sort(byValue).map((c) => ROSTER[c.w].id);
    expect(r).toEqual(["pulse", "tumbler", "pulse2", "nova"]);
  });
});
