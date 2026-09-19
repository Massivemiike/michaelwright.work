// src/game/runtime/hud/format.test.ts
//
// Node-env tests for the pure HUD formatters — no DOM needed.
import { describe, it, expect } from "vitest";
import { TARGET_AIR, TARGET_BOTH, TARGET_LAND } from "@/game/titles/circle-td/content";
import {
  formatInt,
  formatGold,
  formatScore,
  formatWave,
  formatCreeps,
  formatCost,
  formatDamage,
  formatRange,
  formatRefund,
  formatTargets,
} from "./format";

describe("formatInt", () => {
  it("locale-formats with thousands separators", () => {
    expect(formatInt(1234)).toBe("1,234");
    expect(formatInt(0)).toBe("0");
  });

  it("rounds a stray float to the nearest integer", () => {
    expect(formatInt(41.9999999)).toBe("42");
  });
});

describe("formatGold / formatScore", () => {
  it("formats a normal value", () => {
    expect(formatGold(125)).toBe("125");
    expect(formatScore(1960)).toBe("1,960");
  });

  it("clamps a negative value to 0 rather than printing a minus sign", () => {
    expect(formatGold(-5)).toBe("0");
    expect(formatScore(-1)).toBe("0");
  });
});

describe("formatWave", () => {
  it("prints an em dash for the pre-round state (wave 0)", () => {
    expect(formatWave(0)).toBe("—");
  });

  it("prints the wave number once the run has started", () => {
    expect(formatWave(1)).toBe("1");
    expect(formatWave(36)).toBe("36");
  });
});

describe("formatCreeps", () => {
  it("joins count and cap with a slash", () => {
    expect(formatCreeps(3, 100)).toBe("3/100");
    expect(formatCreeps(0, 100)).toBe("0/100");
  });
});

describe("formatCost / formatDamage / formatRange", () => {
  it("format plain integers", () => {
    expect(formatCost(260)).toBe("260");
    expect(formatDamage(2293)).toBe("2,293");
    expect(formatRange(213)).toBe("213");
  });
});

describe("formatRefund", () => {
  it("prefixes with a plus sign", () => {
    expect(formatRefund(42)).toBe("+42");
    expect(formatRefund(0)).toBe("+0");
  });
});

describe("formatTargets", () => {
  it("labels each of the three bitmask values TOWERS actually uses", () => {
    expect(formatTargets(TARGET_LAND)).toBe("Land");
    expect(formatTargets(TARGET_AIR)).toBe("Air");
    expect(formatTargets(TARGET_BOTH)).toBe("Land/Air");
  });

  it("falls back to an em dash for an out-of-set value", () => {
    expect(formatTargets(0)).toBe("—");
  });
});
