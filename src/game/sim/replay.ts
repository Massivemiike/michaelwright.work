// src/game/sim/replay.ts
//
// Command/replay format, applyCommand (the pure state-mutation half of a
// replay), runReplay (constructs a sim and drives it through a scripted
// command set), and hashState (a canonical FNV-1a digest over the sim's
// integer fields — the basis of the golden determinism gate). Every export
// here must stay pure per the purity guard: integer math and deterministic
// RNG only — no non-deterministic time/randomness sources, no host globals,
// no filesystem access.
import { makeSim } from "@/game/titles/circle-td";
import { TOWERS, SELL_REFUND_PCT } from "@/game/titles/circle-td/content";
import { addTower, removeTower, type SimState, type Towers } from "./state";

export interface Command {
  tick: number;
  type: "start" | "place" | "upgrade" | "sell";
  tower?: number;
  tile?: number;
}

export interface Replay {
  seed: number;
  simVersion: number;
  mode: "daily" | "free";
  commands: Command[];
}

// Ruling R11: upgrade/invest cost is integer-only. 1 + 0.05*level ==
// (20 + level) / 20, computed as Math.floor(cost * (20 + level) / 20) — a
// float 0.05 multiplier would drift across JS engines and break the
// cross-engine determinism the golden gate exists to catch.
const upgradeCost = (baseCost: number, level: number): number =>
  Math.floor((baseCost * (20 + level)) / 20);

// base cost + the floor-summed cost of every upgrade step 0..level-1.
export const totalInvested = (type: number, level: number): number => {
  const base = TOWERS[type].cost;
  let total = base;
  for (let l = 0; l < level; l++) total += upgradeCost(base, l);
  return total;
};

const findTowerByTile = (t: Towers, tile: number): number => {
  for (let i = 0; i < t.count; i++) {
    if (t.tile[i] === tile) return i;
  }
  return -1;
};

// Every invalid action is a silent no-op — never throw. A replay is a
// scripted log of player intent; a command that no longer makes sense
// against the current state (occupied tile, unaffordable, missing tower)
// simply does nothing, the same way it would if a human clicked a disabled
// button.
export const applyCommand = (s: SimState, cmd: Command): void => {
  switch (cmd.type) {
    case "start":
      // Waves auto-start at tick 0 in Plan 1; nothing to do.
      return;

    case "place": {
      const type = cmd.tower;
      const tile = cmd.tile;
      if (type === undefined || tile === undefined) return;
      const def = TOWERS[type];
      if (!def) return;
      if (findTowerByTile(s.towers, tile) !== -1) return; // occupied
      const cost = def.cost;
      if (s.bank < cost) return;
      s.bank -= cost;
      addTower(s.towers, { type, tile, level: 0 });
      return;
    }

    case "upgrade": {
      const tile = cmd.tile;
      if (tile === undefined) return;
      const i = findTowerByTile(s.towers, tile);
      if (i === -1) return;
      const level = s.towers.level[i];
      if (level >= 9) return;
      const type = s.towers.type[i];
      const cost = upgradeCost(TOWERS[type].cost, level);
      if (s.bank < cost) return;
      s.bank -= cost;
      s.towers.level[i] = level + 1;
      return;
    }

    case "sell": {
      const tile = cmd.tile;
      if (tile === undefined) return;
      const i = findTowerByTile(s.towers, tile);
      if (i === -1) return;
      const refund = Math.floor(
        (totalInvested(s.towers.type[i], s.towers.level[i]) * SELL_REFUND_PCT) / 100
      );
      s.bank += refund;
      removeTower(s.towers, i);
      return;
    }
  }
};

const groupByTick = (commands: readonly Command[]): Map<number, Command[]> => {
  const byTick = new Map<number, Command[]>();
  for (const cmd of commands) {
    const bucket = byTick.get(cmd.tick);
    if (bucket) bucket.push(cmd);
    else byTick.set(cmd.tick, [cmd]);
  }
  return byTick;
};

// Hard ceiling so a malformed replay (or a bug that clears gameOver) can't
// spin forever.
const CEILING = 5_000_000;

export const runReplay = (replay: Replay): { score: number; wave: number; hash: string } => {
  const sim = makeSim({ seed: replay.seed, mode: replay.mode });
  const byTick = groupByTick(replay.commands);

  while (!sim.state.gameOver && sim.state.tick < CEILING) {
    const cmds = byTick.get(sim.state.tick) || [];
    for (const c of cmds) applyCommand(sim.state, c);
    sim.tick();
  }

  return { score: sim.state.score, wave: sim.state.wave, hash: hashState(sim.state) };
};

// FNV-1a (32-bit), folded 8 bits at a time over each field's little-endian
// bytes. Pure integer ops only (|0, >>>, Math.imul) so it hashes identically
// across JS engines.
function fold(h: number, x: number): number {
  x = x | 0;
  for (let b = 0; b < 4; b++) {
    h ^= (x >>> (b * 8)) & 0xff;
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function hashState(s: SimState): string {
  let h = 0x811c9dc5;
  for (const v of [
    s.tick,
    s.bank,
    s.score,
    s.wave,
    s.gameOver ? 1 : 0,
    s.rng.state,
    s.nextId,
    s.offsetFast,
    s.offsetAir,
    s.offsetHard,
    s.creeps.count,
    s.towers.count,
  ])
    h = fold(h, v);

  const c = s.creeps;
  for (let i = 0; i < c.count; i++)
    for (const col of [c.id, c.dist, c.hp, c.maxHp, c.speed, c.flags, c.entrance, c.slowTicks, c.slowPct])
      h = fold(h, col[i]);

  const t = s.towers;
  for (let i = 0; i < t.count; i++)
    for (const col of [t.type, t.tile, t.level, t.cooldown, t.targetId]) h = fold(h, col[i]);

  return (h >>> 0).toString(16).padStart(8, "0");
}
