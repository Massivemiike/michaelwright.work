// src/game/titles/circle-td/rules.ts
//
// Wave spawning, creep movement (Tasks 5/7), and targeting/damage/hitscan
// fire (Task 9). The top-level makeSimState/tick loop (Task 10) is
// deliberately not here.
import type { Fx } from "@/game/sim/types";
import { fromFloat, fromInt, mul } from "@/game/sim/math/fixed";
import type { Creeps, SimState } from "@/game/sim/state";
import { addCreep, CREEP_AIR, CREEP_FAST, removeCreep, MAX_CREEPS } from "@/game/sim/state";
import { TARGET_AIR, TARGET_LAND, TILES, TOWERS, TRACK, posAt, trackLength, WAVE_SIZE } from "./content";
import { bounty, hp, waveFlags, typeMul } from "./balance";

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
  const outerLen = trackLength(TRACK.outer);
  const innerLen = trackLength(TRACK.inner);
  for (let i = 0; i < c.count; i++) {
    let sp = (c.flags[i] & CREEP_FAST) ? mul(c.speed[i], FAST_MULT) : c.speed[i];
    if (c.slowTicks[i] > 0) {
      sp = Math.trunc(sp * (100 - c.slowPct[i]) / 100);
      c.slowTicks[i] -= 1;
    }
    // Wrap dist modulo the creep's track length each tick so it never
    // overflows Int32 over a long-lived run (controller ruling R10).
    // posAt() already mods by total length, so this is behavior-preserving
    // for position; it just keeps the stored value bounded forever.
    c.dist[i] = (c.dist[i] + sp) % (c.entrance[i] === 0 ? outerLen : innerLen);
  }
};

// --- Task 9: targeting, damage, and hitscan fire ---

// Non-authoritative render feed — the sim's own state (hp, bank, score,
// creep removal) is the source of truth; this is only for the renderer to
// draw a beam/flash without re-deriving what happened.
//
// Named `TowerHit` (final-review finding #6) — NOT `HitEvent` — to avoid
// colliding with the unrelated `HitEvent` already declared in
// src/game/runtime/render/Renderer.ts (a world-space x/y/kind struct the
// Canvas2D renderer consumes). The two are deliberately different shapes:
// this one is sim-space (tile index, tower type, creep id — everything a
// consumer needs to look up world position itself); GameClient.tsx is the
// one place that maps a TowerHit into a render-side HitEvent.
export interface TowerHit { towerType: number; tile: number; creepId: number; killed: boolean }

export const SLOW_DURATION_TICKS = 30; // INVENTED (1s at 30Hz)

export const towerDamage = (type: number, level: number): number =>
  TOWERS[type].dmg0 + level * TOWERS[type].dmgStep;

export const towerRangeSq = (type: number, level: number): Fx => {
  const r = TOWERS[type].range0 + level * TOWERS[type].rangeStep;
  return mul(r, r);
};

const creepPos = (c: Creeps, ci: number): { x: Fx; y: Fx } => {
  const poly = c.entrance[ci] === 0 ? TRACK.outer : TRACK.inner;
  return posAt(poly, c.dist[ci]);
};

const inTargetSet = (flags: number, targets: number): boolean => {
  const isAir = (flags & CREEP_AIR) !== 0;
  if (isAir) return (targets & TARGET_AIR) !== 0;
  return (targets & TARGET_LAND) !== 0;
};

// Per-tick creep world-position scratch (Fx / Q16.16). Rebuilt for [0,count)
// at the top of every fireTowers() call before any read, and kept in sync
// with the swap-with-last removals in the kill pass below, so a later
// tower's targeting never reads a stale position. Replaces the old
// O(towers×creeps) posAt() calls with O(creeps) per tick. fireTowers runs
// fully synchronously within a single tick (no await), so this shared
// buffer is never re-entered mid-run — safe for the one-run-at-a-time
// server verification path too.
const CREEP_PX = new Int32Array(MAX_CREEPS);
const CREEP_PY = new Int32Array(MAX_CREEPS);

export const fireTowers = (s: SimState): TowerHit[] => {
  const events: TowerHit[] = [];
  const c = s.creeps, t = s.towers;

  // Precompute every live creep's world position once this tick.
  for (let i = 0; i < c.count; i++) {
    const p = creepPos(c, i);
    CREEP_PX[i] = p.x; CREEP_PY[i] = p.y;
  }

  for (let ti = 0; ti < t.count; ti++) {
    if (t.cooldown[ti] > 0) { t.cooldown[ti] -= 1; continue; }

    const type = t.type[ti], level = t.level[ti];
    const def = TOWERS[type];
    const tx = TILES[t.tile[ti] * 2], ty = TILES[t.tile[ti] * 2 + 1];
    const rSq = towerRangeSq(type, level);

    // Leading (greatest wrapped dist, R10) valid in-range creep.
    let best = -1, bestDist = -1;
    for (let ci = 0; ci < c.count; ci++) {
      if (!inTargetSet(c.flags[ci], def.targets)) continue;
      const dx = CREEP_PX[ci] - tx, dy = CREEP_PY[ci] - ty;
      const dSq = mul(dx, dx) + mul(dy, dy);
      if (dSq <= rSq && c.dist[ci] > bestDist) { best = ci; bestDist = c.dist[ci]; }
    }
    if (best < 0) continue; // no target: does NOT go on cooldown

    t.cooldown[ti] = def.cooldownTicks;
    const primaryId = c.id[best];
    const ppx = CREEP_PX[best], ppy = CREEP_PY[best]; // BEFORE any removal

    const dmg = towerDamage(type, level);
    c.hp[best] -= dmg;

    if (def.splashRadius0 > 0) {
      const sr = def.splashRadius0 + level * def.splashStep;
      const srSq = mul(sr, sr);
      for (let k = 0; k < c.count; k++) {
        if (k === best) continue;
        if (!inTargetSet(c.flags[k], def.targets)) continue;
        const dx = CREEP_PX[k] - ppx, dy = CREEP_PY[k] - ppy;
        const dSq = mul(dx, dx) + mul(dy, dy);
        if (dSq <= srSq) c.hp[k] -= dmg; // full damage, no falloff — INVENTED
      }
    }

    if (def.slowPct.length > 0) {
      c.slowPct[best] = def.slowPct[level];
      c.slowTicks[best] = SLOW_DURATION_TICKS;
    }

    // Remove the dead and award bounty/score. The position cache is
    // swap-mirrored so it stays valid for the NEXT tower's targeting.
    let killed = false;
    for (let k = 0; k < c.count;) {
      if (c.hp[k] <= 0) {
        s.bank += bounty(c.maxHp[k], s.gamma, s.bountyCap);
        s.score += 2; // SOURCED: 2 points per kill
        if (c.id[k] === primaryId) killed = true;
        const last = c.count - 1;
        CREEP_PX[k] = CREEP_PX[last]; CREEP_PY[k] = CREEP_PY[last]; // mirror removeCreep's swap
        removeCreep(c, k);
      } else {
        k++;
      }
    }

    events.push({ towerType: type, tile: t.tile[ti], creepId: primaryId, killed });
  }

  return events;
};
