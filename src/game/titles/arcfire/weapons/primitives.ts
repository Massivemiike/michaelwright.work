// src/game/titles/arcfire/weapons/primitives.ts
//
// The effect implementations (spec §4.1): the only weapon code outside the
// shell flight in ballistics.ts. Every effect is applied INSTANTLY at its
// trigger step, in closed form or one bounded pass over the terrain; only
// shells and delays take simulated time. Integer px / Q16.16 throughout; no
// weapon draws from the match RNG. The order effects run in is part of the
// determinism contract (see resolve.ts).
import type { Fx } from "@/game/sim/types";
import { fromInt, toInt, mul } from "@/game/sim/math/fixed";
import { cosDeg, sinDeg } from "../aimTable";
import { idiv, isqrt, floorPx } from "../imath";
import {
  isSolid, carveCircle, carveCapsule, removeInterval, addInterval, groundBelow, surfaceTop, type Terrain,
} from "../terrain";
import { muzzle, rotateVel, shellAt, type HitCircle, type Shell } from "../ballistics";
import { blastDamage } from "../damage";
import { WORLD_W, WORLD_H, TANK_HIT_R, ROLL_PROBE, MAX_SHELLS, DIG_MAX_PITCH } from "../constants";
import { SHOW_PX_PER_STEP, showSteps, type Timeline, type TimelineEvent } from "../timeline";
import type { Blast, BeamLaunch, Build, Burn, Dig, Effect, Quake, Roll, Split, Stage } from "./types";

/** Everything one shot's effects can touch. Built by resolveWeapon; lives for one turn. */
export interface Shot {
  t: Terrain;
  tanks: readonly HitCircle[]; // hitboxes, fixed for the whole shot (tanks ride the settle afterwards)
  shooter: number;
  shells: Shell[]; // every shell of the turn, by creation order (= Timeline.shells index)
  stages: Stage[]; // stages[i] = what shells[i] does on its trigger
  live: number; // shells still alive
  pending: Pending[]; // armed delays, in arming order
  received: number[]; // damage each tank took this turn
  rec: boolean; // build the Timeline's paths and events (false: the quiet AI path)
  tl: Timeline;
}

/** Where and how a stage fired. */
export interface Trigger {
  step: number;
  shell: number; // index of the shell that triggered
  x: number; // the trigger px: first solid (or tank) px on impact; the shell's px at the apex
  y: number;
  fx: Fx; // the last free position: children spawn here; roll and burn drop from here
  fy: Fx;
  vx: Fx; // velocity at the trigger: dig direction, the roll/burn tie-break, "ahead"/"cone" splits
  vy: Fx;
  speed: Fx; // the shell's nominal speed: the base of "up"/"cone" splits
  gravityStep: Fx; // inherited by children
  tank: number; // the tank struck, or -1
}

export interface Pending {
  at: number; // the step it fires on
  trig: Trigger;
  effects: readonly Effect[];
}

export function emit(shot: Shot, ev: TimelineEvent): void {
  if (shot.rec) shot.tl.events.push(ev);
}

/** Apply a list of effects at a trigger, completely and in array order (a delay only arms its list). */
export function applyEffects(shot: Shot, trig: Trigger, effects: readonly Effect[]): void {
  for (const e of effects) {
    if ("blast" in e) blastAt(shot, e.blast, trig.x, trig.y, trig.step, trig.shell, 0);
    else if ("split" in e) split(shot, trig, e.split);
    else if ("roll" in e) roll(shot, trig, e.roll);
    else if ("dig" in e) dig(shot, trig, e.dig);
    else if ("burn" in e) burn(shot, trig, e.burn);
    else if ("build" in e) build(shot, trig, e.build);
    else if ("quake" in e) quake(shot, trig, e.quake);
    else {
      const at = trig.step + (e.delay.steps > 1 ? e.delay.steps : 1);
      shot.pending.push({ at, trig, effects: e.delay.then });
      emit(shot, { step: trig.step, kind: "fuse", shell: trig.shell, x: trig.x, y: trig.y, at });
    }
  }
}

/** Damage to tank p: it scores for whoever didn't take it (resolve.ts). */
function hurt(shot: Shot, p: number, amount: number, step: number, lag: number): void {
  if (amount <= 0) return;
  shot.received[p] += amount;
  emit(shot, { step, kind: "damage", target: p, amount, lag });
}

/** Plan 1's blast: carve a disc, then damage both tanks by distance (tank order 0, 1). */
export function blastAt(shot: Shot, b: Blast, x: number, y: number, step: number, shell: number, lag: number): void {
  carveCircle(shot.t, x, y, b.radius);
  emit(shot, { step, kind: "blast", shell, x, y, radius: b.radius, lag });
  for (let p = 0; p < 2; p++) hurt(shot, p, blastDamage(b, x, y, shot.tanks[p].x, shot.tanks[p].y), step, lag);
}

/** Bitmask of the tanks whose hitbox contains px (x, y). */
function tankMask(shot: Shot, x: number, y: number): number {
  let m = 0;
  for (let k = 0; k < 2; k++) {
    const dx = x - shot.tanks[k].x;
    const dy = y - shot.tanks[k].y;
    if (dx * dx + dy * dy <= TANK_HIT_R * TANK_HIT_R) m |= 1 << k;
  }
  return m;
}

/** The first tank whose hitbox contains (x, y), or -1. */
function tankAt(shot: Shot, x: number, y: number): number {
  const m = tankMask(shot, x, y);
  return m === 0 ? -1 : (m & 1) !== 0 ? 0 : 1;
}

/** Add a shell to the turn and arm its stage's flight modifiers. Returns its index, or -1 past MAX_SHELLS (dropped). */
export function addShell(shot: Shot, s: Shell, stage: Stage, angle: number, parent: number, step: number): number {
  if (shot.shells.length >= MAX_SHELLS) return -1;
  s.stopAtApex = stage.on === "apex";
  if (stage.homing) {
    const target = shot.tanks[1 - shot.shooter];
    s.homeDeg = stage.homing.degPerStep;
    s.homeX = target.x;
    s.homeY = target.y;
  }
  if (stage.bounce) {
    if (stage.bounce.walls) s.wallBounces = stage.bounce.times;
    else s.bounces = stage.bounce.times;
    s.restitutionPct = stage.bounce.restitutionPct;
  }
  s.ignore = tankMask(shot, floorPx(s.x), floorPx(s.y)); // only a line split can spawn inside a hitbox
  shot.shells.push(s);
  shot.stages.push(stage);
  shot.live++;
  if (shot.rec) shot.tl.shells.push({ angle, parent, start: step, points: [floorPx(s.x), floorPx(s.y)] });
  return shot.shells.length - 1;
}

/** Fan offset of item i of count across a TOTAL spread (the volley rule; count > 1 guards the divisor). `| 0`: a zero offset is +0, never -0 (Timeline angles). */
export const fanOffset = (i: number, count: number, spread: number): number =>
  count > 1 ? idiv((2 * i - (count - 1)) * spread, 2 * (count - 1)) | 0 : 0;

function split(shot: Shot, trig: Trigger, sp: Split): void {
  const children: number[] | null = shot.rec ? [] : null;
  const speed = idiv(trig.speed * sp.speedPct, 100); // the children's nominal speed
  for (let i = 0; i < sp.count; i++) {
    const off = fanOffset(i, sp.count, sp.spreadDeg);
    let vx: Fx;
    let vy: Fx;
    if (sp.from === "up") {
      vx = mul(speed, cosDeg(90 + off));
      vy = 0 - mul(speed, sinDeg(90 + off));
    } else if (sp.from === "cone") {
      vx = trig.vx + mul(speed, cosDeg(270 + off));
      vy = trig.vy - mul(speed, sinDeg(270 + off));
    } else {
      const [rx, ry] = rotateVel(trig.vx, trig.vy, off);
      vx = idiv(rx * sp.speedPct, 100);
      vy = idiv(ry * sp.speedPct, 100);
    }
    const gx = sp.gapPx ? idiv((2 * i - (sp.count - 1)) * sp.gapPx, 2) : 0;
    const s = shellAt(trig.fx + fromInt(gx), trig.fy, vx, vy, speed, trig.gravityStep);
    const id = addShell(shot, s, sp.child, off, trig.shell, trig.step);
    if (id >= 0 && children) children.push(id);
  }
  if (children) emit(shot, { step: trig.step, kind: "split", shell: trig.shell, x: trig.x, y: trig.y, children });
}

interface WalkEnd { x: number; g: number; stop: "far" | "rise" | "tank" | "edge"; tank: number; n: number } // n: columns walked

/**
 * Walk along the ground from column x (standing on ground px g) toward dir,
 * up to maxPx columns. Level or downhill only: it stops before any rise (the
 * next column is solid at g - 1), at a world edge, or on entering a tank
 * hitbox (the walker's point is (x, g - 1)). Appends each point to `path`
 * when there is one (recording); `n` counts the columns walked either way.
 */
function walk(shot: Shot, x: number, g: number, dir: number, maxPx: number, path: number[] | null): WalkEnd {
  for (let k = 0; k < maxPx; k++) {
    const nx = x + dir;
    if (nx < 0 || nx >= WORLD_W) return { x, g, stop: "edge", tank: -1, n: k };
    if (isSolid(shot.t, nx, g - 1)) return { x, g, stop: "rise", tank: -1, n: k };
    x = nx;
    g = groundBelow(shot.t, x, g);
    if (path) path.push(x, g - 1);
    const tank = tankAt(shot, x, g - 1);
    if (tank >= 0) return { x, g, stop: "tank", tank, n: k + 1 };
  }
  return { x, g, stop: "far", tank: -1, n: maxPx };
}

/** Downhill direction at (x, g) from the ground ROLL_PROBE px either side; on level ground, the travel direction. */
function downhill(t: Terrain, x: number, g: number, vx: Fx): number {
  const l = x - ROLL_PROBE >= 0 ? groundBelow(t, x - ROLL_PROBE, g - ROLL_PROBE) : g;
  const r = x + ROLL_PROBE < WORLD_W ? groundBelow(t, x + ROLL_PROBE, g - ROLL_PROBE) : g;
  if (r > l) return 1;
  if (l > r) return -1;
  return vx < 0 ? -1 : 1;
}

function roll(shot: Shot, trig: Trigger, r: Roll): void {
  if (trig.tank >= 0) return blastAt(shot, r.then, trig.x, trig.y, trig.step, trig.shell, 0); // a direct hit doesn't roll
  const x = floorPx(trig.fx);
  const g = groundBelow(shot.t, x, floorPx(trig.fy));
  const path = shot.rec ? [x, g - 1] : null;
  const against = tankAt(shot, x, g - 1); // landed against a tank: it stops at once
  const end: WalkEnd = against >= 0
    ? { x, g, stop: "tank", tank: against, n: 0 }
    : walk(shot, x, g, downhill(shot.t, x, g, trig.vx), r.maxDistance, path);
  const dur = showSteps(end.n, SHOW_PX_PER_STEP.roll);
  if (path) emit(shot, { step: trig.step, kind: "roll", shell: trig.shell, path, dur });
  if (end.stop === "edge") { // rolled off the world: lost, like any shell leaving the side edges
    emit(shot, { step: trig.step, kind: "out", shell: trig.shell, x: end.x + (end.x === 0 ? -1 : 1), y: end.g - 1, lag: dur });
    return;
  }
  blastAt(shot, r.then, end.x, end.g, trig.step, trig.shell, dur);
}

function dig(shot: Shot, trig: Trigger, d: Dig): void {
  // Along the travel direction, but never steeper than DIG_MAX_PITCH below level: a steeper
  // heading (or none) takes exactly that pitch, keeping the horizontal sense of travel
  // (toward the opponent when there is none). Upward and shallower headings are kept.
  let a = toInt(trig.vx); // px/s, |a| < 2^15: every product here stays < 2^33
  let c = toInt(trig.vy); // px/s, + = down
  if (c > 0 ? c * cosDeg(DIG_MAX_PITCH) > (a < 0 ? 0 - a : a) * sinDeg(DIG_MAX_PITCH) : a === 0 && c === 0) {
    const sense = trig.vx > 0 ? 1 : trig.vx < 0 ? -1 : shot.shooter === 0 ? 1 : -1;
    a = sense * cosDeg(DIG_MAX_PITCH); // (a, c) becomes that pitch's Q16.16 unit vector: only its direction matters
    c = sinDeg(DIG_MAX_PITCH);
  }
  const len = isqrt(a * a + c * c); // >= 1: (a, c) is never (0, 0) here
  const x0 = trig.x;
  const y0 = trig.y;
  const dx = idiv(a * d.length, len);
  const dy = idiv(c * d.length, len);
  const n = Math.max(Math.abs(dx), Math.abs(dy), 1);
  let stop = n; // the last sample the tunnel reaches
  for (let i = 0; i <= n; i++) {
    const sx = x0 + idiv(dx * i, n);
    const sy = y0 + idiv(dy * i, n);
    // i = 0 is the trigger px, inside the world; the floor (WORLD_H) is bedrock
    if (i > 0 && (sx < 0 || sx >= WORLD_W || sy >= WORLD_H)) { stop = i - 1; break; }
    if (tankAt(shot, sx, sy) >= 0) { stop = i; break; }
  }
  const ex = x0 + idiv(dx * stop, n);
  const ey = y0 + idiv(dy * stop, n);
  const reached = idiv(stop * d.length, n); // px along the tunnel
  carveCapsule(shot.t, x0, y0, ex, ey, idiv(d.width, 2));
  const dur = showSteps(reached, SHOW_PX_PER_STEP.dig);
  emit(shot, { step: trig.step, kind: "dig", shell: trig.shell, x0, y0, x1: ex, y1: ey, width: d.width, dur });
  if (d.each && d.blastEvery && d.blastEvery > 0) {
    for (let k = 1; k * d.blastEvery < d.length; k++) {
      const i = idiv(k * d.blastEvery * n, d.length); // the sample k × blastEvery px along
      if (i >= stop) break;
      blastAt(shot, d.each, x0 + idiv(dx * i, n), y0 + idiv(dy * i, n), trig.step, trig.shell,
        showSteps(k * d.blastEvery, SHOW_PX_PER_STEP.dig));
    }
  }
  if (d.then) blastAt(shot, d.then, ex, ey, trig.step, trig.shell, dur);
}

function burn(shot: Shot, trig: Trigger, b: Burn): void {
  const x = floorPx(trig.fx);
  const g = groundBelow(shot.t, x, floorPx(trig.fy));
  const touched = [-1, -1]; // px along a run where each tank was first touched (-1 = never)
  if (trig.tank >= 0) touched[trig.tank] = 0; // a direct hit touches the struck tank, whichever way the runs go
  const start = tankAt(shot, x, g - 1);
  if (start >= 0) touched[start] = 0;
  const half = idiv(b.pool, 2);
  const runs: number[] = []; // [dir, max px] pairs: the pool both ways, then the flow(s)
  if (half > 0) runs.push(-1, half, 1, half);
  if (b.split) runs.push(-1, b.flow, 1, b.flow);
  else runs.push(downhill(shot.t, x, g, trig.vx), b.flow);
  const flows: number[][] | null = shot.rec ? [] : null;
  let longest = 0;
  for (let j = 0; j < runs.length; j += 2) {
    const path = flows ? [x, g - 1] : null;
    const end = walk(shot, x, g, runs[j], runs[j + 1], path);
    const px = end.n;
    if (end.tank >= 0 && (touched[end.tank] < 0 || px < touched[end.tank])) touched[end.tank] = px;
    if (px > longest) longest = px;
    if (flows && path) flows.push(path);
  }
  if (flows) emit(shot, { step: trig.step, kind: "burn", shell: trig.shell, x, y: g - 1, flows, dur: showSteps(longest, SHOW_PX_PER_STEP.burn) });
  for (let p = 0; p < 2; p++) {
    if (touched[p] >= 0) hurt(shot, p, b.damage, trig.step, showSteps(touched[p], SHOW_PX_PER_STEP.burn));
  }
}

function build(shot: Shot, trig: Trigger, b: Build): void {
  const t = shot.t;
  const x = trig.x;
  const y = trig.y;
  if (b.shape === "ball") {
    const r = b.radius;
    for (let cx = Math.max(0, x - r); cx <= Math.min(WORLD_W - 1, x + r); cx++) {
      const h = isqrt(r * r - (cx - x) * (cx - x));
      addInterval(t, cx, y - h, y + h + 1);
    }
  } else if (b.shape === "wall") {
    const left = x - idiv(b.width, 2);
    for (let cx = Math.max(0, left); cx < Math.min(WORLD_W, left + b.width); cx++) {
      const top = surfaceTop(t, cx);
      addInterval(t, cx, top - b.height, top);
    }
  } else {
    for (let cx = Math.max(0, x - b.radius); cx <= Math.min(WORLD_W - 1, x + b.radius); cx++) {
      removeInterval(t, cx, 0, y);
      addInterval(t, cx, y, groundBelow(t, cx, y));
    }
  }
  emit(shot, { step: trig.step, kind: "build", shell: trig.shell, shape: b.shape, x, y,
    size: b.shape === "wall" ? b.height : b.radius, width: b.shape === "wall" ? b.width : 2 * b.radius + 1 });
}

function quake(shot: Shot, trig: Trigger, q: Quake): void {
  if (q.reach <= 0) return; // divisor guard (the roster validator requires reach >= 1)
  const x = trig.x;
  for (let cx = Math.max(0, x - q.reach + 1); cx <= Math.min(WORLD_W - 1, x + q.reach - 1); cx++) {
    const depth = idiv(q.furrow * (q.reach - Math.abs(cx - x)), q.reach); // furrow px at the source, 0 at ±reach
    const top = surfaceTop(shot.t, cx);
    if (depth > 0 && top < WORLD_H) removeInterval(shot.t, cx, top, top + depth);
  }
  emit(shot, { step: trig.step, kind: "quake", shell: trig.shell, x, y: trig.y, reach: q.reach, furrow: q.furrow,
    dur: showSteps(q.reach, SHOW_PX_PER_STEP.quake) });
  // The shockwave hurts only the opponent: the shooter's own tank is exempt (its blasts are not).
  const p = 1 - shot.shooter;
  const gap = Math.abs(shot.tanks[p].x - x) - TANK_HIT_R; // horizontal distance to the hitbox edge, like a blast's
  const d = gap > 0 ? gap : 0;
  if (d < q.reach) hurt(shot, p, idiv(q.damage * (q.reach - d), q.reach), trig.step, showSteps(d, SHOW_PX_PER_STEP.quake));
}

/**
 * The direction (aim sense: 0 = right, 90 = up, 270 = down) of a beam fired
 * at command angle `angle` by `shooter`. A beam reads the angle on the shell
 * dial turned a quarter turn toward the shooter's facing (player 0 faces
 * right and player 1 left; tanks never cross): clockwise for player 0,
 * anticlockwise for player 1. So 90 is level at the opponent's side, the
 * shooter's usual half of the dial (0..90 for player 0, 90..180 for player 1)
 * runs from straight down to level, the other half from level to straight up,
 * and the mirror of a beam command is 180 - angle, as for a shell. The wire
 * angle stays an integer in 0..180; the HUD and the AI call this function.
 */
export const beamDir = (shooter: number, angle: number): number => (shooter === 0 ? angle - 90 : angle + 90);

/** Fire a beam launch at command angle `angle` (step 1): straight lines that carve and pass through terrain and tanks. */
export function fireBeams(shot: Shot, launch: BeamLaunch, angle: number): void {
  const count = launch.count ?? 1;
  const reach = TANK_HIT_R + idiv(launch.width, 2);
  const from = shot.tanks[shot.shooter];
  for (let b = 0; b < count; b++) {
    const a = beamDir(shot.shooter, angle + fanOffset(b, count, launch.spreadDeg ?? 0));
    const mz = muzzle(from.x, from.y, a);
    const dx = toInt(mul(fromInt(launch.length), cosDeg(a)));
    const dy = 0 - toInt(mul(fromInt(launch.length), sinDeg(a)));
    const n = Math.max(Math.abs(dx), Math.abs(dy), 1);
    let hit = 0; // tank bitmask
    let last = 0;
    for (let i = 0; i <= n; i++) {
      const sx = mz.x + idiv(dx * i, n);
      const sy = mz.y + idiv(dy * i, n);
      if (sx < 0 || sx >= WORLD_W || sy >= WORLD_H) break; // the side edges; the floor is bedrock
      last = i;
      for (let p = 0; p < 2; p++) {
        const ex = sx - shot.tanks[p].x;
        const ey = sy - shot.tanks[p].y;
        if (ex * ex + ey * ey <= reach * reach) hit |= 1 << p;
      }
    }
    const x1 = mz.x + idiv(dx * last, n);
    const y1 = mz.y + idiv(dy * last, n);
    carveCapsule(shot.t, mz.x, mz.y, x1, y1, idiv(launch.width, 2));
    emit(shot, { step: 1, kind: "beam", beam: b, x0: mz.x, y0: mz.y, x1, y1, width: launch.width });
    for (let p = 0; p < 2; p++) if ((hit >> p) & 1) hurt(shot, p, launch.damage, 1, 0);
  }
}
