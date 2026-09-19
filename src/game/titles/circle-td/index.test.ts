// src/game/titles/circle-td/index.test.ts
import { describe, it, expect } from "vitest";
import { makeSim } from "./index";
import { START_BANK } from "./content";

describe("Circle TD sim assembly", () => {
  it("starts with sourced bank and no towers", () => {
    const sim = makeSim({ seed: 42, mode: "daily" });
    expect(sim.state.bank).toBe(START_BANK);
    expect(sim.state.towers.count).toBe(0);
  });

  it("ends the game when the population cap is reached (no defence)", () => {
    const sim = makeSim({ seed: 42, mode: "daily" });
    let ticks = 0;
    while (!sim.state.gameOver && ticks < 200000) { sim.tick(); ticks++; }
    expect(sim.state.gameOver).toBe(true);
    expect(sim.state.creeps.count).toBeGreaterThanOrEqual(sim.state.aliveCap);
  });

  it("adds interest when a wave is sent", () => {
    const sim = makeSim({ seed: 42, mode: "daily" });
    const bank0 = sim.state.bank;
    // advance one wave interval
    for (let i = 0; i < 601; i++) sim.tick();
    expect(sim.state.bank).toBeGreaterThan(bank0); // 5% of START_BANK on wave 1
  });

  it("snapshot returns a RenderSnapshot with matching array lengths and finite coordinates", () => {
    const sim = makeSim({ seed: 42, mode: "daily" });
    for (let i = 0; i < 5; i++) sim.tick();
    const snap = sim.snapshot();
    expect(snap.creepXY.length).toBe(2 * snap.creepCount);
    expect(snap.towerXY.length).toBe(2 * snap.towerCount);
    for (let i = 0; i < snap.creepXY.length; i++) {
      expect(Number.isFinite(snap.creepXY[i])).toBe(true);
    }
    for (let i = 0; i < snap.towerXY.length; i++) {
      expect(Number.isFinite(snap.towerXY[i])).toBe(true);
    }
  });

  it("snapshot carries id/hp01/flags and tower type/level, and skips staged (dist<0) creeps", () => {
    const sim = makeSim({ seed: 7, mode: "free" });
    for (let i = 0; i < 30; i++) sim.tick(); // some creeps on-track, some may still be staged
    const s = sim.snapshot();
    expect(s.creepId.length).toBe(s.creepCount);
    expect(s.creepHp01.length).toBe(s.creepCount);
    expect(s.creepFlags.length).toBe(s.creepCount);
    expect(s.towerType.length).toBe(s.towerCount);
    expect(s.towerLevel.length).toBe(s.towerCount);
    for (let i = 0; i < s.creepCount; i++) {
      expect(s.creepHp01[i]).toBeGreaterThan(0);
      expect(s.creepHp01[i]).toBeLessThanOrEqual(1);
    }
    // every packed creep must be on-track (no NaN coords from a wrapped negative dist)
    for (let i = 0; i < s.creepCount * 2; i++) expect(Number.isFinite(s.creepXY[i])).toBe(true);
    // the sim's raw creep count includes staged (dist<0) creeps; the snapshot excludes them
    expect(s.creepCount).toBeLessThanOrEqual(sim.state.creeps.count);
  });
});
