// src/game/titles/circle-td/index.ts
//
// Title-specific sim assembly: config, state construction, the ordered
// per-tick loop, and the render-snapshot packer. The generic RenderSnapshot
// shape and allocator live in @/game/sim/engine (title-agnostic); this file
// is where posAt/TRACK/TILES/toFloat get used to fill one in, since that's
// all Circle-TD-specific geometry.
import { makeCreeps, makeTowers, type SimState } from "@/game/sim/state";
import { makeRng } from "@/game/sim/math/rng";
import { toFloat } from "@/game/sim/math/fixed";
import { makeRenderSnapshot, type RenderSnapshot } from "@/game/sim/engine";
import { START_BANK, ALIVE_CAP_NORMAL, WAVE_INTERVAL_TICKS, TRACK, posAt, TILES } from "./content";
import { deriveOffsets, interest, GAMMA, ALPHA_BP } from "./balance";
import { spawnWave, moveCreeps, fireTowers } from "./rules";

export interface SimConfig {
  seed: number;
  mode: "daily" | "free";
  balance?: { startBank?: number; gamma?: number; alphaBp?: number };
}

export interface CircleTdSim {
  state: SimState;
  tick(): void;
  snapshot(): RenderSnapshot;
}

export const makeSimState = (config: SimConfig): SimState => {
  const rng = makeRng(config.seed);
  const o = deriveOffsets(rng);
  const b = config.balance ?? {};
  return {
    tick: 0,
    rng,
    bank: b.startBank ?? START_BANK,
    score: 0,
    wave: 0,
    aliveCap: ALIVE_CAP_NORMAL,
    gameOver: false,
    nextId: 1,
    offsetFast: o.offFast,
    offsetAir: o.offAir,
    offsetHard: o.offHard,
    gamma: b.gamma ?? GAMMA,
    alphaBp: b.alphaBp ?? ALPHA_BP,
    creeps: makeCreeps(),
    towers: makeTowers(),
  };
};

// tickOnce order (fixed, do not reorder):
//   1. if gameOver, no-op
//   2. on a wave-interval tick: apply interest for the wave about to spawn
//      (wave+1, before spawnWave increments s.wave), then spawnWave
//   3. moveCreeps
//   4. fireTowers
//   5. population-cap lose check
//   6. advance tick counter
const tickOnce = (s: SimState): void => {
  if (s.gameOver) return;

  if (s.tick % WAVE_INTERVAL_TICKS === 0) {
    const o = { offFast: s.offsetFast, offAir: s.offsetAir, offHard: s.offsetHard };
    s.bank += interest(s.bank, s.wave + 1, o, s.alphaBp);
    spawnWave(s);
  }

  moveCreeps(s);
  fireTowers(s);

  if (s.creeps.count >= s.aliveCap) s.gameOver = true;

  s.tick += 1;
};

const packSnapshot = (s: SimState): RenderSnapshot => {
  const c = s.creeps;
  const t = s.towers;
  const snap = makeRenderSnapshot(c.count, t.count);
  snap.tick = s.tick;
  snap.bank = s.bank;
  snap.score = s.score;
  snap.wave = s.wave;
  snap.gameOver = s.gameOver;

  for (let i = 0; i < c.count; i++) {
    const poly = c.entrance[i] === 0 ? TRACK.outer : TRACK.inner;
    const p = posAt(poly, c.dist[i]);
    snap.creepXY[i * 2] = toFloat(p.x);
    snap.creepXY[i * 2 + 1] = toFloat(p.y);
  }

  for (let i = 0; i < t.count; i++) {
    const tile = t.tile[i];
    snap.towerXY[i * 2] = toFloat(TILES[tile * 2]);
    snap.towerXY[i * 2 + 1] = toFloat(TILES[tile * 2 + 1]);
  }

  return snap;
};

export const makeSim = (config: SimConfig): CircleTdSim => {
  const state = makeSimState(config);
  return {
    state,
    tick: () => tickOnce(state),
    snapshot: () => packSnapshot(state),
  };
};
