import { describe, it, expect } from "vitest";
import { createMatch, applyPick } from "./match";
import { hashMatch } from "./hash";
import { cloneMatch, type MatchSettings, type MatchState } from "./state";

const SMALL: MatchSettings = { weaponsEach: 3, poolSize: 8, wind: false, guaranteeTags: [], rosterSize: 8 };

describe("hashMatch", () => {
  it("is an 8-char hex digest that's stable for equal states", () => {
    const a = createMatch(1, SMALL);
    expect(hashMatch(a)).toMatch(/^[0-9a-f]{8}$/);
    expect(hashMatch(cloneMatch(a))).toBe(hashMatch(a));
    expect(hashMatch(createMatch(1, SMALL))).toBe(hashMatch(a));
  });
  it("changes when any part of the state changes", () => {
    const base = createMatch(1, SMALL);
    const h = hashMatch(base);
    const after = (f: (m: MatchState) => void): string => {
      const m = cloneMatch(base);
      f(m);
      return hashMatch(m);
    };
    expect(after((m) => { m.terrain.height[600]++; })).not.toBe(h);
    expect(after((m) => { m.tankX[1]--; })).not.toBe(h);
    expect(after((m) => { m.scores[0] = 1; })).not.toBe(h);
    expect(after((m) => { applyPick(m, 0); })).not.toBe(h);
    expect(after((m) => { m.rng.state ^= 1; })).not.toBe(h);
  });
});
