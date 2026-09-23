// src/game/titles/circle-td/rules.test.ts
import { describe, it, expect } from "vitest";
import {
  makeCreeps, makeTowers, addCreep, addTower, CREEP_FAST, CREEP_AIR,
  type SimState,
} from "@/game/titles/circle-td/state";
import { makeRng } from "@/game/sim/math/rng";
import { fromInt, mul } from "@/game/sim/math/fixed";
import { spawnWave, moveCreeps, fireTowers, towerDamage, towerRangeSq, SLOW_DURATION_TICKS } from "./rules";
import {
  WAVE_SIZE, START_BANK, ALIVE_CAP_NORMAL, TRACK, trackLength,
  TOWERS, TILES, TILE_COUNT, posAt,
} from "./content";
import { deriveOffsets, bounty, GAMMA, ALPHA_BP, BOUNTY_CAP } from "./balance";

// Scans TILES for the first index within rSq (squared range, Fx) of point p.
// Returns -1 if none found — callers assert a match was found rather than
// assuming any particular tile index is in range (geometry is INVENTED and
// may change under Plan 2).
function findInRangeTile(p: { x: number; y: number }, rSq: number): number {
  for (let i = 0; i < TILE_COUNT; i++) {
    const dx = TILES[i * 2] - p.x, dy = TILES[i * 2 + 1] - p.y;
    if (mul(dx, dx) + mul(dy, dy) <= rSq) return i;
  }
  return -1;
}

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
    gamma: GAMMA, alphaBp: ALPHA_BP, bountyCap: BOUNTY_CAP,
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

describe("targeting, damage, hitscan fire", () => {
  it("a Damage tower (type 4) in range kills a low-hp creep, awarding bank + score by the creep's own maxHp", () => {
    const s = makeTestState(1);
    const dist = 0;
    const p = posAt(TRACK.outer, dist);
    addCreep(s.creeps, { id: 1, dist, hp: 5, maxHp: 5, speed: fromInt(1), flags: 0, entrance: 0 });

    const rSq = towerRangeSq(4, 0);
    const tile = findInRangeTile(p, rSq);
    expect(tile).toBeGreaterThanOrEqual(0);
    addTower(s.towers, { type: 4, tile, level: 0 });

    const bankBefore = s.bank;
    const scoreBefore = s.score;
    const countBefore = s.creeps.count;

    const hits = fireTowers(s);

    expect(hits.length).toBe(1);
    expect(hits[0]).toEqual({ towerType: 4, tile, creepId: 1, killed: true });
    expect(s.creeps.count).toBe(countBefore - 1);
    // Task 3: bounty pays by the killed creep's own maxHp (5), not s.wave —
    // s.wave is left at its default (0) here specifically to prove that.
    expect(s.wave).toBe(0);
    expect(s.bank).toBe(bankBefore + bounty(5));
    expect(s.score).toBe(scoreBefore + 2);
  });

  it("bounty is wave-independent, ~2x for a Hard creep in the uncapped range, and flattened by BOUNTY_CAP", () => {
    const s1 = makeTestState(10);
    s1.wave = 1;
    const p1 = posAt(TRACK.outer, 0);
    addCreep(s1.creeps, { id: 1, dist: 0, hp: 100, maxHp: 100, speed: fromInt(1), flags: 0, entrance: 0 });
    const tile1 = findInRangeTile(p1, towerRangeSq(4, 0));
    addTower(s1.towers, { type: 4, tile: tile1, level: 9 }); // one-shot regardless of wave
    const bank1Before = s1.bank;
    fireTowers(s1);
    const gained1 = s1.bank - bank1Before;

    const s2 = makeTestState(10);
    s2.wave = 500; // a huge current wave must not change the payout
    const p2 = posAt(TRACK.outer, 0);
    addCreep(s2.creeps, { id: 1, dist: 0, hp: 100, maxHp: 100, speed: fromInt(1), flags: 0, entrance: 0 });
    const tile2 = findInRangeTile(p2, towerRangeSq(4, 0));
    addTower(s2.towers, { type: 4, tile: tile2, level: 9 });
    const bank2Before = s2.bank;
    fireTowers(s2);
    const gained2 = s2.bank - bank2Before;

    expect(gained2).toBe(gained1);
    expect(gained1).toBe(bounty(100));

    // In the UNCAPPED range (floor(maxHp/5) below BOUNTY_CAP), a Hard creep
    // (2x the maxHp of an otherwise-identical Normal) pays ~2x. gained1 above
    // is a maxHp=100 kill (bounty 20, still under the cap); a maxHp=50 kill
    // pays bounty 10 — half of it.
    const sHalf = makeTestState(10);
    addCreep(sHalf.creeps, { id: 1, dist: 0, hp: 50, maxHp: 50, speed: fromInt(1), flags: 0, entrance: 0 });
    addTower(sHalf.towers, { type: 4, tile: findInRangeTile(posAt(TRACK.outer, 0), towerRangeSq(4, 0)), level: 9 });
    const halfBefore = sHalf.bank;
    fireTowers(sHalf);
    const gainedHalf = sHalf.bank - halfBefore;
    expect(gainedHalf).toBe(bounty(50)); // 10
    expect(gained1).toBeCloseTo(gainedHalf * 2, -1); // 20 ≈ 2×10, both uncapped

    // The per-kill cap flattens the LATE game: a maxHp=200 creep pays the cap
    // (BOUNTY_CAP=25), NOT floor(200/5)=40 — so it is deliberately LESS than
    // 2× the maxHp=100 payout. This is the anti-glut behavior, still keyed to
    // the killed creep's own maxHp.
    const s3 = makeTestState(10);
    const p3 = posAt(TRACK.outer, 0);
    addCreep(s3.creeps, { id: 1, dist: 0, hp: 200, maxHp: 200, speed: fromInt(1), flags: 0, entrance: 0 });
    const tile3 = findInRangeTile(p3, towerRangeSq(4, 0));
    addTower(s3.towers, { type: 4, tile: tile3, level: 9 });
    const bank3Before = s3.bank;
    fireTowers(s3);
    const gained3 = s3.bank - bank3Before;
    expect(gained3).toBe(bounty(200));
    expect(gained3).toBe(BOUNTY_CAP); // capped
    expect(gained3).toBeLessThan(gained1 * 2); // 25 < 40: the cap bit
  });

  it("does not one-shot a high-hp creep, and damages it by exactly towerDamage()", () => {
    const s = makeTestState(1);
    const dist = 0;
    const p = posAt(TRACK.outer, dist);
    addCreep(s.creeps, { id: 1, dist, hp: 100_000, maxHp: 100_000, speed: fromInt(1), flags: 0, entrance: 0 });

    const rSq = towerRangeSq(4, 0);
    const tile = findInRangeTile(p, rSq);
    expect(tile).toBeGreaterThanOrEqual(0);
    addTower(s.towers, { type: 4, tile, level: 0 });

    const hits = fireTowers(s);
    expect(hits.length).toBe(1);
    expect(hits[0].killed).toBe(false);
    expect(s.creeps.hp[0]).toBe(100_000 - towerDamage(4, 0));
  });

  it("an Air-only tower (type 1) does not hit a land creep", () => {
    const s = makeTestState(2);
    const dist = 0;
    const p = posAt(TRACK.outer, dist);
    addCreep(s.creeps, { id: 1, dist, hp: 100, maxHp: 100, speed: fromInt(1), flags: 0, entrance: 0 }); // land

    const rSq = towerRangeSq(1, 0);
    const tile = findInRangeTile(p, rSq);
    expect(tile).toBeGreaterThanOrEqual(0);
    addTower(s.towers, { type: 1, tile, level: 0 });

    const hits = fireTowers(s);
    expect(hits.length).toBe(0);
    expect(s.creeps.hp[0]).toBe(100);
  });

  it("a Land-only tower (type 4, Damage) does not hit an air creep", () => {
    const s = makeTestState(3);
    const dist = 0;
    const p = posAt(TRACK.outer, dist);
    addCreep(s.creeps, { id: 1, dist, hp: 100, maxHp: 100, speed: fromInt(1), flags: CREEP_AIR, entrance: 0 });

    const rSq = towerRangeSq(4, 0);
    const tile = findInRangeTile(p, rSq);
    expect(tile).toBeGreaterThanOrEqual(0);
    addTower(s.towers, { type: 4, tile, level: 0 });

    const hits = fireTowers(s);
    expect(hits.length).toBe(0);
    expect(s.creeps.hp[0]).toBe(100);
  });

  it("sets a tower's cooldown after firing; a second immediate call does not re-fire it", () => {
    const s = makeTestState(4);
    const dist = 0;
    const p = posAt(TRACK.outer, dist);
    // High hp so the creep survives the first hit and is still in range for the second call.
    addCreep(s.creeps, { id: 1, dist, hp: 100_000, maxHp: 100_000, speed: fromInt(1), flags: 0, entrance: 0 });

    const rSq = towerRangeSq(4, 0);
    const tile = findInRangeTile(p, rSq);
    expect(tile).toBeGreaterThanOrEqual(0);
    addTower(s.towers, { type: 4, tile, level: 0 });

    const hits1 = fireTowers(s);
    expect(hits1.length).toBe(1);
    expect(s.towers.cooldown[0]).toBe(TOWERS[4].cooldownTicks);

    const hpAfterFirst = s.creeps.hp[0];
    const hits2 = fireTowers(s);
    expect(hits2.length).toBe(0); // on cooldown, does not fire again
    expect(s.creeps.hp[0]).toBe(hpAfterFirst); // untouched by the second call
    expect(s.towers.cooldown[0]).toBe(TOWERS[4].cooldownTicks - 1); // decremented, not reset
  });

  it("a tower with no in-range target does not go on cooldown", () => {
    const s = makeTestState(5);
    // No creeps at all — any tile is a valid placement, none can find a target.
    addTower(s.towers, { type: 4, tile: 0, level: 0 });
    const hits = fireTowers(s);
    expect(hits.length).toBe(0);
    expect(s.towers.cooldown[0]).toBe(0);
  });

  it("a Splash tower (type 3) damages a second creep clustered with the primary target", () => {
    const s = makeTestState(6);
    const dist = 0;
    const p = posAt(TRACK.outer, dist);
    // Two land creeps at the exact same position: primary is whichever the
    // targeting picks (tie broken by scan order, R10), the other must take
    // splash damage without being the primary.
    addCreep(s.creeps, { id: 1, dist, hp: 1000, maxHp: 1000, speed: fromInt(1), flags: 0, entrance: 0 });
    addCreep(s.creeps, { id: 2, dist, hp: 1000, maxHp: 1000, speed: fromInt(1), flags: 0, entrance: 0 });

    const rSq = towerRangeSq(3, 0);
    const tile = findInRangeTile(p, rSq);
    expect(tile).toBeGreaterThanOrEqual(0);
    addTower(s.towers, { type: 3, tile, level: 0 });

    const hits = fireTowers(s);
    expect(hits.length).toBe(1);
    expect(hits[0].creepId).toBe(1); // first creep scanned wins the dist tie

    const dmg = towerDamage(3, 0);
    expect(s.creeps.count).toBe(2); // neither died (hp 1000 >> dmg)
    // both creeps took the same full splash damage — order in the array is
    // unspecified after any removals, so check both slots took it.
    expect(s.creeps.hp[0]).toBe(1000 - dmg);
    expect(s.creeps.hp[1]).toBe(1000 - dmg);
  });

  it("a Slow tower (type 2) sets slowPct/slowTicks on the primary target only", () => {
    const s = makeTestState(7);
    const dist = 0;
    const p = posAt(TRACK.outer, dist);
    addCreep(s.creeps, { id: 1, dist, hp: 1000, maxHp: 1000, speed: fromInt(1), flags: 0, entrance: 0 });

    const rSq = towerRangeSq(2, 0);
    const tile = findInRangeTile(p, rSq);
    expect(tile).toBeGreaterThanOrEqual(0);
    addTower(s.towers, { type: 2, tile, level: 0 });

    const hits = fireTowers(s);
    expect(hits.length).toBe(1);
    expect(s.creeps.slowPct[0]).toBe(TOWERS[2].slowPct[0]);
    expect(s.creeps.slowTicks[0]).toBe(SLOW_DURATION_TICKS);
  });
});
