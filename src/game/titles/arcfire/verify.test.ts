// src/game/titles/arcfire/verify.test.ts — the verifier's cheap paths (the golden paths run bundled in ai.corpus.test.ts)
import { describe, it, expect } from "vitest";
import { isArcfireCommand, scoreVsAi, DAILY_TIER } from "./verify";

describe("scoreVsAi", () => {
  it("checks the command shape", () => {
    expect([{ k: "pick", w: 3 }, { k: "turn", move: -1, w: 0, angle: 0, power: 100 }].map(isArcfireCommand)).toEqual([true, true]);
    expect([null, 3, "x", { k: "pick" }, { k: "pick", w: 1.5 }, { k: "turn", move: 2, w: 0, angle: 45, power: 50 }, { k: "turn", move: 0, w: 0, angle: "45", power: 50 }, { k: "boom" }]
      .map(isArcfireCommand)).toEqual([false, false, false, false, false, false, false, false]);
  });
  it("rejects cheapest first, before any AI work", () => {
    expect(scoreVsAi(1, "nope")).toEqual({ rejected: "invalid_command_shape" });
    expect(scoreVsAi(1, new Array(22).fill(null))).toEqual({ rejected: "too_long" });
    expect(scoreVsAi(1, [{ k: "pick", w: 0 }, 7])).toEqual({ rejected: "invalid_command_shape" });
    expect(scoreVsAi(1, [])).toEqual({ rejected: "not_a_win" });
    expect(DAILY_TIER).toBe("veteran");
  });
});
