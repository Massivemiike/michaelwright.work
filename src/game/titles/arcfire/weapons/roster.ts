// src/game/titles/arcfire/weapons/roster.ts
//
// The weapon roster. ORDER IS A WIRE FORMAT: a turn command names its weapon
// by index into this array, so entries are append-only — never reorder or
// delete one. Plan 1 ships the eight weapons buildable from shell + blast;
// Plan 2 appends the rest of the 32. Numbers are the spec §4.2 starting values.
import type { Blast, WeaponDef } from "./types";

const blast = (radius: number, damage: number): Blast => ({ radius, damage });

export const ROSTER: readonly WeaponDef[] = [
  {
    id: "pulse", name: "Pulse", tag: "BLAST", tier: 1, power: 30,
    launch: { kind: "shell" },
    stage: { on: "impact", effects: [{ blast: { radius: 28, damage: 40 } }] },
  },
  {
    id: "pulse2", name: "Pulse II", tag: "BLAST", tier: 2, power: 55,
    launch: { kind: "shell" },
    stage: { on: "impact", effects: [{ blast: { radius: 40, damage: 60 } }] },
  },
  {
    id: "nova", name: "Nova", tag: "BLAST", tier: 3, power: 80,
    launch: { kind: "shell" },
    stage: { on: "impact", effects: [{ blast: { radius: 72, damage: 100 } }] },
  },
  {
    id: "needle", name: "Needle", tag: "BLAST", tier: 2, power: 55,
    launch: { kind: "shell", speedPct: 115 },
    stage: { on: "impact", effects: [{ blast: { radius: 10, damage: 110, falloff: "quadratic" } }] },
  },
  {
    id: "crater", name: "Crater", tag: "BLAST", tier: 1, power: 20,
    launch: { kind: "shell" },
    stage: { on: "impact", effects: [{ blast: { radius: 90, damage: 25 } }] },
  },
  {
    id: "triad", name: "Triad", tag: "VOLLEY", tier: 1, power: 35,
    launch: { kind: "shell", count: 3, spreadDeg: 6 },
    stage: { on: "impact", effects: [{ blast: { radius: 24, damage: 24 } }] },
  },
  {
    id: "fan", name: "Fan", tag: "VOLLEY", tier: 2, power: 55,
    launch: { kind: "shell", count: 5, spreadDeg: 12 },
    stage: { on: "impact", effects: [{ blast: { radius: 20, damage: 18 } }] },
  },
  {
    id: "railshot", name: "Railshot", tag: "SPECIAL", tier: 2, power: 55,
    launch: { kind: "shell", speedPct: 180, gravityPct: 40 },
    stage: { on: "impact", effects: [{ blast: { radius: 18, damage: 75 } }] },
  },
  // --- Plan 2A: indices 8..31, in spec §4.2 display order. Numbers the spec leaves open are initial choices (spec §4.2).
  {
    id: "twinnova", name: "Twin Nova", tag: "BLAST", tier: 3, power: 80,
    launch: { kind: "shell" },
    stage: { on: "impact", effects: [{ blast: blast(50, 55) }, { delay: { steps: 30, then: [{ blast: blast(70, 60) }] } }] },
  },
  {
    id: "cascade", name: "Cascade", tag: "SPLIT", tier: 3, power: 80,
    launch: { kind: "shell" },
    stage: { on: "impact", effects: [{ blast: blast(20, 15) }, { split: { count: 3, spreadDeg: 50, speedPct: 40, from: "up",
      child: { on: "impact", effects: [{ blast: blast(18, 15) }, { split: { count: 3, spreadDeg: 50, speedPct: 40, from: "up",
        child: { on: "impact", effects: [{ blast: blast(14, 10) }] } } }] } } }] },
  },
  {
    id: "hydra", name: "Hydra", tag: "SPLIT", tier: 3, power: 80,
    launch: { kind: "shell" },
    stage: { on: "apex", effects: [{ split: { count: 5, spreadDeg: 40, speedPct: 100, from: "ahead",
      child: { on: "impact", effects: [{ blast: blast(26, 30) }] } } }], early: [{ blast: blast(26, 30) }] },
  },
  {
    id: "hailstorm", name: "Hailstorm", tag: "SPLIT", tier: 2, power: 55,
    launch: { kind: "shell" },
    stage: { on: "apex", effects: [{ split: { count: 9, spreadDeg: 30, speedPct: 50, from: "cone",
      child: { on: "impact", effects: [{ blast: blast(14, 12) }] } } }], early: [{ blast: blast(14, 12) }] },
  },
  {
    id: "shrapnel", name: "Shrapnel", tag: "SPLIT", tier: 2, power: 55,
    launch: { kind: "shell" },
    stage: { on: "impact", effects: [{ blast: blast(24, 20) }, { split: { count: 6, spreadDeg: 160, speedPct: 35, from: "up",
      child: { on: "impact", effects: [{ blast: blast(10, 8) }] } } }] },
  },
  {
    id: "barrage", name: "Barrage", tag: "SPLIT", tier: 2, power: 55,
    launch: { kind: "shell" },
    stage: { on: "apex", effects: [{ split: { count: 6, spreadDeg: 0, speedPct: 100, from: "ahead", gapPx: 30,
      child: { on: "impact", effects: [{ blast: blast(20, 18) }] } } }], early: [{ blast: blast(20, 18) }] },
  },
];

/** Roster index by weapon id. */
export const ROSTER_INDEX: Readonly<Record<string, number>> = Object.fromEntries(
  ROSTER.map((w, i) => [w.id, i])
);
