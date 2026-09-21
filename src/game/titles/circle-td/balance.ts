import { nextRange, type Rng } from "@/game/sim/math/rng";
import { CREEP_FAST, CREEP_AIR, CREEP_HARD } from "@/game/sim/state";
import { WAVE_SIZE } from "./content";

export const ALPHA_BP = 110; // INVENTED — interest-cap coefficient in basis points (110 = 1.1% = 0.011). Lowered from 200 (2%) in the 2026-09-21 scarcity re-tune: at cap=25/alpha=200 the capped economy still peaked ~60k bank (owner playtest: 58k at wave 44, fast-only) — the interest cap (alpha * totalWaveHp, which grows quadratically with wave) was the dominant late income. 1.1% roughly halves per-wave interest so money stays scarce. See docs/superpowers/2026-09-18-circle-td-balance-tuning.md "Scarcity re-tune (2026-09-21)".
export const GAMMA = 5; // INVENTED — see BOUNTY_CAP below and docs/superpowers/2026-09-18-circle-td-balance-tuning.md. GAMMA alone can't balance the economy: bounty is proportional to the killed creep's maxHp, which spans ~8 (wave 1) to ~18,000 (late Hard) — any GAMMA stingy enough to avoid a late glut starves the early game into a wave-5 death, and any GAMMA generous enough to survive early (like this 5) pays ~20% of maxHp late. GAMMA=5 is kept for its (measured-good) EARLY payout; the late glut is bounded by BOUNTY_CAP.
export const BOUNTY_CAP = 17; // INVENTED — hard ceiling on per-kill bounty. Lowered from 25 in the 2026-09-21 scarcity re-tune. Keeps early payouts (small maxHp) untouched (floor(maxHp/5) stays under 17 until maxHp>85, ~wave 5) while flattening the late game so a single kill can never pay the old floor(18000/5)=3600 — the source of the original 3.19M-bank glut. Still a pure function of the KILLED creep's own maxHp, so the late-kill arbitrage the by-maxHp bounty fixed stays fixed. With WAVE_SIZE=30, cap=17 makes kill income ~510/wave (vs 750 at cap=25). Combined with ALPHA_BP=110, per-wave income at wave 44 drops from ~3,050 to ~1,100. See docs/superpowers/2026-09-18-circle-td-balance-tuning.md "Scarcity re-tune (2026-09-21)".
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
export const bounty = (maxHp: number, gamma: number = GAMMA, cap: number = BOUNTY_CAP): number =>
  Math.max(1, Math.min(cap, Math.floor(maxHp / gamma))); // spec §5.2, INVENTED γ + BOUNTY_CAP
