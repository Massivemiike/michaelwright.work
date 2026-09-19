// src/game/sim/engine.ts
//
// Generic, title-agnostic sim-engine plumbing. This file must never import
// from src/game/titles/** — it only defines the shape a title's renderer
// feed takes and a small allocator for it.

export interface RenderSnapshot {
  tick: number;
  bank: number;
  score: number;
  wave: number;
  gameOver: boolean;
  creepCount: number;
  creepXY: Float32Array; // length 2*creepCount (screen-space floats)
  towerCount: number;
  towerXY: Float32Array; // length 2*towerCount
}

export const makeRenderSnapshot = (
  creepCount: number,
  towerCount: number
): RenderSnapshot => ({
  tick: 0,
  bank: 0,
  score: 0,
  wave: 0,
  gameOver: false,
  creepCount,
  creepXY: new Float32Array(creepCount * 2),
  towerCount,
  towerXY: new Float32Array(towerCount * 2),
});
