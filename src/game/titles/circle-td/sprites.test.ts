import { describe, it, expect } from "vitest";
import { towerFrame, creepFrame } from "./sprites";
import { CREEP_AIR, CREEP_FAST, CREEP_HARD } from "@/game/titles/circle-td/state";

describe("towerFrame", () => {
  it("maps each tower type to its frame in TOWERS order", () => {
    expect(towerFrame(0)).toBe("tower-fast");
    expect(towerFrame(1)).toBe("tower-air");
    expect(towerFrame(2)).toBe("tower-slow");
    expect(towerFrame(3)).toBe("tower-splash");
    expect(towerFrame(4)).toBe("tower-damage");
  });
  it("falls back to the first frame for an out-of-range type", () => {
    expect(towerFrame(99)).toBe("tower-fast");
    expect(towerFrame(-1)).toBe("tower-fast");
  });
});

describe("creepFrame", () => {
  it("returns the plain frame when no modifier flags are set", () => {
    expect(creepFrame(0)).toBe("creep-normal");
  });
  it("maps each modifier to its frame", () => {
    expect(creepFrame(CREEP_FAST)).toBe("creep-fast");
    expect(creepFrame(CREEP_HARD)).toBe("creep-hard");
    expect(creepFrame(CREEP_AIR)).toBe("creep-air");
  });
  it("prioritizes Air > Hard > Fast for a multi-flag creep (one stable frame)", () => {
    expect(creepFrame(CREEP_AIR | CREEP_HARD | CREEP_FAST)).toBe("creep-air");
    expect(creepFrame(CREEP_HARD | CREEP_FAST)).toBe("creep-hard");
  });
});
