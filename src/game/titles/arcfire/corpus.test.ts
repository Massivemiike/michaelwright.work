// src/game/titles/arcfire/corpus.test.ts
//
// Pins every roster weapon's behaviour, case by case (the corpus in
// src/game/test/arcfire/corpus.ts), plus each weapon's definition. Cases are
// keyed by weapon id, so a roster append only ADDS keys. Update modes (the
// variable set to exactly one of):
//   UPDATE_ARCFIRE_CORPUS=add   write new keys only; every existing key must still match
//   UPDATE_ARCFIRE_CORPUS=1     rewrite everything — only for a declared, reviewed re-pin. It also
//                               needs ARCFIRE_CORPUS_EXPECT_MOVED=<n>, the number of moved cases and
//                               defs the re-pin declares; unless exactly n moved it fails and writes
//                               nothing. The moved list goes to stderr, which any reporter shows:
//   UPDATE_ARCFIRE_CORPUS=1 ARCFIRE_CORPUS_EXPECT_MOVED=4 npx vitest run src/game/titles/arcfire/corpus.test.ts
// On a mismatch the failure lists each moved case with its old and new fingerprint.
import { describe, it, expect } from "vitest";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { FNV_OFFSET, fnvFold, fnvHex } from "@/game/sim/hash";
import { runCorpus, corpusDigest, type Fingerprint } from "@/game/test/arcfire/corpus";
import { ROSTER, ROSTER_INDEX } from "./weapons/roster";
import { maxShells, maxTurnSteps } from "./weapons/validate";
import { MAX_FLIGHT_STEPS } from "./constants";
import type { WeaponDef } from "./weapons/types";

const FIXTURE = join("src/game/titles/arcfire/corpus.golden.json");

/** Canonical JSON (sorted keys, no `power`) of a def, FNV-1a'd: pins every behaviour number of the def. */
function defDigest(def: WeaponDef): string {
  const canon = (v: unknown): string => {
    if (Array.isArray(v)) return `[${v.map(canon).join(",")}]`;
    if (v !== null && typeof v === "object") {
      const o = v as Record<string, unknown>;
      return `{${Object.keys(o).filter((k) => k !== "power").sort().map((k) => `${JSON.stringify(k)}:${canon(o[k])}`).join(",")}}`;
    }
    return JSON.stringify(v);
  };
  const s = canon(def);
  let h = FNV_OFFSET;
  for (let i = 0; i < s.length; i++) h = fnvFold(h, s.charCodeAt(i));
  return fnvHex(h);
}

interface CorpusFixture { digest: string; defs: Record<string, string>; cases: Record<string, Fingerprint> }

describe("arcfire corpus", () => {
  it("reproduces every pinned case and weapon definition", () => {
    const kinds = new Set<string>();
    const volleyAngles: number[] = [];
    let capped = false;
    let beamHit = false;
    const cases = runCorpus((c, tl) => {
      const def = ROSTER[ROSTER_INDEX[c.w]];
      for (const e of tl.events) kinds.add(e.kind === "bounce" ? `bounce:${e.wall ? "wall" : "terrain"}` : e.kind === "build" ? `build:${e.shape}` : e.kind);
      for (const s of tl.shells) {
        if (s.parent === -1) volleyAngles.push(s.angle);
        if (s.points.length === 2 * (MAX_FLIGHT_STEPS + 1)) capped = true;
      }
      if (def.launch.kind === "beam" && tl.points[c.shooter] > 0) beamHit = true;
      // the static cost bounds hold for every case
      expect(tl.steps).toBeLessThanOrEqual(maxTurnSteps(def));
      expect(tl.shells.length).toBeLessThanOrEqual(maxShells(def));
    });
    const defs = Object.fromEntries(ROSTER.map((w) => [w.id, defDigest(w)]));
    const fresh: CorpusFixture = { digest: corpusDigest(cases), defs, cases };

    // Not inert: the corpus exercises the flight cap, both sides of the horizon, and — once
    // the weapon that makes it exists — every event kind (the gates switch on as weapons land).
    expect(capped, "a shell reached the per-shell flight cap").toBe(true);
    expect(Math.min(...volleyAngles)).toBeLessThan(0);
    expect(Math.max(...volleyAngles)).toBeGreaterThan(180);
    const gates: [string, string][] = [
      ["twinnova", "fuse"], ["cascade", "split"], ["skipper", "bounce:terrain"], ["ricochet", "bounce:wall"],
      ["tumbler", "roll"], ["burrow", "dig"], ["inferno", "burn"], ["rampart", "build:wall"], ["bastion", "build:ball"],
      ["leveler", "build:level"], ["lancer", "beam"], ["quake", "quake"],
    ];
    for (const [id, kind] of gates) if (id in ROSTER_INDEX) expect(kinds.has(kind), `${id} emits ${kind}`).toBe(true);
    if ("lancer" in ROSTER_INDEX) expect(beamHit, "a beam scored").toBe(true);

    const mode = process.env.UPDATE_ARCFIRE_CORPUS;
    const old: CorpusFixture | null = existsSync(FIXTURE) ? JSON.parse(readFileSync(FIXTURE, "utf8")) : null;
    const moved = old
      ? Object.keys(old.cases).filter((id) => JSON.stringify(old.cases[id]) !== JSON.stringify(cases[id]))
        .map((id) => `${id}: ${JSON.stringify(old.cases[id])} -> ${JSON.stringify(cases[id] ?? null)}`)
        .concat(Object.keys(old.defs).filter((id) => old.defs[id] !== defs[id]).map((id) => `def ${id}: ${old.defs[id]} -> ${defs[id]}`))
      : [];
    if (mode === "1") {
      // outside Vitest's console capture, so the list shows under any reporter: paste it into the commit body
      process.stderr.write(`corpus re-pin: ${moved.length} moved cases:\n${moved.join("\n")}\n`);
      const declared = process.env.ARCFIRE_CORPUS_EXPECT_MOVED;
      const why = `UPDATE_ARCFIRE_CORPUS=1 needs ARCFIRE_CORPUS_EXPECT_MOVED=<n>, the moved count the re-pin declares (${moved.length} moved, listed on stderr); nothing was written`;
      expect(declared, why).toBe(String(moved.length));
    }
    if (mode === "1" || (mode === "add" && moved.length === 0)) writeFileSync(FIXTURE, JSON.stringify(fresh, null, 1) + "\n");
    expect(existsSync(FIXTURE), "create it once with UPDATE_ARCFIRE_CORPUS=1").toBe(true);
    if (mode !== "1") expect(moved, "moved cases").toEqual([]);
    const pinned: CorpusFixture = JSON.parse(readFileSync(FIXTURE, "utf8"));
    expect(Object.keys(cases).sort()).toEqual(Object.keys(pinned.cases).sort()); // no case missing or unpinned
    expect(defs).toEqual(pinned.defs);
    expect(fresh.digest).toBe(pinned.digest);
  });
});
