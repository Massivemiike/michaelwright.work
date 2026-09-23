import { describe, it, expect } from "vitest";
import { createMatch } from "./match";
import { resolveTurn } from "./resolve";
import { cloneMatch, type MatchSettings, type MatchState } from "./state";
import { spansFromHeight } from "./terrain";
import { ROSTER_INDEX } from "./weapons/roster";
import { MOVE_STEP, MOVES_PER_MATCH } from "./constants";

const SMALL: MatchSettings = { weaponsEach: 3, poolSize: 8, wind: false, guaranteeTags: [] };
const PULSE = ROSTER_INDEX.pulse;

/** A battle-phase match on flat ground (y = 400) with tanks at x = 300 and 700, player 0 to shoot. */
function flatBattle(): MatchState {
  const m = createMatch(1, SMALL);
  m.terrain.height.fill(400);
  spansFromHeight(m.terrain);
  m.tankX[0] = 300;
  m.tankX[1] = 700;
  m.phase = "battle";
  m.shooter = 0;
  return m;
}

describe("resolveTurn", () => {
  it("scores a self-hit for the OPPONENT", () => {
    const m = flatBattle();
    const tl = resolveTurn(m, { move: 0, weapon: PULSE, angle: 90, power: 0 }); // drops straight back down
    expect(tl.points).toEqual([0, 40]);
    expect(Array.from(m.scores)).toEqual([0, 40]);
    expect(tl.events).toContainEqual(expect.objectContaining({ kind: "damage", target: 0, amount: 40 }));
  });
  it("craters the ground and scores nothing on a far miss", () => {
    const m = flatBattle();
    const tl = resolveTurn(m, { move: 0, weapon: PULSE, angle: 60, power: 30 });
    const blast = tl.events.find((e) => e.kind === "blast");
    expect(blast).toBeDefined();
    expect(tl.points).toEqual([0, 0]);
    if (blast && blast.kind === "blast") expect(m.terrain.height[blast.x]).toBeGreaterThan(400);
  });
  it("some aim lands a Pulse on the opponent for points", () => {
    let best = 0;
    for (let power = 30; power <= 100 && best === 0; power += 2) {
      for (let angle = 20; angle <= 70 && best === 0; angle += 2) {
        best = resolveTurn(flatBattle(), { move: 0, weapon: PULSE, angle, power }).points[0];
      }
    }
    expect(best).toBeGreaterThan(0);
  });
  it("fans a volley symmetrically around the aim", () => {
    const tl = resolveTurn(flatBattle(), { move: 0, weapon: ROSTER_INDEX.fan, angle: 45, power: 50 });
    expect(tl.shells.map((s) => s.angle)).toEqual([39, 42, 45, 48, 51]);
  });
  it("moves before firing", () => {
    const m = flatBattle();
    const tl = resolveTurn(m, { move: 1, weapon: PULSE, angle: 45, power: 10 });
    expect(tl.move).toEqual({ fromX: 300, toX: 300 + MOVE_STEP });
    expect(m.tankX[0]).toBe(300 + MOVE_STEP);
    expect(m.movesLeft[0]).toBe(MOVES_PER_MATCH - 1);
    expect(tl.shells[0].points[0]).toBeGreaterThan(300 + MOVE_STEP); // the muzzle moved with the tank
  });
  it("is deterministic across clones", () => {
    const a = flatBattle();
    const b = cloneMatch(a);
    const ta = resolveTurn(a, { move: 0, weapon: ROSTER_INDEX.nova, angle: 50, power: 70 });
    const tb = resolveTurn(b, { move: 0, weapon: ROSTER_INDEX.nova, angle: 50, power: 70 });
    expect(tb).toEqual(ta);
    expect(Array.from(b.terrain.height)).toEqual(Array.from(a.terrain.height));
  });
});
