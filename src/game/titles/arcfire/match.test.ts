import { describe, it, expect } from "vitest";
import { createMatch, applyPick, applyTurn, type TurnCommand } from "./match";
import { cloneMatch, type MatchSettings, type MatchState } from "./state";
import { resolveTurn } from "./resolve";
import { hashMatch } from "./hash";
import { spansFromHeight } from "./terrain";
import { SPAWN_X, MOVES_PER_MATCH, SUDDEN_DEATH_WEAPON, WIND_MAX } from "./constants";
import type { Tag } from "./weapons/types";
import { ROSTER } from "./weapons/roster";

const SMALL: MatchSettings = { weaponsEach: 3, poolSize: 8, wind: false, guaranteeTags: [], rosterSize: 8 };

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
  it("rejects a rosterSize below poolSize, above the roster, or not an integer", () => {
    expect(() => createMatch(1, { ...SMALL, rosterSize: 7 })).toThrow(RangeError);
    expect(() => createMatch(1, { ...SMALL, rosterSize: ROSTER.length + 1 })).toThrow(RangeError);
    expect(() => createMatch(1, { ...SMALL, poolSize: 6, rosterSize: 7.5 })).toThrow(RangeError);
  });
  it("draws the pool from the roster prefix ROSTER[0, rosterSize)", () => {
    for (let seed = 0; seed < 20; seed++) {
      expect(createMatch(seed, { ...SMALL, poolSize: 6, rosterSize: 6 }).pool).toEqual([0, 1, 2, 3, 4, 5]);
    }
  });
  it("keeps a private, frozen copy of its settings", () => {
    const settings: { weaponsEach: number; poolSize: number; wind: boolean; guaranteeTags: Tag[]; rosterSize: number } = {
      weaponsEach: 3, poolSize: 8, wind: false, guaranteeTags: ["BLAST"], rosterSize: 8,
    };
    const m = createMatch(4, settings);
    settings.weaponsEach = 4;
    settings.wind = true;
    settings.guaranteeTags.push("SPLIT");
    settings.rosterSize = 9;
    expect(m.settings).toEqual({ weaponsEach: 3, poolSize: 8, wind: false, guaranteeTags: ["BLAST"], rosterSize: 8 });
    expect(Object.isFrozen(m.settings)).toBe(true);
    expect(Object.isFrozen(m.settings.guaranteeTags)).toBe(true);
  });
});

/** Paths where `b` shares a mutable object, array or typed-array buffer with `a`, walked in parallel. Frozen objects may be shared. */
function sharedMutable(a: unknown, b: unknown, path = "m", out: string[] = []): string[] {
  if (typeof a !== "object" || a === null || typeof b !== "object" || b === null) return out;
  if (a === b && !Object.isFrozen(a)) out.push(path);
  if (ArrayBuffer.isView(a)) {
    if (ArrayBuffer.isView(b) && a.buffer === b.buffer) out.push(`${path}.buffer`);
    return out;
  }
  const ra = a as Record<string, unknown>;
  const rb = b as Record<string, unknown>;
  for (const k of Object.keys(ra)) sharedMutable(ra[k], rb[k], `${path}.${k}`, out);
  return out;
}

describe("cloneMatch", () => {
  it("is a deep copy: playing on the clone leaves the original untouched", () => {
    const m = createMatch(3, SMALL);
    const c = cloneMatch(m);
    expect(c).toEqual(m);
    draftAll(c);
    // A moving, damaging shot: it changes the clone's scores, tankX, movesLeft and terrain.
    const tl = resolveTurn(c, { move: 1, weapon: SUDDEN_DEATH_WEAPON, angle: 90, power: 0 }); // falls back on the shooter
    expect(tl.move).not.toBeNull();
    expect(Array.from(c.scores)).not.toEqual(Array.from(m.scores));
    expect(Array.from(c.tankX)).not.toEqual(Array.from(m.tankX));
    expect(Array.from(c.movesLeft)).not.toEqual(Array.from(m.movesLeft));
    expect(Array.from(c.terrain.height)).not.toEqual(Array.from(m.terrain.height));
    expect(applyTurn(c, aim(c)).ok).toBe(true);
    c.rng.state ^= 1;
    expect(m).toEqual(createMatch(3, SMALL));
  });
  it("shares no mutable object with the original", () => {
    const m = createMatch(3, SMALL);
    draftAll(m);
    applyTurn(m, aim(m));
    expect(sharedMutable(cloneMatch(m), m)).toEqual([]);
    expect(sharedMutable({ ...m }, m)).toContain("m.tankX"); // the walk does catch a shallow copy
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
  it("keeps both hands ascending whatever order the pool is picked in", () => {
    const m = createMatch(3, SMALL);
    for (const i of [5, 0, 7, 2, 6, 1]) expect(applyPick(m, i).ok).toBe(true); // each player picks out of order
    expect(m.phase).toBe("battle");
    for (const hand of m.hands) expect(hand).toEqual([...hand].sort((a, b) => a - b));
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
    const withMove = (move: number): TurnCommand => ({ ...aim(m), move }) as TurnCommand;
    for (const bad of [
      { ...aim(m), w: notMine },
      { ...aim(m), angle: 181 },
      { ...aim(m), angle: 10.5 },
      { ...aim(m), power: 101 },
      { ...aim(m), power: -1 },
      { ...aim(m), power: NaN },
      withMove(2),
      withMove(0.5),
      withMove(-2),
    ]) expect(applyTurn(m, bad).ok).toBe(false);
    expect(m).toEqual(before);
    expect(applyPick(m, 0).ok).toBe(false); // no picking during the battle
  });
  it("rejects a move with no moves left", () => {
    const m = createMatch(5, SMALL);
    draftAll(m);
    m.movesLeft[m.shooter] = 0;
    const before = cloneMatch(m);
    expect(applyTurn(m, { ...aim(m), move: 1 }).ok).toBe(false);
    expect(m).toEqual(before);
  });
  it("accepts the edges of the angle and power ranges", () => {
    for (const edge of [{ power: 0 }, { angle: 0 }, { angle: 180 }]) {
      const m = createMatch(5, SMALL);
      draftAll(m);
      expect(applyTurn(m, { ...aim(m), ...edge }).ok).toBe(true);
    }
  });
  it("takes a fired weapon out of the hand, and it can't be fired again", () => {
    const m = createMatch(5, SMALL);
    draftAll(m);
    const p = m.shooter;
    const w = m.hands[p][m.hands[p].length - 1];
    expect(applyTurn(m, { ...aim(m), w }).ok).toBe(true);
    expect(m.hands[p]).not.toContain(w);
    expect(m.hands[p]).toEqual([...m.hands[p]].sort((a, b) => a - b));
    expect(applyTurn(m, aim(m)).ok).toBe(true); // the opponent's turn
    expect(m.shooter).toBe(p);
    const before = cloneMatch(m);
    expect(applyTurn(m, { ...aim(m), w }).ok).toBe(false);
    expect(m).toEqual(before);
  });
  it("refuses every command once the match is over", () => {
    const m = createMatch(5, SMALL);
    draftAll(m);
    for (let guard = 0; m.phase !== "over" && guard < 20; guard++) applyTurn(m, aim(m));
    expect(m.phase).toBe("over");
    const before = cloneMatch(m);
    for (const w of [SUDDEN_DEATH_WEAPON, ...m.pool]) {
      expect(applyTurn(m, { move: 0, w, angle: 45, power: 50 }).ok).toBe(false);
    }
    for (let i = 0; i < m.pool.length; i++) expect(applyPick(m, i).ok).toBe(false);
    expect(m).toEqual(before);
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
    expect(m.shooter).toBe(1 - m.firstPicker); // same opener as the battle
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

describe("a windless match", () => {
  // Regression pin: computed once from the current code. The golden covers a
  // windy match; this one covers the wind-off path (no wind RNG draws at all).
  it("plays a scripted game to a pinned hash", () => {
    const m = createMatch(99, { ...SMALL, wind: false });
    for (const i of [5, 0, 7, 2, 3, 6]) expect(applyPick(m, i).ok).toBe(true);
    for (let turn = 0; m.phase !== "over" && turn < 20; turn++) {
      const p = m.shooter;
      expect(m.wind).toBe(0);
      expect(applyTurn(m, {
        move: turn === 1 ? (p === 0 ? 1 : -1) : 0,
        w: m.phase === "suddenDeath" ? SUDDEN_DEATH_WEAPON : m.hands[p][0],
        angle: p === 0 ? 45 + turn * 3 : 135 - turn * 3,
        power: 60 + turn * 4,
      }).ok).toBe(true);
    }
    expect(m.phase).toBe("over");
    expect(Array.from(m.scores)).toEqual([36, 24]);
    expect(m.winner).toBe(0);
    expect(hashMatch(m)).toBe("1c8832e9");
  });
});
