import { describe, it, expect } from "vitest";
import { isqrt, clampInt, idiv } from "./imath";

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
