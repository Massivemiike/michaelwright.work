import { describe, it, expect } from "vitest";
import { createMatch, applyPick, applyTurn, type TurnCommand } from "./match";
import { cloneMatch, type MatchSettings, type MatchState } from "./state";
import { spansFromHeight } from "./terrain";
import { SPAWN_X, MOVES_PER_MATCH, SUDDEN_DEATH_WEAPON, WIND_MAX } from "./constants";

const SMALL: MatchSettings = { weaponsEach: 3, poolSize: 8, wind: false, guaranteeTags: [] };

function draftAll(m: MatchState): void {
  while (m.phase === "draft") expect(applyPick(m, m.poolOwner.findIndex((o) => o === -1)).ok).toBe(true);
}

/** A legal shot for whoever's turn it is: first weapon in hand (Pulse in sudden death), aimed at the other side. */
function aim(m: MatchState): TurnCommand {
  const p = m.shooter;
  const w = m.phase === "suddenDeath" ? SUDDEN_DEATH_WEAPON : m.hands[p][0];
  return { move: 0, w, angle: p === 0 ? 45 : 135, power: 60 };
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

describe("turns", () => {
  it("plays a full match to a result", () => {
    const m = createMatch(5, SMALL);
    draftAll(m);
    let guard = 0;
    while (m.phase !== "over" && guard++ < 20) expect(applyTurn(m, aim(m)).ok).toBe(true);
    expect(m.phase).toBe("over");
    expect(m.hands[0].length + m.hands[1].length).toBe(0);
    expect([0, 1, 2]).toContain(m.winner);
    if (m.winner === 2) expect(m.scores[0]).toBe(m.scores[1]);
    else expect(m.scores[m.winner]).toBeGreaterThan(m.scores[1 - m.winner]);
  });
  it("alternates shooters", () => {
    const m = createMatch(5, SMALL);
    draftAll(m);
    const s0 = m.shooter;
    applyTurn(m, aim(m));
    expect(m.shooter).toBe(1 - s0);
  });
  it("rejects illegal turns without changing anything", () => {
    const m = createMatch(5, SMALL);
    expect(applyTurn(m, { move: 0, w: 0, angle: 45, power: 50 }).ok).toBe(false); // still drafting
    draftAll(m);
    const before = cloneMatch(m);
    const notMine = m.hands[1 - m.shooter][0];
    for (const bad of [
      { ...aim(m), w: notMine },
      { ...aim(m), angle: 181 },
      { ...aim(m), angle: 10.5 },
      { ...aim(m), power: 101 },
      { ...aim(m), power: -1 },
    ]) expect(applyTurn(m, bad).ok).toBe(false);
    expect(m).toEqual(before);
    expect(applyPick(m, 0).ok).toBe(false); // no picking during the battle
  });
  it("rejects a move with no moves left", () => {
    const m = createMatch(5, SMALL);
    draftAll(m);
    m.movesLeft[m.shooter] = 0;
    expect(applyTurn(m, { ...aim(m), move: 1 }).ok).toBe(false);
  });
  it("goes to sudden death on a tie, where only Pulse is allowed, then can end in a draw", () => {
    const m = createMatch(5, SMALL);
    draftAll(m);
    m.terrain.height.fill(450); // low flat ground so edge-bound shots fly clean off the world
    spansFromHeight(m.terrain);
    const away = (): TurnCommand => ({
      move: 0,
      w: m.phase === "suddenDeath" ? SUDDEN_DEATH_WEAPON : m.hands[m.shooter][0],
      angle: m.shooter === 0 ? 180 : 0,
      power: 100,
    });
    for (let i = 0; i < 6; i++) expect(applyTurn(m, away()).ok).toBe(true);
    expect(m.phase).toBe("suddenDeath");
    expect(applyTurn(m, { ...away(), w: 1 }).ok).toBe(false);
    expect(applyTurn(m, away()).ok).toBe(true);
    expect(applyTurn(m, away()).ok).toBe(true);
    expect(m.phase).toBe("over");
    expect(m.winner).toBe(2);
  });
  it("draws wind only when it's enabled", () => {
    const calm = createMatch(11, SMALL);
    draftAll(calm);
    expect(calm.wind).toBe(0);
    const windy = createMatch(11, { ...SMALL, wind: true });
    draftAll(windy);
    for (let i = 0; i < 6 && windy.phase !== "over"; i++) {
      expect(Math.abs(windy.wind)).toBeLessThanOrEqual(WIND_MAX);
      applyTurn(windy, aim(windy));
    }
  });
});
