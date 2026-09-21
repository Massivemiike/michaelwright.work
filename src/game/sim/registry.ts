// src/game/sim/registry.ts
//
// Maps a game_slug to its TitleDef so the verification route (which only
// has the wire-format slug) can rebuild the correct sim. Adding a second
// title later is one entry here. Pure: the only runtime import is the
// title's own TitleDef binding.
import type { TitleDef } from "./title";
import { circleTdTitle } from "@/game/titles/circle-td/title";

const REGISTRY: Record<string, TitleDef> = {
  [circleTdTitle.slug]: circleTdTitle,
};

export function getTitle(slug: string): TitleDef | undefined {
  return REGISTRY[slug];
}
