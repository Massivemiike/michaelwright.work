import { describe, it, expect } from "vitest";
import { fromInt } from "@/game/sim/math/fixed";
import { makeTerrain, spansFromHeight, type Terrain } from "./terrain";
import { launchShell, stepShell, muzzle, type HitCircle, type Impact, type Shell } from "./ballistics";
import { WORLD_H, V_UNIT, MAX_FLIGHT_STEPS, BARREL_LEN, MAX_SPANS, GRAVITY_STEP } from "./constants";

function flat(y: number): Terrain {
  const t = makeTerrain();
  t.height.fill(y);
  spansFromHeight(t);
  return t;
}

function fly(s: Shell, t: Terrain = flat(WORLD_H), tanks: HitCircle[] = [], wind = 0): Impact {
  for (;;) {
    const hit = stepShell(s, t, tanks, wind);
    if (hit) return hit;
    expect(s.alive).toBe(true); // still flying after every step that returned null
  }
}

describe("launchShell", () => {
  it("splits the launch speed along the aim", () => {
    const right = launchShell(100, 100, 0, 100);
    expect(right.vx).toBe(100 * V_UNIT);
    expect(right.vy).toBe(0);
    const up = launchShell(100, 100, 90, 50);
    expect(up.vx).toBe(0);
    expect(up.vy).toBe(-50 * V_UNIT);
    expect(launchShell(100, 100, 180, 10).vx).toBe(-10 * V_UNIT);
  });
  it("scales speed and gravity by the weapon percentages", () => {
    const s = launchShell(0, 0, 0, 100, 180, 40);
    expect(s.vx).toBe(Math.trunc((100 * V_UNIT * 180) / 100));
    expect(s.gravityStep).toBe(Math.trunc((GRAVITY_STEP * 40) / 100));
  });
});

describe("muzzle", () => {
  it("sits BARREL_LEN from the hitbox centre along the aim", () => {
    expect(muzzle(500, 300, 0)).toEqual({ x: 500 + BARREL_LEN, y: 300 });
    expect(muzzle(500, 300, 90)).toEqual({ x: 500, y: 300 - BARREL_LEN });
    expect(muzzle(500, 300, 180)).toEqual({ x: 500 - BARREL_LEN, y: 300 });
  });
});

describe("stepShell", () => {
  it("lands a 45° half-power shot about where the range formula says", () => {
    // v = 342 px/s, g = 300 px/s²: ~409 px downrange for a 20 px drop to the ground
    const s = launchShell(100, 380, 45, 50);
    const hit = fly(s, flat(400));
    expect(hit.kind).toBe("terrain");
    expect(hit.x).toBeGreaterThan(470);
    expect(hit.x).toBeLessThan(530);
    expect(hit.y).toBe(400);
    expect(s.alive).toBe(false);
  });
  it("is alive while flying", () => {
    const s = launchShell(600, 100, 90, 60);
    expect(stepShell(s, flat(400), [], 0)).toBeNull();
    expect(s.alive).toBe(true);
  });
  it("sweeps: a fast shot cannot tunnel through a 2px wall", () => {
    const t = flat(WORLD_H); // an empty world
    for (const x of [600, 601]) {
      t.spanCount[x] = 1;
      t.spans[x * MAX_SPANS * 2] = 0;
      t.spans[x * MAX_SPANS * 2 + 1] = WORLD_H;
    }
    const hit = fly(launchShell(300, 250, 0, 100), t);
    expect(hit.kind).toBe("terrain");
    expect(hit.x).toBe(600);
  });
  it("hits a tank hitbox in its path", () => {
    const s = launchShell(300, 250, 0, 100);
    const hit = fly(s, flat(WORLD_H), [{ x: 500, y: 262 }]);
    expect(hit.kind).toBe("tank");
    if (hit.kind === "tank") expect(hit.tank).toBe(0);
    expect(s.alive).toBe(false);
  });
  it("reports 'out' when leaving the world sideways", () => {
    const s = launchShell(40, 250, 180, 100);
    const hit = fly(s);
    expect(hit.kind).toBe("out");
    expect(hit.x).toBeLessThan(0);
    expect(s.alive).toBe(false);
  });
  it("gives up at the flight cap", () => {
    const s: Shell = { x: fromInt(600), y: fromInt(100), vx: 0, vy: 0, gravityStep: 0, steps: 0, alive: true };
    expect(fly(s).kind).toBe("out");
    expect(s.steps).toBe(MAX_FLIGHT_STEPS);
    expect(s.alive).toBe(false);
  });
  it("wind pushes a shot sideways", () => {
    const calm = fly(launchShell(600, 100, 90, 60), flat(400));
    const windy = fly(launchShell(600, 100, 90, 60), flat(400), [], Math.trunc(fromInt(40) / 60));
    expect(windy.x).toBeGreaterThan(calm.x + 10);
  });
});
