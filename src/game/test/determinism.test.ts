// src/game/test/determinism.test.ts
//
// The golden determinism gate: a fixed scripted replay's hash/score/wave
// are pinned to a committed fixture. This test file (not replay.ts itself)
// is allowed to touch node:fs — it's a *.test.ts, excluded from the purity
// guard's scan.
import { describe, it, expect } from "vitest";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { runReplay, type Replay } from "@/game/sim/replay";
import { SIM_VERSION } from "@/game/sim/types";
import { TILES, TILE_COUNT, TRACK, trackLength, posAt } from "@/game/titles/circle-td/content";
import { towerRangeSq } from "@/game/titles/circle-td/rules";
import { mul, fromInt } from "@/game/sim/math/fixed";

const FIXTURE = join("src/game/test/determinism.golden.json");

// Tile indices within a Damage(L0) tower's range of some sampled point on
// either track polyline — the same method balance.sweep.test.ts's own
// inRangeTiles() uses (scan TILES, sample every ~8px along TRACK.outer/
// inner, keep tiles within towerRangeSq(4,0) of some sampled point).
// Recomputed here rather than hardcoding raw tile numbers: content.ts's
// geometry can change (it already has once, Plan 2's real spiral replacing
// Plan 1's placeholder), and a hardcoded index could silently drift out of
// range on the next change too.
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

const IN_RANGE = inRangeTiles();

// Tile indices are chosen as FRACTIONS of the in-range array's length —
// never a raw/hardcoded index (like the old "IN_RANGE[100]") that could
// exceed a smaller in-range set on a future geometry change. Twelve core
// tiles spread from 5% to 60% of the way through IN_RANGE (never
// clustered on one spot), plus one throwaway tile at 80% for the
// place-then-sell exercise.
const CORE_FRACTIONS = [0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6];
const CORE_TILES = CORE_FRACTIONS.map((f) => IN_RANGE[Math.floor(IN_RANGE.length * f)]);
const THROWAWAY_TILE = IN_RANGE[Math.floor(IN_RANGE.length * 0.8)];

// A fixed scripted run that actually plays: twelve towers (a mix of Fast,
// Air and one Splash) are bought as the economy affords them, a filler
// Fast tower is bought and sold in the same tick purely to exercise "sell"
// on a tower that actually exists, and the towers are continuously
// upgraded (lowest-level affordable first) as the bank allows.
//
// Real geometry (Task 2) made per-tower path coverage much narrower than
// Plan 1's placeholder (flanking tiles instead of a uniform whole-board
// grid) — a small 2-3 tower opening that used to snowball on the old board
// now stalls out at the population cap by wave 5-9, so this script needs
// more towers up front than the old fixture's 2 Splash + 1 Damage did.
// Tick numbers were derived by driving the real sim with exactly this
// strategy (place the next core tile's tower when affordable, otherwise
// upgrade the lowest-level tower that's affordable) and recording the
// ticks at which each command actually took effect — this is a fixed
// script now, not a live bot, so any future change to balance constants,
// geometry, or tower stats will shift these numbers and require
// regenerating both the script and the fixture.
const REPLAY: Replay = {
  seed: 20260918,
  simVersion: SIM_VERSION,
  mode: "daily",
  commands: [
    { tick: 0, type: "place", tower: 3, tile: CORE_TILES[0] },
    { tick: 693, type: "place", tower: 0, tile: CORE_TILES[1] },
    { tick: 817, type: "place", tower: 1, tile: CORE_TILES[2] },
    { tick: 1348, type: "place", tower: 0, tile: THROWAWAY_TILE },
    { tick: 1348, type: "sell", tile: THROWAWAY_TILE },
    { tick: 1349, type: "place", tower: 1, tile: CORE_TILES[3] },
    { tick: 1472, type: "place", tower: 1, tile: CORE_TILES[4] },
    { tick: 1596, type: "place", tower: 0, tile: CORE_TILES[5] },
    { tick: 1699, type: "place", tower: 1, tile: CORE_TILES[6] },
    { tick: 1895, type: "place", tower: 0, tile: CORE_TILES[7] },
    { tick: 2010, type: "place", tower: 0, tile: CORE_TILES[8] },
    { tick: 2060, type: "place", tower: 1, tile: CORE_TILES[9] },
    { tick: 2088, type: "place", tower: 0, tile: CORE_TILES[10] },
    { tick: 2141, type: "place", tower: 0, tile: CORE_TILES[11] },
    { tick: 2172, type: "upgrade", tile: CORE_TILES[1] },
    { tick: 2218, type: "upgrade", tile: CORE_TILES[2] },
    { tick: 2235, type: "upgrade", tile: CORE_TILES[3] },
    { tick: 2258, type: "upgrade", tile: CORE_TILES[4] },
    { tick: 2278, type: "upgrade", tile: CORE_TILES[6] },
    { tick: 2424, type: "upgrade", tile: CORE_TILES[5] },
    { tick: 2487, type: "upgrade", tile: CORE_TILES[9] },
    { tick: 2529, type: "upgrade", tile: CORE_TILES[2] },
    { tick: 2569, type: "upgrade", tile: CORE_TILES[7] },
    { tick: 2604, type: "upgrade", tile: CORE_TILES[8] },
    { tick: 2641, type: "upgrade", tile: CORE_TILES[10] },
    { tick: 2672, type: "upgrade", tile: CORE_TILES[11] },
    { tick: 2706, type: "upgrade", tile: CORE_TILES[1] },
    { tick: 2727, type: "upgrade", tile: CORE_TILES[3] },
    { tick: 2754, type: "upgrade", tile: CORE_TILES[4] },
    { tick: 2774, type: "upgrade", tile: CORE_TILES[5] },
    { tick: 2795, type: "upgrade", tile: CORE_TILES[6] },
    { tick: 2827, type: "upgrade", tile: CORE_TILES[7] },
    { tick: 2847, type: "upgrade", tile: CORE_TILES[8] },
    { tick: 2876, type: "upgrade", tile: CORE_TILES[9] },
    { tick: 2960, type: "upgrade", tile: CORE_TILES[10] },
    { tick: 3044, type: "upgrade", tile: CORE_TILES[11] },
    { tick: 3086, type: "upgrade", tile: CORE_TILES[1] },
    { tick: 3128, type: "upgrade", tile: CORE_TILES[2] },
    { tick: 3148, type: "upgrade", tile: CORE_TILES[3] },
    { tick: 3170, type: "upgrade", tile: CORE_TILES[4] },
    { tick: 3201, type: "upgrade", tile: CORE_TILES[5] },
    { tick: 3242, type: "upgrade", tile: CORE_TILES[6] },
    { tick: 3248, type: "upgrade", tile: CORE_TILES[7] },
    { tick: 3277, type: "upgrade", tile: CORE_TILES[8] },
    { tick: 3281, type: "upgrade", tile: CORE_TILES[9] },
    { tick: 3307, type: "upgrade", tile: CORE_TILES[10] },
    { tick: 3319, type: "upgrade", tile: CORE_TILES[11] },
    { tick: 3347, type: "upgrade", tile: CORE_TILES[1] },
    { tick: 3361, type: "upgrade", tile: CORE_TILES[2] },
    { tick: 3396, type: "upgrade", tile: CORE_TILES[3] },
    { tick: 3431, type: "upgrade", tile: CORE_TILES[4] },
    { tick: 3432, type: "upgrade", tile: CORE_TILES[5] },
    { tick: 3459, type: "upgrade", tile: CORE_TILES[6] },
    { tick: 3487, type: "upgrade", tile: CORE_TILES[7] },
    { tick: 3489, type: "upgrade", tile: CORE_TILES[8] },
    { tick: 3515, type: "upgrade", tile: CORE_TILES[9] },
    { tick: 3543, type: "upgrade", tile: CORE_TILES[10] },
    { tick: 3544, type: "upgrade", tile: CORE_TILES[11] },
    { tick: 3552, type: "upgrade", tile: CORE_TILES[1] },
    { tick: 3571, type: "upgrade", tile: CORE_TILES[2] },
    { tick: 3599, type: "upgrade", tile: CORE_TILES[3] },
    { tick: 3615, type: "upgrade", tile: CORE_TILES[4] },
    { tick: 3636, type: "upgrade", tile: CORE_TILES[5] },
    { tick: 3663, type: "upgrade", tile: CORE_TILES[6] },
    { tick: 3681, type: "upgrade", tile: CORE_TILES[7] },
    { tick: 3685, type: "upgrade", tile: CORE_TILES[8] },
    { tick: 3690, type: "upgrade", tile: CORE_TILES[9] },
    { tick: 3713, type: "upgrade", tile: CORE_TILES[10] },
    { tick: 3714, type: "upgrade", tile: CORE_TILES[11] },
    { tick: 3723, type: "upgrade", tile: CORE_TILES[1] },
    { tick: 3737, type: "upgrade", tile: CORE_TILES[2] },
    { tick: 3739, type: "upgrade", tile: CORE_TILES[3] },
    { tick: 3746, type: "upgrade", tile: CORE_TILES[4] },
    { tick: 3762, type: "upgrade", tile: CORE_TILES[5] },
    { tick: 3779, type: "upgrade", tile: CORE_TILES[6] },
    { tick: 3785, type: "upgrade", tile: CORE_TILES[7] },
    { tick: 3788, type: "upgrade", tile: CORE_TILES[8] },
    { tick: 3809, type: "upgrade", tile: CORE_TILES[9] },
    { tick: 3810, type: "upgrade", tile: CORE_TILES[10] },
    { tick: 3821, type: "upgrade", tile: CORE_TILES[11] },
    { tick: 3830, type: "upgrade", tile: CORE_TILES[1] },
    { tick: 3835, type: "upgrade", tile: CORE_TILES[2] },
    { tick: 3850, type: "upgrade", tile: CORE_TILES[3] },
    { tick: 3851, type: "upgrade", tile: CORE_TILES[4] },
    { tick: 3863, type: "upgrade", tile: CORE_TILES[5] },
    { tick: 3872, type: "upgrade", tile: CORE_TILES[6] },
    { tick: 3873, type: "upgrade", tile: CORE_TILES[9] },
    { tick: 3877, type: "upgrade", tile: CORE_TILES[7] },
    { tick: 3889, type: "upgrade", tile: CORE_TILES[2] },
    { tick: 3893, type: "upgrade", tile: CORE_TILES[8] },
    { tick: 3902, type: "upgrade", tile: CORE_TILES[10] },
    { tick: 3912, type: "upgrade", tile: CORE_TILES[3] },
    { tick: 3914, type: "upgrade", tile: CORE_TILES[11] },
    { tick: 3926, type: "upgrade", tile: CORE_TILES[0] },
    { tick: 3940, type: "upgrade", tile: CORE_TILES[1] },
    { tick: 4222, type: "upgrade", tile: CORE_TILES[4] },
    { tick: 4271, type: "upgrade", tile: CORE_TILES[5] },
    { tick: 4299, type: "upgrade", tile: CORE_TILES[6] },
    { tick: 4313, type: "upgrade", tile: CORE_TILES[7] },
    { tick: 4330, type: "upgrade", tile: CORE_TILES[9] },
    { tick: 4355, type: "upgrade", tile: CORE_TILES[8] },
    { tick: 4369, type: "upgrade", tile: CORE_TILES[10] },
    { tick: 4377, type: "upgrade", tile: CORE_TILES[11] },
    { tick: 4398, type: "upgrade", tile: CORE_TILES[1] },
    { tick: 4412, type: "upgrade", tile: CORE_TILES[2] },
    { tick: 4425, type: "upgrade", tile: CORE_TILES[3] },
    { tick: 4453, type: "upgrade", tile: CORE_TILES[4] },
    { tick: 4460, type: "upgrade", tile: CORE_TILES[5] },
    { tick: 4481, type: "upgrade", tile: CORE_TILES[6] },
    { tick: 4495, type: "upgrade", tile: CORE_TILES[7] },
    { tick: 4503, type: "upgrade", tile: CORE_TILES[8] },
    { tick: 4518, type: "upgrade", tile: CORE_TILES[9] },
    { tick: 4537, type: "upgrade", tile: CORE_TILES[10] },
    { tick: 4552, type: "upgrade", tile: CORE_TILES[11] },
    { tick: 4580, type: "upgrade", tile: CORE_TILES[0] },
    { tick: 4801, type: "upgrade", tile: CORE_TILES[0] },
    { tick: 4857, type: "upgrade", tile: CORE_TILES[0] },
    { tick: 4863, type: "upgrade", tile: CORE_TILES[0] },
    { tick: 4906, type: "upgrade", tile: CORE_TILES[0] },
    { tick: 4927, type: "upgrade", tile: CORE_TILES[0] },
    { tick: 4956, type: "upgrade", tile: CORE_TILES[0] },
    { tick: 4983, type: "upgrade", tile: CORE_TILES[0] },
  ],
};

describe("determinism golden gate", () => {
  it("plays a real defense (kills, an upgrade, a sell) and reproduces the committed hash", () => {
    const result = runReplay(REPLAY);

    // Inertness self-checks — run unconditionally, including in
    // UPDATE_GOLDEN=1 regeneration mode, so a future edit that accidentally
    // makes this replay inert (e.g. placements drifting onto occupied/out-
    // of-range tiles) fails loud instead of quietly re-pinning a zero-kill
    // fixture the way the original version of this file did.
    expect(result.score).toBeGreaterThan(0);
    expect(result.wave).toBeGreaterThanOrEqual(20);
    expect(result.maxTowerLevel).toBeGreaterThan(0);

    if (process.env.UPDATE_GOLDEN === "1") {
      writeFileSync(FIXTURE, JSON.stringify({ replay: REPLAY, ...result }, null, 2) + "\n");
      // eslint-disable-next-line no-console
      console.warn("golden fixture written — inspect and commit it");
    } else if (!existsSync(FIXTURE)) {
      // Missing fixture must fail loud, not silently re-baseline — a
      // deleted/missing fixture is a real problem (e.g. a bad rebase), not
      // an invitation to write a new "first run" baseline unattended.
      throw new Error(
        `Golden fixture missing at ${FIXTURE}. Run ` +
          "\`UPDATE_GOLDEN=1 npx vitest run src/game/test/determinism.test.ts\`, " +
          "inspect the result (score > 0, wave >= 20, maxTowerLevel > 0), then commit the fixture."
      );
    }

    const golden = JSON.parse(readFileSync(FIXTURE, "utf8"));
    expect(result.hash).toBe(golden.hash);
    expect(result.score).toBe(golden.score);
    expect(result.wave).toBe(golden.wave);
  });
});
