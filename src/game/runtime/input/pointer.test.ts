// src/game/runtime/input/pointer.test.ts
//
// Node-env tests (no DOM needed — pointer.ts is pure logic plus the
// applyCommand path already tested by replay.test.ts). This file is the
// RED step: it's written against pointer.ts before that module exists.
import { describe, it, expect } from "vitest";
import { makeSim } from "@/game/titles/circle-td";
import { TOWERS, TRACK, TILES, TILE_COUNT } from "@/game/titles/circle-td/content";
import { toFloat } from "@/game/sim/math/fixed";
import { InputModel, tileAtWorld, towerIndexAtTile } from "./pointer";

describe("tileAtWorld", () => {
  it("returns the tile index for a point at a known tile's centre", () => {
    // Any in-range index works — this exercises the Fx->float conversion
    // and the within-radius match, not a specific tile's geometry.
    const idx = 5;
    const wx = toFloat(TILES[idx * 2]);
    const wy = toFloat(TILES[idx * 2 + 1]);
    expect(tileAtWorld(wx, wy)).toBe(idx);
  });

  it("returns -1 for a point far off the board", () => {
    expect(tileAtWorld(-5000, -5000)).toBe(-1);
  });

  it("returns -1 for a point on the path (tile centres sit a full flank offset away)", () => {
    // TRACK.outer's first vertex is a point ON the path's centreline —
    // content.ts's own tile generator keeps every tile centre at least
    // TILE_SIZE (the flank offset) away from any segment, well outside
    // tileAtWorld's TILE_SIZE/2 search radius.
    const px = toFloat(TRACK.outer[0]);
    const py = toFloat(TRACK.outer[1]);
    expect(tileAtWorld(px, py)).toBe(-1);
  });
});

describe("InputModel", () => {
  const TILE = 10; // arbitrary valid, empty tile (mirrors replay.test.ts's usage)

  it("place on a valid empty tile with enough bank adds a tower AND logs the command", () => {
    const sim = makeSim({ seed: 1, mode: "free" });
    const model = new InputModel({ getState: () => sim.state });
    model.selectTower(0); // Fast: cost 50, affordable against the 125 start bank

    model.place(TILE);

    expect(sim.state.towers.count).toBe(1);
    expect(sim.state.towers.type[0]).toBe(0);
    expect(sim.state.towers.tile[0]).toBe(TILE);
    expect(model.inputLog).toEqual([{ tick: 0, type: "place", tower: 0, tile: TILE }]);
  });

  it("an unaffordable place is a no-op via applyCommand and does NOT append to the log", () => {
    const sim = makeSim({ seed: 2, mode: "free" });
    const model = new InputModel({ getState: () => sim.state });
    model.selectTower(4); // Damage: cost 260 > the 125 start bank

    model.place(TILE);

    expect(sim.state.towers.count).toBe(0);
    expect(model.inputLog).toEqual([]);
  });

  it("placing on an already-occupied tile is a no-op and does NOT append a second entry", () => {
    const sim = makeSim({ seed: 3, mode: "free" });
    const model = new InputModel({ getState: () => sim.state });
    model.selectTower(0);

    model.place(TILE);
    expect(model.inputLog).toHaveLength(1);

    model.place(TILE); // same tile again — occupied
    expect(model.inputLog).toHaveLength(1);
    expect(sim.state.towers.count).toBe(1);
  });

  it("sell on a placed tower appends to the log AND removes the tower", () => {
    const sim = makeSim({ seed: 4, mode: "free" });
    const model = new InputModel({ getState: () => sim.state });
    model.selectTower(0);
    model.place(TILE);
    expect(sim.state.towers.count).toBe(1);

    model.sell(TILE);

    expect(sim.state.towers.count).toBe(0);
    expect(model.inputLog).toHaveLength(2);
    expect(model.inputLog[1]).toEqual({ tick: 0, type: "sell", tile: TILE });
  });

  it("selling an empty tile is a no-op and does not append", () => {
    const sim = makeSim({ seed: 5, mode: "free" });
    const model = new InputModel({ getState: () => sim.state });
    model.sell(TILE);
    expect(model.inputLog).toEqual([]);
  });

  it("upgrade on a placed tower appends to the log AND raises its level", () => {
    const sim = makeSim({ seed: 6, mode: "free" });
    const model = new InputModel({ getState: () => sim.state });
    model.selectTower(0);
    model.place(TILE);
    sim.state.bank += 1000; // ensure the upgrade is affordable regardless of tower cost curve

    model.upgrade(TILE);

    expect(sim.state.towers.level[0]).toBe(1);
    expect(model.inputLog).toHaveLength(2);
    expect(model.inputLog[1]).toEqual({ tick: 0, type: "upgrade", tile: TILE });
  });

  it("towerIndexAtTile finds a placed tower's index and reports -1 when nothing is there", () => {
    const sim = makeSim({ seed: 7, mode: "free" });
    const model = new InputModel({ getState: () => sim.state });
    expect(towerIndexAtTile(sim.state, TILE)).toBe(-1);
    model.selectTower(0);
    model.place(TILE);
    expect(towerIndexAtTile(sim.state, TILE)).toBe(0);
  });

  it("selectTower ignores an out-of-range type; selectTile/cancel manage selection", () => {
    const sim = makeSim({ seed: 8, mode: "free" });
    const model = new InputModel({ getState: () => sim.state }, 2);
    model.selectTower(999);
    expect(model.selectedTowerType).toBe(2); // unchanged — invalid type ignored
    model.selectTower(TOWERS.length); // also out of range
    expect(model.selectedTowerType).toBe(2);

    model.selectTile(TILE);
    expect(model.selectedTile).toBe(TILE);
    model.cancel();
    expect(model.selectedTile).toBe(-1);
  });
});
