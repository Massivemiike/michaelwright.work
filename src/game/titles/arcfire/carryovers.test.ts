// src/game/titles/arcfire/carryovers.test.ts — Plan 2B T3: the parked Plan 2A minors (the validator fixes and the missing tests)
import { describe, it, expect } from "vitest";
import { hashMatch } from "./hash";
import { resolveWeapon } from "./resolve";
import { ROSTER, ROSTER_INDEX } from "./weapons/roster";
import { maxTurnSteps, weaponErrors } from "./weapons/validate";
import { flatBattle } from "@/game/test/arcfire/fixtures";
import type { Blast, Effect, Stage, WeaponDef } from "./weapons/types";

const B: Blast = { radius: 28, damage: 40 };
const weapon = (stage: Stage): WeaponDef => ({ id: "t", name: "T", tag: "BLAST", tier: 1, power: 30, launch: { kind: "shell" }, stage });
const up = (child: Stage): Effect => ({ split: { count: 1, spreadDeg: 0, speedPct: 50, from: "up", child } });

describe("the Plan 2A carry-overs", () => {
  it("weaponErrors never descends into a delay: a self-containing or deep delay chain is one report, no throw", () => {
    const then: Effect[] = [{ blast: B }];
    then.push({ delay: { steps: 5, then: then as never } });
    expect(weaponErrors(weapon({ on: "impact", effects: [{ delay: { steps: 5, then: then as never } }] })))
      .toEqual(["stage.effects[0].delay.then[1]: a delay cannot schedule a delay"]);
    let deep: Effect = { blast: B };
    for (let i = 0; i < 10000; i++) deep = { delay: { steps: 1, then: [deep] as never } };
    expect(weaponErrors(weapon({ on: "impact", effects: [deep] }))).toEqual(["stage.effects[0].delay.then[0]: a delay cannot schedule a delay"]);
  });
  it("walks each stage of a multi-stage cycle once, and still reports every back-reference", () => {
    const ring: Stage[] = [0, 1, 2, 3].map(() => ({ on: "impact" as const, effects: [{ blast: B }] as Effect[] }));
    for (let i = 0; i < 4; i++) for (let k = 0; k < 40; k++) ring[i].effects.push(up(ring[(i + 1) % 4]));
    let walks = 0; // reads of a ring stage's effect list: one per stage check
    for (const st of ring) {
      const list = st.effects;
      Object.defineProperty(st, "effects", { get: () => { walks++; return list; } });
    }
    const errs = weaponErrors(weapon(ring[0]));
    expect(walks).toBe(4); // without the (stage, depth) memo: 1 + 40 + 1,600 + 64,000 walks and 40^4 reports
    expect(errs.length).toBe(40);
    expect(errs.every((e) => e.endsWith("split.child: cyclic stage, so its stages nest deeper than 4"))).toBe(true);
  });
  it("still reports an over-deep path through a stage it already checked at a shallower depth", () => {
    const leaf: Stage = { on: "impact", effects: [{ blast: B }] };
    const s: Stage = { on: "impact", effects: [{ blast: B }, up(leaf)] }; // leaf: depth 3 under s at 2, depth 5 under s at 4
    const b: Stage = { on: "impact", effects: [{ blast: B }, up(s)] };
    const a: Stage = { on: "impact", effects: [{ blast: B }, up(b)] };
    expect(weaponErrors(weapon({ on: "impact", effects: [{ blast: B }, up(s), up(a)] }))).toEqual([
      "stage.effects[2].split.child.effects[1].split.child.effects[1].split.child.effects[1].split.child: stages nest deeper than 4",
    ]);
  });
  it("reports homing: null as missing, and resolves such a def as if it had no homing", () => {
    const bad = weapon({ on: "impact", effects: [{ blast: B }], homing: null as never });
    expect(weaponErrors(bad)).toContain("stage.homing: missing");
    const a = flatBattle();
    const b = flatBattle();
    const input = { move: 0 as const, weapon: 0, angle: 45, power: 60 };
    expect(resolveWeapon(a, bad, input).points).toEqual(resolveWeapon(b, weapon({ on: "impact", effects: [{ blast: B }] }), input).points);
    expect(hashMatch(a)).toBe(hashMatch(b));
  });
  it("bounds a turn's steps statically", () => {
    expect(maxTurnSteps(ROSTER[ROSTER_INDEX.twinnova])).toBe(1230);
    expect(maxTurnSteps(ROSTER[ROSTER_INDEX.cascade])).toBe(3600);
    expect(maxTurnSteps(ROSTER[ROSTER_INDEX.lancer])).toBe(1);
    const leaf: Stage = { on: "impact", effects: [{ blast: B }, { delay: { steps: 600, then: [{ blast: B }] } }] };
    expect(maxTurnSteps(weapon({ on: "impact", effects: [{ split: { count: 2, spreadDeg: 10, speedPct: 50, from: "up", child: leaf } }] }))).toBe(3000);
  });
  it("abandons every shell still flying at the 4,800-step backstop with one out event each", () => {
    const hop: Stage = { on: "impact", effects: [] };
    hop.effects.push({ split: { count: 1, spreadDeg: 0, speedPct: 100, from: "up", child: hop } });
    const tl = resolveWeapon(flatBattle(), weapon(hop), { move: 0, weapon: 0, angle: 90, power: 100 });
    expect(tl.steps).toBe(4800);
    const outs = tl.events.filter((e) => e.kind === "out");
    expect(outs.length).toBe(1);
    expect(outs[0]).toMatchObject({ step: 4800, lag: 0 });
    expect(tl.events[tl.events.length - 1]).toBe(outs[0]);
    const alive = tl.shells.length - 1; // the one shell alive at the backstop: its path ends at the out point
    const pts = tl.shells[alive].points;
    expect([pts[pts.length - 2], pts[pts.length - 1]]).toEqual([(outs[0] as { x: number }).x, (outs[0] as { y: number }).y]);
  });
});
