// src/game/titles/arcfire/weapons/primitives.test.ts
//
// The weapon primitives, fired through resolveTurn / resolveWeapon on small
// hand-built boards. Exact coordinates are pinned: they are what the plan's
// verbatim code produces, so a changed constant or operator anywhere in the
// sim shows up here as well as in the corpus.
import { describe, it, expect } from "vitest";
import { fromInt } from "@/game/sim/math/fixed";
import { resolveTurn, resolveTurnPoints, resolveWeapon, type TurnInput } from "../resolve";
import { cloneMatch, type MatchState } from "../state";
import { createMatch } from "../match";
import { hashMatch } from "../hash";
import { isSolid } from "../terrain";
import { ROSTER, ROSTER_INDEX } from "./roster";
import { MAX_TURN_STEPS, WORLD_H, TANK_HIT_DY } from "../constants";
import { CORPUS_SEED, CORPUS_SETTINGS } from "@/game/test/arcfire/corpus";
import { flatBattle, setHeights } from "@/game/test/arcfire/fixtures";
import type { Timeline, TimelineEvent } from "../timeline";
import type { Stage, WeaponDef } from "./types";

/** Fire roster weapon `id` for the current shooter, without moving. */
const fire = (m: MatchState, id: string, angle: number, power: number): Timeline =>
  resolveTurn(m, { move: 0, weapon: ROSTER_INDEX[id], angle, power });

/** A synthetic weapon, fired through resolveWeapon (the input's `weapon` is only recorded). */
const synth = (stage: Stage | undefined, launch: WeaponDef["launch"] = { kind: "shell" }): WeaponDef =>
  ({ id: "synthetic", name: "Synthetic", tag: "SPECIAL", tier: 1, power: 1, launch, stage });
const fireDef = (m: MatchState, def: WeaponDef, angle: number, power: number): Timeline =>
  resolveWeapon(m, def, { move: 0, weapon: 0, angle, power });

/** The events of one kind, typed. */
function eventsOf<K extends TimelineEvent["kind"]>(tl: Timeline, kind: K): Extract<TimelineEvent, { kind: K }>[] {
  return tl.events.filter((e): e is Extract<TimelineEvent, { kind: K }> => e.kind === kind);
}

describe("every roster weapon", () => {
  it("emits events sorted by step, each naming a valid shell", () => {
    for (let w = 0; w < ROSTER.length; w++) {
      for (const [angle, power] of [[45, 60], [60, 50], [0, 100], [180, 100], [90, 0]]) {
        const tl = resolveTurn(flatBattle(), { move: 0, weapon: w, angle, power });
        for (let i = 1; i < tl.events.length; i++) expect(tl.events[i].step).toBeGreaterThanOrEqual(tl.events[i - 1].step);
        for (const e of tl.events) {
          if ("shell" in e) expect(e.shell >= 0 && e.shell < tl.shells.length, `${ROSTER[w].id} ${e.kind}`).toBe(true);
        }
      }
    }
  });
});

describe("shell paths", () => {
  it("muzzle shells have parent -1 and start 0, and each path ends on its terminal step", () => {
    const tl = fire(flatBattle(), "fan", 45, 60);
    expect(tl.shells.map((s) => [s.parent, s.start])).toEqual([[-1, 0], [-1, 0], [-1, 0], [-1, 0], [-1, 0]]);
    for (const e of eventsOf(tl, "blast")) {
      const p = tl.shells[e.shell];
      expect(p.points.length / 2 - 1).toBe(e.step - p.start); // point k is at step start + k
      expect(p.points.slice(-2)).toEqual([e.x, e.y]);
    }
    expect(tl.steps).toBe(Math.max(...tl.events.map((e) => e.step)));
  });
});

/** The sweep boards: the corpus hills (player 0 in wind 0, +40 and -40; player 1 in wind 0) and flatBattle(). */
function sweepBoards(): MatchState[] {
  const hills = (shooter: number, wind: number): MatchState => {
    const m = createMatch(CORPUS_SEED, CORPUS_SETTINGS);
    m.phase = "battle";
    m.shooter = shooter;
    m.wind = wind;
    return m;
  };
  return [hills(0, 0), hills(0, 40), hills(0, -40), hills(1, 0), flatBattle()];
}

const AIMS: [number, number][] = [
  [0, 100], [15, 70], [35, 70], [45, 60], [50, 80], [65, 95], [90, 0], [90, 100], [115, 70], [135, 60], [165, 70], [180, 100],
];

describe("the quiet path", () => {
  it("resolveTurnPoints leaves the same state and points as resolveTurn, and no weapon draws from the RNG", () => {
    for (const base of sweepBoards()) {
      for (let w = 0; w < ROSTER.length; w++) {
        for (const [angle, power] of AIMS) {
          const input: TurnInput = { move: 0, weapon: w, angle, power };
          const loud = cloneMatch(base);
          const quiet = cloneMatch(base);
          const tl = resolveTurn(loud, input);
          expect(resolveTurnPoints(quiet, input)).toEqual(tl.points);
          expect(hashMatch(quiet)).toBe(hashMatch(loud));
          expect(loud.rng.state).toBe(base.rng.state);
          expect(quiet.rng.state).toBe(base.rng.state);
        }
      }
    }
  });
  it("records no paths, events or falls when record is false", () => {
    const tl = resolveWeapon(flatBattle(), ROSTER[ROSTER_INDEX.fan], { move: 0, weapon: ROSTER_INDEX.fan, angle: 45, power: 60 }, false);
    expect(tl.shells).toEqual([]);
    expect(tl.events).toEqual([]);
    expect(tl.settle.falls).toEqual([]);
    expect(tl.steps).toBeGreaterThan(0);
  });
});
