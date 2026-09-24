// src/game/titles/arcfire/weapons/primitives.ts
//
// The effect implementations (spec §4.1): the only weapon code outside the
// shell flight in ballistics.ts. Every effect is applied INSTANTLY at its
// trigger step, in closed form or one bounded pass over the terrain; only
// shells and delays take simulated time. Integer px / Q16.16 throughout; no
// weapon draws from the match RNG. The order effects run in is part of the
// determinism contract (see resolve.ts).
import type { Fx } from "@/game/sim/types";
import { fromInt, mul } from "@/game/sim/math/fixed";
import { cosDeg, sinDeg } from "../aimTable";
import { idiv, floorPx } from "../imath";
import { carveCircle, type Terrain } from "../terrain";
import { rotateVel, shellAt, type HitCircle, type Shell } from "../ballistics";
import { blastDamage } from "../damage";
import { TANK_HIT_R, MAX_SHELLS } from "../constants";
import type { Timeline, TimelineEvent } from "../timeline";
import type { Blast, Effect, Split, Stage } from "./types";

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
    else if ("delay" in e) {
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

/** Fan offset of item i of count across a TOTAL spread (the volley rule; count > 1 guards the divisor). */
export const fanOffset = (i: number, count: number, spread: number): number =>
  count > 1 ? idiv((2 * i - (count - 1)) * spread, 2 * (count - 1)) : 0;

function split(shot: Shot, trig: Trigger, sp: Split): void {
  const children: number[] = [];
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
    if (id >= 0) children.push(id);
  }
  emit(shot, { step: trig.step, kind: "split", shell: trig.shell, x: trig.x, y: trig.y, children });
}
