// src/game/titles/arcfire/ai/search.test.ts — Plan 2B T6: the RNG-free search and the choice rules
import { describe, it, expect } from "vitest";
import { cloneMatch } from "../state";
import { hashMatch } from "../hash";
import { resolveTurn } from "../resolve";
import { ROSTER, ROSTER_INDEX } from "../weapons/roster";
import { battleBoards, corpusState, flatBattle } from "@/game/test/arcfire/fixtures";
import { byValue, chooseOffence, planTurn } from "./plan";
import { TIERS, tierBudget } from "./tiers";
import { gridFor, makeCtx, newStats, valueOf, type Cand } from "./search";
import { probeModelOf } from "./model";

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
  it("values a shot as the points it scores minus the points its self-damage gifts, both live, from either seat", () => {
    for (const [shooter, angle] of [[0, 60], [1, 120]] as const) { // mirrored shots on a flat board, the tanks 40 px apart
      const m = flatBattle(300, 340);
      m.shooter = shooter;
      const cmd = { move: 0 as const, weapon: ROSTER_INDEX.pulse, angle, power: 10 };
      const tl = resolveTurn(cloneMatch(m), cmd);
      expect(tl.points[shooter], "it scores").toBeGreaterThan(0);
      expect(tl.points[1 - shooter], "it gifts: the self-damage term is live").toBeGreaterThan(0);
      const hash = hashMatch(m);
      expect(valueOf(makeCtx(m, TIERS.veteran, newStats()), m, cmd.weapon, 0, angle, cmd.power)).toBe(tl.points[shooter] - tl.points[1 - shooter]);
      expect(hashMatch(m)).toBe(hash); // resolved on a scratch copy
    }
  });
});

describe("the DIRT-only paths", () => {
  const dirtOnly = () => {
    const m = corpusState(67, 0);
    m.hands[m.shooter] = [ROSTER_INDEX.rampart];
    return m;
  };
  it("Ace holding only DIRT builds it by the forced rule (forcedDirt)", () => {
    const p = planTurn(dirtOnly(), "ace");
    expect(p.stats.reason).toBe("forcedDirt");
    expect(p.choices.map((c) => c.w)).toEqual([ROSTER_INDEX.rampart]);
    expect(ROSTER[p.choices[0].w].tag).toBe("DIRT");
    expect(p.stats.reply).toBe(-1); // no offensive pick to estimate a reply to: the threat is taken as DIRT_THREAT
    expect(p.stats.replyDirt).toBeGreaterThanOrEqual(0); // the builds were estimated
  });
  it("Veteran holding only DIRT fires it at the grid's least-metric cell, the first of equals (inertOnly)", () => {
    const m = dirtOnly();
    const p = planTurn(m, "veteran");
    const g = gridFor(makeCtx(m, TIERS.veteran, newStats()), 0, probeModelOf(ROSTER[ROSTER_INDEX.rampart]));
    let bc = 0;
    for (let c = 1; c < g.metric.length; c++) if (g.metric[c] < g.metric[bc]) bc = c;
    expect(bc, "not inert: cell 0 is not the answer").toBeGreaterThan(0);
    const np = g.powers.length;
    expect(p.stats.reason).toBe("inertOnly");
    expect(p.choices).toEqual([{ w: ROSTER_INDEX.rampart, move: 0, angle: g.angles[Math.trunc(bc / np)], power: g.powers[bc % np], ev: 0, raw: 0 }]);
  });
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
