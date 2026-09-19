// src/game/sim/math/trig.ts
import type { Fx } from "../types";
import { fromFloat } from "./fixed";

export const ANGLE_STEPS = 4096;

// Built once at module load. Math.sin here is a table constant, never called
// during a tick, so it cannot introduce per-tick cross-engine drift.
const SIN: Int32Array = (() => {
  const t = new Int32Array(ANGLE_STEPS);
  for (let i = 0; i < ANGLE_STEPS; i++) {
    t[i] = fromFloat(Math.sin((i / ANGLE_STEPS) * 2 * Math.PI));
  }
  return t;
})();

const wrap = (i: number): number => ((i % ANGLE_STEPS) + ANGLE_STEPS) % ANGLE_STEPS;

export const sinFx = (i: number): Fx => SIN[wrap(i)];
export const cosFx = (i: number): Fx => SIN[wrap(i + ANGLE_STEPS / 4)];
