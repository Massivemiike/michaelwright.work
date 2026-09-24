// src/game/titles/arcfire/weapons/types.ts
//
// Data-driven weapon definitions (spec §4.1). A weapon is a Launch (shells or
// beams) plus, for shells, a Stage: WHEN it triggers (impact or apex), HOW the
// shell flies until then (optional bounce and homing), and WHAT it does
// (effects, applied in array order at the trigger point). Pure data: the
// only weapon code is weapons/primitives.ts and ballistics.ts.

export type Tag =
  | "BLAST" | "VOLLEY" | "SPLIT" | "BOUNCE" | "ROLL" | "DIG"
  | "FIRE" | "DIRT" | "BEAM" | "HOMING" | "QUAKE" | "SPECIAL";

export interface Blast {
  radius: number; // px, >= 1
  damage: number; // points when the blast overlaps the hitbox
  falloff?: "linear" | "quadratic"; // default linear
}

export interface ShellLaunch {
  kind: "shell";
  count?: number; // shells in the volley (default 1)
  spreadDeg?: number; // TOTAL angular spread across the volley (default 0); never clamped
  speedPct?: number; // launch speed scale (default 100)
  gravityPct?: number; // gravity scale (default 100); children inherit it
}

export interface BeamLaunch {
  kind: "beam"; // straight lines from the muzzle, aimed on the beam dial (beamDir: can point down); ignore power, gravity and wind
  count?: number; // beams (default 1)
  spreadDeg?: number; // TOTAL angular spread across the beams (default 0)
  length: number; // px, >= 1
  width: number; // px, 2..12 (carves a width/2-radius capsule; <= 12 so a beam can never touch its own hitbox)
  damage: number; // flat points to each tank a beam passes within width/2 of
}

export type Launch = ShellLaunch | BeamLaunch;

export interface Split {
  count: number; // children, >= 1
  spreadDeg: number; // TOTAL fan across the children (0 = all parallel)
  speedPct: number; // % of the base speed (see `from`)
  // up:    a fan about straight up at the parent's nominal speed (impact splits: Cascade, Shrapnel)
  // ahead: a fan about the parent's current velocity, at its current speed (apex splits: Hydra, Barrage)
  // cone:  the parent's current velocity PLUS a fan about straight down at the parent's
  //        nominal speed — a burst carried by the parent's motion (Hailstorm)
  from: "up" | "ahead" | "cone";
  gapPx?: number; // spawn the children in a horizontal line this far apart, centred on the parent (Barrage)
  child: Stage;
}

export type Build =
  | { shape: "ball"; radius: number } // a disc of dirt centred on the impact
  | { shape: "wall"; width: number; height: number } // each column's surface rises by `height`
  | { shape: "level"; radius: number }; // columns within ±radius become solid exactly from the impact y down

export interface Roll { maxDistance: number; then: Blast } // px along the ground
export interface Dig { length: number; width: number; blastEvery?: number; each?: Blast; then?: Blast } // along travel, never steeper than DIG_MAX_PITCH below level
export interface Burn { flow: number; pool: number; damage: number; split?: boolean }
export interface Quake { reach: number; damage: number; furrow: number } // reach is horizontal; the shockwave never hurts the shooter

/** What a delay may schedule. None of these creates a shell or another delay, so every armed delay fires once and adds nothing that waits. */
export type DelayableEffect =
  | { blast: Blast }
  | { roll: Roll }
  | { dig: Dig }
  | { burn: Burn }
  | { build: Build }
  | { quake: Quake };

export interface Delay { steps: number; then: DelayableEffect[] }

export type Effect = DelayableEffect | { split: Split } | { delay: Delay };

export interface Bounce {
  times: number; // reflections before the stage triggers
  restitutionPct: number; // speed kept per reflection, 1..100
  blastEach?: Blast; // detonated at every reflection point
  walls?: boolean; // true: reflect off the world's side walls instead of the terrain (Ricochet)
}

export interface Stage {
  // impact: the first terrain or tank contact that isn't consumed by a bounce.
  // apex: the first step a RISING shell stops rising (vy < 0 before the step's
  //       gravity, vy >= 0 after it). A shell launched level or downward never apexes.
  on: "impact" | "apex";
  effects: Effect[];
  early?: Effect[]; // on "apex" only: applied instead when the shell hits something before its apex (omitted = a dud)
  homing?: { degPerStep: number }; // on "impact" only: once past the apex, turn <= this many whole degrees per step toward the enemy
  bounce?: Bounce; // on "impact" only
}

export interface WeaponDef {
  id: string;
  name: string;
  tag: Tag;
  tier: 1 | 2 | 3;
  power: number; // draft score 1..100 (the balance harness rewrites these)
  launch: Launch;
  stage?: Stage; // required for shell launches; beams have none
}
