// src/game/titles/arcfire/copyInto.test.ts — Plan 2B T1: copyMatchInto, and no -0 shell angle (both pin-neutral)
import { describe, it, expect } from "vitest";
import { createMatch } from "./match";
import { STANDARD_SETTINGS, cloneMatch, copyMatchInto, type MatchState } from "./state";
import { hashMatch } from "./hash";
import { resolveTurn, resolveTurnPoints } from "./resolve";
import { ROSTER } from "./weapons/roster";
import { fanOffset } from "./weapons/primitives";
import { runCorpus } from "@/game/test/arcfire/corpus";
import { corpusState, flatBattle } from "@/game/test/arcfire/fixtures";

function sweepBoards(): MatchState[] {
  const hills = (shooter: number, wind: number): MatchState => {
    const m = corpusState(20260922, 0);
    m.shooter = shooter;
    m.wind = wind;
    return m;
  };
  return [hills(0, 0), hills(0, 40), hills(1, -40), corpusState(23, 9), flatBattle()];
}

/** Each column's live spans: [count, top0, bottom0, ...]. */
function liveSpans(m: MatchState): number[] {
  const out: number[] = [];
  for (let x = 0; x < 1200; x++) {
    const n = m.terrain.spanCount[x];
    out.push(n);
    for (let i = 0; i < 2 * n; i++) out.push(m.terrain.spans[x * 16 + i]);
  }
  return out;
}

describe("copyMatchInto", () => {
  it("copies every field, shares no array, and resolves exactly like a clone", () => {
    const states = [createMatch(5, STANDARD_SETTINGS), corpusState(11, 0), corpusState(23, 9), corpusState(37, 20)];
    const other = createMatch(99, { ...STANDARD_SETTINGS, poolSize: 22 }); // another pool length: poolOwner is reallocated
    for (const s of states) {
      copyMatchInto(other, s);
      expect(hashMatch(other)).toBe(hashMatch(s));
      for (const k of Object.keys(s) as (keyof MatchState)[]) { // every field by value: a new field fails until it is copied
        if (k !== "terrain") expect(other[k], k).toEqual(s[k]);
      }
      expect(other.terrain.height).toEqual(s.terrain.height); // the spans are scratch until the next resolve
      expect([other.pool, other.hands, Array.from(other.poolOwner), Array.from(other.scores)]).toEqual([s.pool, s.hands, Array.from(s.poolOwner), Array.from(s.scores)]);
      other.hands[0].push(99);
      other.scores[0] += 1;
      other.terrain.height[0] += 1;
      expect(hashMatch(other)).not.toBe(hashMatch(s)); // nothing shared with the source
    }
    const AIMS: [number, number][] = [[0, 100], [35, 70], [45, 60], [65, 95], [90, 100], [115, 70], [135, 60], [180, 100]];
    const scratch = cloneMatch(states[0]);
    for (const b of sweepBoards()) {
      for (let w = 0; w < ROSTER.length; w++) {
        for (const [angle, power] of AIMS) {
          const input = { move: 0 as const, weapon: w, angle, power };
          const loud = cloneMatch(b);
          const tl = resolveTurn(loud, input);
          copyMatchInto(scratch, b);
          expect(resolveTurnPoints(scratch, input)).toEqual(tl.points);
          expect(hashMatch(scratch)).toBe(hashMatch(loud));
          expect(liveSpans(scratch)).toEqual(liveSpans(loud)); // the slots past spanCount are scratch
        }
      }
    }
  }, 120_000);
});

describe("Timeline shell angles", () => {
  it("never records a -0 shell angle", () => {
    for (let i = 0; i < 6; i++) expect(Object.is(fanOffset(i, 6, 0), -0)).toBe(false);
    let angles = 0;
    runCorpus((_c, tl) => {
      for (const s of tl.shells) {
        angles++;
        expect(Object.is(s.angle, -0)).toBe(false);
      }
    });
    expect(angles).toBeGreaterThan(900);
  }, 60_000);
});
