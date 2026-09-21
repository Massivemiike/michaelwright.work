// src/game/test/balance.grid.test.ts
//
// Gated (BALANCE_SWEEP=1) §5.4 parameter-grid sweep. Extends the shipping
// sweep to vary startBank × gamma × alphaBp × BOUNTY_CAP (the last is
// INVENTED and spec-undocumented — see balance.ts). Reports the landscape
// and asserts the invariants the FROZEN shipping constants satisfy:
// winnable-and-climbing, active play beats pure banking, no trivial
// infinite survival. NOT run per-commit; the scheduled CI job runs it.
import { describe, it, expect } from "vitest";
import { makeSim } from "@/game/titles/circle-td";
import { applyCommand } from "@/game/sim/replay";
import { TILES, TILE_COUNT, TRACK, trackLength, posAt, TOWERS } from "@/game/titles/circle-td/content";
import { towerRangeSq } from "@/game/titles/circle-td/rules";
import { mul, fromInt } from "@/game/sim/math/fixed";

const FULL = process.env.BALANCE_SWEEP === "1";
const slowIt = FULL ? it : it.skip;

const TICK_CEILING = 2_000_000;
const DAMAGE_TOWER = 4;
const AFFORD: ReadonlyArray<{ type: number; cost: number }> = [
  { type: 4, cost: TOWERS[4].cost }, { type: 3, cost: TOWERS[3].cost },
  { type: 0, cost: TOWERS[0].cost }, { type: 1, cost: TOWERS[1].cost }, { type: 2, cost: TOWERS[2].cost },
];

function inRangeTiles(): number[] {
  const rSq = towerRangeSq(DAMAGE_TOWER, 0);
  const step = fromInt(8);
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
const TILES_CACHE = inRangeTiles();

interface Balance { startBank: number; gamma: number; alphaBp: number; bountyCap: number }

function playActive(seed: number, b: Balance): { wave: number; score: number; hitCeiling: boolean; peakBank: number } {
  const sim = makeSim({ seed, mode: "daily", balance: b });
  const tiles = TILES_CACHE;
  let next = 0;
  let peakBank = sim.state.bank;
  while (!sim.state.gameOver && sim.state.tick < TICK_CEILING) {
    if (next < tiles.length) {
      const pick = AFFORD.find((t) => sim.state.bank >= t.cost);
      if (pick) {
        const before = sim.state.towers.count;
        applyCommand(sim.state, { tick: sim.state.tick, type: "place", tower: pick.type, tile: tiles[next] });
        if (sim.state.towers.count > before) next++;
      }
    }
    sim.tick();
    if (sim.state.bank > peakBank) peakBank = sim.state.bank;
  }
  return { wave: sim.state.wave, score: sim.state.score, hitCeiling: sim.state.tick >= TICK_CEILING, peakBank };
}

function playBanking(seed: number, b: Balance): number {
  const sim = makeSim({ seed, mode: "daily", balance: b });
  while (!sim.state.gameOver && sim.state.tick < TICK_CEILING) sim.tick();
  return sim.state.wave;
}

// Shipping (frozen) constants — see balance.ts / content.ts.
const SHIPPING: Balance = { startBank: 125, gamma: 5, alphaBp: 110, bountyCap: 17 };
const SEEDS = [20260918, 1, 2, 3, 4];

describe("balance grid sweep (spec §5.4, incl. BOUNTY_CAP)", () => {
  slowIt("reports the startBank×gamma×alphaBp×bountyCap landscape", () => {
    const startBanks = [125, 250];
    const gammas = [5, 10, 20];
    const alphas = [200];
    const caps = [25, 50, 1_000_000]; // include a near-uncapped cell to show the glut it prevents
    for (const startBank of startBanks) for (const gamma of gammas) for (const alphaBp of alphas) for (const bountyCap of caps) {
      const b = { startBank, gamma, alphaBp, bountyCap };
      const r = playActive(20260918, b);
      // eslint-disable-next-line no-console
      console.log(`[grid] ${JSON.stringify(b)} → wave=${r.wave} score=${r.score} peakBank=${r.peakBank} hitCeiling=${r.hitCeiling}`);
    }
    expect(true).toBe(true); // reporting cell; assertions live in the invariant tests below
  }, 300_000);

  slowIt("FROZEN constants: active defense is winnable-and-climbing across seeds (floor 45)", () => {
    const min = Math.min(...SEEDS.map((s) => playActive(s, SHIPPING).wave));
    // eslint-disable-next-line no-console
    console.log(`[grid] shipping min wave across seeds = ${min}`);
    expect(min).toBeGreaterThanOrEqual(45);
  }, 300_000);

  slowIt("FROZEN constants: no trivial infinite survival (terminates by gameOver)", () => {
    for (const s of SEEDS) expect(playActive(s, SHIPPING).hitCeiling).toBe(false);
  }, 300_000);

  slowIt("FROZEN constants: active defense outlasts pure banking (degenerate strategy loses)", () => {
    for (const s of SEEDS) expect(playActive(s, SHIPPING).wave).toBeGreaterThan(playBanking(s, SHIPPING));
  }, 300_000);

  slowIt("BOUNTY_CAP binds the late economy: uncapped bounty balloons peak bank far past the capped shipping cell", () => {
    // BOUNTY_CAP governs the ECONOMY, not survival. Under this place-only
    // strategy every tile is filled identically capped or uncapped, so both
    // runs die at ~the same wave — the cap's effect shows in BANK, not wave:
    // uncapped, late huge-HP kills pay thousands each and the bank gluts;
    // capped, each kill pays <= BOUNTY_CAP so the bank stays flat. See
    // balance.ts / the balance-tuning doc (~8k capped vs ~3.15M uncapped).
    const capped = playActive(20260918, SHIPPING);
    const uncapped = playActive(20260918, { ...SHIPPING, bountyCap: 1_000_000 });
    // eslint-disable-next-line no-console
    console.log(`[grid] peakBank capped=${capped.peakBank} vs uncapped=${uncapped.peakBank} (waves ${capped.wave}/${uncapped.wave})`);
    expect(uncapped.peakBank).toBeGreaterThan(capped.peakBank * 3);
  }, 300_000);
});
