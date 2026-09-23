// src/game/test/live-replay-roundtrip.test.ts
//
// FINDING 1 (FR#1) — live-play -> server-recompute round-trip regression.
//
// Every other test in this suite hands runReplay a synthesized or hand-written
// command log; NONE drives the real LIVE-play recorder. This test closes that
// seam: it drives the actual InputModel (src/game/runtime/input/pointer.ts) —
// the same object GameClient.tsx wires real pointer/keyboard events to — over a
// deterministic strong-play run, then proves the server's runReplay path
// reproduces the LIVE final state (score, wave, and full state hash) byte-for-
// byte from the recorded inputLog. That is exactly the leaderboard's trust
// chain: the browser records commands via InputModel; the server re-simulates
// via runReplay and trusts only what it recomputes.
//
// The live loop mirrors the real game loop EXACTLY — optionally issue one
// action through the MODEL (never applyCommand directly), THEN sim.tick() — and
// runs all the way to gameOver, so the captured live terminal state is the same
// terminal runReplay drives its own fresh sim to. Commands are recorded by the
// model only when effective, so inputLog is precisely "what actually happened".
//
// This file lives under src/game/test/** — outside the sim purity roots
// (src/game/sim/purity.test.ts walks only src/game/sim and
// src/game/titles/circle-td) — so importing @/game/runtime/** and
// @/game/titles/** here is fine, and it uses no banned tokens anyway.
import { describe, it, expect } from "vitest";
import { runReplay, hashState, upgradeCost, type Command } from "@/game/titles/circle-td/replay";
import { SIM_VERSION } from "@/game/titles/circle-td/version";
import { makeSim } from "@/game/titles/circle-td";
import { circleTdTitle } from "@/game/titles/circle-td/title";
import { InputModel } from "@/game/runtime/input/pointer";
import { TILES, TILE_COUNT, TOWERS, TRACK, trackLength, posAt } from "@/game/titles/circle-td/content";
import { towerRangeSq } from "@/game/titles/circle-td/rules";
import { mul, fromInt } from "@/game/sim/math/fixed";

// Tile indices within a Damage(L0) tower's range of some sampled point on
// either track polyline — the same method determinism.test.ts's inRangeTiles()
// uses. Recomputed rather than hardcoded so a geometry change can't silently
// drift a placement out of range and quietly make the run inert.
function inRangeTiles(): number[] {
  const rSq = towerRangeSq(4, 0);
  const step = fromInt(8); // sample the track every ~8px
  const out: number[] = [];
  for (let ti = 0; ti < TILE_COUNT; ti++) {
    const tx = TILES[ti * 2], ty = TILES[ti * 2 + 1];
    let near = false;
    for (const poly of [TRACK.outer, TRACK.inner]) {
      const total = trackLength(poly);
      for (let d = 0; d <= total && !near; d += step) {
        const p = posAt(poly, d);
        const dx = p.x - tx, dy = p.y - ty;
        if (mul(dx, dx) + mul(dy, dy) <= rSq) near = true;
      }
    }
    if (near) out.push(ti);
  }
  return out;
}

const SEED = 20260918;
const MODE = "daily" as const;

// Best-affordable buy order (strongest first), matching the golden generator's
// realistic-opening strategy. Ids/costs from content.ts (Fast=0 Air=1 Slow=2
// Splash=3 Damage=4).
const AFFORD: ReadonlyArray<{ type: number; cost: number }> = [
  { type: 4, cost: TOWERS[4].cost },
  { type: 3, cost: TOWERS[3].cost },
  { type: 0, cost: TOWERS[0].cost },
  { type: 1, cost: TOWERS[1].cost },
  { type: 2, cost: TOWERS[2].cost },
];

// Bound tower placement so the log stays modest; NO wave stop — the live loop
// runs to gameOver so its terminal state matches runReplay's own run to death.
const TOWER_CAP = 40;
// Generous ceiling = runReplay's own default CEILING, so the live loop can
// never be cut off before the same gameOver runReplay reaches. In practice
// gameOver lands far earlier (the 40-tower defense dies ~wave 64).
const TICK_CEILING = 5_000_000;

describe("live-play -> server recompute round-trip", () => {
  it("InputModel's recorded log, applied at live tick-ordering, is reproduced exactly by runReplay", () => {
    const sim = makeSim({ seed: SEED, mode: MODE });
    const model = new InputModel({ getState: () => sim.state });
    const s = sim.state;
    const tiles = inRangeTiles();
    const cap = Math.min(tiles.length, TOWER_CAP);
    const throwawayTile = tiles[Math.min(tiles.length - 1, Math.floor(tiles.length * 0.85))];
    let next = 0;
    let didThrowaway = false;

    // The real live loop: each tick, at most one player action through the
    // MODEL (place/upgrade/sell — the model records only effective ones), then
    // advance the sim one tick. First applicable action wins:
    //   1. place the next in-range tile with the best currently-affordable tower;
    //   2. once towers exist, a one-off place+sell of a throwaway tile (exercises
    //      the sell path); then
    //   3. upgrade the lowest-level tower whose next upgrade is affordable.
    while (!s.gameOver && s.tick < TICK_CEILING) {
      let acted = false;

      if (next < cap) {
        const pick = AFFORD.find((t) => s.bank >= t.cost);
        if (pick) {
          const before = s.towers.count;
          model.selectTower(pick.type);
          model.place(tiles[next]);
          if (s.towers.count > before) { next++; acted = true; }
        }
      }

      if (!acted && !didThrowaway && s.towers.count > 0) {
        const before = s.towers.count;
        model.selectTower(0);
        model.place(throwawayTile);
        if (s.towers.count > before) {
          model.sell(throwawayTile);
          didThrowaway = true;
          acted = true;
        }
      }

      if (!acted) {
        const t = s.towers;
        let bi = -1, bl = 99;
        for (let i = 0; i < t.count; i++) {
          const lv = t.level[i];
          if (lv < 9 && lv < bl && s.bank >= upgradeCost(TOWERS[t.type[i]].cost, lv)) { bl = lv; bi = i; }
        }
        if (bi !== -1) model.upgrade(t.tile[bi]);
      }

      sim.tick();
    }

    // Capture the LIVE terminal state AFTER the loop.
    const liveScore = s.score;
    const liveWave = s.wave;
    const liveHash = hashState(s);
    const log: Command[] = model.inputLog;

    // The recorded log must be non-trivial: place + upgrade + at least one sell,
    // and the run must actually have fought (score > 0, deep wave). A future
    // regression that makes the run inert then fails loud here.
    expect(log.some((c) => c.type === "place")).toBe(true);
    expect(log.some((c) => c.type === "upgrade")).toBe(true);
    expect(log.some((c) => c.type === "sell")).toBe(true);
    expect(liveScore).toBeGreaterThan(0);
    expect(liveWave).toBeGreaterThanOrEqual(20);

    // The server's recompute path: rebuild a fresh sim and drive it through the
    // recorded log, exactly as the /api/games/scores route does.
    const replay = runReplay(
      { seed: SEED, simVersion: SIM_VERSION, mode: MODE, commands: log },
      circleTdTitle
    );

    // Byte-faithful reproduction of the live terminal state.
    expect(replay.score).toBe(liveScore);
    expect(replay.wave).toBe(liveWave);
    expect(replay.hash).toBe(liveHash);
  });
});
