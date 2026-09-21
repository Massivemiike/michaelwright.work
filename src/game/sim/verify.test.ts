import { describe, it, expect } from "vitest";
import { verifyScore, MAX_VERIFY_COMMANDS, type VerifyInput } from "./verify";
import { circleTdTitle } from "@/game/titles/circle-td/title";
import { SIM_VERSION } from "@/game/sim/types";
import { runReplay, type Command } from "./replay";

const SEED = 20260918;
const baseOpts = { title: circleTdTitle, expectedSimVersion: SIM_VERSION, acceptableSeeds: [SEED] as number[] };
const input = (over: Partial<VerifyInput> = {}): VerifyInput => ({
  gameSlug: "circle-td", simVersion: SIM_VERSION, seed: SEED, mode: "daily",
  commands: [{ tick: 0, type: "place", tower: 0, tile: 10 }], ...over,
});

describe("verifyScore", () => {
  it("recomputes the authoritative result for a valid daily submission", () => {
    const r = verifyScore(input(), baseOpts);
    expect(r.ok).toBe(true);
    if (r.ok) {
      const direct = runReplay({ seed: SEED, simVersion: SIM_VERSION, mode: "daily", commands: input().commands }, circleTdTitle);
      expect(r.score).toBe(direct.score);
      expect(r.wave).toBe(direct.wave);
      expect(r.hash).toBe(direct.hash);
    }
  });
  it("rejects a simVersion mismatch without simulating", () => {
    expect(verifyScore(input({ simVersion: 999 }), baseOpts)).toEqual({ ok: false, reason: "sim_version_mismatch" });
  });
  it("rejects free mode as unranked", () => {
    expect(verifyScore(input({ mode: "free" }), baseOpts)).toEqual({ ok: false, reason: "wrong_mode" });
  });
  it("rejects a seed not in the acceptable set", () => {
    expect(verifyScore(input({ seed: 42 }), baseOpts)).toEqual({ ok: false, reason: "bad_seed" });
  });
  it("accepts a grace-window seed when present in acceptableSeeds", () => {
    const r = verifyScore(input({ seed: 42 }), { ...baseOpts, acceptableSeeds: [SEED, 42] });
    expect(r.ok).toBe(true);
  });
  it("rejects over-limit command counts before simulating", () => {
    const many: Command[] = Array.from({ length: MAX_VERIFY_COMMANDS + 1 }, () => ({ tick: 0, type: "start" }));
    expect(verifyScore(input({ commands: many }), baseOpts)).toEqual({ ok: false, reason: "too_many_commands" });
  });
  it("rejects a malformed command tick (non-integer / negative)", () => {
    expect(verifyScore(input({ commands: [{ tick: -1, type: "start" }] }), baseOpts)).toEqual({ ok: false, reason: "invalid_command_shape" });
    expect(verifyScore(input({ commands: [{ tick: 1.5, type: "start" }] }), baseOpts)).toEqual({ ok: false, reason: "invalid_command_shape" });
  });
});
