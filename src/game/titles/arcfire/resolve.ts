// src/game/titles/arcfire/resolve.ts
//
// resolveTurn (spec §1.3): one whole turn — the optional move, then the shot —
// resolved to completion. It MUTATES the MatchState it's given; callers that
// need the original (AI search, previews) resolve a cloneMatch() copy. The
// caller (match.ts applyTurn) validates the command first. Plan 1 resolves
// shell launches with impact blasts; Plan 2 adds the other primitives.
import { fromInt, toInt } from "@/game/sim/math/fixed";
import { ROSTER } from "./weapons/roster";
import type { Blast } from "./weapons/types";
import { launchShell, muzzle, stepShell, type HitCircle, type Shell } from "./ballistics";
import { carveCircle, settle, spansFromHeight } from "./terrain";
import { blastDamage } from "./damage";
import { hitCircles, moveTarget } from "./tanks";
import { idiv, clampInt } from "./imath";
import { STEPS_PER_SEC, MAX_FLIGHT_STEPS } from "./constants";
import type { MatchState } from "./state";
import type { Timeline, TimelineEvent } from "./timeline";

export interface TurnInput {
  move: -1 | 0 | 1;
  weapon: number; // roster index
  angle: number; // integer degrees 0..180
  power: number; // integer 0..100
}

export function resolveTurn(m: MatchState, input: TurnInput): Timeline {
  const shooter = m.shooter;
  const def = ROSTER[input.weapon];
  const tl: Timeline = {
    shooter,
    move: null,
    wind: m.wind,
    weapon: input.weapon,
    shells: [],
    events: [],
    settle: { heights: m.terrain.height.slice(), falls: [] },
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

  // 2. Launch the volley from the shooter's muzzle.
  spansFromHeight(m.terrain);
  const tanks = hitCircles(m);
  const count = def.launch.count ?? 1;
  const spread = def.launch.spreadDeg ?? 0;
  const shells: Shell[] = [];
  for (let i = 0; i < count; i++) {
    const offset = count > 1 ? idiv((2 * i - (count - 1)) * spread, 2 * (count - 1)) : 0;
    const angle = clampInt(input.angle + offset, 0, 180);
    const mz = muzzle(tanks[shooter].x, tanks[shooter].y, angle);
    shells.push(launchShell(mz.x, mz.y, angle, input.power, def.launch.speedPct ?? 100, def.launch.gravityPct ?? 100));
    tl.shells.push({ angle, points: [mz.x, mz.y] });
  }

  // 3. Fly every shell together, one step at a time, in shell order.
  const windStep = idiv(fromInt(m.wind), STEPS_PER_SEC);
  const received = [0, 0]; // damage each tank took this turn
  for (let step = 1; step <= MAX_FLIGHT_STEPS; step++) {
    let anyAlive = false;
    for (let i = 0; i < shells.length; i++) {
      const s = shells[i];
      if (!s.alive) continue;
      const hit = stepShell(s, m.terrain, tanks, windStep);
      if (hit === null) {
        tl.shells[i].points.push(toInt(s.x), toInt(s.y));
        anyAlive = true;
        continue;
      }
      tl.shells[i].points.push(hit.x, hit.y);
      if (hit.kind === "out") {
        tl.events.push({ step, kind: "out", shell: i, x: hit.x, y: hit.y });
        continue;
      }
      for (const eff of def.stage.effects) applyBlast(m, eff.blast, hit.x, hit.y, step, i, tanks, received, tl.events);
    }
    if (!anyAlive) break;
  }

  // 4. Dirt settles once, after the whole shot.
  tl.settle = settle(m.terrain);

  // 5. Damage to the opponent scores for the shooter; self-damage scores for the opponent.
  const opp = 1 - shooter;
  tl.points[shooter] += received[opp];
  tl.points[opp] += received[shooter];
  m.scores[0] += tl.points[0];
  m.scores[1] += tl.points[1];
  return tl;
}

function applyBlast(
  m: MatchState, b: Blast, x: number, y: number, step: number, shell: number,
  tanks: readonly HitCircle[], received: number[], events: TimelineEvent[]
): void {
  carveCircle(m.terrain, x, y, b.radius);
  events.push({ step, kind: "blast", shell, x, y, radius: b.radius });
  for (let p = 0; p < 2; p++) {
    const dmg = blastDamage(b, x, y, tanks[p].x, tanks[p].y);
    if (dmg > 0) {
      received[p] += dmg;
      events.push({ step, kind: "damage", target: p, amount: dmg });
    }
  }
}
