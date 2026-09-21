// src/game/sim/title.ts
//
// Title-agnostic engine contracts. A TitleDef lets replay.ts / verify.ts /
// the verification route rebuild a title's sim from a game_slug WITHOUT
// replay.ts hard-importing a specific title's makeSim. Type-only imports
// (erased at runtime) so this stays a leaf under the sim purity roots with
// no runtime dependency cycle.
import type { SimState } from "./state";
import type { Command } from "./replay";

// The minimal sim surface runReplay drives: a mutable SimState and a tick().
// tick()'s return is title-specific (circle-td returns TowerHit[]); the
// replay engine ignores it, so it is typed `unknown` here.
export interface TitleSim {
  state: SimState;
  tick(): unknown;
}

export interface TitleDef {
  readonly slug: string;
  readonly simVersion: number;
  makeSim(config: { seed: number; mode: "daily" | "free" }): TitleSim;
  applyCommand(state: SimState, cmd: Command): void;
}
