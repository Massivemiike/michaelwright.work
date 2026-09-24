// src/game/test/arcfire/fixtures.ts
//
// Shared boards for the Arcfire weapon tests (test-only; outside the sim
// purity roots). flatBattle() is Plan 1's resolve.test.ts board: battle
// phase, flat ground at y = 400, player 0 to shoot, no wind, rosterSize 8.
import { createMatch } from "@/game/titles/arcfire/match";
import { spansFromHeight } from "@/game/titles/arcfire/terrain";
import type { MatchSettings, MatchState } from "@/game/titles/arcfire/state";

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
