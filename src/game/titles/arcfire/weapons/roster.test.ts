import { describe, it, expect } from "vitest";
import { ROSTER, ROSTER_INDEX } from "./roster";
import { weaponErrors, maxShells, maxTurnSteps } from "./validate";
import { SUDDEN_DEATH_WEAPON, MAX_TURN_STEPS, MAX_SHELLS } from "../constants";

// The wire order pinned so far. Append-only: T7–T12 each append their slice of ids here; T13 replaces this
// prefix pin with the exact 32-id pin (§8.2). A prefix pin stays green when a later task appends weapons.
const WIRE = [
  "pulse", "pulse2", "nova", "needle", "crater", "triad", "fan", "railshot",
  "twinnova", "cascade", "hydra", "hailstorm", "shrapnel", "barrage", "skipper", "pinball",
  "ricochet",
];

describe("ROSTER", () => {
  it("has unique ids that index back to themselves", () => {
    const ids = ROSTER.map((w) => w.id);
    expect(new Set(ids).size).toBe(ids.length);
    ROSTER.forEach((w, i) => expect(ROSTER_INDEX[w.id]).toBe(i));
  });
  it("keeps Pulse at the sudden-death index", () => {
    expect(ROSTER[SUDDEN_DEATH_WEAPON].id).toBe("pulse");
  });
  it("pins the wire order so far (append-only: existing indices never move)", () => {
    expect(ROSTER.slice(0, WIRE.length).map((w) => w.id)).toEqual(WIRE);
  });
  it("every weapon is valid and within the static cost bounds", () => {
    for (const w of ROSTER) {
      expect(weaponErrors(w), w.id).toEqual([]);
      expect(maxShells(w)).toBeLessThanOrEqual(MAX_SHELLS);
      expect(maxTurnSteps(w)).toBeLessThan(MAX_TURN_STEPS);
    }
    expect(Math.max(...ROSTER.map(maxShells))).toBe(13); // Cascade
    expect(Math.max(...ROSTER.map(maxTurnSteps))).toBe(3600); // Cascade: three generations of 1,200 steps
  });
});
