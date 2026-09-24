import { describe, it, expect } from "vitest";
import { weaponErrors, maxShells, maxTurnSteps } from "./validate";
import { ROSTER } from "./roster";
import { resolveWeapon } from "../resolve";
import { hashMatch } from "../hash";
import { MAX_SHELLS, MAX_TURN_STEPS, WORLD_H } from "../constants";
import { flatBattle } from "@/game/test/arcfire/fixtures";
import type { Blast, Effect, Stage, WeaponDef } from "./types";

const B: Blast = { radius: 28, damage: 40 };

/** A valid shell + blast weapon with `over` applied. */
const weapon = (over: Partial<WeaponDef>): WeaponDef => ({
  id: "test", name: "Test", tag: "BLAST", tier: 1, power: 30,
  launch: { kind: "shell" }, stage: { on: "impact", effects: [{ blast: B }] }, ...over,
});

/** A shell weapon whose impact stage has these effects (and `extra` stage fields). */
const impact = (effects: Effect[], extra: Partial<Stage> = {}): WeaponDef => weapon({ stage: { on: "impact", effects, ...extra } });

describe("weaponErrors", () => {
  it("accepts every roster weapon and a plain shell + blast", () => {
    for (const w of ROSTER) expect(weaponErrors(w), w.id).toEqual([]);
    expect(weaponErrors(weapon({}))).toEqual([]);
  });
  it("reports each seeded mistake at its path", () => {
    const cases: [WeaponDef, string][] = [
      [weapon({ power: 0 }), "power: 0 is not an integer in [1, 100]"],
      [impact([{ blast: { radius: 0, damage: 40 } }]), "stage.effects[0].blast.radius: 0 is not an integer in [1, 200]"],
      [impact([]), "stage.effects: must be a non-empty effect list"],
      [weapon({ stage: undefined }), "stage: a shell launch needs one"],
      [weapon({ launch: { kind: "beam", length: 1200, width: 20, damage: 60 }, stage: undefined }), "launch.width: 20 is not an integer in [2, 12]"],
      [impact([{ blast: B }], { early: [{ blast: B }] }), "stage.early: only on an apex stage"],
      [weapon({ stage: { on: "apex", effects: [{ blast: B }], homing: { degPerStep: 2 } } }), "stage.homing: only on an impact stage"],
      [
        impact([{ split: { count: 3, spreadDeg: 20, speedPct: 100, from: "ahead", child: { on: "impact", effects: [{ blast: B }] } } }]),
        "stage.effects[0].split.from: \"ahead\" only in an apex stage's effects (at an impact the heading points into the ground)",
      ],
      [impact([{ dig: { length: 90, width: 14, blastEvery: 30 } }]), "stage.effects[0].dig: blastEvery and each come together"],
      [impact([{ delay: { steps: 0, then: [{ blast: B }] } }]), "stage.effects[0].delay.steps: 0 is not an integer in [1, 600]"],
      [impact([{ blast: B, quake: { reach: 100, damage: 10, furrow: 2 } } as unknown as Effect]), "stage.effects[0]: an effect has exactly one known key"],
    ];
    for (const [def, err] of cases) expect(weaponErrors(def)).toContain(err);
  });
  it("reports a cyclic stage (nesting deeper than 4), whose static bounds exceed the backstops", () => {
    const loop: Stage = { on: "impact", effects: [{ blast: B }] };
    loop.effects.push({ split: { count: 2, spreadDeg: 30, speedPct: 50, from: "up", child: loop } });
    const def = weapon({ stage: loop });
    expect(weaponErrors(def).some((e) => e.endsWith("stages nest deeper than 4"))).toBe(true);
    expect(maxShells(def)).toBeGreaterThan(MAX_SHELLS);
    expect(maxTurnSteps(def)).toBeGreaterThan(MAX_TURN_STEPS);
  });
});

/** Resolve `def` at 45/60, 90/0 and 0/100 on flatBattle(): no throw, integer state, a valid hash, and within the backstops. */
function expectTotal(def: WeaponDef): void {
  for (const [angle, power] of [[45, 60], [90, 0], [0, 100]]) {
    const m = flatBattle();
    const tl = resolveWeapon(m, def, { move: 0, weapon: 0, angle, power });
    expect(Array.from(m.terrain.height).every((h) => Number.isInteger(h) && h >= 0 && h <= WORLD_H)).toBe(true);
    expect([...tl.points, ...Array.from(m.scores)].every(Number.isInteger)).toBe(true);
    expect(hashMatch(m)).toMatch(/^[0-9a-f]{8}$/);
    expect(tl.shells.length).toBeLessThanOrEqual(MAX_SHELLS);
    expect(tl.steps).toBeLessThanOrEqual(MAX_TURN_STEPS);
  }
}

describe("totality: degenerate definitions resolve without throwing", () => {
  it("a zero-shell volley, a zero blast, and the launch maxima", () => {
    expectTotal(weapon({ launch: { kind: "shell", count: 0 } }));
    expectTotal(impact([{ blast: { radius: 0, damage: 0 } }]));
    expectTotal(weapon({ launch: { kind: "shell", count: 9, spreadDeg: 180, speedPct: 300, gravityPct: 0 } }));
  });
});

describe("totality: split", () => {
  it("a zero-child split and a cyclic split", () => {
    const child: Stage = { on: "impact", effects: [{ blast: B }] };
    expectTotal(impact([{ blast: B }, { split: { count: 0, spreadDeg: 30, speedPct: 50, from: "up", child } }]));
    const loop: Stage = { on: "impact", effects: [{ blast: B }] };
    loop.effects.push({ split: { count: 3, spreadDeg: 60, speedPct: 80, from: "up", child: loop } });
    expectTotal(weapon({ stage: loop }));
  });
});

describe("totality: roll, dig and burn", () => {
  it("a zero roll, an all-zero dig and an all-zero burn", () => {
    const Z: Blast = { radius: 0, damage: 0 };
    expectTotal(impact([{ roll: { maxDistance: 0, then: Z } }]));
    expectTotal(impact([{ dig: { length: 0, width: 0, blastEvery: 0, each: Z, then: Z } }]));
    expectTotal(impact([{ burn: { flow: 0, pool: 0, damage: 0 } }]));
  });
});

describe("totality: build", () => {
  it("a 0 × 0 wall", () => {
    expectTotal(impact([{ build: { shape: "wall", width: 0, height: 0 } }]));
  });
});

describe("totality: beam", () => {
  it("an all-zero beam launch, with no beams and with one", () => {
    expectTotal(weapon({ launch: { kind: "beam", count: 0, spreadDeg: 0, length: 0, width: 0, damage: 0 }, stage: undefined }));
    expectTotal(weapon({ launch: { kind: "beam", count: 1, spreadDeg: 0, length: 0, width: 0, damage: 0 }, stage: undefined }));
  });
});
