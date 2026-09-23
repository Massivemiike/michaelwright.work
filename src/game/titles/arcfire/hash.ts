// src/game/titles/arcfire/hash.ts
//
// hashMatch: FNV-1a over every integer field of a MatchState in one fixed,
// canonical order (spec §3.4). Used per turn (future desync detection) and as
// the final verification hash. Engine-exact: integer folds only.
import { FNV_OFFSET, fnvFold, fnvHex } from "@/game/sim/hash";
import type { MatchState, Phase } from "./state";

const PHASE_CODE: Record<Phase, number> = { draft: 0, battle: 1, suddenDeath: 2, over: 3 };

export function hashMatch(m: MatchState): string {
  const s = m.settings;
  let h = FNV_OFFSET;
  for (const v of [
    s.weaponsEach, s.poolSize, s.wind ? 1 : 0, s.guaranteeTags.length,
    PHASE_CODE[m.phase], m.rng.state, m.firstPicker, m.picksMade, m.shooter, m.shotsFired,
    m.wind, m.winner, m.scores[0], m.scores[1],
    m.tankX[0], m.tankX[1], m.movesLeft[0], m.movesLeft[1], m.pool.length,
  ]) h = fnvFold(h, v);
  for (let i = 0; i < m.pool.length; i++) {
    h = fnvFold(h, m.pool[i]);
    h = fnvFold(h, m.poolOwner[i]);
  }
  for (const hand of m.hands) {
    h = fnvFold(h, hand.length);
    for (const w of hand) h = fnvFold(h, w);
  }
  for (let x = 0; x < m.terrain.height.length; x++) h = fnvFold(h, m.terrain.height[x]);
  return fnvHex(h);
}
