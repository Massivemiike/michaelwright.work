// src/game/titles/arcfire/match.ts
//
// The match state machine (spec §2): create → draft picks → alternating turns
// → sudden death on a tie → over. Every command is validated here; an illegal
// one changes nothing and is reported as "invalid_command" (a replay log
// containing one is rejected whole).
import { makeRng, nextRange } from "@/game/sim/math/rng";
import { makeTerrain, generateTerrain } from "./terrain";
import { drawPool, pickerAt } from "./draft";
import { ROSTER } from "./weapons/roster";
import { SPAWN_X, MOVES_PER_MATCH, WIND_MAX } from "./constants";
import type { MatchSettings, MatchState } from "./state";

export type PickResult = { ok: true } | { ok: false; reason: "invalid_command" };

/** A fresh match: seeded terrain, both tanks spawned, the pool drawn, the coin flipped. */
export function createMatch(seed: number, settings: MatchSettings): MatchState {
  if (settings.poolSize < settings.weaponsEach * 2) {
    throw new RangeError(`createMatch: poolSize ${settings.poolSize} < 2 × weaponsEach ${settings.weaponsEach}`);
  }
  const rng = makeRng(seed);
  const terrain = makeTerrain();
  generateTerrain(terrain, rng);
  const pool = drawPool(rng, ROSTER, settings.poolSize, settings.guaranteeTags);
  const firstPicker = nextRange(rng, 2);
  return {
    settings,
    rng,
    phase: "draft",
    terrain,
    tankX: Int32Array.from(SPAWN_X),
    movesLeft: Int32Array.from([MOVES_PER_MATCH, MOVES_PER_MATCH]),
    pool,
    poolOwner: new Int32Array(pool.length).fill(-1),
    firstPicker,
    picksMade: 0,
    hands: [[], []],
    shooter: 1 - firstPicker,
    shotsFired: 0,
    wind: 0,
    scores: new Int32Array(2),
    winner: -1,
  };
}

/** Draft pick (by pool index) for whoever's pick it is. */
export function applyPick(m: MatchState, poolIndex: number): PickResult {
  if (m.phase !== "draft") return { ok: false, reason: "invalid_command" };
  if (!Number.isInteger(poolIndex) || poolIndex < 0 || poolIndex >= m.pool.length) {
    return { ok: false, reason: "invalid_command" };
  }
  if (m.poolOwner[poolIndex] !== -1) return { ok: false, reason: "invalid_command" };
  const p = pickerAt(m.firstPicker, m.picksMade);
  m.poolOwner[poolIndex] = p;
  m.hands[p].push(m.pool[poolIndex]);
  m.hands[p].sort((a, b) => a - b);
  m.picksMade++;
  if (m.picksMade === m.settings.weaponsEach * 2) {
    m.phase = "battle";
    m.shooter = 1 - m.firstPicker;
    beginTurn(m);
  }
  return { ok: true };
}

/** Draw this turn's wind (only when wind is enabled, so a windless match never consumes that RNG). */
function beginTurn(m: MatchState): void {
  m.wind = m.settings.wind ? nextRange(m.rng, WIND_MAX * 2 + 1) - WIND_MAX : 0;
}
