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
  {
    id: "skipper", name: "Skipper", tag: "BOUNCE", tier: 2, power: 55,
    launch: { kind: "shell" },
    stage: { on: "impact", bounce: { times: 3, restitutionPct: 55, blastEach: blast(22, 20) }, effects: [{ blast: blast(26, 24) }] },
  },
  {
    id: "pinball", name: "Pinball", tag: "BOUNCE", tier: 2, power: 55,
    launch: { kind: "shell" },
    stage: { on: "impact", bounce: { times: 6, restitutionPct: 80 }, effects: [{ blast: blast(36, 55) }] },
  },
  {
    id: "ricochet", name: "Ricochet", tag: "BOUNCE", tier: 1, power: 30,
    launch: { kind: "shell" },
    stage: { on: "impact", bounce: { times: 2, restitutionPct: 100, walls: true }, effects: [{ blast: blast(30, 40) }] },
  },
  {
    id: "tumbler", name: "Tumbler", tag: "ROLL", tier: 1, power: 30,
    launch: { kind: "shell" },
    stage: { on: "impact", effects: [{ roll: { maxDistance: 160, then: blast(30, 40) } }] },
  },
  {
    id: "juggernaut", name: "Juggernaut", tag: "ROLL", tier: 3, power: 80,
    launch: { kind: "shell" },
    stage: { on: "impact", effects: [{ roll: { maxDistance: 300, then: blast(60, 85) } }] },
  },
  {
    id: "burrow", name: "Burrow", tag: "DIG", tier: 2, power: 55,
    launch: { kind: "shell" },
    stage: { on: "impact", effects: [{ dig: { length: 90, width: 14, then: blast(34, 55) } }] },
  },
  {
    id: "auger", name: "Auger", tag: "DIG", tier: 2, power: 55,
    launch: { kind: "shell" },
    stage: { on: "impact", effects: [{ dig: { length: 160, width: 14, blastEvery: 40, each: blast(18, 16), then: blast(18, 16) } }] },
  },
  {
    id: "inferno", name: "Inferno", tag: "FIRE", tier: 3, power: 80,
    launch: { kind: "shell" },
    stage: { on: "impact", effects: [{ burn: { flow: 220, pool: 30, damage: 70 } }] },
  },
  {
    id: "wildfire", name: "Wildfire", tag: "FIRE", tier: 2, power: 55,
    launch: { kind: "shell" },
    stage: { on: "impact", effects: [{ burn: { flow: 140, pool: 0, damage: 45, split: true } }] },
  },
  {
    id: "rampart", name: "Rampart", tag: "DIRT", tier: 1, power: 25,
    launch: { kind: "shell" },
    stage: { on: "impact", effects: [{ build: { shape: "wall", width: 36, height: 80 } }] },
  },
  {
    id: "bastion", name: "Bastion", tag: "DIRT", tier: 1, power: 25,
    launch: { kind: "shell" },
    stage: { on: "impact", effects: [{ build: { shape: "ball", radius: 48 } }] },
  },
  {
    id: "leveler", name: "Leveler", tag: "DIRT", tier: 1, power: 25,
    launch: { kind: "shell" },
    stage: { on: "impact", effects: [{ build: { shape: "level", radius: 80 } }] },
  },
  {
    id: "lancer", name: "Lancer", tag: "BEAM", tier: 2, power: 55,
    launch: { kind: "beam", length: 1200, width: 8, damage: 60 },
  },
  {
    id: "prism", name: "Prism", tag: "BEAM", tier: 3, power: 80,
    launch: { kind: "beam", count: 3, spreadDeg: 8, length: 1200, width: 6, damage: 35 },
  },
];

/** Roster index by weapon id. */
export const ROSTER_INDEX: Readonly<Record<string, number>> = Object.fromEntries(
  ROSTER.map((w, i) => [w.id, i])
);
