import { describe, it, expect } from "vitest";
import { aimCos, aimSin } from "./aimTable";

describe("aimTable", () => {
  it("hits the exact special angles", () => {
    expect([aimCos(0), aimSin(0)]).toEqual([65536, 0]);
    expect([aimCos(90), aimSin(90)]).toEqual([0, 65536]);
    expect([aimCos(180), aimSin(180)]).toEqual([-65536, 0]);
    expect([aimCos(30), aimSin(30)]).toEqual([56756, 32768]);
    expect([aimCos(45), aimSin(45)]).toEqual([46341, 46341]);
    expect([aimCos(60), aimSin(60)]).toEqual([32768, 56756]);
  });
  it("is exactly mirror-symmetric about 90°", () => {
    for (let d = 0; d <= 180; d++) {
      expect(aimCos(180 - d)).toBe(-aimCos(d) || 0);
      expect(aimSin(180 - d)).toBe(aimSin(d));
    }
  });
  it("matches Math.cos/sin within 1 LSB at every integer degree", () => {
    for (let d = 0; d <= 180; d++) {
      const r = (d * Math.PI) / 180;
      expect(Math.abs(aimCos(d) - Math.round(Math.cos(r) * 65536))).toBeLessThanOrEqual(1);
      expect(Math.abs(aimSin(d) - Math.round(Math.sin(r) * 65536))).toBeLessThanOrEqual(1);
    }
  });
  it("clamps out-of-range angles", () => {
    expect(aimCos(-5)).toBe(aimCos(0));
    expect(aimSin(200)).toBe(aimSin(180));
  });
});
