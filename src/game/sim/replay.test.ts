import { describe, it, expect } from "vitest";
import { runReplay, applyCommand, hashState, type Replay } from "./replay";
import { makeSim } from "@/game/titles/circle-td";
import { TOWERS, TILE_COUNT } from "@/game/titles/circle-td/content";

describe("replay + hash", () => {
  it("same replay → identical hash and score", () => {
    const replay: Replay = {
      seed: 7,
      simVersion: 1,
      mode: "daily",
      commands: [
        { tick: 0, type: "place", tower: 4, tile: 10 },
        { tick: 30, type: "place", tower: 1, tile: 20 },
        { tick: 90, type: "upgrade", tile: 20 },
      ],
    };
    const a = runReplay(replay);
    const b = runReplay(replay);
    expect(a.hash).toBe(b.hash);
    expect(a.score).toBe(b.score);
  });

  it("hash changes when state differs", () => {
    const s1 = makeSim({ seed: 1, mode: "free" });
    s1.tick();
    const s2 = makeSim({ seed: 2, mode: "free" });
    s2.tick();
    expect(hashState(s1.state)).not.toBe(hashState(s2.state));
  });

  it("an unaffordable place is a no-op; sell refunds and removes the tower", () => {
    const sim = makeSim({ seed: 3, mode: "free" });
    const bankBefore = sim.state.bank;

    // Damage tower (index 4) costs 260; starting bank (125) can't afford it.
    applyCommand(sim.state, { tick: 0, type: "place", tower: 4, tile: 10 });
    expect(sim.state.bank).toBe(bankBefore);
    expect(sim.state.towers.count).toBe(0);

    // Fast tower (index 0) costs 50; affordable.
    applyCommand(sim.state, { tick: 0, type: "place", tower: 0, tile: 10 });
    expect(sim.state.towers.count).toBe(1);
    expect(sim.state.bank).toBe(bankBefore - TOWERS[0].cost);

    const bankAfterPlace = sim.state.bank;
    applyCommand(sim.state, { tick: 0, type: "sell", tile: 10 });
    expect(sim.state.towers.count).toBe(0);
    const expectedRefund = Math.floor((TOWERS[0].cost * 75) / 100);
    expect(sim.state.bank).toBe(bankAfterPlace + expectedRefund);
  });

  it("out-of-range/malformed tile or tower values are silent no-ops, never a throw or NaN", () => {
    const sim = makeSim({ seed: 3, mode: "free" });
    const bankBefore = sim.state.bank;

    const badTiles = [-1, TILE_COUNT, TILE_COUNT + 1000, 1.5, NaN, Infinity, -Infinity];
    for (const tile of badTiles) {
      expect(() => applyCommand(sim.state, { tick: 0, type: "place", tower: 0, tile })).not.toThrow();
    }
    expect(sim.state.towers.count).toBe(0);
    expect(sim.state.bank).toBe(bankBefore);

    const badTowers = [-1, TOWERS.length, TOWERS.length + 10, 1.5, NaN];
    for (const tower of badTowers) {
      expect(() => applyCommand(sim.state, { tick: 0, type: "place", tower, tile: 10 })).not.toThrow();
    }
    expect(sim.state.towers.count).toBe(0);
    expect(sim.state.bank).toBe(bankBefore);

    // A legitimate tower to probe upgrade/sell against.
    applyCommand(sim.state, { tick: 0, type: "place", tower: 0, tile: 10 });
    expect(sim.state.towers.count).toBe(1);
    const bankAfterPlace = sim.state.bank;

    for (const tile of badTiles) {
      expect(() => applyCommand(sim.state, { tick: 0, type: "upgrade", tile })).not.toThrow();
      expect(() => applyCommand(sim.state, { tick: 0, type: "sell", tile })).not.toThrow();
    }
    // Neither an out-of-range upgrade nor an out-of-range sell touched the
    // real tower on tile 10 or the bank.
    expect(sim.state.towers.count).toBe(1);
    expect(sim.state.towers.level[0]).toBe(0);
    expect(sim.state.bank).toBe(bankAfterPlace);

    // The sim still snapshots cleanly afterward — no NaN leaked into state.
    const snap = sim.snapshot();
    expect(Number.isFinite(snap.towerXY[0])).toBe(true);
    expect(Number.isFinite(snap.towerXY[1])).toBe(true);
  });
});
