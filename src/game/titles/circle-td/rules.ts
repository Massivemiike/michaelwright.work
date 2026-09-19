// src/game/titles/circle-td/rules.ts
//
// First slice of the rules module: wave spawning and creep movement.
// Targeting/firing (Task 9) and the top-level makeSimState/tick loop
// (Task 10) are deliberately not here.
import type { Fx } from "@/game/sim/types";
import { fromFloat, fromInt, mul } from "@/game/sim/math/fixed";
import type { SimState } from "@/game/sim/state";
import { addCreep, CREEP_FAST } from "@/game/sim/state";
import { WAVE_SIZE } from "./content";
import { hp, waveFlags, typeMul } from "./balance";

export const CREEP_SPEED: Fx = fromFloat(1.2); // px/tick, INVENTED
export const FAST_MULT: Fx = fromFloat(1.8);   // INVENTED

export const spawnWave = (s: SimState): void => {
  s.wave += 1;
  const o = { offFast: s.offsetFast, offAir: s.offsetAir, offHard: s.offsetHard };
  const flags = waveFlags(s.wave, o.offFast, o.offAir, o.offHard);
  const baseHp = hp(s.wave) * typeMul(s.wave, o);
  const half = WAVE_SIZE / 2;
  const spacing = fromInt(24); // INVENTED stagger between creeps in a group
  for (let k = 0; k < WAVE_SIZE; k++) {
    const entrance = k < half ? 0 : 1;
    const idxInGroup = entrance === 0 ? k : k - half;
    addCreep(s.creeps, {
      id: s.nextId++,
      dist: -mul(spacing, fromInt(idxInGroup)),
      hp: baseHp, maxHp: baseHp,
      speed: CREEP_SPEED, flags, entrance,
    });
  }
};

export const moveCreeps = (s: SimState): void => {
  const c = s.creeps;
  for (let i = 0; i < c.count; i++) {
    let sp = (c.flags[i] & CREEP_FAST) ? mul(c.speed[i], FAST_MULT) : c.speed[i];
    if (c.slowTicks[i] > 0) {
      sp = Math.trunc(sp * (100 - c.slowPct[i]) / 100);
      c.slowTicks[i] -= 1;
    }
    c.dist[i] += sp;
  }
};
