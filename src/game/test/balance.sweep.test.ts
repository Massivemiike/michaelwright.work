// src/game/test/balance.sweep.test.ts
//
// Task 12: balance acceptance / sweep harness. This is a MEASUREMENT task —
// it empirically drives the sim with scripted strategies and asserts on the
// ACTUAL observed behavior. Per controller ruling R12, the track/tile
// geometry in content.ts is an INVENTED placeholder (the real visual layout
// is Plan 2's job), so tower placement is computed on the fly via
// inRangeTiles() instead of hardcoding specific tile indices — this
// measures the balance MATH (interest cap, HP curve, bounty), not geometry
// luck.
//
// Plan-1 addendum (§5.4 tuning, task-13b, 2026-09-18): the headless grid
// sweep described in task-13b-report.md retuned the defaults (START_BANK
// 125->250 in content.ts; GAMMA 400->20 in balance.ts; ALPHA_BP unchanged
// at 200) so this strategy is actually winnable-and-climbing instead of
// dying at wave 5. The thresholds below were re-measured against those new
// defaults — see that report for the full sweep landscape and the seed=4
// finding noted below "meaningful wave".
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
// opening buys whatever it can afford immediately to start killing — with
// START_BANK=250 that's two Splash towers (125 each) back-to-back, which
// stays below the Damage tower's 260 cost so the opening never flips into
// a single slow-cooldown Damage buy (task-13b-report.md found that
// crossing that 260 threshold makes outcomes seed-chaotic: it happens to
// rescue one bad seed while breaking a previously-fine one). Killing
// creeps flows bounty income, which is the snowball this strategy is meant
// to exercise.
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
    // Two full runs to wave ~81 (each ~45s once the economy escapes the
    // wave-5 trap — see task-13b-report.md's "Performance note") comfortably
    // exceed vitest's 5000ms default; this is real compute, not a hang.
  }, 180_000);

  it("active defense reaches a meaningful wave (measured floor across seeds, see task-13b-report.md)", () => {
    // Seeds match the §5.4 sweep's own tested set exactly (task-13b-report.md
    // step 1), so this assertion is pinned to numbers the sweep actually
    // produced, not a superset invented after the fact.
    const seeds = [20260918, 1, 2, 3];
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
    // OBSERVED with the tuned defaults (START_BANK=250, GAMMA=20,
    // ALPHA_BP=200 unchanged — task-13b-report.md): all four seeds now
    // reach wave 78-81 (all 450 in-range tiles eventually filled), a
    // ~16x improvement over the pre-tuning floor of 5. Pinned to the
    // measured floor (78), not padded.
    expect(minWave).toBeGreaterThanOrEqual(78);
    // Four full runs to wave ~78-81 each (~45s apiece once the economy
    // escapes the wave-5 trap) comfortably exceed vitest's 5000ms default.
  }, 300_000);

  it("KNOWN CONCERN: seed=4 does not escape under these defaults (see task-13b-report.md)", () => {
    // Not part of the §5.4 sweep's own seed set (only seeds
    // [20260918,1,2,3] were swept per the task brief) — logged as an
    // explicit, non-blocking observation rather than silently omitted.
    // seed=4 stalls at wave 7 (only 11 towers ever bought) while the four
    // swept seeds reach wave 78+. This is NOT cleanly explained by a single
    // cause: seed=4 does draw an early CREEP_HARD wave (wave 2), which
    // doubles spawned HP via typeMul() without a matching bounty increase
    // (bounty() uses the un-multiplied hp(wave)) — but seed=2 draws the
    // *same* offsetHard (HARD at wave 2 too, combined with FAST) and still
    // escapes fine, so that alone isn't the full story; some other
    // seed-derived factor (spawn stagger / targeting order interacting
    // with the fixed tile-fill sequence) also matters and wasn't fully
    // isolated. Separately CONFIRMED: raising START_BANK to 400 rescues
    // seed=4 (wave 82) but *breaks* seed=3 (wave 5) by crossing the 260
    // Damage-tower-cost threshold and flipping the opening buy — so this
    // "best affordable" bot is genuinely chaotic near the escape
    // threshold, not a simple monotonic economy dial. This test only
    // documents the number; it does not assert a floor.
    const r = playActiveDefense(4);
    // eslint-disable-next-line no-console
    console.log(`[balance.sweep] KNOWN CONCERN seed=4: wave=${r.wave} tilesUsed=${r.tilesUsed}`);
    expect(r.hitCeiling).toBe(false); // still terminates; just early
  });

  it("does not allow trivial infinite survival (terminates by gameOver, not the tick ceiling)", () => {
    const r = playActiveDefense(20260918);
    expect(r.hitCeiling).toBe(false);
  }, 120_000);

  it("active defense outlasts pure banking", () => {
    // Measured with the tuned defaults: active defense reaches wave 81
    // (score ~4600, all 450 in-range tiles eventually filled — see the
    // "meaningful wave" test above) vs. wave 4 for pure banking (which buys
    // nothing and kills nothing, so population-cap timing is the same
    // regardless of the economy constants). A ~20x margin, not a marginal
    // one — see task-13b-report.md.
    const seed = 20260918;
    const active = playActiveDefense(seed);
    const banking = playPureBanking(seed);
    // eslint-disable-next-line no-console
    console.log(`[balance.sweep] active=${active.wave} banking=${banking.wave} (seed=${seed})`);
    expect(active.wave).toBeGreaterThan(banking.wave);
  }, 120_000);
});
