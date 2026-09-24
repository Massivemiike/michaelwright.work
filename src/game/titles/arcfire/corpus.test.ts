// src/game/titles/arcfire/corpus.test.ts
//
// Pins every roster weapon's behaviour, case by case (the corpus in
// src/game/test/arcfire/corpus.ts), plus each weapon's definition. Cases are
// keyed by weapon id, so a roster append only ADDS keys. Update modes (the
// variable set to exactly one of):
//   UPDATE_ARCFIRE_CORPUS=add   write new keys only; every existing key must still match
//   UPDATE_ARCFIRE_CORPUS=1     rewrite everything — only for a declared, reviewed re-pin
// On a mismatch the failure lists each moved case with its old and new fingerprint.
import { describe, it, expect } from "vitest";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { FNV_OFFSET, fnvFold, fnvHex } from "@/game/sim/hash";
import { runCorpus, corpusDigest, type Fingerprint } from "@/game/test/arcfire/corpus";
import { ROSTER } from "./weapons/roster";
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
    let capped = false;
    const cases = runCorpus((_c, tl) => {
      for (const s of tl.shells) if (s.points.length === 2 * (MAX_FLIGHT_STEPS + 1)) capped = true;
    });
    const defs = Object.fromEntries(ROSTER.map((w) => [w.id, defDigest(w)]));
    const fresh: CorpusFixture = { digest: corpusDigest(cases), defs, cases };

    // Not inert: the corpus exercises the flight cap. (The Plan 2A data model adds the
    // horizon, static-bound and event-kind gates to this test.)
    expect(capped, "a shell reached the per-shell flight cap").toBe(true);

    const mode = process.env.UPDATE_ARCFIRE_CORPUS;
    const old: CorpusFixture | null = existsSync(FIXTURE) ? JSON.parse(readFileSync(FIXTURE, "utf8")) : null;
    const moved = old
      ? Object.keys(old.cases).filter((id) => JSON.stringify(old.cases[id]) !== JSON.stringify(cases[id]))
        .map((id) => `${id}: ${JSON.stringify(old.cases[id])} -> ${JSON.stringify(cases[id] ?? null)}`)
        .concat(Object.keys(old.defs).filter((id) => old.defs[id] !== defs[id]).map((id) => `def ${id}: ${old.defs[id]} -> ${defs[id]}`))
      : [];
    if (mode === "1") console.log(`re-pinned ${moved.length} moved cases:\n${moved.join("\n")}`); // paste into the commit body
    if (mode === "1" || (mode === "add" && moved.length === 0)) writeFileSync(FIXTURE, JSON.stringify(fresh, null, 1) + "\n");
    expect(existsSync(FIXTURE), "create it once with UPDATE_ARCFIRE_CORPUS=1").toBe(true);
    if (mode !== "1") expect(moved, "moved cases").toEqual([]);
    const pinned: CorpusFixture = JSON.parse(readFileSync(FIXTURE, "utf8"));
    expect(Object.keys(cases).sort()).toEqual(Object.keys(pinned.cases).sort()); // no case missing or unpinned
    expect(defs).toEqual(pinned.defs);
    expect(fresh.digest).toBe(pinned.digest);
  });
});
