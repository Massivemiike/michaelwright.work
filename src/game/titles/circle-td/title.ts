// src/game/titles/circle-td/title.ts
//
// The circle-td binding of the generic TitleDef (src/game/sim/title.ts). The
// verifier only calls replay(): it rejects any command that is not a non-null
// object or whose tick is not an integer in [0, maxTicks), then drives this
// title's own replay loop and reports wave as the generic stat.
// makeSim/applyCommand stay exposed because runReplay's direct callers (tests,
// the cross-engine harness) drive the loop through them.
import { SIM_VERSION } from "@/game/titles/circle-td/version";
import type { TitleDef } from "@/game/sim/title";
import { applyCommand, runReplay, type CircleTdSimDef, type Command } from "@/game/titles/circle-td/replay";
import { makeSim } from "./index";

export const CIRCLE_TD_SLUG = "circle-td";

export const circleTdTitle: TitleDef<Command> & CircleTdSimDef = {
  slug: CIRCLE_TD_SLUG,
  simVersion: SIM_VERSION,
  makeSim: (config) => makeSim(config),
  applyCommand,
  replay(input, limits) {
    for (const cmd of input.commands) {
      // A null / non-object entry has no tick to read: a shape error, not a throw.
      if (typeof cmd !== "object" || cmd === null) return { rejected: "invalid_command_shape" };
      if (!Number.isInteger(cmd.tick) || cmd.tick < 0 || cmd.tick >= limits.maxTicks) {
        return { rejected: "invalid_command_shape" };
      }
    }
    const r = runReplay(
      { seed: input.seed, simVersion: SIM_VERSION, mode: input.mode, commands: [...input.commands] },
      circleTdTitle,
      limits.maxTicks
    );
    return { score: r.score, stat: r.wave, hash: r.hash };
  },
};
