// src/game/titles/arcfire/state.ts
//
// The complete Arcfire match state (spec §3.4). Everything the sim needs lives
// here and nowhere else: it is exactly what hashMatch() digests and what
// cloneMatch() copies for AI search and previews. Integer-only.
import type { Rng } from "@/game/sim/math/rng";
import type { Tag } from "./weapons/types";
import { cloneTerrain, type Terrain } from "./terrain";

export type Phase = "draft" | "battle" | "suddenDeath" | "over";

export interface MatchSettings {
  weaponsEach: number; // 10 normally, 5 for short free play
  poolSize: number; // 24 for 10 each, 12 for 5 each; must be >= 2 × weaponsEach
  wind: boolean; // seeded per-turn wind (free-play toggle)
  guaranteeTags: readonly Tag[]; // the pool always holds >= 1 weapon of each (spec: BLAST, SPLIT, DIRT)
  rosterSize: number; // the pool is drawn from ROSTER[0, rosterSize): pins a match to a roster prefix, so appends never move it
}

/** The daily challenge and default free play (spec §2): 10 weapons each from a 24-weapon pool. */
export const STANDARD_SETTINGS: MatchSettings = Object.freeze({
  weaponsEach: 10,
  poolSize: 24,
  wind: false,
  guaranteeTags: Object.freeze(["BLAST", "SPLIT", "DIRT"] as Tag[]),
  rosterSize: 32, // a literal, NOT ROSTER.length: a roster append must be a deliberate settings + simVersion change
});

/** Short free play: 5 each from a pool of 12. */
export const SHORT_SETTINGS: MatchSettings = Object.freeze({ ...STANDARD_SETTINGS, weaponsEach: 5, poolSize: 12 });

export interface MatchState {
  settings: MatchSettings;
  rng: Rng;
  phase: Phase;
  terrain: Terrain;
  tankX: Int32Array; // [2] each tank's centre column
  movesLeft: Int32Array; // [2]
  pool: number[]; // roster indices, ascending — a pool index is a position in this array
  poolOwner: Int32Array; // [pool.length] -1 = available, else the player (0/1) who drafted it
  firstPicker: number; // 0/1 from the seeded coin flip; the OTHER player shoots first
  picksMade: number;
  hands: [number[], number[]]; // each player's unfired roster indices, ascending
  shooter: number; // whose turn it is in battle / sudden death
  shotsFired: number; // resolved turns so far (battle + sudden death)
  wind: number; // this turn's wind, px/s² (0 when wind is off)
  scores: Int32Array; // [2]
  winner: number; // -1 undecided, 0 or 1, or 2 for a draw
}

/** A deep copy for AI search and previews. `settings` is frozen by createMatch, so it is shared, not copied. */
export function cloneMatch(m: MatchState): MatchState {
  return {
    ...m,
    rng: { state: m.rng.state },
    terrain: cloneTerrain(m.terrain),
    tankX: m.tankX.slice(),
    movesLeft: m.movesLeft.slice(),
    pool: m.pool.slice(),
    poolOwner: m.poolOwner.slice(),
    hands: [m.hands[0].slice(), m.hands[1].slice()],
    scores: m.scores.slice(),
  };
}
