// src/game/titles/arcfire/ai/probe.test.ts — Plan 2B T5: the probe flies the weapon's own flight, exactly
import { describe, it, expect } from "vitest";
import { cloneMatch } from "../state";
import { resolveTurn, resolveWeapon } from "../resolve";
import { hitCircles } from "../tanks";
import { spansFromHeight } from "../terrain";
import { ROSTER, ROSTER_INDEX } from "../weapons/roster";
import { weaponErrors } from "../weapons/validate";
import type { Blast, Stage, WeaponDef } from "../weapons/types";
import { battleBoards } from "@/game/test/arcfire/fixtures";
import { probeModelOf } from "./model";
import { LAND_FOE, LAND_OUT, landingGrid } from "./probe";
import { TIERS } from "./tiers";

describe("the probe", () => {
  it("lands a plain model exactly where Pulse's blast lands (or leaves the world where Pulse does)", () => {
    for (const b of battleBoards()) {
      const t = cloneMatch(b);
      spansFromHeight(t.terrain);
      const board = { t: t.terrain, tanks: hitCircles(t), me: b.shooter, windStep: Math.trunc((b.wind * 65536) / 60) };
      const g = landingGrid(board, probeModelOf(ROSTER[0]), TIERS.rookie, { probes: 0 });
      for (let c = 0; c < g.kind.length; c++) {
        const tl = resolveTurn(cloneMatch(b), { move: 0, weapon: 0, angle: g.angles[Math.trunc(c / g.powers.length)], power: g.powers[c % g.powers.length] });
        const blast = tl.events.find((e) => e.kind === "blast");
        if (g.kind[c] === LAND_OUT) expect(blast).toBeUndefined();
        else expect(blast && [blast.x, blast.y]).toEqual([g.x[c], g.y[c]]);
      }
    }
  }, 60_000);
  it("a beam probe reaches the enemy exactly when Lancer damages it, on the whole dial", () => {
    for (const b of battleBoards()) {
      const t = cloneMatch(b);
      spansFromHeight(t.terrain);
      const board = { t: t.terrain, tanks: hitCircles(t), me: b.shooter, windStep: 0 };
      const g = landingGrid(board, probeModelOf(ROSTER[ROSTER_INDEX.lancer]), TIERS.ace, { probes: 0 });
      expect(g.angles.length).toBe(181);
      for (let c = 0; c < g.angles.length; c++) {
        const tl = resolveTurn(cloneMatch(b), { move: 0, weapon: ROSTER_INDEX.lancer, angle: g.angles[c], power: 50 });
        expect(g.kind[c] === LAND_FOE, `angle ${g.angles[c]}`).toBe(tl.points[b.shooter] > 0);
      }
    }
  }, 60_000);
  it("follows an apex split once: an apex child that is itself an apex stage lands where the sim's child acts, so every probe ends", () => {
    const B: Blast = { radius: 28, damage: 40 };
    const child: Stage = { on: "apex", effects: [{ blast: B }], early: [{ blast: B }] };
    const def: WeaponDef = {
      id: "t", name: "T", tag: "SPLIT", tier: 1, power: 30, launch: { kind: "shell" },
      stage: { on: "apex", effects: [{ split: { count: 1, spreadDeg: 0, speedPct: 100, from: "up", child } }], early: [{ blast: B }] },
    };
    expect(weaponErrors(def)).toEqual([]); // a legal append, which the AI must handle with no AI code
    for (const b of battleBoards()) {
      const t = cloneMatch(b);
      spansFromHeight(t.terrain);
      const board = { t: t.terrain, tanks: hitCircles(t), me: b.shooter, windStep: Math.trunc((b.wind * 65536) / 60) };
      const counter = { probes: 0 };
      const g = landingGrid(board, probeModelOf(def), TIERS.rookie, counter); // re-spawning at every apex, this never returned
      expect(counter.probes).toBe(g.kind.length);
      for (let c = 0; c < g.kind.length; c++) {
        const tl = resolveWeapon(cloneMatch(b), def, { move: 0, weapon: 0, angle: g.angles[Math.trunc(c / g.powers.length)], power: g.powers[c % g.powers.length] });
        const blast = tl.events.find((e) => e.kind === "blast");
        if (g.kind[c] === LAND_OUT) expect(blast).toBeUndefined();
        else expect(blast && [blast.x, blast.y]).toEqual([g.x[c], g.y[c]]);
      }
    }
  }, 60_000);
});
