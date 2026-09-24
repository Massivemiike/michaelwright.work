// src/game/titles/arcfire/timeline.ts
//
// What one resolved turn looked like, for the renderer to play back (spec
// §3.4). Presentation-only: never hashed and never fed back into the sim.
//
// Every event's `step` is the sim step it was APPLIED on, and `events` is in
// application order (so it is sorted by step). Roll, dig, burn and quake
// resolve instantly in the sim; their events carry the geometry plus `dur`,
// the display steps the animation takes at SHOW_PX_PER_STEP, and the blasts,
// damage and exits they cause carry `lag`: show them at step + lag, when the
// animation reaches them. Changing these rates never moves a hash.
import type { SettleFall } from "./terrain";
import { ceilDiv } from "./imath";

/** Display speed of the instant effects' animations, px per step. Presentation only. */
export const SHOW_PX_PER_STEP = { roll: 3, dig: 4, burn: 4, quake: 8 } as const;

/** Display steps for `px` of animation at `rate` px per step. */
export const showSteps = (px: number, rate: number): number => ceilDiv(px < 0 ? 0 - px : px, rate);

export type TimelineEvent =
  | { step: number; kind: "blast"; shell: number; x: number; y: number; radius: number; lag: number }
  | { step: number; kind: "damage"; target: number; amount: number; lag: number }
  | { step: number; kind: "out"; shell: number; x: number; y: number; lag: number } // left a side edge, or a flight cap
  // Plan 2A — `shell` indexes Timeline.shells
  | { step: number; kind: "bounce"; shell: number; x: number; y: number; wall: boolean } // the path continues through it
  | { step: number; kind: "split"; shell: number; x: number; y: number; children: number[] }
  | { step: number; kind: "dud"; shell: number; x: number; y: number } // an apex weapon hit early and has no `early` effects
  | { step: number; kind: "fuse"; shell: number; x: number; y: number; at: number } // a delay armed here fires at step `at`
  | { step: number; kind: "roll"; shell: number; path: number[]; dur: number } // flat [x, y, ...], one point per column, ends at the stop
  | { step: number; kind: "dig"; shell: number; x0: number; y0: number; x1: number; y1: number; width: number; dur: number }
  | { step: number; kind: "burn"; shell: number; x: number; y: number; flows: number[][]; dur: number } // each run's flat path
  // build: size = the ball/level radius or the wall height; width = the columns it spans (the wall's width, or 2 × radius + 1), the first at x - floor(width / 2)
  | { step: number; kind: "build"; shell: number; shape: "ball" | "wall" | "level"; x: number; y: number; size: number; width: number }
  | { step: number; kind: "quake"; shell: number; x: number; y: number; reach: number; furrow: number; dur: number }
  | { step: number; kind: "beam"; beam: number; x0: number; y0: number; x1: number; y1: number; width: number }; // muzzle to end, along beamDir: may point down

export interface ShellPath {
  angle: number; // launch angle (muzzle shells; may lie outside 0..180 at a volley's edge), or the fan offset (children)
  parent: number; // index of the shell that spawned this one; -1 for muzzle shells
  start: number; // the step of points[0]: point k is at step start + k
  points: number[]; // flat [x0, y0, x1, y1, ...] px: the spawn point, then one point per step, ending at the terminal event
}

export interface Timeline {
  shooter: number;
  move: { fromX: number; toX: number } | null;
  wind: number; // px/s² during this turn
  weapon: number; // roster index fired
  steps: number; // sim steps the shot took (1 for beams); the renderer adds any dur/lag beyond it
  shells: ShellPath[];
  events: TimelineEvent[]; // in application order, so sorted by step
  settle: { heights: Int32Array; falls: SettleFall[] };
  points: [number, number]; // points awarded this turn to player 0 / player 1
}
