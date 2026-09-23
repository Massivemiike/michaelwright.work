// src/game/titles/arcfire/timeline.ts
//
// What one resolved turn looked like, for the renderer to play back (spec
// §3.4). Presentation-only: never hashed and never fed back into the sim.
import type { SettleFall } from "./terrain";

export type TimelineEvent =
  | { step: number; kind: "blast"; shell: number; x: number; y: number; radius: number }
  | { step: number; kind: "damage"; target: number; amount: number }
  | { step: number; kind: "out"; shell: number; x: number; y: number };

export interface ShellPath {
  angle: number; // the launch angle of this shell (volleys fan out around the aim)
  points: number[]; // flat [x0, y0, x1, y1, ...] in px: the muzzle, then one point per step, ending at the impact
}

export interface Timeline {
  shooter: number;
  move: { fromX: number; toX: number } | null;
  wind: number; // px/s² during this turn
  weapon: number; // roster index fired
  shells: ShellPath[];
  events: TimelineEvent[]; // ordered by step
  settle: { heights: Int32Array; falls: SettleFall[] };
  points: [number, number]; // points awarded this turn to player 0 / player 1
}
