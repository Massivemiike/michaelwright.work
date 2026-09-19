// src/game/test/balance.sweep.test.ts
//
// Task 12: balance acceptance / sweep harness. This is a MEASUREMENT task —
// it empirically drives the sim with scripted strategies and asserts on the
// ACTUAL observed behavior. Tower placement is computed on the fly via
// inRangeTiles() instead of hardcoding specific tile indices, so this file
// survives geometry changes without hand-updating tile numbers.
//
// Plan-1 tuning (§5.4, 2026-09-18): a headless grid sweep on Plan 1's
// placeholder geometry found START_BANK=250/GAMMA=20/ALPHA_BP=200 winnable
// (reaching wave 78-81), documented in
// docs/superpowers/2026-09-18-circle-td-balance-tuning.md.
//
// Real-geometry re-tune (Task 2+3, 2026-09-19): Plan 2 replaced that
// placeholder with a real square-spiral track and flanking-only buildable
// tiles (content.ts) — each tile now only covers a narrow stretch of a much
// longer track, instead of the placeholder's uniform whole-board grid where
// a tower could often reach many different points on the path at once. The
// SAME START_BANK=250/GAMMA=20 that worked on the placeholder now traps the
// economy at wave 5-9 on the real board. Separately, the bounty formula
// changed from `bounty(wave)` to `bounty(killedCreep.maxHp)` (Task 3, fixes
// a gold exploit and the old seed=4 underpayment). Re-sweeping on the real
// geometry with the new bounty found START_BANK=125 (SOURCED, restored) +
// GAMMA=5 (INVENTED) + ALPHA_BP=200 (unchanged) winnable-and-climbing again
// — see docs/superpowers/2026-09-18-circle-td-balance-tuning.md's
// "Real-geometry re-tune" section for the full sweep landscape. All
// thresholds below are updated to the numbers actually observed on the new
// board with these constants — honest measurements, not carried over from
// the placeholder-geometry sweep.
//
// Same-day addendum (still current): playing the tuned game to gameOver
// with every in-range tile filled is real O(towers x creeps)-per-tick
// compute — it made the DEFAULT `npm test` take several minutes, which is
// CI-flakiness risk for no per-commit benefit. Split:
//
//   - FAST (always on, part of `npm test`): a capped bot (40 towers, a
//     realistic partial defense rather than every in-range tile) that
//     STOPS as soon as it reaches a modest target wave rather than playing
//     to gameOver. This is the per-commit regression guard: it proves
//     "the game is winnable, not dying at wave 5" in a couple hundred
//     milliseconds.
//   - FULL (opt-in via `BALANCE_SWEEP=1 npm test`): the original uncapped,
//     play-to-gameOver measurements across the sweep's full seed set. This
//     is the "scheduled CI job" the original Task 12 comment referred to
//     for the grid sweep itself — same idea, applied to the expensive
//     acceptance measurements this file also grew.
//
// Nested-loop re-geometry (final-review findings #4/#5, 2026-09-19): the
// track/tile geometry in content.ts changed again — the OLD "real spiral"
// above turned out to interleave its own rings (outer self-crossed twice,
// inner once, outer×inner crossed 4x, painting the board centre as one
// solid blob with no build tiles), and its tile dedup let adjacent tiles
// land as little as 1px apart. Both are now fixed: OUTER and INNER are each
// a single rectangular ring, genuinely nested with a uniform ~150px gap
// (comfortably above the required TRACK_WIDTH + 2*TILE_SIZE = 128px), and
// tile placement now rejects any candidate within ~0.75*TILE_SIZE of an
// already-accepted tile. Net effect on this file: TILE_COUNT moved 223 ->
// 216 (a differently-shaped, slightly smaller in-range set, not a coverage
// bug), and a ONE-TIME `BALANCE_SWEEP=1` run with the SAME START_BANK=125/
// GAMMA=5/ALPHA_BP=200 (no retune) showed the measured wave floor moving
// from 54-58 down to 49-56 — still comfortably winnable-and-climbing
// (hitCeiling false every seed, active still ~12x pure banking), so only
// the FULL block's thresholds below were updated to the new honest
// minimum; the constants themselves did not change. Per the task brief:
// a full parameter-grid re-sweep was NOT re-run for this — the geometry
// fix's qualitative effect (a modest, expected floor shift) was already
// clear from the one gated run.
import { describe, it, expect } from "vitest";
import { makeSim } from "@/game/titles/circle-td";
import { applyCommand } from "@/game/sim/replay";
import {
  TILES, TILE_COUNT, TRACK, trackLength, posAt, TOWERS,
} from "@/game/titles/circle-td/content";
import { towerRangeSq } from "@/game/titles/circle-td/rules";
import { mul, fromInt } from "@/game/sim/math/fixed";

const FULL = process.env.BALANCE_SWEEP === "1";
const slowIt = FULL ? it : it.skip;

// Hard ceiling matching the brief — a strategy that can't finish (bug, or a
// genuinely unwinnable/unlosable balance state) must not hang the suite.
const TICK_CEILING = 2_000_000;
const DAMAGE_TOWER = 4;

// Best-affordable buy order: most expensive (and generally strongest) tower
// first, falling through to cheaper ones. Costs/ids from content.ts's
// TOWERS array (Fast=0, Air=1, Slow=2, Splash=3, Damage=4). A realistic
// opening buys whatever it can afford immediately to start killing — with
// START_BANK=125 that's a single Splash tower (125) to start, then whatever
// the next few kills afford. Killing creeps flows bounty income (by the
// killed creep's own maxHp as of Task 3), which is the snowball this
// strategy is meant to exercise.
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
// Computed once at module load and reused by every strategy below — it's
// pure geometry (no seed/balance dependence), so recomputing it per call
// would just be wasted work on every one of the (many) runs in this file.
const TILES_CACHE = inRangeTiles();

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
// version of this strategy (an earlier iteration of this harness, before
// this file's current revision) which never bought anything because 260 is
// unreachable before the population cap; buying the
// best affordable tower lets a cheap opening (Splash/Fast/Air/Slow) start
// killing on wave 1, which is what actually funds the climb to Damage.
//
// Plays all the way to gameOver (or the tick ceiling) with every in-range
// tile available — this is the FULL, expensive measurement (all 216
// in-range tiles eventually filled; see
// docs/superpowers/2026-09-18-circle-td-balance-tuning.md). Used only by the
// slowIt-gated tests below; the always-on fast guard uses
// playCappedDefense instead.
function playActiveDefense(seed: number): ActiveDefenseResult {
  const sim = makeSim({ seed, mode: "daily" });
  const tiles = TILES_CACHE;
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

interface CappedDefenseResult {
  wave: number;
  score: number;
  tilesUsed: number;
  gameOver: boolean;
}

// FAST per-commit guard's strategy: same best-affordable buy order, but
// (a) capped at `maxTowers` placements — a realistic partial defense, not
// every one of the 450 in-range tiles — and (b) stops the instant `wave`
// reaches `targetWave`, rather than playing to gameOver. Calibrated
// empirically (see docs/superpowers/2026-09-18-circle-td-balance-tuning.md's
// "Fast/slow test split" section): with `maxTowers=40`, this strategy played
// to death naturally dies at wave 21-23 across all four of the sweep's seeds, so a
// `targetWave` at or below that would-be-death-wave lets the loop exit via
// "reached the target, still alive" instead of "died before getting
// there" — which is the actual thing being asserted (not literally "did
// wave counter hit N", but "is 40 towers already meaningfully more
// survivable than the pre-tuning wave-5 trap").
function playCappedDefense(
  seed: number,
  maxTowers: number,
  targetWave: number,
  tickCeiling: number
): CappedDefenseResult {
  const sim = makeSim({ seed, mode: "daily" });
  const tiles = TILES_CACHE;
  const cap = Math.min(tiles.length, maxTowers);
  let next = 0;
  while (!sim.state.gameOver && sim.state.wave < targetWave && sim.state.tick < tickCeiling) {
    if (next < cap) {
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
    gameOver: sim.state.gameOver,
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

// --- FAST per-commit guard constants (empirical calibration, see
// docs/superpowers/2026-09-18-circle-td-balance-tuning.md "Real-geometry
// re-tune") ---
// 40 towers is a realistic partial defense (vs. 216 in-range tiles, which
// only a play-to-gameOver run ever fully occupies) — cheap enough per tick
// that even playing several of these to completion takes well under a
// second. Re-measured on the nested-loop geometry (final-review findings
// #4/#5, 2026-09-19) with START_BANK=125/GAMMA=5: this cap's bot played to
// death naturally dies at wave 19 for both of the guard's own seeds (was
// 19-21 on the previous interleaved-spiral geometry, 21-23 on Plan 1's
// placeholder before that — close enough each time that the existing
// targetWave/floor below didn't need to change).
// targetWave=15 stays comfortably below that natural death wave, so a
// healthy run stops via "reached the target" every time, not "ran out of
// luck at the ceiling". FLOOR=10 leaves margin below the target itself (not
// just below the natural-death wave) so a run that's a little slower to
// snowball still passes without the assertion being fragile to minor
// changes.
const FAST_MAX_TOWERS = 40;
const FAST_TARGET_WAVE = 15;
const FAST_TICK_CEILING = 50_000; // safety valve; actual runs finish by tick ~8,400
const FAST_WAVE_FLOOR = 10;

describe("balance acceptance / sweep harness (spec §5.4)", () => {
  it("computes a non-empty set of Damage-tower-in-range tiles (real geometry sanity)", () => {
    const tiles = inRangeTiles();
    // eslint-disable-next-line no-console
    console.log(`[balance.sweep] inRangeTiles(): ${tiles.length} of ${TILE_COUNT} tiles in range`);
    // OBSERVED on the nested-loop geometry (final-review findings #4/#5):
    // all 216 tiles come back in range of the Damage tower (125px) from
    // SOME point on the track. This is expected and correct-by-construction
    // now, not a geometry-fidelity artifact the way it was on Plan 1's
    // placeholder grid: every tile in
    // content.ts's TILES is generated as a cell flanking some path segment
    // at a fixed ~1 tile-width offset, which is always well inside 125px —
    // so "in range of the path somewhere" is true by definition. What the
    // real geometry actually bounds (unlike the placeholder) is whether a
    // single tower can reach MULTIPLE distant sections of the track at
    // once, which this particular sanity check doesn't measure — see
    // content.test.ts's flanking/clearance tests for that property instead.
    expect(tiles.length).toBeGreaterThan(0);
  });

  it("FAST per-commit guard: a capped defense (40 towers) reaches a meaningful wave without dying", () => {
    // Proves "the game is winnable, not dying at wave 5" on every commit,
    // in milliseconds — see the FAST_* constants' comment above for how
    // targetWave/floor were calibrated. Keeps to 2 seeds per the brief;
    // the full 4-seed uncapped measurement lives in the gated block below.
    const seeds = [20260918, 1];
    for (const seed of seeds) {
      const r = playCappedDefense(seed, FAST_MAX_TOWERS, FAST_TARGET_WAVE, FAST_TICK_CEILING);
      // eslint-disable-next-line no-console
      console.log(
        `[balance.sweep] FAST capped(${FAST_MAX_TOWERS}) seed=${seed}: wave=${r.wave} ` +
        `score=${r.score} tilesUsed=${r.tilesUsed} gameOver=${r.gameOver}`
      );
      // Must not have died before reaching the target wave — dying early
      // is exactly the pre-tuning wave-5 failure mode this guard exists
      // to catch.
      expect(r.gameOver).toBe(false);
      expect(r.wave).toBeGreaterThanOrEqual(FAST_WAVE_FLOOR);
    }
  });

  it("FAST: capped defense is deterministic for a fixed seed", () => {
    const a = playCappedDefense(20260918, FAST_MAX_TOWERS, FAST_TARGET_WAVE, FAST_TICK_CEILING);
    const b = playCappedDefense(20260918, FAST_MAX_TOWERS, FAST_TARGET_WAVE, FAST_TICK_CEILING);
    expect(b.wave).toBe(a.wave);
    expect(b.score).toBe(a.score);
  });

  // --- FULL sweep-measurement block, opt-in only: `BALANCE_SWEEP=1 npm test` ---
  // These reproduce the actual §5.4 sweep acceptance numbers
  // (docs/superpowers/2026-09-18-circle-td-balance-tuning.md) but each one
  // plays a full, uncapped (all 216 in-range tiles) game to
  // gameOver, which is real O(towers x creeps)-per-tick compute — several
  // minutes combined. Not part of the default per-commit suite; run on
  // demand or wire into a scheduled CI job (mirrors the original Task 12
  // comment's note that the full grid sweep itself belongs in scheduled
  // CI, not per-commit).

  slowIt("FULL: active defense is deterministic for a fixed seed (uncapped, play to gameOver)", () => {
    const a = playActiveDefense(20260918);
    const b = playActiveDefense(20260918);
    expect(b.wave).toBe(a.wave);
    expect(b.score).toBe(a.score);
  }, 180_000);

  slowIt("FULL: active defense reaches a meaningful wave (measured floor across seeds, see docs/superpowers/2026-09-18-circle-td-balance-tuning.md)", () => {
    // Seeds match the §5.4 sweep's own tested set PLUS seed=4 — folded in
    // here because the Task 3 bounty-by-maxHp fix resolved seed=4's old
    // "known concern" (see the test below): it now behaves like every
    // other seed, so it belongs in the main measured set instead of a
    // separate non-asserting observation.
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
    // RE-MEASURED 2026-09-19 on the nested-loop geometry (final-review
    // findings #4/#5 fix — content.ts's interleaved multi-ring spiral
    // replaced by two genuinely nested single rings, 216 tiles instead of
    // 223) with the SAME START_BANK=125/GAMMA=5/ALPHA_BP=200: all five
    // seeds (including the previously-concerning seed=4) reach wave 49-56
    // (all 216 in-range tiles eventually filled), a few waves below the
    // prior interleaved geometry's 54-58 — expected, since 216 tiles is a
    // slightly smaller, differently-shaped in-range set than the old
    // (overlapping-rings) 223, not a balance regression: hitCeiling is
    // still false for every seed, and active defense still vastly outlasts
    // pure banking (see below). No GAMMA change was needed; only this
    // threshold moved, to stay honest about the new floor. Pinned to 45
    // (below the measured minimum of 49), not padded up to it — same
    // methodology as the previous floor (50, below a measured 54).
    expect(minWave).toBeGreaterThanOrEqual(45);
    // Five full runs to wave ~49-56 each comfortably exceed vitest's
    // 5000ms default.
  }, 300_000);

  slowIt("FULL: seed=4's old bounty-exploit concern is resolved by the by-maxHp bounty fix", () => {
    // Historical context: under the OLD bounty(wave, gamma) formula, seed=4
    // stalled at wave 7 on the placeholder geometry while the swept seeds
    // reached wave 78+ — an unexplained outlier attributed at the time to
    // typeMul()'s CREEP_HARD doubling not being reflected in bounty (which
    // only looked at the un-multiplied hp(wave)). Task 3 changed bounty to
    // pay by the killed creep's own maxHp (which DOES include typeMul), and
    // that alone fixed seed=4: it's now folded into the main "meaningful
    // wave" test above and behaves like every other seed (wave 52 on the
    // nested-loop geometry as of the 2026-09-19 re-measurement, no longer a
    // documented non-asserting outlier). This test exists only to record
    // that the old concern is gone, not to re-litigate the mechanism.
    const r = playActiveDefense(4);
    // eslint-disable-next-line no-console
    console.log(`[balance.sweep] seed=4 (formerly KNOWN CONCERN): wave=${r.wave} tilesUsed=${r.tilesUsed}`);
    expect(r.hitCeiling).toBe(false);
    expect(r.wave).toBeGreaterThanOrEqual(45);
  }, 60_000);

  slowIt("FULL: does not allow trivial infinite survival (terminates by gameOver, not the tick ceiling)", () => {
    const r = playActiveDefense(20260918);
    expect(r.hitCeiling).toBe(false);
  }, 120_000);

  slowIt("FULL: active defense outlasts pure banking", () => {
    // Re-measured 2026-09-19 on the nested-loop geometry: active defense
    // reaches wave ~49-56 (score ~2700-3150, all 216 in-range tiles
    // eventually filled — see the "meaningful wave" test above) vs. wave 4
    // for pure banking (which buys nothing and kills nothing, so
    // population-cap timing is unaffected by geometry or the economy
    // constants — same wave 4 as the prior geometry). A ~12x margin at the
    // worst seed, not a marginal one — see
    // docs/superpowers/2026-09-18-circle-td-balance-tuning.md.
    const seed = 20260918;
    const active = playActiveDefense(seed);
    const banking = playPureBanking(seed);
    // eslint-disable-next-line no-console
    console.log(`[balance.sweep] active=${active.wave} banking=${banking.wave} (seed=${seed})`);
    expect(active.wave).toBeGreaterThan(banking.wave);
  }, 120_000);
});
