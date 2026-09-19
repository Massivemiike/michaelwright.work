import { nextRange, type Rng } from "@/game/sim/math/rng";
import { CREEP_FAST, CREEP_AIR, CREEP_HARD } from "@/game/sim/state";
import { WAVE_SIZE } from "./content";

export const ALPHA_BP = 200; // INVENTED — interest-cap coefficient in basis points (200 = 2% = 0.02). Re-confirmed unchanged by the real-geometry re-tune (2026-09-19; see docs/superpowers/2026-09-18-circle-td-balance-tuning.md "Real-geometry re-tune"): varying alphaBp alone did not move the outcome once startBank/gamma escaped the early wave-5 trap.
export const GAMMA = 5; // INVENTED — re-tuned 2026-09-19 for the real spiral geometry (content.ts) + the by-maxHp bounty fix together (was 20, tuned for Plan 1's placeholder geometry + the old by-wave bounty; see docs/superpowers/2026-09-18-circle-td-balance-tuning.md "Real-geometry re-tune"). The real geometry's flanking tiles give each tower much narrower path coverage than the placeholder's uniform grid did, so the same GAMMA that worked before now traps the economy at wave 5-9; GAMMA=5 escapes it and climbs to wave ~50-58 across seeds [20260918,1,2,3,4].
export const INTEREST_RATE_PCT = 5; // SOURCED

export const hp = (wave: number): number =>
  wave < 2 ? 8 : Math.floor(1.5 * wave * wave + 21.5 * wave - 16); // SOURCED

export interface Offsets {
  offFast: number;
  offAir: number;
  offHard: number;
}

export const deriveOffsets = (rng: Rng): Offsets => ({
  offFast: nextRange(rng, 5),
  offAir: nextRange(rng, 7),
  offHard: nextRange(rng, 9),
});

export const waveFlags = (
  wave: number,
  offFast: number,
  offAir: number,
  offHard: number
): number => {
  let f = 0;
  if ((wave + offFast) % 5 === 0) f |= CREEP_FAST;
  if ((wave + offAir) % 7 === 0) f |= CREEP_AIR;
  if ((wave + offHard) % 9 === 0) f |= CREEP_HARD;
  return f;
};

export const typeMul = (wave: number, o: Offsets): number =>
  (waveFlags(wave, o.offFast, o.offAir, o.offHard) & CREEP_HARD) ? 2 : 1; // SOURCED

export const totalWaveHp = (wave: number, o: Offsets): number =>
  WAVE_SIZE * hp(wave) * typeMul(wave, o);

export const interest = (bank: number, wave: number, o: Offsets, alphaBp: number = ALPHA_BP): number => {
  const uncapped = Math.floor((bank * INTEREST_RATE_PCT) / 100);
  const cap = Math.floor((totalWaveHp(wave, o) * alphaBp) / 10000); // spec §5.2: integer arithmetic, overflow-safe
  return Math.min(uncapped, cap);
};

// Bounty pays by the KILLED CREEP'S OWN maxHp, not the current wave (Task 3
// fix, final-review finding #6). The old bounty(wave,gamma) = hp(wave)/gamma
// let killing an old, weak, already-spawned creep late in the game pay a
// huge current-wave bonus (a gold exploit) and underpaid CREEP_HARD (2x
// maxHp via typeMul) kills, since hp(wave) never accounted for typeMul.
// Paying by the creep's own maxHp fixes both: a Hard creep now pays ~2x a
// Normal one from the same wave, and re-killing old creeps late can never
// pay more than their own (small) maxHp allows.
export const bounty = (maxHp: number, gamma: number = GAMMA): number =>
  Math.max(1, Math.floor(maxHp / gamma)); // spec §5.2, INVENTED γ
