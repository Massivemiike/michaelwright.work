// src/game/titles/arcfire/determinism.test.ts
//
// Arcfire's golden determinism gate (mirrors src/game/test/determinism.test.ts).
// A fixed in-file strategy GENERATES a complete 2-player command log; replaying
// it must land on the hash pinned in determinism.golden.json. Same code → same
// log → same hash; any unintended sim change moves the hash and fails loud.
// Two goldens: "plan1" (determinism.golden.json, Plan 1's 8-weapon shape) and
// "full" (determinism.full.golden.json, the 32-weapon roster). Re-pin ONLY for
// an intentional sim change, naming the golden the change declares:
//   UPDATE_ARCFIRE_GOLDEN=plan1 npx vitest run src/game/titles/arcfire/determinism.test.ts
//   UPDATE_ARCFIRE_GOLDEN=full  npx vitest run src/game/titles/arcfire/determinism.test.ts
//   UPDATE_ARCFIRE_GOLDEN=1     ... re-pins both (kept for compatibility)
// A golden that is not named keeps failing on a moved hash. Every re-pin writes
// `golden <name>: <old hash> -> <new hash> (scores <old> -> <new>)` to stderr,
// which shows under any reporter: paste it into the commit body.
// The inertness checks run first either way, so a degenerate match (a draw, a
// zero score, no move, no volley) can never be pinned.
// (This *.test.ts may use node:fs and process — the purity guard skips tests.)
import { describe, it, expect } from "vitest";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createMatch, applyPick, applyTurn } from "./match";
import { replayMatch, type ArcfireCommand, type ArcfireReplay } from "./replay";
import { cloneMatch, type MatchSettings } from "./state";
import { SUDDEN_DEATH_WEAPON } from "./constants";
import { ROSTER } from "./weapons/roster";

interface GoldenFixture { replay: ArcfireReplay; hash: string; scores: number[]; winner: number }

/** Is golden `name` selected for a re-pin? UPDATE_ARCFIRE_GOLDEN=1 selects both; =plan1 or =full only that one. */
function repinning(name: "plan1" | "full"): boolean {
  const mode = process.env.UPDATE_ARCFIRE_GOLDEN;
  return mode === "1" || mode === name;
}

/** Rewrite golden `name` at `path` and report what moved on stderr (outside Vitest's console capture, so any reporter shows it). */
function repin(name: string, path: string, fixture: GoldenFixture): void {
  const old: GoldenFixture | null = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : null;
  writeFileSync(path, JSON.stringify(fixture, null, 2) + "\n");
  const was = old ? old.hash : "none";
  const wasScores = old ? JSON.stringify(old.scores) : "none";
  process.stderr.write(`golden ${name}: ${was} -> ${fixture.hash} (scores ${wasScores} -> ${JSON.stringify(fixture.scores)})\n`);
}

const FIXTURE = join("src/game/titles/arcfire/determinism.golden.json");
const SEED = 20260922;
const SETTINGS: MatchSettings = { weaponsEach: 4, poolSize: 8, wind: true, guaranteeTags: ["VOLLEY"], rosterSize: 8 };

function buildGoldenReplay(): ArcfireReplay {
  const m = createMatch(SEED, SETTINGS);
  const commands: ArcfireCommand[] = [];
  while (m.phase === "draft") {
    const w = m.poolOwner.findIndex((o) => o === -1); // lowest free pool slot
    if (!applyPick(m, w).ok) throw new Error("golden strategy made an illegal pick");
    commands.push({ k: "pick", w });
  }
  for (let turn = 0; m.phase !== "over"; turn++) {
    const p = m.shooter;
    const w = m.phase === "suddenDeath" ? SUDDEN_DEATH_WEAPON : m.hands[p][0];
    const angle = p === 0 ? 40 + (turn % 5) * 5 : 140 - (turn % 5) * 5;
    const power = 55 + (turn % 7) * 5;
    const move: -1 | 0 | 1 = turn === 2 ? (p === 0 ? 1 : -1) : 0;
    if (!applyTurn(m, { move, w, angle, power }).ok) throw new Error(`golden strategy made an illegal turn at ${turn}`);
    commands.push({ k: "turn", move, w, angle, power });
  }
  return { seed: SEED, settings: SETTINGS, commands };
}

describe("arcfire golden determinism", () => {
  it("replays the generated log to the pinned golden hash", () => {
    const replay = buildGoldenReplay();
    const result = replayMatch(replay);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Not inert: a decisive match where both sides scored, a tank moved and a volley flew.
    expect(result.state.phase).toBe("over");
    expect([0, 1]).toContain(result.state.winner);
    expect(result.state.scores[0]).toBeGreaterThan(0);
    expect(result.state.scores[1]).toBeGreaterThan(0);
    expect(replay.commands.some((c) => c.k === "turn" && c.move !== 0)).toBe(true);
    expect(replay.commands.some((c) => c.k === "turn" && ROSTER[c.w].tag === "VOLLEY")).toBe(true);
    if (repinning("plan1")) {
      repin("plan1", FIXTURE, { replay, hash: result.hash, scores: Array.from(result.state.scores), winner: result.state.winner });
    }
    expect(existsSync(FIXTURE), "create it once with UPDATE_ARCFIRE_GOLDEN=plan1").toBe(true);
    const golden = JSON.parse(readFileSync(FIXTURE, "utf8"));
    expect(replay).toEqual(golden.replay);
    expect(result.hash).toBe(golden.hash);
    expect(Array.from(result.state.scores)).toEqual(golden.scores);
  });
});

// The full-roster golden: the daily-challenge shape (10 each from 24, BLAST/SPLIT/DIRT
// guaranteed) drawn from all 32 weapons. The settings are a LITERAL, frozen with
// rosterSize 32, so a later roster append can't move this pin either.
const FULL_FIXTURE = join("src/game/titles/arcfire/determinism.full.golden.json");
const FULL_SEED = 20260927;
const FULL_SETTINGS: MatchSettings = { weaponsEach: 10, poolSize: 24, wind: false, guaranteeTags: ["BLAST", "SPLIT", "DIRT"], rosterSize: 32 };

/** Draft the highest free slot; each turn fire the lowest weapon in hand at the best point of a coarse grid (resolved on clones). */
function buildFullReplay(): ArcfireReplay {
  const m = createMatch(FULL_SEED, FULL_SETTINGS);
  const commands: ArcfireCommand[] = [];
  while (m.phase === "draft") {
    let w = m.poolOwner.length - 1;
    while (m.poolOwner[w] !== -1) w--;
    if (!applyPick(m, w).ok) throw new Error("full-golden strategy made an illegal pick");
    commands.push({ k: "pick", w });
  }
  for (let turn = 0; m.phase !== "over"; turn++) {
    const p = m.shooter;
    const w = m.phase === "suddenDeath" ? SUDDEN_DEATH_WEAPON : m.hands[p][0];
    const move: -1 | 0 | 1 = turn === 2 ? (p === 0 ? 1 : -1) : 0;
    let best = -Infinity;
    let angle = 0;
    let power = 0;
    for (let a = 25; a <= 70; a += 5) {
      for (let pw = 40; pw <= 100; pw += 10) {
        const c = cloneMatch(m);
        const aim = p === 0 ? a : 180 - a;
        if (!applyTurn(c, { move, w, angle: aim, power: pw }).ok) throw new Error("full-golden probe was illegal");
        const v = c.scores[p] - m.scores[p] - (c.scores[1 - p] - m.scores[1 - p]);
        if (v > best) {
          best = v;
          angle = aim;
          power = pw;
        }
      }
    }
    if (!applyTurn(m, { move, w, angle, power }).ok) throw new Error(`full-golden strategy made an illegal turn at ${turn}`);
    commands.push({ k: "turn", move, w, angle, power });
  }
  return { seed: FULL_SEED, settings: FULL_SETTINGS, commands };
}

describe("arcfire full-roster golden", () => {
  it("replays the generated full-roster log to its pinned hash", () => {
    const replay = buildFullReplay();
    const result = replayMatch(replay);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Not inert: decisive, both sides scored, a tank moved, and every one of the 12 tags was fired.
    expect(result.state.phase).toBe("over");
    expect([0, 1]).toContain(result.state.winner);
    expect(result.state.scores[0]).toBeGreaterThan(0);
    expect(result.state.scores[1]).toBeGreaterThan(0);
    expect(replay.commands.some((c) => c.k === "turn" && c.move !== 0)).toBe(true);
    expect(new Set(replay.commands.flatMap((c) => (c.k === "turn" ? [ROSTER[c.w].tag] : [])))).toEqual(new Set(ROSTER.map((w) => w.tag)));
    if (repinning("full")) {
      repin("full", FULL_FIXTURE, { replay, hash: result.hash, scores: Array.from(result.state.scores), winner: result.state.winner });
    }
    expect(existsSync(FULL_FIXTURE), "create it once with UPDATE_ARCFIRE_GOLDEN=full").toBe(true);
    const golden = JSON.parse(readFileSync(FULL_FIXTURE, "utf8"));
    expect(replay).toEqual(golden.replay);
    expect(result.hash).toBe(golden.hash);
    expect(Array.from(result.state.scores)).toEqual(golden.scores);
  });
});
