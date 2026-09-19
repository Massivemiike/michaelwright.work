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
  creepXY: Float32Array; // length 2*creepCount (world-space floats)
  creepId: Int32Array; // length creepCount — stable identity across frames
  creepHp01: Float32Array; // length creepCount — hp/maxHp clamped to [0,1]
  creepFlags: Int32Array; // length creepCount — CREEP_FAST|AIR|HARD bitmask
  towerCount: number;
  towerXY: Float32Array; // length 2*towerCount
  towerType: Int32Array; // length towerCount
  towerLevel: Int32Array; // length towerCount
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
  creepId: new Int32Array(creepCount),
  creepHp01: new Float32Array(creepCount),
  creepFlags: new Int32Array(creepCount),
  towerCount,
  towerXY: new Float32Array(towerCount * 2),
  towerType: new Int32Array(towerCount),
  towerLevel: new Int32Array(towerCount),
});
