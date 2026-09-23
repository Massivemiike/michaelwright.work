// src/game/titles/arcfire/determinism.test.ts
//
// Arcfire's golden determinism gate (mirrors src/game/test/determinism.test.ts).
// A fixed in-file strategy GENERATES a complete 2-player command log; replaying
// it must land on the hash pinned in determinism.golden.json. Same code → same
// log → same hash; any unintended sim change moves the hash and fails loud.
// Re-pin ONLY for an intentional sim change:
//   UPDATE_ARCFIRE_GOLDEN=1 npx vitest run src/game/titles/arcfire/determinism.test.ts
// (This *.test.ts may use node:fs and process — the purity guard skips tests.)
import { describe, it, expect } from "vitest";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createMatch, applyPick, applyTurn } from "./match";
import { replayMatch, type ArcfireCommand, type ArcfireReplay } from "./replay";
import type { MatchSettings } from "./state";
import { SUDDEN_DEATH_WEAPON } from "./constants";

const FIXTURE = join("src/game/titles/arcfire/determinism.golden.json");
const SEED = 20260922;
const SETTINGS: MatchSettings = { weaponsEach: 4, poolSize: 8, wind: true, guaranteeTags: ["VOLLEY"] };

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
    expect(result.state.phase).toBe("over");
    if (process.env.UPDATE_ARCFIRE_GOLDEN) {
      const fixture = { replay, hash: result.hash, scores: Array.from(result.state.scores), winner: result.state.winner };
      writeFileSync(FIXTURE, JSON.stringify(fixture, null, 2) + "\n");
    }
    expect(existsSync(FIXTURE), "create it once with UPDATE_ARCFIRE_GOLDEN=1").toBe(true);
    const golden = JSON.parse(readFileSync(FIXTURE, "utf8"));
    expect(replay).toEqual(golden.replay);
    expect(result.hash).toBe(golden.hash);
    expect(Array.from(result.state.scores)).toEqual(golden.scores);
  });
});
