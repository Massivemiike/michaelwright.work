// src/game/sim/math/trig.test.ts
import { describe, it, expect } from "vitest";
import { ANGLE_STEPS, sinFx, cosFx } from "./trig";
import { fromInt, toFloat } from "./fixed";

describe("trig LUT", () => {
  it("sin(0) = 0, cos(0) = 1", () => {
    expect(sinFx(0)).toBe(0);
    expect(cosFx(0)).toBe(fromInt(1));
  });
  it("sin(quarter turn) ≈ 1", () => {
    expect(Math.abs(toFloat(sinFx(ANGLE_STEPS / 4)) - 1)).toBeLessThan(0.001);
  });
  it("wraps the index", () => {
    expect(sinFx(ANGLE_STEPS + 10)).toBe(sinFx(10));
    expect(sinFx(-1)).toBe(sinFx(ANGLE_STEPS - 1));
  });
});
