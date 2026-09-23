// src/game/titles/arcfire/draft.ts
//
// The weapon draft (spec §2): a seeded pool drawn from the roster with tag
// guarantees, then alternating picks until each player holds weaponsEach.
import { nextRange, type Rng } from "@/game/sim/math/rng";
import type { WeaponDef, Tag } from "./weapons/types";

/**
 * Draw `size` distinct roster indices: one random weapon per guaranteed tag
 * first (skipping tags the roster lacks), then a seeded Fisher–Yates shuffle
 * of the rest fills the remaining slots. Returned ascending.
 */
export function drawPool(rng: Rng, roster: readonly WeaponDef[], size: number, guaranteeTags: readonly Tag[]): number[] {
  if (size > roster.length) throw new RangeError(`drawPool: pool size ${size} exceeds roster size ${roster.length}`);
  const chosen: number[] = [];
  const taken = new Uint8Array(roster.length);
  for (const tag of guaranteeTags) {
    if (chosen.length >= size) break;
    const candidates: number[] = [];
    for (let i = 0; i < roster.length; i++) if (!taken[i] && roster[i].tag === tag) candidates.push(i);
    if (candidates.length === 0) continue;
    const pick = candidates[nextRange(rng, candidates.length)];
    taken[pick] = 1;
    chosen.push(pick);
  }
  const rest: number[] = [];
  for (let i = 0; i < roster.length; i++) if (!taken[i]) rest.push(i);
  for (let i = rest.length - 1; i > 0; i--) {
    const j = nextRange(rng, i + 1);
    const tmp = rest[i];
    rest[i] = rest[j];
    rest[j] = tmp;
  }
  for (let i = 0; chosen.length < size; i++) chosen.push(rest[i]);
  return chosen.sort((a, b) => a - b);
}

/** Who makes pick number `picksMade`: picks alternate, starting with firstPicker. */
export const pickerAt = (firstPicker: number, picksMade: number): number =>
  picksMade % 2 === 0 ? firstPicker : 1 - firstPicker;
