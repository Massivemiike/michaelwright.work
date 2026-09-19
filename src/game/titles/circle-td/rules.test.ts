// src/game/titles/circle-td/rules.test.ts
import { describe, it, expect } from "vitest";
import { makeCreeps, makeTowers, CREEP_FAST, type SimState } from "@/game/sim/state";
import { makeRng } from "@/game/sim/math/rng";
import { spawnWave, moveCreeps } from "./rules";
import { WAVE_SIZE, START_BANK, ALIVE_CAP_NORMAL, TRACK, trackLength } from "./content";
import { deriveOffsets } from "./balance";

// Local test helper — Task 10's makeSimState()/index.ts doesn't exist yet,
// so build a SimState directly from the Task 5/7 primitives this task
// actually depends on.
function makeTestState(seed = 1): SimState {
  const rng = makeRng(seed);
  const o = deriveOffsets(rng);
  return {
    tick: 0, rng, bank: START_BANK, score: 0, wave: 0,
    aliveCap: ALIVE_CAP_NORMAL, gameOver: false, nextId: 1,
    offsetFast: o.offFast, offsetAir: o.offAir, offsetHard: o.offHard,
    creeps: makeCreeps(), towers: makeTowers(),
  };
}

describe("spawn + movement", () => {
  it("spawns a full wave split across entrances", () => {
    const s = makeTestState(1);
    spawnWave(s);
    expect(s.creeps.count).toBe(WAVE_SIZE);
    const outer = [...s.creeps.entrance.slice(0, WAVE_SIZE)].filter((e) => e === 0).length;
    expect(outer).toBe(WAVE_SIZE / 2);
  });

  it("moves creeps forward along the track", () => {
    const s = makeTestState(1);
    spawnWave(s);
    const before = s.creeps.dist[0];
    moveCreeps(s);
    expect(s.creeps.dist[0]).toBeGreaterThan(before);
  });

  it("increments wave and assigns sequential ids on spawn", () => {
    const s = makeTestState(1);
    spawnWave(s);
    expect(s.wave).toBe(1);
    expect(s.creeps.id[0]).toBe(1);
    expect(s.creeps.id[WAVE_SIZE - 1]).toBe(WAVE_SIZE);
    expect(s.nextId).toBe(WAVE_SIZE + 1);
  });

  it("stages entrance-0 creeps at or before 0 distance, in strictly decreasing stagger order", () => {
    const s = makeTestState(1);
    spawnWave(s);
    const half = WAVE_SIZE / 2;
    for (let k = 0; k < half; k++) {
      expect(s.creeps.dist[k]).toBeLessThanOrEqual(0);
      if (k > 0) expect(s.creeps.dist[k]).toBeLessThan(s.creeps.dist[k - 1]);
    }
  });

  it("does not remove creeps on movement (looping track)", () => {
    const s = makeTestState(1);
    spawnWave(s);
    const countBefore = s.creeps.count;
    for (let i = 0; i < 1000; i++) moveCreeps(s);
    expect(s.creeps.count).toBe(countBefore);
  });

  it("keeps dist bounded well inside Int32 forever (wraps modulo track length, R10)", () => {
    const s = makeTestState(1);
    spawnWave(s);
    // Force at least one creep fast regardless of what this seed's wave
    // flags happen to be, so the larger effective speed (the faster path
    // to Int32 overflow pre-fix) is actually exercised.
    s.creeps.flags[0] |= CREEP_FAST;
    for (let i = 0; i < 30_000; i++) moveCreeps(s);
    const outerLen = trackLength(TRACK.outer);
    const innerLen = trackLength(TRACK.inner);
    for (let k = 0; k < s.creeps.count; k++) {
      const len = s.creeps.entrance[k] === 0 ? outerLen : innerLen;
      expect(Math.abs(s.creeps.dist[k])).toBeLessThan(len);
    }
  });
});
