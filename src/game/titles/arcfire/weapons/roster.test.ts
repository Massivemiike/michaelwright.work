import { describe, it, expect } from "vitest";
import { ROSTER, ROSTER_INDEX } from "./roster";
import { SUDDEN_DEATH_WEAPON } from "../constants";

describe("ROSTER", () => {
  it("has unique ids that index back to themselves", () => {
    const ids = ROSTER.map((w) => w.id);
    expect(new Set(ids).size).toBe(ids.length);
    ROSTER.forEach((w, i) => expect(ROSTER_INDEX[w.id]).toBe(i));
  });
  it("keeps Pulse at the sudden-death index", () => {
    expect(ROSTER[SUDDEN_DEATH_WEAPON].id).toBe("pulse");
  });
  it("gives every weapon a shell launch, at least one blast, and a 1..100 draft power", () => {
    for (const w of ROSTER) {
      expect(w.launch.kind).toBe("shell");
      expect(w.stage.effects.length).toBeGreaterThan(0);
      for (const e of w.stage.effects) {
        expect(e.blast.radius).toBeGreaterThan(0);
        expect(e.blast.damage).toBeGreaterThan(0);
      }
      expect(w.power).toBeGreaterThanOrEqual(1);
      expect(w.power).toBeLessThanOrEqual(100);
    }
  });
  it("pins the Plan-1 wire order (the roster is append-only)", () => {
    expect(ROSTER.map((w) => w.id)).toEqual(["pulse", "pulse2", "nova", "needle", "crater", "triad", "fan", "railshot"]);
  });
});
