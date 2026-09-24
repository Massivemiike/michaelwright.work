// src/game/titles/arcfire/ballistics.ts
//
// Shell flight (spec §3.2): launch from the muzzle along an integer angle,
// then fixed 1/60 s steps of semi-implicit Euler in Q16.16. Each step's
// movement is swept in <= 1 px increments against the tank hitboxes and the
// terrain spans, so nothing tunnels through a thin wall or clips past a tank.
import type { Fx } from "@/game/sim/types";
import { fromInt, toInt, mul } from "@/game/sim/math/fixed";
import { cosDeg, sinDeg } from "./aimTable";
import { isSolid, type Terrain } from "./terrain";
import {
  WORLD_W, STEPS_PER_SEC, GRAVITY_STEP, V_UNIT, MAX_FLIGHT_STEPS, BARREL_LEN, TANK_HIT_R,
} from "./constants";
import { idiv, floorPx } from "./imath";

export interface Shell {
  x: Fx;
  y: Fx;
  vx: Fx; // px/s
  vy: Fx; // px/s, positive = falling
  gravityStep: Fx; // fall-speed gain per step (weapon-scaled gravity)
  steps: number; // steps flown so far
  alive: boolean;
}

/** A tank hitbox centre in px; the radius is TANK_HIT_R. */
export interface HitCircle {
  x: number;
  y: number;
}

export type Impact =
  | { kind: "terrain"; x: number; y: number }
  | { kind: "tank"; x: number; y: number; tank: number }
  | { kind: "out"; x: number; y: number }; // left the world sideways, or hit the flight cap

/** The muzzle point for a hitbox centre and an integer angle (any integer degrees), px. */
export function muzzle(cx: number, cy: number, angleDeg: number): { x: number; y: number } {
  return {
    x: cx + toInt(mul(fromInt(BARREL_LEN), cosDeg(angleDeg))),
    y: cy - toInt(mul(fromInt(BARREL_LEN), sinDeg(angleDeg))),
  };
}

export function launchShell(
  x: number, y: number, angleDeg: number, power: number, speedPct = 100, gravityPct = 100
): Shell {
  const speed = idiv(power * V_UNIT * speedPct, 100);
  return {
    x: fromInt(x),
    y: fromInt(y),
    vx: mul(speed, cosDeg(angleDeg)),
    vy: 0 - mul(speed, sinDeg(angleDeg)),
    gravityStep: idiv(GRAVITY_STEP * gravityPct, 100),
    steps: 0,
    alive: true,
  };
}

/**
 * Advance one physics step. Returns the first impact along the swept path, or
 * null while the shell is still flying. windStep is the horizontal velocity
 * change per step (Fx). Pixels are floored (floorPx): column c is [c, c + 1),
 * so the left world edge is exactly x = 0.
 */
export function stepShell(s: Shell, t: Terrain, tanks: readonly HitCircle[], windStep: Fx): Impact | null {
  s.vx += windStep;
  s.vy += s.gravityStep;
  const nx = s.x + idiv(s.vx, STEPS_PER_SEC);
  const ny = s.y + idiv(s.vy, STEPS_PER_SEC);
  const n = Math.max(Math.abs(floorPx(nx) - floorPx(s.x)), Math.abs(floorPx(ny) - floorPx(s.y)), 1);
  const r2 = TANK_HIT_R * TANK_HIT_R;
  for (let i = 1; i <= n; i++) {
    const cx = floorPx(s.x + idiv((nx - s.x) * i, n));
    const cy = floorPx(s.y + idiv((ny - s.y) * i, n));
    if (cx < 0 || cx >= WORLD_W) {
      s.alive = false;
      return { kind: "out", x: cx, y: cy };
    }
    for (let k = 0; k < tanks.length; k++) {
      const dx = cx - tanks[k].x;
      const dy = cy - tanks[k].y;
      if (dx * dx + dy * dy <= r2) {
        s.alive = false;
        return { kind: "tank", x: cx, y: cy, tank: k };
      }
    }
    if (isSolid(t, cx, cy)) {
      s.alive = false;
      return { kind: "terrain", x: cx, y: cy };
    }
  }
  s.x = nx;
  s.y = ny;
  s.steps++;
  if (s.steps >= MAX_FLIGHT_STEPS) {
    s.alive = false;
    return { kind: "out", x: floorPx(nx), y: floorPx(ny) };
  }
  return null;
}
