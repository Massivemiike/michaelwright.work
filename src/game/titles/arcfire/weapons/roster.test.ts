import { describe, it, expect } from "vitest";
import { ROSTER, ROSTER_INDEX } from "./roster";
import { weaponErrors, maxShells, maxTurnSteps } from "./validate";
import { SUDDEN_DEATH_WEAPON, MAX_TURN_STEPS, MAX_SHELLS } from "../constants";
import { STANDARD_SETTINGS, SHORT_SETTINGS } from "../state";
import { createMatch, applyPick } from "../match";
import type { Tag } from "./types";

const TAGS: Tag[] = ["BLAST", "VOLLEY", "SPLIT", "BOUNCE", "ROLL", "DIG", "FIRE", "DIRT", "BEAM", "HOMING", "QUAKE", "SPECIAL"];

describe("ROSTER", () => {
  it("has unique ids that index back to themselves", () => {
    const ids = ROSTER.map((w) => w.id);
    expect(new Set(ids).size).toBe(ids.length);
    ROSTER.forEach((w, i) => expect(ROSTER_INDEX[w.id]).toBe(i));
  });
  it("keeps Pulse at the sudden-death index", () => {
    expect(ROSTER[SUDDEN_DEATH_WEAPON].id).toBe("pulse");
  });
  it("pins the wire order (append-only): Plan 1's eight, then Plan 2A's twenty-four", () => {
    expect(ROSTER.map((w) => w.id)).toEqual([
      "pulse", "pulse2", "nova", "needle", "crater", "triad", "fan", "railshot",
      "twinnova", "cascade", "hydra", "hailstorm", "shrapnel", "barrage", "skipper", "pinball",
      "ricochet", "tumbler", "juggernaut", "burrow", "auger", "inferno", "wildfire", "rampart",
      "bastion", "leveler", "lancer", "prism", "seeker", "swarm", "quake", "aftershock",
    ]);
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
  it("covers all 12 tags", () => {
    expect(new Set(ROSTER.map((w) => w.tag))).toEqual(new Set(TAGS));
  });
});

describe("STANDARD_SETTINGS / SHORT_SETTINGS", () => {
  it("are frozen with the spec values", () => {
    expect(STANDARD_SETTINGS).toEqual({ weaponsEach: 10, poolSize: 24, wind: false, guaranteeTags: ["BLAST", "SPLIT", "DIRT"], rosterSize: 32 });
    expect(SHORT_SETTINGS).toEqual({ ...STANDARD_SETTINGS, weaponsEach: 5, poolSize: 12 });
    expect(Object.isFrozen(STANDARD_SETTINGS) && Object.isFrozen(SHORT_SETTINGS) && Object.isFrozen(STANDARD_SETTINGS.guaranteeTags)).toBe(true);
  });
  it("tripwire: STANDARD covers the whole roster (an append must bump it deliberately, with simVersion)", () => {
    expect(STANDARD_SETTINGS.rosterSize).toBe(ROSTER.length);
  });
  it("guarantees the tags by construction: one distinct tag per free slot, each with a weapon in the drawable prefix", () => {
    // drawPool takes one weapon per guaranteed tag BEFORE the shuffle; a weapon has one tag, so
    // distinct tags never compete for a candidate, and it only stops early when the pool is full.
    for (const s of [STANDARD_SETTINGS, SHORT_SETTINGS]) {
      expect(new Set(s.guaranteeTags).size).toBe(s.guaranteeTags.length);
      expect(s.guaranteeTags.length).toBeLessThanOrEqual(s.poolSize);
      for (const tag of s.guaranteeTags) expect(ROSTER.slice(0, s.rosterSize).some((w) => w.tag === tag), tag).toBe(true);
    }
  });
  it("always draws a legal pool with the guaranteed tags, and every weapon can be drawn", () => {
    for (const s of [STANDARD_SETTINGS, SHORT_SETTINGS]) {
      const seen = new Set<number>();
      for (let seed = 0; seed < 500; seed++) {
        const m = createMatch(seed, s);
        expect(m.pool.length).toBe(s.poolSize);
        expect(new Set(m.pool).size).toBe(s.poolSize);
        for (const i of m.pool) {
          expect(i).toBeLessThan(s.rosterSize);
          seen.add(i);
        }
        for (const tag of s.guaranteeTags) expect(m.pool.some((i) => ROSTER[i].tag === tag)).toBe(true);
        if (seed < 20) {
          while (m.phase === "draft") expect(applyPick(m, m.poolOwner.findIndex((o) => o === -1)).ok).toBe(true);
          expect(m.hands[0].length + m.hands[1].length).toBe(2 * s.weaponsEach);
        }
      }
      if (s === STANDARD_SETTINGS) expect(seen.size).toBe(32);
    }
  });
});
