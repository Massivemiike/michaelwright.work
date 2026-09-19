// src/game/runtime/input/pointer.ts
//
// Pure pointer/keyboard input model for Circle TD (Task 6, Plan 2):
// world-space -> tile mapping plus an InputModel that turns player intent
// (place/upgrade/sell/select) into Commands applied through the SAME
// applyCommand path Plan 3's leaderboard replay verifies. Nothing here
// bypasses applyCommand with a bespoke mutation — what the player does and
// what gets verified are identical by construction.
//
// This file lives under src/game/runtime/** — outside the sim purity guard
// (src/game/sim/purity.test.ts only walks src/game/sim and
// src/game/titles/circle-td) — but it's kept free of DOM/canvas concerns
// anyway: it only reads SimState and content.ts's static geometry, so it's
// fully unit-testable with a plain `makeSim` (see pointer.test.ts), no
// React/browser involved. GameClient.tsx (Task 5/6/7) is what wires real
// PointerEvents/KeyboardEvents to these methods.
import { applyCommand, type Command } from "@/game/sim/replay";
import type { SimState } from "@/game/sim/state";
import { toFloat } from "@/game/sim/math/fixed";
import { TILE_COUNT, TILE_SIZE, TILES, TOWERS } from "@/game/titles/circle-td/content";

// A candidate must fall within half a tile's width of a tile's own centre
// to count as "on" that tile. content.ts's generator only guarantees
// adjacent tile centres are >= ~0.75*TILE_SIZE apart (MIN_TILE_SPACING,
// final-review finding #4) — a little under the full TILE_SIZE this
// HALF_TILE radius assumes — so for the closest-allowed pair (24-32px
// apart) a point in the sliver between them can fall within HALF_TILE of
// BOTH. That's a same-tile-or-nearest-neighbour ambiguity, never a miss
// into empty space: the loop below keeps updating `best` on ties (`<=`),
// so it resolves to whichever of the two is scanned last — always a real,
// valid tile, just not guaranteed to be the nearer one in that narrow edge
// case.
const HALF_TILE = TILE_SIZE / 2;
const RADIUS_SQ = HALF_TILE * HALF_TILE;

// World-space (stage-px, the same space RenderSnapshot and content.ts's
// geometry already live in) point -> tile index, or -1 when the point
// isn't within HALF_TILE of any tile's centre (off-board, on the path, or
// simply in empty space between tiles). Pure: no DOM, no sim state. Linear
// scan over TILE_COUNT (~223) is cheap enough to call on every pointermove.
export function tileAtWorld(wx: number, wy: number): number {
  let best = -1;
  let bestDistSq = RADIUS_SQ;
  for (let i = 0; i < TILE_COUNT; i++) {
    const dx = wx - toFloat(TILES[i * 2]);
    const dy = wy - toFloat(TILES[i * 2 + 1]);
    const d2 = dx * dx + dy * dy;
    if (d2 <= bestDistSq) {
      bestDistSq = d2;
      best = i;
    }
  }
  return best;
}

// Linear scan of the live tower list for the one occupying `tile`, or -1.
// Mirrors replay.ts's private findTowerByTile (not exported there) — kept
// as its own small copy here rather than reaching into replay.ts's
// internals, since GameClient needs this too (mapping a clicked tile to a
// RenderSnapshot tower index for the range-ring highlight).
export function towerIndexAtTile(state: SimState, tile: number): number {
  const t = state.towers;
  for (let i = 0; i < t.count; i++) {
    if (t.tile[i] === tile) return i;
  }
  return -1;
}

// Default palette selection until Task 7's palette UI sets a real one from
// player input — Damage (index 4), per the brief. Any out-of-range value
// passed to the constructor falls back to this rather than leaving
// selectedTowerType pointing at a nonexistent tower definition.
export const DEFAULT_TOWER_TYPE = 4;

const isValidTowerType = (type: number): boolean =>
  Number.isInteger(type) && type >= 0 && type < TOWERS.length;

export interface InputModelDeps {
  // A getter, not a raw SimState, so the model always reads/mutates
  // whatever state is CURRENTLY live — and so pointer.test.ts can hand it
  // a real `makeSim` state with no React/DOM involved at all.
  getState: () => SimState;
}

// Turns player intent into Commands run through applyCommand(state, cmd) —
// the exact function Plan 3's leaderboard replay verifier calls — and
// records only the commands that actually changed state (an unaffordable
// or occupied placement, an over-level upgrade, or a sell on an empty tile
// are all silent no-ops inside applyCommand itself; recording those too
// would make the input log diverge from "what actually happened," which is
// the log a replay needs to reproduce). Effectiveness is checked by
// re-reading SimState after the call, never assumed from the command's
// shape alone — the same state applyCommand just mutated is the single
// source of truth for whether it did anything.
export class InputModel {
  selectedTowerType: number;
  selectedTile: number = -1;
  readonly inputLog: Command[] = [];

  private readonly getState: () => SimState;

  constructor(deps: InputModelDeps, initialTowerType: number = DEFAULT_TOWER_TYPE) {
    this.getState = deps.getState;
    this.selectedTowerType = isValidTowerType(initialTowerType) ? initialTowerType : DEFAULT_TOWER_TYPE;
  }

  // Effective iff the tower count went up — true precisely when applyCommand
  // actually added one (occupied/unaffordable/invalid all leave count
  // unchanged, whether or not a tower already happened to sit there).
  place(tile: number): void {
    const state = this.getState();
    const countBefore = state.towers.count;
    const cmd: Command = { tick: state.tick, type: "place", tower: this.selectedTowerType, tile };
    applyCommand(state, cmd);
    if (state.towers.count > countBefore) {
      this.inputLog.push(cmd);
    }
  }

  // Effective iff the tile's own tower level rose — not just "a tower is
  // there," which would also be true (and unchanged) for a no-op upgrade
  // against an already-max-level or unaffordable tower.
  upgrade(tile: number): void {
    const state = this.getState();
    const before = towerIndexAtTile(state, tile);
    const levelBefore = before === -1 ? -1 : state.towers.level[before];
    const cmd: Command = { tick: state.tick, type: "upgrade", tile };
    applyCommand(state, cmd);
    const after = towerIndexAtTile(state, tile);
    if (after !== -1 && state.towers.level[after] > levelBefore) {
      this.inputLog.push(cmd);
    }
  }

  // Effective iff the tower count went down. Also clears selectedTile when
  // the tower just sold was the selected one — nothing left to show
  // upgrade/sell controls for.
  sell(tile: number): void {
    const state = this.getState();
    const countBefore = state.towers.count;
    const cmd: Command = { tick: state.tick, type: "sell", tile };
    applyCommand(state, cmd);
    if (state.towers.count < countBefore) {
      this.inputLog.push(cmd);
      if (this.selectedTile === tile) this.selectedTile = -1;
    }
  }

  // Palette selection — UI-only, never itself a Command (no sim state
  // changes just from choosing which tower type is armed).
  selectTower(type: number): void {
    if (isValidTowerType(type)) this.selectedTowerType = type;
  }

  // Marks a placed tower's tile as selected (for the upgrade/sell HUD) —
  // also UI-only.
  selectTile(tile: number): void {
    this.selectedTile = tile;
  }

  // Esc: deselect whatever placed tower was selected. Does not reset the
  // armed palette tower type — that's a persistent "current tool," not a
  // per-selection state.
  cancel(): void {
    this.selectedTile = -1;
  }
}
