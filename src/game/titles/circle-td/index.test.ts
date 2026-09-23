// src/game/titles/circle-td/index.test.ts
import { describe, it, expect } from "vitest";
import { makeSim } from "./index";
import { START_BANK, TILES, posAt, TRACK } from "./content";
import { towerRangeSq } from "./rules";
import { addCreep, addTower } from "@/game/titles/circle-td/state";
import { fromInt, mul } from "@/game/sim/math/fixed";

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

describe("RenderSnapshot.creepAlive (final-review finding #3)", () => {
  it("always equals SimState.creeps.count exactly (the real population-cap figure)", () => {
    const sim = makeSim({ seed: 5, mode: "free" });
    sim.tick(); // triggers spawnWave at tick 0 — most of the wave starts staged (dist < 0)
    const snap = sim.snapshot();
    expect(snap.creepAlive).toBe(sim.state.creeps.count);
  });

  it("exceeds the on-track creepCount right after a wave spawns (staged creeps aren't drawn but ARE alive)", () => {
    const sim = makeSim({ seed: 5, mode: "free" });
    sim.tick();
    const snap = sim.snapshot();
    expect(snap.creepAlive).toBeGreaterThan(snap.creepCount);
  });

  it("is 0 before any wave has spawned (matches the empty on-track creepCount)", () => {
    const sim = makeSim({ seed: 6, mode: "free" });
    const snap = sim.snapshot(); // tick 0, before tick() has run — no creeps at all yet
    expect(snap.creepAlive).toBe(0);
    expect(snap.creepAlive).toBe(snap.creepCount);
  });
});

describe("tick() hit feed (final-review finding #6)", () => {
  // Mirrors rules.test.ts's own in-range-tile scan (fireTowers is already
  // covered there in isolation) — this test's job is only to prove the
  // hits fireTowers() computes actually SURVIVE the trip back out of
  // CircleTdSim.tick(), which previously discarded them entirely.
  function findInRangeTile(p: { x: number; y: number }, rSq: number): number {
    for (let i = 0; i < TILES.length / 2; i++) {
      const dx = TILES[i * 2] - p.x;
      const dy = TILES[i * 2 + 1] - p.y;
      if (mul(dx, dx) + mul(dy, dy) <= rSq) return i;
    }
    return -1;
  }

  it("returns a non-empty TowerHit list (with a real kill) when a tower has a target in range", () => {
    const sim = makeSim({ seed: 42, mode: "free" });
    // dist=50 (not 0): this same tick() call also triggers tick-0's
    // spawnWave, whose entrance-0 creeps start at dist<=0 — fireTowers
    // targets the LEADING (greatest dist) in-range creep, so parking ours
    // well ahead of every freshly-staged wave creep guarantees it (not one
    // of the 30 wave creeps that might incidentally also land in range) is
    // the one actually picked and killed.
    const dist = fromInt(50);
    const p = posAt(TRACK.outer, dist);
    const tile = findInRangeTile(p, towerRangeSq(4, 0)); // Damage tower, L0
    expect(tile).toBeGreaterThanOrEqual(0);
    addTower(sim.state.towers, { type: 4, tile, level: 0 });
    addCreep(sim.state.creeps, { id: 9999, dist, hp: 5, maxHp: 5, speed: fromInt(1), flags: 0, entrance: 0 });

    const hits = sim.tick();

    const hit = hits.find((h) => h.creepId === 9999);
    expect(hit).toBeDefined();
    expect(hit).toEqual({ towerType: 4, tile, creepId: 9999, killed: true });
  });

  it("returns an empty array once the game is already over (tick is a no-op)", () => {
    const sim = makeSim({ seed: 1, mode: "free" });
    sim.state.gameOver = true;
    expect(sim.tick()).toEqual([]);
  });

  it("returns an empty array on a tick where fireTowers found no target (no towers placed at all)", () => {
    const sim = makeSim({ seed: 2, mode: "free" });
    // No towers exist, so fireTowers has nothing to iterate regardless of
    // how many creeps this tick's wave spawn adds — a clean, geometry-
    // independent way to exercise the "no hits" path through the real
    // tick() -> tickOnce -> fireTowers chain.
    const hits = sim.tick();
    expect(hits).toEqual([]);
  });
});
