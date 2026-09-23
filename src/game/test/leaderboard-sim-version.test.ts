import { describe, it, expect } from "vitest";
import { SIM_VERSION } from "@/game/titles/circle-td/version";
import { LEADERBOARD_SIM_VERSION } from "@/lib/leaderboard/config";

describe("leaderboard sim version mirror", () => {
  it("LEADERBOARD_SIM_VERSION equals the sim's SIM_VERSION", () => {
    expect(LEADERBOARD_SIM_VERSION).toBe(SIM_VERSION);
  });
});
