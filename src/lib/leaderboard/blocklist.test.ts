import { describe, it, expect } from "vitest";
import { isBlockedInitials } from "./blocklist";

describe("isBlockedInitials", () => {
  it("blocks a known offensive trigram case-insensitively", () => {
    expect(isBlockedInitials("ass")).toBe(true);
    expect(isBlockedInitials("ASS")).toBe(true);
  });
  it("allows ordinary initials", () => {
    expect(isBlockedInitials("ABC")).toBe(false);
    expect(isBlockedInitials("MRW")).toBe(false);
  });
});
