import type { Fx } from "./types";
import type { Rng } from "./math/rng";

export const MAX_CREEPS = 512;
export const MAX_TOWERS = 2048;
export const MAX_PROJECTILES = 0;

export const CREEP_FAST = 1;
export const CREEP_AIR = 2;
export const CREEP_HARD = 4;

export interface Creeps {
  count: number;
  id: Int32Array; dist: Int32Array; hp: Int32Array; maxHp: Int32Array;
  speed: Int32Array; flags: Int32Array; entrance: Int32Array;
  slowTicks: Int32Array; slowPct: Int32Array;
}

export interface Towers {
  count: number;
  type: Int32Array; tile: Int32Array; level: Int32Array;
  cooldown: Int32Array; targetId: Int32Array;
}

export interface SimState {
  tick: number;
  rng: Rng;
  bank: number; score: number; wave: number;
  aliveCap: number; gameOver: boolean;
  nextId: number;
  offsetFast: number; offsetAir: number; offsetHard: number;
  gamma: number; alphaBp: number;
  creeps: Creeps; towers: Towers;
}

export const makeCreeps = (): Creeps => ({
  count: 0,
  id: new Int32Array(MAX_CREEPS), dist: new Int32Array(MAX_CREEPS),
  hp: new Int32Array(MAX_CREEPS), maxHp: new Int32Array(MAX_CREEPS),
  speed: new Int32Array(MAX_CREEPS), flags: new Int32Array(MAX_CREEPS),
  entrance: new Int32Array(MAX_CREEPS),
  slowTicks: new Int32Array(MAX_CREEPS), slowPct: new Int32Array(MAX_CREEPS),
});

export const makeTowers = (): Towers => ({
  count: 0,
  type: new Int32Array(MAX_TOWERS), tile: new Int32Array(MAX_TOWERS),
  level: new Int32Array(MAX_TOWERS), cooldown: new Int32Array(MAX_TOWERS),
  targetId: new Int32Array(MAX_TOWERS),
});

interface CreepInit {
  id: number; dist: Fx; hp: number; maxHp: number;
  speed: Fx; flags: number; entrance: number;
}

export const addCreep = (c: Creeps, f: CreepInit): number => {
  if (c.count >= MAX_CREEPS) return -1;
  const i = c.count++;
  c.id[i] = f.id; c.dist[i] = f.dist; c.hp[i] = f.hp; c.maxHp[i] = f.maxHp;
  c.speed[i] = f.speed; c.flags[i] = f.flags; c.entrance[i] = f.entrance;
  c.slowTicks[i] = 0; c.slowPct[i] = 0;
  return i;
};

export const removeCreep = (c: Creeps, slot: number): void => {
  const last = --c.count;
  if (slot !== last) {
    c.id[slot] = c.id[last]; c.dist[slot] = c.dist[last];
    c.hp[slot] = c.hp[last]; c.maxHp[slot] = c.maxHp[last];
    c.speed[slot] = c.speed[last]; c.flags[slot] = c.flags[last];
    c.entrance[slot] = c.entrance[last];
    c.slowTicks[slot] = c.slowTicks[last]; c.slowPct[slot] = c.slowPct[last];
  }
};

interface TowerInit { type: number; tile: number; level: number }

export const addTower = (t: Towers, f: TowerInit): number => {
  if (t.count >= MAX_TOWERS) return -1;
  const i = t.count++;
  t.type[i] = f.type; t.tile[i] = f.tile; t.level[i] = f.level;
  t.cooldown[i] = 0; t.targetId[i] = -1;
  return i;
};

export const removeTower = (t: Towers, slot: number): void => {
  const last = --t.count;
  if (slot !== last) {
    t.type[slot] = t.type[last]; t.tile[slot] = t.tile[last];
    t.level[slot] = t.level[last]; t.cooldown[slot] = t.cooldown[last];
    t.targetId[slot] = t.targetId[last];
  }
};
