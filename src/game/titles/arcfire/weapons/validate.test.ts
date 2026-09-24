import { describe, it, expect } from "vitest";
import { weaponErrors, maxShells, maxTurnSteps } from "./validate";
import { ROSTER } from "./roster";
import { resolveWeapon } from "../resolve";
import { hashMatch } from "../hash";
import { MAX_SHELLS, MAX_TURN_STEPS, WORLD_H } from "../constants";
import { flatBattle } from "@/game/test/arcfire/fixtures";
import type { Blast, DelayableEffect, Effect, Stage, WeaponDef } from "./types";

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
      [impact([{ delay: { steps: 10, then: [{ split: { count: 2, spreadDeg: 10, speedPct: 50, from: "up", child: { on: "impact", effects: [{ blast: B }] } } } as unknown as DelayableEffect] } }]),
        "stage.effects[0].delay.then[0]: a delay cannot schedule a split"],
      [weapon({ stage: { on: "apex", effects: [{ blast: B }], bounce: { times: 2, restitutionPct: 50 } } }), "stage.bounce: only on an impact stage"],
      [impact([{ dig: { length: 90, width: 1 } }]), "stage.effects[0].dig.width: 1 is not an integer in [2, 32]"],
    ];
    for (const [def, err] of cases) expect(weaponErrors(def)).toContain(err);
  });
  it("reports a legal-looking but over-bound def by its static cost: 9 children that each split 9 (1 + 9 × 10 shells)", () => {
    const nine = (child: Stage): Effect => ({ split: { count: 9, spreadDeg: 40, speedPct: 50, from: "up", child } });
    const def = impact([nine({ on: "impact", effects: [nine({ on: "impact", effects: [{ blast: B }] })] })]);
    expect(maxShells(def)).toBe(91);
    expect(weaponErrors(def)).toEqual([`maxShells 91 > MAX_SHELLS ${MAX_SHELLS}`]);
  });
  it("reports a cyclic stage (nesting deeper than 4), whose static bounds exceed the backstops", () => {
    const loop: Stage = { on: "impact", effects: [{ blast: B }] };
    loop.effects.push({ split: { count: 2, spreadDeg: 30, speedPct: 50, from: "up", child: loop } });
    const def = weapon({ stage: loop });
    expect(weaponErrors(def).some((e) => e.endsWith("stages nest deeper than 4"))).toBe(true);
    expect(maxShells(def)).toBeGreaterThan(MAX_SHELLS);
    expect(maxTurnSteps(def)).toBeGreaterThan(MAX_TURN_STEPS);
  });
  it("detects a cycle directly: a stage that refers to itself 5 times reports each back-reference once, fast", () => {
    const loop: Stage = { on: "impact", effects: [{ blast: B }] };
    for (let k = 0; k < 5; k++) loop.effects.push({ split: { count: 1, spreadDeg: 0, speedPct: 50, from: "up", child: loop } });
    const t0 = performance.now();
    const errs = weaponErrors(weapon({ stage: loop }));
    const ms = performance.now() - t0;
    expect(errs).toEqual([1, 2, 3, 4, 5].map((k) => `stage.effects[${k}].split.child: cyclic stage, so its stages nest deeper than 4`));
    expect(ms).toBeLessThan(50);
  });
  it("does not mistake a shared, acyclic child for a cycle", () => {
    const child: Stage = { on: "impact", effects: [{ blast: B }] };
    const split = { count: 2, spreadDeg: 10, speedPct: 50, from: "up" as const, child };
    expect(weaponErrors(impact([{ split }, { split }]))).toEqual([]);
  });
  it("never throws on malformed input: a missing or null nested object is reported at its path", () => {
    const bad = <T>(v: unknown): T => v as T;
    const child: Stage = { on: "impact", effects: [{ blast: B }] };
    const cases: [WeaponDef, string][] = [
      [bad<WeaponDef>(null), "def: missing"],
      [weapon({ stage: bad<Stage>(null) }), "stage: a shell launch needs one"],
      [impact([{ split: { count: 2, spreadDeg: 10, speedPct: 50, from: "up", child: bad<Stage>(null) } }]), "stage.effects[0].split.child: missing"],
      [weapon({ launch: bad<WeaponDef["launch"]>(undefined) }), "launch: missing"],
      [impact([bad<Effect>(null)]), "stage.effects[0]: missing"],
      [impact([bad<Effect>({})]), "stage.effects[0]: an effect has exactly one known key"],
      [impact([bad<Effect>({ split: null })]), "stage.effects[0].split: missing"],
      [impact([bad<Effect>({ roll: { maxDistance: 100, then: null } })]), "stage.effects[0].roll.then: missing"],
      [impact([{ blast: B }], { bounce: bad<Stage["bounce"]>(null) }), "stage.bounce: missing"],
      [weapon({ stage: { on: "apex", effects: [{ split: { count: 2, spreadDeg: 10, speedPct: 50, from: "ahead", child } }], early: bad<Effect[]>([null]) } }),
        "stage.early[0]: missing"],
    ];
    for (const [def, err] of cases) expect(weaponErrors(def), err).toContain(err);
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

describe("totality: quake", () => {
  it("a zero-reach quake", () => {
    expectTotal(impact([{ quake: { reach: 0, damage: 0, furrow: 0 } }]));
  });
});
