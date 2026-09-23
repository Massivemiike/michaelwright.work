// src/game/titles/arcfire/tanks.ts
//
// Tank placement and movement (spec §2). A tank's centre column is its x; it
// always rests on the settled surface there, and its hitbox circle sits
// TANK_HIT_DY above that surface point.
import { WORLD_W, TANK_HIT_DY, MOVE_STEP, MIN_TANK_SEP, TANK_EDGE_MARGIN } from "./constants";
import type { HitCircle } from "./ballistics";
import type { MatchState } from "./state";

/** Both tanks' hitbox centres on the current settled terrain. */
export function hitCircles(m: MatchState): HitCircle[] {
  return [0, 1].map((p) => ({ x: m.tankX[p], y: m.terrain.height[m.tankX[p]] - TANK_HIT_DY }));
}

/** Where player p would end up moving one step in `dir`, or -1 if illegal (no moves left, past the edge margin, or too close to the other tank). */
export function moveTarget(m: MatchState, p: number, dir: -1 | 1): number {
  if (m.movesLeft[p] <= 0) return -1;
  const nx = m.tankX[p] + dir * MOVE_STEP;
  if (nx < TANK_EDGE_MARGIN || nx > WORLD_W - 1 - TANK_EDGE_MARGIN) return -1;
  if (Math.abs(nx - m.tankX[1 - p]) < MIN_TANK_SEP) return -1;
  return nx;
}
