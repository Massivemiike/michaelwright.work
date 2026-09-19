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
// Recomputed here rather than hardcoding raw tile numbers: if content.ts's
// placeholder geometry is ever replaced (Plan 2), a hardcoded index could
// silently drift out of range, and a "place" command on an out-of-range-
// but-still-valid tile is a hash/score mismatch (loud), not a no-op — but a
// hardcoded index could just as easily drift onto a tile that's *still* in
// range yet behaves differently, so recomputing keeps this fixture's intent
// (place towers that can actually hit the track) tied to the real geometry
// instead of frozen numbers.
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
const TILE_A = IN_RANGE[12];  // Splash — core defense
const TILE_B = IN_RANGE[40];  // Splash — core defense
const TILE_C = IN_RANGE[55];  // Damage — placed once the bank affords it
const TILE_D = IN_RANGE[100]; // Fast — placed then immediately sold (exercises "sell" on a real tower)

// A fixed scripted run that actually plays: two Splash towers fund an early
// defense (Splash+Splash stays under the Damage tower's 260 cost, so the
// opening buy doesn't flip into the single-target/slow-cooldown trap — see
// docs/superpowers/2026-09-18-circle-td-balance-tuning.md), a filler Fast
// tower is bought and sold in the same tick purely to exercise "sell" on a
// tower that actually exists, and the two Splash towers plus a later Damage
// tower are upgraded to level 9 as the bank allows. Tick numbers were
// derived by driving the real sim with exactly this strategy (place when
// affordable, upgrade the lowest-level tower when affordable) and recording
// the ticks at which each command actually took effect — this is a fixed
// script now, not a live bot, so any future change to balance constants or
// tower stats will shift these numbers and require regenerating both the
// script and the fixture.
const REPLAY: Replay = {
  seed: 20260918,
  simVersion: SIM_VERSION,
  mode: "daily",
  commands: [
    { tick: 0, type: "place", tower: 3, tile: TILE_A },
    { tick: 0, type: "place", tower: 3, tile: TILE_B },
    { tick: 822, type: "place", tower: 0, tile: TILE_D },
    { tick: 822, type: "sell", tile: TILE_D },
    { tick: 1748, type: "upgrade", tile: TILE_A },
    { tick: 2669, type: "upgrade", tile: TILE_B },
    { tick: 3202, type: "upgrade", tile: TILE_A },
    { tick: 3636, type: "upgrade", tile: TILE_B },
    { tick: 3859, type: "upgrade", tile: TILE_A },
    { tick: 4417, type: "upgrade", tile: TILE_B },
    { tick: 4589, type: "upgrade", tile: TILE_A },
    { tick: 4758, type: "upgrade", tile: TILE_B },
    { tick: 4983, type: "upgrade", tile: TILE_A },
    { tick: 5085, type: "upgrade", tile: TILE_B },
    { tick: 5192, type: "upgrade", tile: TILE_A },
    { tick: 5474, type: "upgrade", tile: TILE_B },
    { tick: 5657, type: "upgrade", tile: TILE_A },
    { tick: 5726, type: "upgrade", tile: TILE_B },
    { tick: 5843, type: "upgrade", tile: TILE_A },
    { tick: 6183, type: "upgrade", tile: TILE_B },
    { tick: 6307, type: "upgrade", tile: TILE_A },
    { tick: 6378, type: "upgrade", tile: TILE_B },
    { tick: 6719, type: "place", tower: 4, tile: TILE_C },
    { tick: 6843, type: "upgrade", tile: TILE_C },
    { tick: 7284, type: "upgrade", tile: TILE_C },
    { tick: 7439, type: "upgrade", tile: TILE_C },
    { tick: 7558, type: "upgrade", tile: TILE_C },
    { tick: 8546, type: "upgrade", tile: TILE_C },
    { tick: 8767, type: "upgrade", tile: TILE_C },
    { tick: 9001, type: "upgrade", tile: TILE_C },
    { tick: 9208, type: "upgrade", tile: TILE_C },
    { tick: 9301, type: "upgrade", tile: TILE_C },
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
