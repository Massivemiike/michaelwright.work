import type { Fx } from "@/game/sim/types";
import { fromFloat, fromInt, mul, toInt } from "@/game/sim/math/fixed";
import { nextRange, type Rng } from "@/game/sim/math/rng";
import { CREEP_FAST, CREEP_AIR, CREEP_HARD } from "@/game/sim/state";
import { WAVE_SIZE } from "./content";

export const ALPHA: Fx = fromFloat(0.02); // INVENTED, tuned in Task 12
export const GAMMA = 400; // INVENTED
export const INTEREST_RATE_PCT = 5; // SOURCED

export const hp = (wave: number): number =>
  wave < 2 ? 8 : Math.floor(1.5 * wave * wave + 21.5 * wave - 16); // SOURCED

interface Offsets {
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
  waveFlags(wave, o.offFast, o.offAir, o.offHard) & CREEP_HARD ? 2 : 1; // SOURCED

export const totalWaveHp = (wave: number, o: Offsets): number =>
  WAVE_SIZE * hp(wave) * typeMul(wave, o);

export const interest = (bank: number, wave: number, o: Offsets): number => {
  const uncapped = Math.floor((bank * INTEREST_RATE_PCT) / 100);
  const cap = toInt(mul(ALPHA, fromInt(totalWaveHp(wave, o)))); // spec §5.2
  return Math.min(uncapped, cap);
};

export const bounty = (wave: number): number =>
  Math.max(1, Math.floor(hp(wave) / GAMMA)); // spec §5.2, INVENTED γ
