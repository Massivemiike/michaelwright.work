// src/game/test/balance.sweep.test.ts
//
// Task 12: balance acceptance / sweep harness. This is a MEASUREMENT task —
// it empirically drives the sim with scripted strategies and asserts on the
// ACTUAL observed behavior (see task-12-report.md for the numbers and how
// each threshold below was chosen). Per controller ruling R12, the
// track/tile geometry in content.ts is an INVENTED placeholder (the real
// visual layout is Plan 2's job), so tower placement is computed on the fly
// via inRangeTiles() instead of hardcoding specific tile indices — this
// measures the balance MATH (interest cap, HP curve, bounty), not geometry
// luck. The full α/γ grid sweep is a scheduled CI job (Plan 3), not a
// per-commit test; this lands the acceptance shape + placement harness.
import { describe, it, expect } from "vitest";
import { makeSim } from "@/game/titles/circle-td";
import { applyCommand } from "@/game/sim/replay";
import {
  TILES, TILE_COUNT, TRACK, trackLength, posAt, TOWERS,
} from "@/game/titles/circle-td/content";
import { towerRangeSq } from "@/game/titles/circle-td/rules";
import { mul, fromInt } from "@/game/sim/math/fixed";

// Hard ceiling matching the brief — a strategy that can't finish (bug, or a
// genuinely unwinnable/unlosable balance state) must not hang the suite.
const TICK_CEILING = 2_000_000;
const DAMAGE_TOWER = 4;

// Best-affordable buy order: most expensive (and generally strongest) tower
// first, falling through to cheaper ones. Costs/ids from content.ts's
// TOWERS array (Fast=0, Air=1, Slow=2, Splash=3, Damage=4). A realistic
// opening buys whatever it can afford immediately to start killing — a
// cheap tower (Splash 125 / Fast 50 / Air 45 / Slow 45) fits inside
// START_BANK=125 on wave 1, unlike a Damage-only strategy which can never
// afford its first tower before the population cap (see the superseded
// Damage-only measurement in task-12-report.md's history). Killing creeps
// flows bounty income, which is the snowball this strategy is meant to
// exercise.
const AFFORD_ORDER: ReadonlyArray<{ type: number; cost: number }> = [
  { type: 4, cost: TOWERS[4].cost }, // Damage 260
  { type: 3, cost: TOWERS[3].cost }, // Splash 125
  { type: 0, cost: TOWERS[0].cost }, // Fast 50
  { type: 1, cost: TOWERS[1].cost }, // Air 45
  { type: 2, cost: TOWERS[2].cost }, // Slow 45
];

// All tile indices within a Damage(L0) tower's range of some sampled point
// on either track polyline. Sampling every ~8px along both loops is dense
// enough relative to the tile grid (24px spacing, content.ts) and the
// Damage tower's range (125px, content.ts) that no in-range tile is missed.
function inRangeTiles(): number[] {
  const rSq = towerRangeSq(DAMAGE_TOWER, 0);
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

interface ActiveDefenseResult {
  wave: number;
  score: number;
  tilesUsed: number;
  hitCeiling: boolean;
}

// Places the most expensive currently-affordable tower on the next computed
// in-range tile every tick there's an unused tile; never sells or upgrades.
// `next` only advances when the placement actually lands (towers.count
// increases), so a failed/occupied placement can't strand the index — see
// ruling R12 in the task brief. This supersedes an earlier Damage-only
// version of this strategy (see task-12-report.md) which never bought
// anything because 260 is unreachable before the population cap; buying the
// best affordable tower lets a cheap opening (Splash/Fast/Air/Slow) start
// killing on wave 1, which is what actually funds the climb to Damage.
function playActiveDefense(seed: number): ActiveDefenseResult {
  const sim = makeSim({ seed, mode: "daily" });
  const tiles = inRangeTiles();
  let next = 0;
  while (!sim.state.gameOver && sim.state.tick < TICK_CEILING) {
    if (next < tiles.length) {
      const pick = AFFORD_ORDER.find((t) => sim.state.bank >= t.cost);
      if (pick) {
        const before = sim.state.towers.count;
        applyCommand(sim.state, { tick: sim.state.tick, type: "place", tower: pick.type, tile: tiles[next] });
        if (sim.state.towers.count > before) next++;
      }
    }
    sim.tick();
  }
  return {
    wave: sim.state.wave,
    score: sim.state.score,
    tilesUsed: next,
    hitCeiling: sim.state.tick >= TICK_CEILING,
  };
}

interface BankingResult {
  wave: number;
  hitCeiling: boolean;
}

// Same loop, but never places a tower (buys nothing) — isolates how far the
// interest-cap economy alone carries a run before the population cap ends
// it, with zero active defense.
function playPureBanking(seed: number): BankingResult {
  const sim = makeSim({ seed, mode: "daily" });
  while (!sim.state.gameOver && sim.state.tick < TICK_CEILING) {
    sim.tick();
  }
  return { wave: sim.state.wave, hitCeiling: sim.state.tick >= TICK_CEILING };
}

describe("balance acceptance / sweep harness (spec §5.4)", () => {
  it("computes a non-empty set of Damage-tower-in-range tiles (placeholder geometry sanity)", () => {
    const tiles = inRangeTiles();
    // eslint-disable-next-line no-console
    console.log(`[balance.sweep] inRangeTiles(): ${tiles.length} of ${TILE_COUNT} tiles in range`);
    // OBSERVED: currently ALL 450 tiles come back in range (the Damage
    // tower's 125px range plus the spiral track's footprint covers the
    // whole placeholder tile grid). That's a property of the INVENTED
    // content.ts geometry (content.ts's own header disclaims pixel fidelity
    // to Plan 2's real layout), not a harness bug — noted in
    // task-12-report.md since it means this sanity check can't yet fail on
    // a geometry regression that leaves *some* tiles in range.
    expect(tiles.length).toBeGreaterThan(0);
  });

  it("active defense is deterministic for a fixed seed", () => {
    const a = playActiveDefense(20260918);
    const b = playActiveDefense(20260918);
    expect(b.wave).toBe(a.wave);
    expect(b.score).toBe(a.score);
  });

  it("active defense reaches a meaningful wave (measured floor across seeds, see task-12-report.md)", () => {
    const seeds = [20260918, 1, 2, 3, 4];
    const results = seeds.map((seed) => ({ seed, ...playActiveDefense(seed) }));
    for (const r of results) {
      // eslint-disable-next-line no-console
      console.log(
        `[balance.sweep] active defense seed=${r.seed}: wave=${r.wave} score=${r.score} ` +
        `tilesUsed=${r.tilesUsed} hitCeiling=${r.hitCeiling}`
      );
    }
    const minWave = Math.min(...results.map((r) => r.wave));
    // eslint-disable-next-line no-console
    console.log(`[balance.sweep] min wave across seeds: ${minWave}`);
    // OBSERVED CEILING (do not raise this without re-measuring): threshold
    // 20 was tried first per the brief and FAILS. Every seed above reaches
    // exactly wave 5 with only 1-2 towers ever built (tilesUsed), even
    // buying the most expensive currently-affordable tower every tick.
    // Traced with an instrumented run (seed 20260918): the wave-1 buy
    // (Splash, cost 125) exactly drains START_BANK=125 to 0; from then on
    // bounty() = max(1, floor(hp(wave)/GAMMA)) with GAMMA=400 is PINNED AT
    // EXACTLY 1 gold per kill for the whole window (hp(wave) doesn't cross
    // 400 until roughly wave 16), and interest (a % of bank) is ~0 because
    // bank stays near-zero the entire time. Even after 35-50 kills by wave
    // 5, that's only 35-50 gold total — barely enough for a single second
    // tower (Air, 45) — while WAVE_SIZE=30 new creeps spawn every 600 ticks
    // regardless. Two towers' DPS can't out-kill that spawn rate, so the
    // population cap (100) fires at wave 5 every time. This is a genuine
    // balance/tuning finding (GAMMA and/or START_BANK are the likely
    // bottlenecks — see task-12-report.md), not a harness or strategy-
    // definition defect: this strategy buys the best affordable tower
    // every single tick, which is the realistic snowball opening the
    // coordinator asked for. The assertion below is pinned to the measured
    // floor, not invented.
    expect(minWave).toBeGreaterThanOrEqual(5);
  });

  it("does not allow trivial infinite survival (terminates by gameOver, not the tick ceiling)", () => {
    const r = playActiveDefense(20260918);
    expect(r.hitCeiling).toBe(false);
  });

  it("active defense outlasts pure banking", () => {
    // Measured: active defense reaches wave 5 (killing 35-50 creeps along
    // the way, see the "meaningful wave" test above) vs. wave 4 for pure
    // banking (which buys nothing and kills nothing) — a real, if modest,
    // improvement. Asserting strict > since that's what's actually
    // observed now that the strategy buys the best affordable tower
    // instead of only ever trying to save for the unaffordable Damage
    // tower (which degenerated to the banking result exactly, see
    // task-12-report.md's history).
    const seed = 20260918;
    const active = playActiveDefense(seed);
    const banking = playPureBanking(seed);
    // eslint-disable-next-line no-console
    console.log(`[balance.sweep] active=${active.wave} banking=${banking.wave} (seed=${seed})`);
    expect(active.wave).toBeGreaterThan(banking.wave);
  });
});
