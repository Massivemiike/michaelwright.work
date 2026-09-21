// src/game/titles/circle-td/title.ts
//
// The circle-td binding of the generic TitleDef (src/game/sim/title.ts):
// maps the slug + SIM_VERSION to this title's makeSim and applyCommand so
// the registry / verification route can rebuild this sim from "circle-td"
// with no hard import of makeSim inside replay.ts.
import { SIM_VERSION } from "@/game/sim/types";
import type { TitleDef } from "@/game/sim/title";
import { applyCommand } from "@/game/sim/replay";
import { makeSim } from "./index";

export const CIRCLE_TD_SLUG = "circle-td";

export const circleTdTitle: TitleDef = {
  slug: CIRCLE_TD_SLUG,
  simVersion: SIM_VERSION,
  makeSim: (config) => makeSim(config),
  applyCommand,
};
