// src/game/titles/arcfire/weapons/types.ts
//
// Data-driven weapon definitions (spec §4.1). Plan 1 implements the shell
// launch (including volleys) and the impact blast. Plan 2 widens Launch,
// Effect and Stage with the remaining primitives (split, bounce, roll, dig,
// burn, build, quake, beam, homing, delay).

export type Tag =
  | "BLAST" | "VOLLEY" | "SPLIT" | "BOUNCE" | "ROLL" | "DIG"
  | "FIRE" | "DIRT" | "BEAM" | "HOMING" | "QUAKE" | "SPECIAL";

export interface Blast {
  radius: number; // px
  damage: number; // points at the hitbox edge overlap
  falloff?: "linear" | "quadratic"; // default linear
}

export interface ShellLaunch {
  kind: "shell";
  count?: number; // shells in the volley (default 1)
  spreadDeg?: number; // TOTAL angular spread across the volley (default 0)
  speedPct?: number; // launch speed scale (default 100)
  gravityPct?: number; // gravity scale (default 100)
}

export type Launch = ShellLaunch;

export type Effect = { blast: Blast };

export interface Stage {
  on: "impact";
  effects: Effect[];
}

export interface WeaponDef {
  id: string;
  name: string;
  tag: Tag;
  tier: 1 | 2 | 3;
  power: number; // draft score 1..100 (Plan 2's balance harness rewrites these)
  launch: Launch;
  stage: Stage;
}
