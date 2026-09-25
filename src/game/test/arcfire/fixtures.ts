// src/game/test/arcfire/fixtures.ts
//
// Shared boards for the Arcfire weapon tests (test-only; outside the sim
// purity roots). flatBattle() is Plan 1's resolve.test.ts board: battle
// phase, flat ground at y = 400, player 0 to shoot, no wind, rosterSize 8.
// corpusState() is a real STANDARD_SETTINGS match with no AI in it: the
// Plan 2B engine tests, the AI units and the AI corpus share it (so it lands
// with the first 2B task, before any AI module exists).
import { nextU32 } from "@/game/sim/math/rng";
import { applyPick, applyTurn, createMatch } from "@/game/titles/arcfire/match";
import { spansFromHeight } from "@/game/titles/arcfire/terrain";
import { SUDDEN_DEATH_WEAPON } from "@/game/titles/arcfire/constants";
import { STANDARD_SETTINGS, type MatchSettings, type MatchState } from "@/game/titles/arcfire/state";

const SMALL: MatchSettings = { weaponsEach: 3, poolSize: 8, wind: false, guaranteeTags: [], rosterSize: 8 };

/** Battle phase on flat ground at y = 400 with the tanks at x0 / x1 (default 300 / 700), player 0 to shoot, no wind. */
export function flatBattle(x0 = 300, x1 = 700): MatchState {
  const m = createMatch(1, SMALL);
  m.terrain.height.fill(400);
  spansFromHeight(m.terrain);
  m.tankX[0] = x0;
  m.tankX[1] = x1;
  m.phase = "battle";
  m.shooter = 0;
  return m;
}

/** Reshape the board: height[x] = f(x) for every column (f may read the old height), then rebuild the spans. Returns m. */
export function setHeights(m: MatchState, f: (x: number) => number): MatchState {
  for (let x = 0; x < m.terrain.height.length; x++) m.terrain.height[x] = f(x);
  spansFromHeight(m.terrain);
  return m;
}

/** A STANDARD_SETTINGS match after the lowest-free-slot draft (never `power`), then `shots` fixed shots (the first weapon in hand at 50 or 130, power 65). */
export function corpusState(seed: number, shots: number): MatchState {
  const m = createMatch(seed, STANDARD_SETTINGS);
  while (m.phase === "draft") applyPick(m, m.poolOwner.findIndex((o) => o === -1));
  for (let i = 0; i < shots && m.phase !== "over"; i++) {
    const p = m.shooter;
    applyTurn(m, { move: 0, w: m.phase === "suddenDeath" ? SUDDEN_DEATH_WEAPON : m.hands[p][0], angle: p === 0 ? 50 : 130, power: 65 });
  }
  return m;
}

/** The AI units' 8 battle boards: corpusState 11/0 and 23/9, each with either player to shoot, windless and with wind 40. */
export function battleBoards(): MatchState[] {
  const out: MatchState[] = [];
  for (const [seed, shots] of [[11, 0], [23, 9]]) {
    for (const shooter of [0, 1]) {
      for (const wind of [0, 40]) {
        const m = corpusState(seed, shots);
        m.phase = "battle";
        m.shooter = shooter;
        m.wind = wind;
        out.push(m);
      }
    }
  }
  return out;
}

/** The RNG state after n more draws from `state`: what a decision that draws n values must leave behind. */
export function rngAfter(state: number, n: number): number {
  const r = { state };
  for (let i = 0; i < n; i++) nextU32(r);
  return r.state;
}
