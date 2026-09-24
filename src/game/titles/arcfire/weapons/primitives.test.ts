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

describe("delay", () => {
  it("Twin Nova blasts twice at one point, 30 steps apart, announced by a fuse", () => {
    const tl = fire(flatBattle(), "twinnova", 60, 50);
    expect(eventsOf(tl, "blast").map((b) => [b.step, b.x, b.y, b.radius])).toEqual([[124, 663, 400, 50], [154, 663, 400, 70]]);
    expect(eventsOf(tl, "fuse")).toEqual([{ step: 124, kind: "fuse", shell: 0, x: 663, y: 400, at: 154 }]);
    expect(tl.steps).toBe(154);
    expect(tl.points).toEqual([65, 0]);
  });
  it("a delay past the turn backstop is dropped: one blast, and a fuse whose `at` is beyond tl.steps", () => {
    const B = { radius: 28, damage: 40 };
    const tl = fireDef(flatBattle(), synth({ on: "impact", effects: [{ blast: B }, { delay: { steps: 5000, then: [{ blast: B }] } }] }), 60, 50);
    expect(eventsOf(tl, "blast").length).toBe(1);
    expect(tl.steps).toBe(MAX_TURN_STEPS);
    const fuses = eventsOf(tl, "fuse");
    expect(fuses.length).toBe(1);
    expect(fuses[0].at).toBeGreaterThan(tl.steps);
  });
});

describe("split", () => {
  it("Cascade: 13 shells over three generations, each fanned about straight up", () => {
    const tl = fire(flatBattle(), "cascade", 60, 50);
    expect(tl.shells.length).toBe(13);
    const splits = eventsOf(tl, "split");
    expect(splits.map((s) => [s.step, s.children.length])).toEqual([[124, 3], [156, 3], [173, 3], [186, 3]]);
    expect(eventsOf(tl, "blast").length).toBe(13);
    const first = splits[0];
    expect(first.shell).toBe(0);
    first.children.forEach((c, k) => {
      const p = tl.shells[c];
      expect([p.angle, p.parent, p.start]).toEqual([[-25, 0, 25][k], 0, first.step]);
      expect(p.points[3]).toBeLessThan(p.points[1]); // its first step moves up
    });
    expect(tl.points).toEqual([35, 0]);
  });
  it("Hydra splits at its apex, where the parent stopped, into 5 heavies about its heading", () => {
    const tl = fire(flatBattle(), "hydra", 45, 60);
    const splits = eventsOf(tl, "split");
    expect(splits.length).toBe(1);
    const sp = splits[0];
    expect([sp.step, sp.x, sp.y]).toEqual([59, 595, 235]);
    const parent = tl.shells[0].points;
    expect(parent.length / 2).toBe(sp.step); // no point for the apex step: it did not move
    expect(parent.slice(-2)).toEqual([sp.x, sp.y]);
    expect(sp.children.map((c) => tl.shells[c].angle)).toEqual([-20, -10, 0, 10, 20]);
  });
  it("Hydra fired level never apexes: its early effect is one child's blast", () => {
    const tl = fire(flatBattle(), "hydra", 0, 60);
    expect(eventsOf(tl, "split")).toEqual([]);
    expect(eventsOf(tl, "blast").map((b) => b.radius)).toEqual([26]);
  });
  it("an apex weapon that hits something before its apex uses `early`, or is a dud without it", () => {
    const wall = (): MatchState => setHeights(flatBattle(), (x) => (x >= 400 && x < 420 ? 100 : 400));
    const tl = fire(wall(), "barrage", 45, 90);
    expect(eventsOf(tl, "split")).toEqual([]);
    expect(eventsOf(tl, "blast").map((b) => b.radius)).toEqual([20]);
    const bare = synth({ on: "apex", effects: [{ split: { count: 2, spreadDeg: 10, speedPct: 100, from: "ahead",
      child: { on: "impact", effects: [{ blast: { radius: 20, damage: 18 } }] } } }] });
    const dud = fireDef(wall(), bare, 45, 90);
    expect(eventsOf(dud, "dud").length).toBe(1);
    expect(eventsOf(dud, "blast")).toEqual([]);
  });
  it("Barrage drops a line of 6 at its apex, 30 px apart, that lands exactly 30 px apart", () => {
    const tl = fire(flatBattle(300, 1000), "barrage", 45, 60);
    const sp = eventsOf(tl, "split")[0];
    expect(sp.children.map((c) => tl.shells[c].points[0])).toEqual([520, 550, 580, 610, 640, 670]);
    expect(eventsOf(tl, "blast").map((b) => b.x).sort((a, b) => a - b)).toEqual([818, 848, 878, 908, 938, 968]);
  });
  it("a line child spawned inside a hill impacts at its first sample, one step later", () => {
    const m = setHeights(flatBattle(300, 1000), (x) => (x >= 630 && x < 700 ? 200 : 400));
    const tl = fire(m, "barrage", 45, 60);
    const sp = eventsOf(tl, "split")[0];
    expect([sp.step, sp.x, sp.y]).toEqual([59, 595, 235]); // the split is unchanged
    for (const [shell, spawnX, hitX] of [[5, 640, 641], [6, 670, 671]]) {
      expect(tl.shells[shell].points).toEqual([spawnX, 235, hitX, 235]);
      expect(tl.events).toContainEqual({ step: 60, kind: "blast", shell, x: hitX, y: 235, radius: 20, lag: 0 });
    }
  });
  it("Hailstorm bursts 9 shells downward at its apex, carried by the parent's motion", () => {
    const tl = fire(flatBattle(300, 1000), "hailstorm", 45, 60);
    const sp = eventsOf(tl, "split")[0];
    expect([sp.x, sp.y, sp.children.length]).toEqual([595, 235, 9]);
    for (const c of sp.children) expect(tl.shells[c].points[3]).toBeGreaterThan(tl.shells[c].points[1]); // first step moves down
    const xs = eventsOf(tl, "blast").map((b) => b.x);
    expect([Math.min(...xs), Math.max(...xs)]).toEqual([737, 795]);
  });
  it("Shrapnel fans 6 fragments at -80, -48, -16, 16, 48 and 80 degrees off straight up", () => {
    const tl = fire(flatBattle(), "shrapnel", 60, 50);
    const sp = eventsOf(tl, "split")[0];
    expect(sp.children.map((c) => tl.shells[c].angle)).toEqual([-80, -48, -16, 16, 48, 80]);
  });
  it("a child spawned inside a hitbox ignores that tank until it leaves it; a rear child can still fly into the shooter (O5)", () => {
    const tl = fire(flatBattle(300, 400), "barrage", 3, 60);
    const sp = eventsOf(tl, "split")[0];
    expect(sp.step).toBe(5);
    const insideOf = (c: number): number => [300, 400].findIndex((tx) => {
      const dx = tl.shells[c].points[0] - tx;
      const dy = tl.shells[c].points[1] - 388; // both hitbox centres are at y = 400 - TANK_HIT_DY
      return dx * dx + dy * dy <= 14 * 14;
    });
    const inside = sp.children.filter((c) => insideOf(c) >= 0);
    expect(inside.map(insideOf)).toEqual([0, 1]); // one child spawned inside each hitbox ...
    const endStep = (c: number): number => tl.shells[c].start + tl.shells[c].points.length / 2 - 1;
    expect(inside.map(endStep)).toEqual([18, 22]); // ... and neither ended on its first sample
    expect(tl.shells[sp.children[0]].points[0]).toBe(273); // the rear child spawned outside the shooter's hitbox ...
    expect(tl.points[1]).toBe(18); // ... and flew into it: 18 self-damage, scored for the opponent
  });
});

describe("bounce", () => {
  it("Pinball bounces exactly 6 times, then blasts", () => {
    const tl = fire(flatBattle(300, 1100), "pinball", 45, 40);
    const bounces = eventsOf(tl, "bounce");
    expect(bounces.map((b) => b.x)).toEqual([586, 775, 894, 971, 1019, 1048]);
    for (let i = 1; i < bounces.length; i++) expect(bounces[i].step).toBeGreaterThan(bounces[i - 1].step);
    expect(bounces.every((b) => !b.wall)).toBe(true);
    expect(eventsOf(tl, "blast").map((b) => [b.step, b.x, b.y, b.radius])).toEqual([[354, 1067, 400, 36]]);
  });
  it("Skipper blasts at each of its 3 bounces in the same step, then blasts where it lands", () => {
    const tl = fire(flatBattle(300, 1100), "skipper", 45, 40);
    const bounces = eventsOf(tl, "bounce");
    expect(bounces.map((b) => b.x)).toEqual([586, 675, 701]);
    const blasts = eventsOf(tl, "blast");
    expect(blasts.slice(0, 3).map((b) => [b.step, b.x, b.y, b.radius])).toEqual(bounces.map((b) => [b.step, b.x, b.y, 22]));
    expect(blasts.slice(3).map((b) => [b.x, b.y, b.radius])).toEqual([[699, 422, 26]]);
  });
  it("Ricochet reflects off the left wall back into the world; Pulse at the same aim is lost", () => {
    const tl = fire(flatBattle(100, 700), "ricochet", 150, 70);
    const bounces = eventsOf(tl, "bounce");
    expect(bounces.map((b) => [b.step, b.x, b.wall])).toEqual([[12, 0, true]]);
    expect(eventsOf(tl, "blast").map((b) => [b.step, b.x, b.y])).toEqual([[101, 609, 400]]);
    const pulse = fire(flatBattle(100, 700), "pulse", 150, 70);
    expect(pulse.events.map((e) => e.kind)).toEqual(["out"]);
  });
});

describe("roll", () => {
  /** Tanks at 200 / 900; the ground falls from 300 to 420 over x 300..539 (1 px every 2 columns). */
  const slope = (): MatchState =>
    setHeights(flatBattle(200, 900), (x) => (x < 300 ? 300 : x < 540 ? 300 + Math.floor((x - 300) / 2) : 420));
  it("Tumbler rolls downhill along the surface and blasts where it stops", () => {
    const tl = fire(slope(), "tumbler", 70, 30);
    const [r] = eventsOf(tl, "roll");
    const xs = r.path.filter((_, i) => i % 2 === 0);
    const ys = r.path.filter((_, i) => i % 2 === 1);
    for (let i = 1; i < xs.length; i++) {
      expect(xs[i]).toBe(xs[i - 1] + 1); // one column at a time, downhill
      expect(ys[i]).toBeGreaterThanOrEqual(ys[i - 1]); // never climbs
    }
    expect(xs.length).toBeLessThanOrEqual(161); // maxDistance 160
    expect([xs[0], xs[xs.length - 1], r.dur]).toEqual([307, 467, 54]);
    const blasts = eventsOf(tl, "blast");
    expect(blasts.map((b) => [b.x, b.y - 1, b.lag])).toEqual([[xs[xs.length - 1], ys[ys.length - 1], r.dur]]); // at the stop column's ground pixel
  });
  it("a direct hit doesn't roll", () => {
    const tl = fire(flatBattle(), "tumbler", 90, 0);
    expect(eventsOf(tl, "roll")).toEqual([]);
    expect(tl.points).toEqual([0, 40]);
  });
  it("a roll off the world is lost: an out, and no blast", () => {
    const tl = fireDef(flatBattle(), synth({ on: "impact", effects: [{ roll: { maxDistance: 1200, then: { radius: 30, damage: 40 } } }] }), 60, 60);
    expect(eventsOf(tl, "out").map((o) => o.x)).toEqual([1200]);
    expect(eventsOf(tl, "blast")).toEqual([]);
  });
});

describe("dig", () => {
  it("Burrow's steep fall tunnels at the 30° clamp, and blasts at the tunnel's end", () => {
    const tl = fire(flatBattle(), "burrow", 60, 50);
    const [d] = eventsOf(tl, "dig");
    expect([d.x0, d.y0, d.x1, d.y1, d.width, d.dur]).toEqual([663, 400, 740, 445, 14, 23]);
    const len = Math.hypot(d.x1 - d.x0, d.y1 - d.y0);
    expect(len >= 88 && len <= 91).toBe(true);
    expect(eventsOf(tl, "blast").map((b) => [b.x, b.y, b.lag])).toEqual([[740, 445, 23]]);
  });
  it("keeps a heading shallower than 30°: a level shot into a cliff tunnels level", () => {
    const m = setHeights(flatBattle(), (x) => (x >= 450 ? 200 : 400));
    const [d] = eventsOf(fire(m, "burrow", 0, 100), "dig");
    expect([d.x0, d.y0, d.x1, d.y1]).toEqual([450, 393, 539, 400]);
  });
  it("with no horizontal travel it digs 30° below level toward the opponent", () => {
    const def = synth({ on: "apex", effects: [{ dig: { length: 90, width: 14 } }] });
    const [d0] = eventsOf(fireDef(flatBattle(), def, 90, 50), "dig");
    expect([d0.x0, d0.y0, d0.x1, d0.y1]).toEqual([300, 173, 377, 218]);
    const m1 = flatBattle();
    m1.shooter = 1;
    const [d1] = eventsOf(fireDef(m1, def, 90, 50), "dig");
    expect([d1.x0, d1.y0, d1.x1, d1.y1]).toEqual([700, 173, 623, 218]);
  });
  it("Auger blasts every 40 px along its clamped tunnel, then at the end", () => {
    const tl = fire(flatBattle(), "auger", 30, 60);
    const blasts = eventsOf(tl, "blast");
    expect(blasts.map((b) => [b.x, b.y, b.lag])).toEqual([[871, 419, 10], [906, 440, 20], [940, 459, 30], [975, 480, 40]]);
    expect(blasts.every((b) => b.y < WORLD_H)).toBe(true);
  });
  it("a direct hit digs nothing: a zero-length tunnel and one blast", () => {
    const tl = fire(flatBattle(), "burrow", 90, 0);
    const [d] = eventsOf(tl, "dig");
    expect([d.x1, d.y1]).toEqual([d.x0, d.y0]);
    expect(eventsOf(tl, "blast").length).toBe(1);
  });
});

describe("burn", () => {
  it("Wildfire runs both ways from its ignition and burns the enemy exactly once", () => {
    const m = flatBattle();
    const before = Array.from(m.terrain.height);
    const tl = fire(m, "wildfire", 60, 52);
    const [b] = eventsOf(tl, "burn");
    expect(b.x).toBe(687);
    expect(b.flows.map((f) => [f[0], f[f.length - 2]])).toEqual([[687, 547], [687, 692]]); // the right-hand flow stops at the tank
    expect(eventsOf(tl, "damage").map((d) => [d.target, d.amount, d.lag])).toEqual([[1, 45, 2]]);
    expect(Array.from(m.terrain.height)).toEqual(before); // fire changes no terrain
  });
  it("Inferno ignites uphill of the enemy and its flow runs down into it: 70, once", () => {
    // tanks 200 / 700; flat at 300 up to x 399, then falling 120 px over x 400..700, then flat at 420
    const m = setHeights(flatBattle(200, 700), (x) => (x < 400 ? 300 : x <= 700 ? 300 + Math.floor(((x - 400) * 120) / 300) : 420));
    const before = Array.from(m.terrain.height);
    const tl = fire(m, "inferno", 45, 37);
    expect(eventsOf(tl, "burn")[0].x).toBe(470);
    expect(eventsOf(tl, "damage").map((d) => [d.target, d.amount, d.lag])).toEqual([[1, 70, 55]]);
    expect(Array.from(m.terrain.height)).toEqual(before);
  });
});
