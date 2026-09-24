// src/game/titles/arcfire/ballistics.ts
//
// Shell flight (spec §3.2): launch from the muzzle along an integer angle,
// then fixed 1/60 s steps of semi-implicit Euler in Q16.16. Each step's
// movement is swept in <= 1 px increments against the tank hitboxes and the
// terrain spans, so nothing tunnels through a thin wall or clips past a tank.
// Plan 2A adds the flight modifiers a Stage can ask for — stop at the apex,
// homing after the apex, bounces off the terrain or the side walls — and a
// shell spawned inside a tank's hitbox ignores that tank until it has left it.
// A shell with no modifiers takes exactly Plan 1's path (pixels are floored).
import type { Fx } from "@/game/sim/types";
import { fromInt, toInt, mul } from "@/game/sim/math/fixed";
import { cosDeg, sinDeg } from "./aimTable";
import { isSolid, type Terrain } from "./terrain";
import {
  WORLD_W, STEPS_PER_SEC, GRAVITY_STEP, V_UNIT, MAX_FLIGHT_STEPS, BARREL_LEN, TANK_HIT_R, BOUNCE_PROBE_R,
} from "./constants";
import { idiv, floorPx } from "./imath";

export interface Shell {
  x: Fx;
  y: Fx;
  vx: Fx; // px/s
  vy: Fx; // px/s, positive = falling
  gravityStep: Fx; // fall-speed gain per step (weapon-scaled gravity)
  steps: number; // steps flown so far (the per-shell flight cap counts these)
  alive: boolean;
  // --- Plan 2A
  speed: Fx; // nominal speed: the launch speed, or a child's split speed ("up"/"cone" splits scale it)
  apexed: boolean; // latched on the step a rising shell stops rising
  stopAtApex: boolean; // die with an "apex" result on the step `apexed` latches
  homeDeg: number; // > 0: once apexed, turn <= this many whole degrees per step toward (homeX, homeY)
  homeX: number;
  homeY: number;
  bounces: number; // terrain reflections left
  wallBounces: number; // side-wall reflections left
  restitutionPct: number; // speed kept per reflection
  ignore: number; // bitmask of tanks whose hitbox the shell spawned inside; a bit clears once a sample is outside
}

/** A tank hitbox centre in px; the radius is TANK_HIT_R. */
export interface HitCircle {
  x: number;
  y: number;
}

export type Impact =
  | { kind: "terrain"; x: number; y: number; fx: Fx; fy: Fx } // (x, y) = first solid px; (fx, fy) = last free position
  | { kind: "tank"; x: number; y: number; tank: number; fx: Fx; fy: Fx }
  | { kind: "apex"; x: number; y: number; fx: Fx; fy: Fx } // only for stopAtApex shells; the shell has not moved this step
  | { kind: "bounce"; x: number; y: number; wall: boolean } // reflected at (x, y); the shell is alive at its last free position
  | { kind: "out"; x: number; y: number }; // left the world sideways, or hit the per-shell flight cap

/** The muzzle point for a hitbox centre and an integer angle (any integer degrees), px. */
export function muzzle(cx: number, cy: number, angleDeg: number): { x: number; y: number } {
  return {
    x: cx + toInt(mul(fromInt(BARREL_LEN), cosDeg(angleDeg))),
    y: cy - toInt(mul(fromInt(BARREL_LEN), sinDeg(angleDeg))),
  };
}

/** A shell at Q16.16 position (x, y) with velocity (vx, vy), nominal speed `speed` and no flight modifiers. */
export function shellAt(x: Fx, y: Fx, vx: Fx, vy: Fx, speed: Fx, gravityStep: Fx): Shell {
  return {
    x, y, vx, vy, gravityStep, steps: 0, alive: true,
    speed, apexed: false, stopAtApex: false, homeDeg: 0, homeX: 0, homeY: 0,
    bounces: 0, wallBounces: 0, restitutionPct: 100, ignore: 0,
  };
}

/** A shell at (x, y) px flying at `speed` (Fx px/s) along an integer angle (any integer degrees). */
export function launchAt(x: number, y: number, angleDeg: number, speed: Fx, gravityStep: Fx): Shell {
  return shellAt(fromInt(x), fromInt(y), mul(speed, cosDeg(angleDeg)), 0 - mul(speed, sinDeg(angleDeg)), speed, gravityStep);
}

export function launchShell(
  x: number, y: number, angleDeg: number, power: number, speedPct = 100, gravityPct = 100
): Shell {
  return launchAt(x, y, angleDeg, idiv(power * V_UNIT * speedPct, 100), idiv(GRAVITY_STEP * gravityPct, 100));
}

/** Rotate a velocity by an integer angle in the aim sense (+ turns a rightward vector toward up). */
export function rotateVel(vx: Fx, vy: Fx, deg: number): [Fx, Fx] {
  const c = cosDeg(deg);
  const s = sinDeg(deg);
  return [mul(vx, c) + mul(vy, s), mul(vy, c) - mul(vx, s)];
}

/**
 * Turn the shell toward (homeX, homeY) by k = min(homeDeg, the whole degrees
 * between its heading and the target) — never past the target, so there is no
 * overshoot and no wobble. No arctangent: with dot > 0 the angle is < k exactly
 * when |cross| * cos k < dot * sin k, compared with the baked table. At
 * 90 degrees or more (dot <= 0) the full homeDeg turn is taken.
 */
function steer(s: Shell): void {
  const dx = s.homeX - floorPx(s.x);
  const dy = s.homeY - floorPx(s.y);
  const vx = idiv(s.vx, 256); // 1/256-px/s units: every product below stays < 2^52 for validator-legal data (see the magnitude notes)
  const vy = idiv(s.vy, 256);
  const cross = vx * dy - vy * dx; // < 0: the target is anticlockwise of the heading (aim sense)
  const dot = vx * dx + vy * dy;
  if (cross === 0 && dot >= 0) return; // dead on, at the target, or too slow to have a heading
  let k = s.homeDeg;
  if (dot > 0) {
    const ac = cross < 0 ? 0 - cross : cross;
    while (k > 0 && ac * cosDeg(k) < dot * sinDeg(k)) k--;
  }
  if (k === 0) return;
  const [rx, ry] = rotateVel(s.vx, s.vy, cross <= 0 ? k : 0 - k); // dead astern (cross 0, dot < 0) turns anticlockwise
  s.vx = rx;
  s.vy = ry;
}

/**
 * The outward surface direction at solid pixel (cx, cy): minus the sum of the
 * offsets of the solid pixels in a radius-BOUNCE_PROBE_R disc around it (their
 * centroid points into the ground). If that is zero or doesn't oppose the
 * motion, the way the shell came in, (fromX - cx, fromY - cy), is used
 * instead; it always opposes the motion, because the swept samples move
 * monotonically along the velocity. Never (0, 0). At BOUNCE_PROBE_R = 8 the
 * components are <= 330 (a half-disc's moment), from <= 197 isSolid probes.
 */
function surfaceNormal(s: Shell, t: Terrain, cx: number, cy: number, fromX: number, fromY: number): [number, number] {
  const r = BOUNCE_PROBE_R;
  let sx = 0;
  let sy = 0;
  for (let dy = 0 - r; dy <= r; dy++) {
    for (let dx = 0 - r; dx <= r; dx++) {
      if (dx * dx + dy * dy <= r * r && isSolid(t, cx + dx, cy + dy)) {
        sx += dx;
        sy += dy;
      }
    }
  }
  const nx = 0 - sx;
  const ny = 0 - sy;
  if ((nx !== 0 || ny !== 0) && s.vx * nx + s.vy * ny < 0) return [nx, ny];
  if (fromX !== cx || fromY !== cy) return [fromX - cx, fromY - cy];
  return [0, -1];
}

/** Mirror the velocity's component along normal (nx, ny) (any non-zero length) if it points into the surface, then keep restitutionPct of the speed. */
function reflect(s: Shell, nx: number, ny: number): void {
  const vn = s.vx * nx + s.vy * ny; // |v| < 2^31, |n| components <= 330: < 2^41
  if (vn < 0) {
    const nn = nx * nx + ny * ny; // >= 1
    s.vx -= idiv(2 * vn * nx, nn); // < 2^50
    s.vy -= idiv(2 * vn * ny, nn);
  }
  s.vx = idiv(s.vx * s.restitutionPct, 100);
  s.vy = idiv(s.vy * s.restitutionPct, 100);
}

/** A bounce ends the step at the last free sample; the flight cap still applies. */
function endBounce(s: Shell, fx: Fx, fy: Fx, ev: Impact): Impact {
  s.x = fx;
  s.y = fy;
  s.steps++;
  if (s.steps >= MAX_FLIGHT_STEPS) {
    s.alive = false;
    return { kind: "out", x: floorPx(fx), y: floorPx(fy) };
  }
  return ev;
}

/**
 * Advance one physics step. Returns the first event along the swept path, or
 * null while the shell is still flying. windStep is the horizontal velocity
 * change per step (Fx). The order inside a step is part of the determinism
 * contract: wind, gravity, the apex latch (an apex stage ends the step here),
 * homing, then the sweep, whose every sample checks the side edges, then the
 * tanks in index order, then the terrain.
 */
export function stepShell(s: Shell, t: Terrain, tanks: readonly HitCircle[], windStep: Fx): Impact | null {
  const rising = s.vy < 0;
  s.vx += windStep;
  s.vy += s.gravityStep;
  if (!s.apexed && rising && s.vy >= 0) {
    s.apexed = true;
    if (s.stopAtApex) {
      s.alive = false;
      return { kind: "apex", x: floorPx(s.x), y: floorPx(s.y), fx: s.x, fy: s.y };
    }
  }
  if (s.homeDeg > 0 && s.apexed) steer(s);
  const nx = s.x + idiv(s.vx, STEPS_PER_SEC);
  const ny = s.y + idiv(s.vy, STEPS_PER_SEC);
  const n = Math.max(Math.abs(floorPx(nx) - floorPx(s.x)), Math.abs(floorPx(ny) - floorPx(s.y)), 1);
  const r2 = TANK_HIT_R * TANK_HIT_R;
  let fx = s.x; // the last free sample
  let fy = s.y;
  for (let i = 1; i <= n; i++) {
    const sx = s.x + idiv((nx - s.x) * i, n);
    const sy = s.y + idiv((ny - s.y) * i, n);
    const cx = floorPx(sx);
    const cy = floorPx(sy);
    if (cx < 0 || cx >= WORLD_W) {
      // A wall reflects only a shell coming from inside the world: one spawned past a side wall is out (§3.2 rule 6).
      if (s.wallBounces > 0 && floorPx(fx) >= 0 && floorPx(fx) < WORLD_W) {
        s.wallBounces--;
        reflect(s, cx < 0 ? 1 : -1, 0);
        return endBounce(s, fx, fy, { kind: "bounce", x: cx < 0 ? 0 : WORLD_W - 1, y: cy, wall: true });
      }
      s.alive = false;
      return { kind: "out", x: cx, y: cy };
    }
    for (let k = 0; k < tanks.length; k++) {
      const dx = cx - tanks[k].x;
      const dy = cy - tanks[k].y;
      const inside = dx * dx + dy * dy <= r2;
      if ((s.ignore >> k) & 1) {
        if (!inside) s.ignore &= ~(1 << k);
        continue;
      }
      if (inside) {
        s.alive = false;
        return { kind: "tank", x: cx, y: cy, tank: k, fx, fy };
      }
    }
    if (isSolid(t, cx, cy)) {
      if (s.bounces > 0) {
        s.bounces--;
        const [nX, nY] = surfaceNormal(s, t, cx, cy, floorPx(fx), floorPx(fy));
        reflect(s, nX, nY);
        return endBounce(s, fx, fy, { kind: "bounce", x: cx, y: cy, wall: false });
      }
      s.alive = false;
      return { kind: "terrain", x: cx, y: cy, fx, fy };
    }
    fx = sx;
    fy = sy;
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
