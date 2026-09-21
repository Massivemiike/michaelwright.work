import { describe, it, expect } from "vitest";
import { scoreSubmissionSchema } from "./score.schema";

const ok = {
  gameSlug: "circle-td", simVersion: 1, seed: 20260918, mode: "daily",
  initials: "ABC", commands: [{ tick: 0, type: "place", tower: 0, tile: 10 }],
};

describe("scoreSubmissionSchema", () => {
  it("accepts a well-formed submission", () => {
    expect(scoreSubmissionSchema.safeParse(ok).success).toBe(true);
  });
  it("rejects a wrong gameSlug", () => {
    expect(scoreSubmissionSchema.safeParse({ ...ok, gameSlug: "snake" }).success).toBe(false);
  });
  it("rejects initials that are not exactly 3 letters", () => {
    for (const initials of ["AB", "ABCD", "A1C", "A C", ""]) {
      expect(scoreSubmissionSchema.safeParse({ ...ok, initials }).success).toBe(false);
    }
  });
  it("accepts lowercase initials (route uppercases before blocklist + insert)", () => {
    expect(scoreSubmissionSchema.safeParse({ ...ok, initials: "abc" }).success).toBe(true);
  });
  it("rejects more than 20000 commands", () => {
    const commands = Array.from({ length: 20001 }, () => ({ tick: 0, type: "start" }));
    expect(scoreSubmissionSchema.safeParse({ ...ok, commands }).success).toBe(false);
  });
  it("rejects a non-integer seed and a bad command type", () => {
    expect(scoreSubmissionSchema.safeParse({ ...ok, seed: 1.5 }).success).toBe(false);
    expect(scoreSubmissionSchema.safeParse({ ...ok, commands: [{ tick: 0, type: "nuke" }] }).success).toBe(false);
  });
});
