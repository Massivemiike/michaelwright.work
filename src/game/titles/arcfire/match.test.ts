import { describe, it, expect } from "vitest";
import { createMatch, applyPick } from "./match";
import { cloneMatch, type MatchSettings, type MatchState } from "./state";
import { SPAWN_X, MOVES_PER_MATCH } from "./constants";

const SMALL: MatchSettings = { weaponsEach: 3, poolSize: 8, wind: false, guaranteeTags: [] };

function draftAll(m: MatchState): void {
  while (m.phase === "draft") expect(applyPick(m, m.poolOwner.findIndex((o) => o === -1)).ok).toBe(true);
}

describe("createMatch", () => {
  it("starts in the draft with both tanks spawned and the pool drawn", () => {
    const m = createMatch(42, SMALL);
    expect(m.phase).toBe("draft");
    expect(Array.from(m.tankX)).toEqual([...SPAWN_X]);
    expect(Array.from(m.movesLeft)).toEqual([MOVES_PER_MATCH, MOVES_PER_MATCH]);
    expect(m.pool.length).toBe(8);
    expect(Array.from(m.poolOwner).every((o) => o === -1)).toBe(true);
    expect([0, 1]).toContain(m.firstPicker);
    expect(m.shooter).toBe(1 - m.firstPicker);
  });
  it("is deterministic per seed", () => {
    const a = createMatch(7, SMALL);
    const b = createMatch(7, SMALL);
    expect(Array.from(a.terrain.height)).toEqual(Array.from(b.terrain.height));
    expect(a.pool).toEqual(b.pool);
    expect(a.firstPicker).toBe(b.firstPicker);
  });
  it("rejects a pool too small to finish the draft", () => {
    expect(() => createMatch(1, { ...SMALL, poolSize: 5 })).toThrow(RangeError);
  });
});

describe("cloneMatch", () => {
  it("is a deep copy: mutating the clone leaves the original untouched", () => {
    const m = createMatch(3, SMALL);
    const c = cloneMatch(m);
    expect(c).toEqual(m);
    applyPick(c, 0);
    c.terrain.height[10]++;
    c.rng.state ^= 1;
    const fresh = createMatch(3, SMALL);
    expect(m).toEqual(fresh);
  });
});

describe("the draft", () => {
  it("alternates from the first picker, then opens the battle with the other player", () => {
    const m = createMatch(3, SMALL);
    const first = m.firstPicker;
    applyPick(m, 0);
    applyPick(m, 1);
    expect(m.poolOwner[0]).toBe(first);
    expect(m.poolOwner[1]).toBe(1 - first);
    draftAll(m);
    expect(m.phase).toBe("battle");
    expect(m.hands[0].length).toBe(3);
    expect(m.hands[1].length).toBe(3);
    expect(m.shooter).toBe(1 - first);
  });
  it("rejects taken, out-of-range and non-integer picks", () => {
    const m = createMatch(3, SMALL);
    applyPick(m, 2);
    expect(applyPick(m, 2).ok).toBe(false);
    expect(applyPick(m, 8).ok).toBe(false);
    expect(applyPick(m, -1).ok).toBe(false);
    expect(applyPick(m, 1.5).ok).toBe(false);
  });
});
