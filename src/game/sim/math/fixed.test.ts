// src/game/sim/math/fixed.test.ts
import { describe, it, expect } from "vitest";
import { SCALE, fromInt, fromFloat, toInt, toFloat, mul, div, sqrt, clamp } from "./fixed";

describe("fixed-point Q16.16", () => {
  it("round-trips integers", () => {
    expect(fromInt(5)).toBe(5 * SCALE);
    expect(toInt(fromInt(5))).toBe(5);
    expect(toInt(fromInt(-3))).toBe(-3);
  });
  it("converts back to a float", () => {
    expect(toFloat(fromInt(5))).toBe(5);
  });
  it("multiplies deterministically", () => {
    // 2.5 * 4 = 10
    expect(mul(fromFloat(2.5), fromInt(4))).toBe(fromInt(10));
  });
  it("divides deterministically", () => {
    // 10 / 4 = 2.5
    expect(div(fromInt(10), fromInt(4))).toBe(fromFloat(2.5));
  });
  it("computes integer square root in fixed-point", () => {
    // sqrt(16) = 4
    expect(toInt(sqrt(fromInt(16)))).toBe(4);
    // sqrt(2) ≈ 1.414; within 1 fixed unit
    expect(Math.abs(sqrt(fromInt(2)) - fromFloat(1.41421356))).toBeLessThan(2);
  });
  it("clamps", () => {
    expect(clamp(fromInt(5), fromInt(0), fromInt(3))).toBe(fromInt(3));
    expect(clamp(fromInt(-1), fromInt(0), fromInt(3))).toBe(fromInt(0));
  });
});
