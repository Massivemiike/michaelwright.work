// src/game/titles/arcfire/ai/tiers.ts
//
// The three AI tiers (spec §5) as data: the AI's one tuning surface. A budget
// is a FIXED count of full weapon resolves ("sims"), never a clock:
// tierBudget = stay + 2 x moveEach + dirt, pinned to 300 / 1,500 / 4,000 by a
// test. Probe flights are a separate count, fixed by the grid and the hand.
// After launch, any change here changes the regenerated AI of a vs-AI replay:
// it is a simVersion bump (the AI pins make it loud).
export type AiTier = "rookie" | "veteran" | "ace";

export interface TierSpec {
  angleStep: number; // probe grid: facing degrees 0..90 in this step (a wall bouncer 0..180; a beam the whole dial 0..180)
  powerStep: number; // probe grid: powers powerStep..100 in this step (beams: one power)
  refineA: number; // refine box: +-refineA degrees around a centre, step 1 (0 with refineP 0: no box, a centre is one cell)
  refineP: number; // refine box: +-refineP power, step 1 (beams: the angle only)
  stay: number; // sims from where the tank stands: each weapon in hand gets stay / max(BUDGET_HAND, hand size)
  moveEach: number; // sims from each legal moved position (0 = the tier never moves)
  movers: number; // the best stationary weapons re-searched from a moved position, sharing moveEach
  moveBelow: number; // look at moves only while the best stationary value is below this many points (MOVE_ALWAYS: always)
  moveGain: number; // a move must beat staying by at least this many points
  dirt: number; // sims for the DIRT decision (0 = the tier never defends)
  noiseA: number; // aim noise: a sum of 3 uniform integers within +-noiseA degrees (noise.ts)
  noiseP: number; // power noise, within +-noiseP
  noiseAware: boolean; // rank aims by their expected value under this tier's own noise (else by the value at the exact aim)
  pickTop: number; // weapon choice: uniform among the pickTop best weapons (1 = the best)
  draftTop: number; // draft: uniform among the draftTop available weapons with the highest roster power
  saveTier3: boolean; // fire a tier-3 weapon only when it beats the best other weapon by >= 20%
}

/** A moveBelow that every value is below: moves are always considered. */
export const MOVE_ALWAYS = 1 << 30;

export const TIERS: Readonly<Record<AiTier, TierSpec>> = Object.freeze({
  rookie: Object.freeze({
    angleStep: 5, powerStep: 10, refineA: 0, refineP: 0, stay: 300, moveEach: 0, movers: 0, moveBelow: 0, moveGain: 0,
    dirt: 0, noiseA: 6, noiseP: 8, noiseAware: false, pickTop: 4, draftTop: 8, saveTier3: false,
  }),
  veteran: Object.freeze({
    angleStep: 2, powerStep: 4, refineA: 2, refineP: 4, stay: 1200, moveEach: 150, movers: 1, moveBelow: 25, moveGain: 8,
    dirt: 0, noiseA: 2, noiseP: 3, noiseAware: false, pickTop: 1, draftTop: 3, saveTier3: false,
  }),
  ace: Object.freeze({
    angleStep: 1, powerStep: 2, refineA: 1, refineP: 2, stay: 3000, moveEach: 350, movers: 1, moveBelow: MOVE_ALWAYS, moveGain: 8,
    dirt: 300, noiseA: 1, noiseP: 1, noiseAware: true, pickTop: 1, draftTop: 1, saveTier3: true,
  }),
});

/** A tier's worst-case sims per turn: the stationary search, both move sides and the DIRT decision (spec §5: 300 / 1,500 / 4,000). */
export const tierBudget = (t: TierSpec): number => t.stay + 2 * t.moveEach + t.dirt;

// --- shared AI constants (spec §5)
export const BUDGET_HAND = 10; // stay is split into this many equal weapon shares at least (STANDARD hands hold 10): a smaller hand spends less
export const DIRT_THREAT = 60; // Ace considers DIRT when the enemy's estimated best reply to its planned shot is at least this
export const DIRT_GAIN = 20; // ... and fires DIRT when a build cuts that estimate by at least this many points
export const DIRT_FRONT = 90; // a DIRT placement: this many px in front of the AI's tank (the other is midway to the enemy)
export const THREAT_AIMS = 2; // the enemy's reply estimate: each enemy weapon at its THREAT_AIMS nearest probe aims on Rookie's grid
export const BEAM_POWER = 50; // the power an AI beam command carries (beams ignore power)
