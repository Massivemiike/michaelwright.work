// src/game/titles/circle-td/snapshot.ts
//
// Circle TD's renderer feed: the RenderSnapshot shape its renderers draw from
// and a small allocator for it. (Moved from src/game/sim/engine.ts when the
// engine was generalized for a second title.)

export interface RenderSnapshot {
  tick: number;
  bank: number;
  score: number;
  wave: number;
  gameOver: boolean;
  creepCount: number;
  // Final-review finding #3: the total LIVE creep population (on-track +
  // still-staged, i.e. SimState.creeps.count) — the figure the population-
  // cap lose condition (titles/circle-td/index.ts's tickOnce) actually
  // checks. `creepCount` above only counts on-track creeps (packSnapshot
  // excludes dist<0 staged ones so the renderer never draws them at a
  // wrapped mid-track position), so a HUD meter built off creepCount alone
  // undercounts against the real cap — sometimes badly, right after a wave
  // spawns and most of it is still staged. Unhashed (like every other
  // RenderSnapshot field): adding it must never move the golden determinism
  // hash, which is computed straight off SimState, not RenderSnapshot.
  creepAlive: number;
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
  towerCount: number,
  // Defaults to creepCount so every existing call site (tests, GameClient's
  // pre-mount placeholder) that only cares about on-track creeps keeps
  // working unchanged; packSnapshot (titles/circle-td/index.ts) is the one
  // real caller that passes the true, possibly-larger live population.
  creepAlive: number = creepCount
): RenderSnapshot => ({
  tick: 0,
  bank: 0,
  score: 0,
  wave: 0,
  gameOver: false,
  creepCount,
  creepAlive,
  creepXY: new Float32Array(creepCount * 2),
  creepId: new Int32Array(creepCount),
  creepHp01: new Float32Array(creepCount),
  creepFlags: new Int32Array(creepCount),
  towerCount,
  towerXY: new Float32Array(towerCount * 2),
  towerType: new Int32Array(towerCount),
  towerLevel: new Int32Array(towerCount),
});
