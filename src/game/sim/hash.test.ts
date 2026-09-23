import { describe, it, expect } from "vitest";
import { FNV_OFFSET, fnvFold, fnvHex } from "./hash";

describe("FNV-1a primitives", () => {
  it("formats the offset basis as 8-char hex", () => {
    expect(fnvHex(FNV_OFFSET)).toBe("811c9dc5");
  });
  it("folds only the low 32 bits of each value", () => {
    expect(fnvFold(FNV_OFFSET, 4294967296 + 5)).toBe(fnvFold(FNV_OFFSET, 5));
    expect(fnvFold(FNV_OFFSET, -1)).toBe(fnvFold(FNV_OFFSET, 0xffffffff));
  });
  it("is order-sensitive and always returns an unsigned 32-bit value", () => {
    const ab = fnvFold(fnvFold(FNV_OFFSET, 1), 2);
    const ba = fnvFold(fnvFold(FNV_OFFSET, 2), 1);
    expect(ab).not.toBe(ba);
    expect(ab).toBeGreaterThanOrEqual(0);
    expect(ab).toBeLessThan(4294967296);
  });
  it("matches pinned vectors", () => {
    expect(fnvHex(fnvFold(FNV_OFFSET, 0))).toBe("4b95f515");
    expect(fnvHex(fnvFold(fnvFold(FNV_OFFSET, 1), -1))).toBe("ec9ef2e0");
  });
});
