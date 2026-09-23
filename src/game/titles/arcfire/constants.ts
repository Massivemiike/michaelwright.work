// src/game/titles/arcfire/constants.ts
//
// Every Arcfire tuning number in one place (spec §2–§3). Stage px, y-down,
// origin top-left; the floor is at WORLD_H. Physics runs at 60 fixed steps per
// simulated second. Fixed-point values are Q16.16 (Fx). Pure data — this file
// sits under the sim purity guard.
import type { Fx } from "@/game/sim/types";
import { fromInt } from "@/game/sim/math/fixed";

export const ARCFIRE_SLUG = "arcfire";
export const ARCFIRE_SIM_VERSION = 1;

// --- world
export const WORLD_W = 1200;
export const WORLD_H = 500;

// --- physics (spec §3.2)
export const STEPS_PER_SEC = 60;
export const GRAVITY_STEP: Fx = fromInt(5); // 300 px/s² ÷ 60 steps = +5 px/s of fall speed per step
export const V_UNIT: Fx = 448266; // 6.84 px/s per power point, Q16.16 (6.84 × 65536, truncated)
export const MAX_FLIGHT_STEPS = 1200; // 20 simulated seconds
export const BARREL_LEN = 22; // px from the hitbox centre to the muzzle
export const WIND_MAX = 40; // |wind| in px/s² when the free-play wind toggle is on

// --- tanks (spec §2, §3.2)
export const TANK_HIT_R = 14; // hitbox circle radius, px
export const TANK_HIT_DY = 12; // the hitbox centre sits this far above the surface point
export const MOVE_STEP = 36; // px per move
export const MOVES_PER_MATCH = 4;
export const MIN_TANK_SEP = 64; // closest the two tank centres may get, px
export const TANK_EDGE_MARGIN = 24; // tank centres stay this far inside the world edges
export const SPAWN_X: readonly [number, number] = [180, 1020]; // 15% / 85% of WORLD_W
export const SPAWN_FLAT = 24; // terrain is flattened ±this around each spawn column

// --- terrain (spec §3.1)
export const TERRAIN_MIN_Y = 120;
export const TERRAIN_MAX_Y = 420;
export const MAX_SPANS = 8; // solid runs a column may hold during a shot
export const TERRAIN_CTRL_STEP = 150; // generation control-point pitch, px
export const TERRAIN_BLUR_R = 24; // generation box-blur radius, px
export const TERRAIN_BLUR_PASSES = 3;

// --- match (spec §2)
export const SUDDEN_DEATH_WEAPON = 0; // roster index of Pulse
