import { describe, it, expect } from "vitest";
import { fromInt } from "@/game/sim/math/fixed";
import { makeTerrain, spansFromHeight, type Terrain } from "./terrain";
import { launchShell, stepShell, muzzle, shellAt, rotateVel, type HitCircle, type Impact, type Shell } from "./ballistics";
import { floorPx } from "./imath";
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
    const s = shellAt(fromInt(600), fromInt(100), 0, 0, 0, 0);
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

describe("Plan 2A carry-forwards", () => {
  it("muzzle and launch take any integer angle, including below the horizon", () => {
    expect(muzzle(500, 300, -90)).toEqual({ x: 500, y: 300 + BARREL_LEN });
    expect(muzzle(500, 300, 270)).toEqual({ x: 500, y: 300 + BARREL_LEN });
    const down = launchShell(100, 100, -30, 50);
    expect(down.vy).toBeGreaterThan(0); // leaves downward
    expect(down.vx).toBe(launchShell(100, 100, 30, 50).vx);
  });
  it("floors pixels: a shell crossing x in (-1, 0) is off the world at column -1", () => {
    // x = 100/65536 px, moving left at 6 px/s: its first sample is at x ≈ -0.098 px
    const s = shellAt(100, fromInt(100), fromInt(-6), 0, 0, 0);
    expect(stepShell(s, flat(400), [], 0)).toEqual({ kind: "out", x: -1, y: 100 });
    expect(s.alive).toBe(false);
  });
});

describe("rotateVel", () => {
  it("turns a rightward velocity toward up for a positive angle (aim sense)", () => {
    expect(rotateVel(fromInt(100), 0, 90)).toEqual([0, fromInt(-100)]);
  });
});

describe("the apex latch", () => {
  it("a stopAtApex shell ends on the step it stops rising, without moving that step", () => {
    const s = launchShell(600, 300, 60, 50);
    s.stopAtApex = true;
    const t = flat(WORLD_H);
    let step = 0;
    let hit: Impact | null = null;
    let at = { x: s.x, y: s.y };
    while (hit === null) {
      step++;
      const vyBefore = s.vy;
      at = { x: s.x, y: s.y };
      hit = stepShell(s, t, [], 0);
      if (hit !== null) {
        expect(vyBefore).toBeLessThan(0); // rising before the step's gravity ...
        expect(s.vy).toBeGreaterThanOrEqual(0); // ... and not after it
      }
    }
    expect(step).toBe(60);
    expect(hit).toEqual({ kind: "apex", x: floorPx(at.x), y: floorPx(at.y), fx: at.x, fy: at.y });
    expect([s.x, s.y]).toEqual([at.x, at.y]); // it did not move on the apex step
    expect([s.apexed, s.alive]).toEqual([true, false]);
  });
  it("a shell launched level never apexes", () => {
    const s = launchShell(100, 300, 0, 50);
    s.stopAtApex = true;
    expect(fly(s, flat(400)).kind).toBe("terrain");
    expect(s.apexed).toBe(false);
  });
});

describe("the spawn-inside mask", () => {
  it("ignores the tank it spawned inside until a sample leaves the hitbox, then can hit it", () => {
    const tanks = [{ x: 600, y: 300 }];
    const t = flat(WORLD_H);
    const s = shellAt(fromInt(600), fromInt(300), fromInt(600), 0, fromInt(600), 0); // 10 px/step right, no gravity
    s.ignore = 1;
    const back = fromInt(-40); // wind: -40 px/s per step, so it turns around after 15 steps
    let hit: Impact | null = null;
    for (let step = 1; hit === null && step <= 100; step++) {
      hit = stepShell(s, t, tanks, back);
      if (step === 1) expect(s.ignore).toBe(1); // still inside
      if (step === 2) expect(s.ignore).toBe(0); // a sample left the hitbox
    }
    expect(hit).toMatchObject({ kind: "tank", tank: 0, x: 614, y: 300 }); // back into it from the right
  });
});

describe("a spawn point is never tested (only the samples after it are)", () => {
  // flat ground at 400, no tanks, no wind, no gravity
  it("a shell spawned inside the ground impacts at its first sample", () => {
    const s = shellAt(fromInt(600), fromInt(420), fromInt(60), 0, fromInt(60), 0); // 20 px deep, 1 px/step right
    expect(stepShell(s, flat(400), [], 0)).toEqual({ kind: "terrain", x: 601, y: 420, fx: fromInt(600), fy: fromInt(420) });
  });
  it("a shell spawned on a surface pixel moving out flies on", () => {
    const s = shellAt(fromInt(600), fromInt(400), 0, fromInt(-60), fromInt(60), 0); // rising 1 px/step
    expect(stepShell(s, flat(400), [], 0)).toBeNull();
    expect([floorPx(s.x), floorPx(s.y), s.alive]).toEqual([600, 399, true]);
  });
  it("a shell spawned off the world is out at its first sample", () => {
    const s = shellAt(fromInt(-5), fromInt(300), fromInt(60), 0, fromInt(60), 0);
    expect(stepShell(s, flat(400), [], 0)).toEqual({ kind: "out", x: -4, y: 300 });
  });
});
