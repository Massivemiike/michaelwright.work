// src/game/titles/arcfire/weapons/roster.ts
//
// The weapon roster. ORDER IS A WIRE FORMAT: a turn command names its weapon
// by index into this array, so entries are append-only — never reorder or
// delete one. Plan 1 ships the eight weapons buildable from shell + blast;
// Plan 2 appends the rest of the 32. Numbers are the spec §4.2 starting values.
import type { WeaponDef } from "./types";

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
];

/** Roster index by weapon id. */
export const ROSTER_INDEX: Readonly<Record<string, number>> = Object.fromEntries(
  ROSTER.map((w, i) => [w.id, i])
);
