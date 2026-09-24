import { describe, it, expect } from "vitest";
import { isqrt, clampInt, idiv, floorPx, ceilDiv } from "./imath";

describe("imath", () => {
  it("isqrt is the exact integer floor", () => {
    for (let n = 0; n <= 20000; n++) {
      const r = isqrt(n);
      expect(r * r <= n && (r + 1) * (r + 1) > n).toBe(true);
    }
    expect(isqrt(-4)).toBe(0);
  });
  it("clampInt clamps to the inclusive range", () => {
    expect(clampInt(5, 0, 3)).toBe(3);
    expect(clampInt(-1, 0, 3)).toBe(0);
    expect(clampInt(2, 0, 3)).toBe(2);
  });
  it("idiv truncates toward zero", () => {
    expect(idiv(7, 2)).toBe(3);
    expect(idiv(-7, 2)).toBe(-3);
  });
});

describe("floorPx / ceilDiv", () => {
  it("floorPx is the pixel containing a Q16.16 coordinate (floor, not truncation toward zero)", () => {
    expect([0, 65535, 65536, -1, -65536, -65537].map(floorPx)).toEqual([0, 0, 1, -1, -1, -2]);
  });
  it("ceilDiv rounds a >= 0 up to a multiple of b >= 1", () => {
    expect(ceilDiv(0, 3)).toBe(0);
    expect(ceilDiv(6, 3)).toBe(2);
    expect(ceilDiv(7, 3)).toBe(3);
  });
});
