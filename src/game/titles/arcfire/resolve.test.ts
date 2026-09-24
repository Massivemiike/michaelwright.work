import { describe, it, expect } from "vitest";
import { createMatch } from "./match";
import { resolveTurn } from "./resolve";
import { cloneMatch, type MatchSettings, type MatchState } from "./state";
import { spansFromHeight } from "./terrain";
import { ROSTER_INDEX } from "./weapons/roster";
import { MOVE_STEP, MOVES_PER_MATCH, WORLD_W } from "./constants";

const SMALL: MatchSettings = { weaponsEach: 3, poolSize: 8, wind: false, guaranteeTags: [], rosterSize: 8 };
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
  it("never clamps a volley near the horizon: the fan stays symmetric about the aim", () => {
    const low = resolveTurn(flatBattle(), { move: 0, weapon: ROSTER_INDEX.fan, angle: 2, power: 30 });
    expect(low.shells.map((s) => s.angle)).toEqual([-4, -1, 2, 5, 8]);
    const high = resolveTurn(flatBattle(), { move: 0, weapon: ROSTER_INDEX.fan, angle: 178, power: 30 });
    expect(high.shells.map((s) => s.angle)).toEqual([172, 175, 178, 181, 184]);
  });
  it("lands a Fan volley on the opponent: one terminal event per shell", () => {
    const tl = resolveTurn(flatBattle(), { move: 0, weapon: ROSTER_INDEX.fan, angle: 36, power: 48 });
    const terminal = tl.events.filter((e) => e.kind === "blast" || e.kind === "out");
    expect(terminal.length).toBe(5); // a shell that hit a tank must stop, not blast again next step
    expect(terminal.map((e) => e.shell).sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4]);
    expect(tl.points).toEqual([50, 0]); // 51 under Plan 1's floored distance (exact damage, Plan 2A Task 3)
  });
  it("scores nothing and leaves the ground alone when the shot leaves the world", () => {
    const m = flatBattle();
    const before = Array.from(m.terrain.height);
    const tl = resolveTurn(m, { move: 0, weapon: PULSE, angle: 170, power: 100 }); // off the left edge
    expect(tl.events.filter((e) => e.kind === "out").length).toBe(1);
    expect(tl.events.some((e) => e.kind === "blast")).toBe(false);
    expect(tl.points).toEqual([0, 0]);
    expect(Array.from(m.terrain.height)).toEqual(before);
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

describe("the timeline", () => {
  it("records the settled heightfield", () => {
    const m = flatBattle();
    const tl = resolveTurn(m, { move: 0, weapon: ROSTER_INDEX.fan, angle: 36, power: 48 });
    expect(Array.from(tl.settle.heights)).toEqual(Array.from(m.terrain.height));
  });
  it("ends each shell's path at its terminal event", () => {
    for (const [weapon, angle, power] of [[ROSTER_INDEX.fan, 36, 48], [PULSE, 170, 100], [PULSE, 60, 30]]) {
      const tl = resolveTurn(flatBattle(), { move: 0, weapon, angle, power });
      for (const e of tl.events) {
        if (e.kind !== "blast" && e.kind !== "out") continue;
        expect(tl.shells[e.shell].points.slice(-2)).toEqual([e.x, e.y]);
      }
    }
  });
  it("records the dirt that falls when a blast undercuts a cliff", () => {
    const m = flatBattle();
    for (let x = 450; x < WORLD_W; x++) m.terrain.height[x] = 200; // a sheer 200 px cliff face at x = 450
    spansFromHeight(m.terrain);
    const tl = resolveTurn(m, { move: 0, weapon: PULSE, angle: 0, power: 100 }); // flat and fast into the face
    expect(tl.events.find((e) => e.kind === "blast")).toMatchObject({ x: 450, y: 393 }); // well below the top
    expect(tl.settle.falls.length).toBeGreaterThan(0);
    expect(tl.settle.falls).toContainEqual({ x: 450, top: 200, bottom: 365, fall: 57 });
    expect(m.terrain.height[450]).toBe(257);
    expect(Array.from(tl.settle.heights)).toEqual(Array.from(m.terrain.height));
  });
});
