// src/game/titles/arcfire/ai/probe.ts
//
// The coarse probe (spec §5 step 1): where does an aim land? It flies the
// weapon's probe model (model.ts) with the sim's OWN flight code (muzzle,
// launchShell, stepShell: no second integrator), effect-free, over a settled
// board whose spans are built, and writes nothing to the board. A plain
// model lands exactly where a plain shell's blast would; bounces, wall
// bounces and homing fly exactly as the first shell of the weapon does; an
// apex split continues along its centre child from the apex (Hailstorm's
// cone lands 100-160 px short of a plain shell, and this follows it), and
// only once: a child that is itself an apex stage acts where it stops, as in
// the sim, so every probe ends within two flight caps, whatever the weapon.
// A beam probe is the fireBeams line on the beam dial, every beam of the fan.
// The probe only ORDERS aims: every value the AI acts on comes from a full
// resolve, so a probe that differs from the real weapon costs search
// quality, never correctness. Pure integer math.
import type { Fx } from "@/game/sim/types";
import { fromInt, mul, toInt } from "@/game/sim/math/fixed";
import { cosDeg, sinDeg } from "../aimTable";
import { launchShell, muzzle, shellAt, stepShell, type HitCircle, type Shell } from "../ballistics";
import { beamDir, fanOffset } from "../weapons/primitives";
import { idiv } from "../imath";
import { TANK_HIT_R, WORLD_H, WORLD_W } from "../constants";
import type { Terrain } from "../terrain";
import type { FlightMods, ProbeModel } from "./model";
import { BEAM_POWER, type TierSpec } from "./tiers";

/** What a probe flies over: settled terrain with its spans built, both hitbox centres (the shooter's possibly moved), the wind step. */
export interface ProbeBoard {
  t: Terrain;
  tanks: HitCircle[];
  me: number;
  windStep: Fx;
}

export const LAND_OUT = 0; // left the world, or its flight cap
export const LAND_TERRAIN = 1;
export const LAND_FOE = 2;
export const LAND_SELF = 3;
/** The metric of a landing that is no use: out, or on the shooter's own tank. Above every real squared distance. */
export const FAR = 1 << 30;

/** One landing grid: every (angle, power) of a tier's probe grid for one model from one position. Cell c = ia * powers.length + ip. */
export interface Grid {
  angles: Int32Array; // command angles
  powers: Int32Array;
  kind: Uint8Array; // LAND_*
  x: Int32Array; // the landing px (first solid or hitbox px; for a beam, its sample nearest the foe)
  y: Int32Array;
  metric: Int32Array; // squared px from the landing to the foe's hitbox centre: 0 = on the foe, FAR = no use
}

function arm(s: Shell, f: FlightMods, board: ProbeBoard): void {
  const foe = board.tanks[1 - board.me];
  s.stopAtApex = f.stopAtApex;
  s.homeDeg = f.homeDeg;
  s.homeX = foe.x; // addShell's homing target: the foe's hitbox centre, fixed for the shot
  s.homeY = foe.y;
  s.bounces = f.bounces;
  s.wallBounces = f.wallBounces;
  s.restitutionPct = f.restitutionPct;
}

/** Fly one shell probe; writes (kind, x, y) into out. An apex split is followed once, so the flight ends within two flight caps. */
function flyShell(board: ProbeBoard, model: ProbeModel, angle: number, power: number, out: Int32Array): void {
  const me = board.tanks[board.me];
  const mz = muzzle(me.x, me.y, angle);
  let s = launchShell(mz.x, mz.y, angle, power, model.speedPct, model.gravityPct);
  arm(s, model.mods, board);
  let split = false; // at most once: a re-spawned child starts a fresh flight cap, so splitting at every apex could fly forever
  for (;;) {
    const hit = stepShell(s, board.t, board.tanks, board.windStep);
    if (hit === null || hit.kind === "bounce") continue;
    if (hit.kind === "apex") {
      const a = model.apex;
      if (a === null || split) { // an apex stage with no split, or the split's own apex child, acts where it stops
        out[0] = LAND_TERRAIN;
        out[1] = hit.x;
        out[2] = hit.y;
        return;
      }
      split = true;
      // the centre child (fan offset 0, no gap), launched as primitives.split launches it
      const speed = idiv(s.speed * a.speedPct, 100);
      const vx = a.from === "up" ? 0 : a.from === "cone" ? s.vx : idiv(s.vx * a.speedPct, 100);
      const vy = a.from === "up" ? 0 - speed : a.from === "cone" ? s.vy + speed : idiv(s.vy * a.speedPct, 100);
      s = shellAt(hit.fx, hit.fy, vx, vy, speed, s.gravityStep);
      arm(s, a.child, board);
      continue;
    }
    if (hit.kind === "out") {
      out[0] = LAND_OUT;
      out[1] = hit.x;
      out[2] = hit.y;
      return;
    }
    out[0] = hit.kind === "tank" ? (hit.tank === board.me ? LAND_SELF : LAND_FOE) : LAND_TERRAIN;
    out[1] = hit.x;
    out[2] = hit.y;
    return;
  }
}

/** A beam fan on the beam dial: the fireBeams line of every beam; writes (kind, x, y) of the sample nearest the foe, and returns its squared distance. */
function flyBeam(board: ProbeBoard, beam: NonNullable<ProbeModel["beam"]>, angle: number, out: Int32Array): number {
  const me = board.tanks[board.me];
  const foe = board.tanks[1 - board.me];
  let best = FAR;
  out[1] = me.x;
  out[2] = me.y;
  for (let b = 0; b < beam.count; b++) {
    const a = beamDir(board.me, angle + fanOffset(b, beam.count, beam.spreadDeg));
    const mz = muzzle(me.x, me.y, a);
    const dx = toInt(mul(fromInt(beam.length), cosDeg(a)));
    const dy = 0 - toInt(mul(fromInt(beam.length), sinDeg(a)));
    const n = Math.max(Math.abs(dx), Math.abs(dy), 1);
    for (let i = 0; i <= n; i++) {
      const sx = mz.x + idiv(dx * i, n);
      const sy = mz.y + idiv(dy * i, n);
      if (sx < 0 || sx >= WORLD_W || sy >= WORLD_H) break; // fireBeams' stops: the side edges and the floor
      const ex = sx - foe.x;
      const ey = sy - foe.y;
      if (ex * ex + ey * ey < best) {
        best = ex * ex + ey * ey;
        out[1] = sx;
        out[2] = sy;
      }
    }
  }
  const reach = TANK_HIT_R + idiv(beam.width, 2);
  out[0] = best <= reach * reach ? LAND_FOE : LAND_TERRAIN;
  return best;
}

const LAND = new Int32Array(3);

/**
 * The tier's landing grid for one model from the board's shooter position. Shells fly the facing
 * quarter (facing degrees 0..90: command angle f for player 0, 180 - f for player 1), a wall bouncer
 * the facing half (0..180), at powers powerStep..100. A beam sweeps the whole dial 0..180 at BEAM_POWER
 * (dial 90 is level at the opponent for both players). counter.probes counts the flights.
 */
export function landingGrid(board: ProbeBoard, model: ProbeModel, spec: TierSpec, counter: { probes: number }): Grid {
  const span = model.beam !== null || model.mods.wallBounces > 0 ? 180 : 90;
  const na = idiv(span, spec.angleStep) + 1;
  const np = model.beam !== null ? 1 : idiv(100, spec.powerStep);
  const angles = new Int32Array(na);
  const powers = new Int32Array(np);
  for (let i = 0; i < na; i++) angles[i] = model.beam !== null || board.me === 0 ? i * spec.angleStep : 180 - i * spec.angleStep;
  if (model.beam !== null) powers[0] = BEAM_POWER;
  else for (let j = 0; j < np; j++) powers[j] = (j + 1) * spec.powerStep;
  const n = na * np;
  const g: Grid = { angles, powers, kind: new Uint8Array(n), x: new Int32Array(n), y: new Int32Array(n), metric: new Int32Array(n) };
  const foe = board.tanks[1 - board.me];
  for (let c = 0; c < n; c++) {
    const a = angles[idiv(c, np)];
    let d: number;
    if (model.beam !== null) d = flyBeam(board, model.beam, a, LAND);
    else {
      flyShell(board, model, a, powers[c % np], LAND);
      const ex = LAND[1] - foe.x;
      const ey = LAND[2] - foe.y;
      d = LAND[0] === LAND_FOE ? 0 : LAND[0] === LAND_TERRAIN ? ex * ex + ey * ey : FAR;
    }
    counter.probes++;
    g.kind[c] = LAND[0];
    g.x[c] = LAND[1];
    g.y[c] = LAND[2];
    g.metric[c] = d; // < FAR for every real landing (at most about 1,300^2 px), so it always ranks before a useless one
  }
  return g;
}
