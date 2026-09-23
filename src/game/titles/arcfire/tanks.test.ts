import { describe, it, expect } from "vitest";
import { createMatch } from "./match";
import { hitCircles, moveTarget } from "./tanks";
import { spansFromHeight } from "./terrain";
import type { MatchSettings } from "./state";
import { MOVE_STEP, MIN_TANK_SEP, TANK_EDGE_MARGIN, TANK_HIT_DY, WORLD_W } from "./constants";

const SMALL: MatchSettings = { weaponsEach: 3, poolSize: 8, wind: false, guaranteeTags: [] };

/** A match on flat ground (y = 400) with the tanks at x0 and x1. */
function onFlat(x0: number, x1: number) {
  const m = createMatch(1, SMALL);
  m.terrain.height.fill(400);
  spansFromHeight(m.terrain);
  m.tankX[0] = x0;
  m.tankX[1] = x1;
  return m;
}

describe("hitCircles", () => {
  it("centres each hitbox TANK_HIT_DY above the surface under its tank", () => {
    const m = onFlat(300, 700);
    m.terrain.height[700] = 350;
    expect(hitCircles(m)).toEqual([
      { x: 300, y: 400 - TANK_HIT_DY },
      { x: 700, y: 350 - TANK_HIT_DY },
    ]);
  });
});

describe("moveTarget", () => {
  it("steps MOVE_STEP px either way", () => {
    const m = onFlat(300, 700);
    expect(moveTarget(m, 0, 1)).toBe(300 + MOVE_STEP);
    expect(moveTarget(m, 0, -1)).toBe(300 - MOVE_STEP);
  });
  it("is illegal with no moves left", () => {
    const m = onFlat(300, 700);
    m.movesLeft[0] = 0;
    expect(moveTarget(m, 0, 1)).toBe(-1);
  });
  it("keeps tank centres inside the edge margin (landing exactly on it is legal)", () => {
    expect(moveTarget(onFlat(TANK_EDGE_MARGIN + MOVE_STEP - 1, 700), 0, -1)).toBe(-1);
    const edge = WORLD_W - 1 - TANK_EDGE_MARGIN;
    expect(moveTarget(onFlat(300, edge - MOVE_STEP), 1, 1)).toBe(edge);
  });
  it("won't bring the tank centres closer than MIN_TANK_SEP", () => {
    expect(moveTarget(onFlat(500, 500 + MOVE_STEP + MIN_TANK_SEP - 1), 0, 1)).toBe(-1);
    expect(moveTarget(onFlat(500, 500 + MOVE_STEP + MIN_TANK_SEP), 0, 1)).toBe(500 + MOVE_STEP);
  });
});
