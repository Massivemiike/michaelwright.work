// src/game/titles/arcfire/resolve.ts
//
// resolveTurn (spec §1.3): one whole turn — the optional move, then the shot —
// resolved to completion. It MUTATES the MatchState it's given; callers that
// need the original (AI search, previews) resolve a cloneMatch() copy. The
// caller (match.ts applyTurn) validates the command first.
//
// The step loop and its ORDER are part of the determinism contract:
//   step s = 1, 2, ...:
//     1. delays due at s fire, in the order they were armed;
//     2. every shell that existed at the start of the step and is alive moves
//        once (stepShell), in creation order; a shell that triggers applies
//        its effects at once, in list order (so a later shell this step sees
//        their terrain); children it spawns are appended and first move at s + 1;
//   until no shell is alive and no delay is armed (or MAX_TURN_STEPS). Then
//   settle once, then score.
import { fromInt } from "@/game/sim/math/fixed";
import { ROSTER } from "./weapons/roster";
import { launchShell, muzzle, stepShell } from "./ballistics";
import { settle, spansFromHeight } from "./terrain";
import { hitCircles, moveTarget } from "./tanks";
import { idiv, floorPx } from "./imath";
import { STEPS_PER_SEC, MAX_TURN_STEPS } from "./constants";
import { addShell, applyEffects, blastAt, emit, fanOffset, type Shot } from "./weapons/primitives";
import type { MatchState } from "./state";
import type { Timeline } from "./timeline";
import type { WeaponDef } from "./weapons/types";

export interface TurnInput {
  move: -1 | 0 | 1;
  weapon: number; // roster index
  angle: number; // integer degrees 0..180
  power: number; // integer 0..100
}

export function resolveTurn(m: MatchState, input: TurnInput): Timeline {
  return resolveWeapon(m, ROSTER[input.weapon], input, true);
}

/** resolveTurn without building the Timeline's paths or events: the same state and points, faster (AI search, verification). */
export function resolveTurnPoints(m: MatchState, input: TurnInput): [number, number] {
  return resolveWeapon(m, ROSTER[input.weapon], input, false).points;
}

/**
 * resolveTurn with the weapon passed in: the seam unit tests use to fire
 * synthetic WeaponDefs (and 2B's probe shell). `input.weapon` is only
 * recorded. `record = false` leaves `shells`, `events` and `settle.falls` empty.
 */
export function resolveWeapon(m: MatchState, def: WeaponDef, input: TurnInput, record = true): Timeline {
  const shooter = m.shooter;
  const tl: Timeline = {
    shooter,
    move: null,
    wind: m.wind,
    weapon: input.weapon,
    steps: 0,
    shells: [],
    events: [],
    settle: { heights: m.terrain.height, falls: [] }, // replaced by the settle below
    points: [0, 0],
  };

  // 1. The move happens first, on the settled terrain.
  if (input.move !== 0) {
    const nx = moveTarget(m, shooter, input.move);
    if (nx !== -1) {
      tl.move = { fromX: m.tankX[shooter], toX: nx };
      m.tankX[shooter] = nx;
      m.movesLeft[shooter]--;
    }
  }

  // 2. Launch: shells fan out from the muzzle.
  spansFromHeight(m.terrain);
  const shot: Shot = {
    t: m.terrain, tanks: hitCircles(m), shooter, shells: [], stages: [], live: 0, pending: [], received: [0, 0],
    rec: record, tl,
  };
  const launch = def.launch;
  if (launch.kind === "shell" && def.stage) {
    const count = launch.count ?? 1;
    for (let i = 0; i < count; i++) {
      const angle = input.angle + fanOffset(i, count, launch.spreadDeg ?? 0); // never clamped: may leave 0..180 near the horizon
      const mz = muzzle(shot.tanks[shooter].x, shot.tanks[shooter].y, angle);
      const s = launchShell(mz.x, mz.y, angle, input.power, launch.speedPct ?? 100, launch.gravityPct ?? 100);
      addShell(shot, s, def.stage, angle, -1, 0);
    }
  }

  // 3. The step loop.
  const windStep = idiv(fromInt(m.wind), STEPS_PER_SEC);
  for (let step = 1; shot.live > 0 || shot.pending.length > 0; step++) {
    if (step > MAX_TURN_STEPS) {
      abandon(shot, MAX_TURN_STEPS);
      break;
    }
    tl.steps = step;
    const n = shot.shells.length; // shells spawned during this step first move at step + 1
    for (let j = 0; j < shot.pending.length; ) {
      const p = shot.pending[j];
      if (p.at !== step) {
        j++;
        continue;
      }
      shot.pending.splice(j, 1);
      applyEffects(shot, { ...p.trig, step }, p.effects);
    }
    for (let i = 0; i < n; i++) {
      const s = shot.shells[i];
      if (!s.alive) continue;
      const hit = stepShell(s, shot.t, shot.tanks, windStep);
      const path = record ? tl.shells[i].points : null;
      if (hit === null) {
        if (path) path.push(floorPx(s.x), floorPx(s.y));
        continue;
      }
      if (!s.alive) shot.live--;
      if (hit.kind === "bounce") {
        if (path) path.push(floorPx(s.x), floorPx(s.y));
        emit(shot, { step, kind: "bounce", shell: i, x: hit.x, y: hit.y, wall: hit.wall });
        const each = shot.stages[i].bounce?.blastEach;
        if (each) blastAt(shot, each, hit.x, hit.y, step, i, 0);
        continue;
      }
      if (hit.kind === "out") {
        if (path) path.push(hit.x, hit.y);
        emit(shot, { step, kind: "out", shell: i, x: hit.x, y: hit.y, lag: 0 });
        continue;
      }
      if (hit.kind !== "apex" && path) path.push(hit.x, hit.y);
      const stage = shot.stages[i];
      let effects = stage.effects;
      if (hit.kind !== "apex" && stage.on === "apex") { // an apex weapon that hit something before its apex
        if (!stage.early) {
          emit(shot, { step, kind: "dud", shell: i, x: hit.x, y: hit.y });
          continue;
        }
        effects = stage.early;
      }
      applyEffects(shot, {
        step, shell: i, x: hit.x, y: hit.y, fx: hit.fx, fy: hit.fy, vx: s.vx, vy: s.vy,
        speed: s.speed, gravityStep: s.gravityStep, tank: hit.kind === "tank" ? hit.tank : -1,
      }, effects);
    }
  }

  // 4. Dirt settles once, after the whole shot.
  tl.settle = settle(m.terrain, record);

  // 5. Damage to the opponent scores for the shooter; self-damage scores for the opponent.
  const opp = 1 - shooter;
  tl.points[shooter] += shot.received[opp];
  tl.points[opp] += shot.received[shooter];
  m.scores[0] += tl.points[0];
  m.scores[1] += tl.points[1];
  return tl;
}

/** The turn backstop: everything still flying is lost at `step` and armed delays are dropped (their `fuse` events keep an `at` beyond tl.steps: playback's cue). */
function abandon(shot: Shot, step: number): void {
  for (let i = 0; i < shot.shells.length; i++) {
    const s = shot.shells[i];
    if (!s.alive) continue;
    s.alive = false;
    emit(shot, { step, kind: "out", shell: i, x: floorPx(s.x), y: floorPx(s.y), lag: 0 });
  }
  shot.live = 0;
  shot.pending.length = 0;
}
