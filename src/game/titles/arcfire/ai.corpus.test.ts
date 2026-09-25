// src/game/titles/arcfire/ai.corpus.test.ts
//
// The AI's pins (spec §8), run on the bundled sim (ai.entry.ts):
//   the AI corpus (ai.corpus.golden.json): two digests, `turn` (power-
//     independent) and `draft` (reads `power`), plus coverage gates so the
//     case list can never go inert: some case moved, saved a tier-3 weapon,
//     built DIRT by the rule, chose a beam, played sudden death, faced wind;
//   the vs-AI goldens (determinism.vsai.golden.json): a human win and a human
//     loss against Veteran with STANDARD_SETTINGS, played live by the scripted
//     human (vsaiGolden.ts), then replayed from the human's commands alone:
//     the replay must reproduce the live hash (the leaderboard's core
//     guarantee) and the pinned one; scoreVsAi scores the win and rejects the rest.
// Update modes, declared and loud (each writes what moved to stderr):
//   UPDATE_ARCFIRE_AI=add    write new case ids only; refuses if any pinned case moved
//   UPDATE_ARCFIRE_AI=draft  re-pin the draft section only (a `power` write-back)
//   UPDATE_ARCFIRE_AI=1      re-pin both sections; needs ARCFIRE_AI_EXPECT_MOVED=<n>, the moved count
//   UPDATE_ARCFIRE_GOLDEN=vsai re-pins the vs-AI goldens, and only =vsai does: determinism.test.ts's
//     =1 (plan1 + full) never touches them, so one re-pin command moves one cause's pins
import { describe, it, expect, beforeAll } from "vitest";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { build } from "esbuild";
import { ROSTER } from "./weapons/roster";
import type { ArcfireCommand } from "./replay";
import type { MatchSettings, MatchState } from "./state";
import type { TurnCommand } from "./match";
import type { Plan } from "./ai/plan";
import type { AiCorpus, AiFingerprint } from "@/game/test/arcfire/aiCorpus";
import type { LivePlay } from "@/game/test/arcfire/vsaiGolden";
import type { VsAiResult, VsAiResume } from "./vsai";
import type { ReplayOutcome, ReplayRejection } from "@/game/sim/title";

interface AiEntry {
  runAiCorpus(onTurn?: (id: string, m: MatchState, cmd: TurnCommand, plan: Plan) => void): AiCorpus;
  aiDigest(cases: Record<string, AiFingerprint>): string;
  playVsAi(seed: number, settings: MatchSettings, tier: "veteran"): LivePlay;
  replayVsAi(r: { seed: number; settings: MatchSettings; tier: "veteran"; commands: unknown }): VsAiResult;
  resumeVsAi(r: { seed: number; settings: MatchSettings; log: unknown }): VsAiResume;
  scoreVsAi(seed: number, commands: unknown): ReplayOutcome | { rejected: ReplayRejection };
  hashMatch(m: MatchState): string;
  STANDARD_SETTINGS: MatchSettings;
}

let ai: AiEntry;
beforeAll(async () => {
  const out = await build({
    entryPoints: [resolve("src/game/test/arcfire/ai.entry.ts")],
    bundle: true, format: "cjs", platform: "node", write: false, tsconfig: "tsconfig.json",
  });
  const mod: { exports: Partial<AiEntry> } = { exports: {} };
  new Function("module", "exports", out.outputFiles[0].text)(mod, mod.exports);
  ai = mod.exports as AiEntry;
}, 60000);

const CORPUS = "src/game/titles/arcfire/ai.corpus.golden.json";
const GOLDEN = "src/game/titles/arcfire/determinism.vsai.golden.json";

interface CorpusFixture { turnDigest: string; draftDigest: string; turn: Record<string, AiFingerprint>; draft: Record<string, AiFingerprint> }

const movedIn = (old: Record<string, AiFingerprint>, cur: Record<string, AiFingerprint>): string[] =>
  [...new Set([...Object.keys(old), ...Object.keys(cur)])].sort()
    .filter((id) => id in old && JSON.stringify(old[id]) !== JSON.stringify(cur[id] ?? null))
    .map((id) => `${id}: ${JSON.stringify(old[id])} -> ${JSON.stringify(cur[id] ?? null)}`);

describe("arcfire AI corpus", () => {
  it("reproduces every pinned AI decision, and exercises every heuristic", () => {
    const seen = new Set<string>();
    const corpus = ai.runAiCorpus((id, m, cmd, plan) => {
      expect(cmd.angle >= 0 && cmd.angle <= 180 && cmd.power >= 0 && cmd.power <= 100, id).toBe(true);
      if (plan.stats.reason === "move" && cmd.move !== 0) seen.add("move");
      if (plan.stats.reason === "saveT3") seen.add("saveT3");
      if (plan.stats.reason === "dirt" && ROSTER[cmd.w].tag === "DIRT") seen.add("dirt");
      if (ROSTER[cmd.w].launch.kind === "beam") seen.add("beam");
      if (m.phase === "suddenDeath") seen.add("sudden");
      if (m.wind !== 0) seen.add("wind");
    });
    expect([...seen].sort(), "coverage gates").toEqual(["beam", "dirt", "move", "saveT3", "sudden", "wind"]);
    const fresh: CorpusFixture = { turnDigest: ai.aiDigest(corpus.turn), draftDigest: ai.aiDigest(corpus.draft), turn: corpus.turn, draft: corpus.draft };
    const mode = process.env.UPDATE_ARCFIRE_AI;
    const old: CorpusFixture | null = existsSync(CORPUS) ? JSON.parse(readFileSync(CORPUS, "utf8")) : null;
    const movedTurn = old ? movedIn(old.turn, corpus.turn) : [];
    const movedDraft = old ? movedIn(old.draft, corpus.draft) : [];
    if (mode === "1" || mode === "draft") {
      const moved = mode === "draft" ? movedDraft : movedTurn.concat(movedDraft);
      process.stderr.write(`AI corpus re-pin (${mode}): ${moved.length} moved cases:\n${moved.join("\n")}\n`);
      if (mode === "draft") expect(movedTurn, "a draft re-pin must not move a turn case").toEqual([]);
      else expect(process.env.ARCFIRE_AI_EXPECT_MOVED, "UPDATE_ARCFIRE_AI=1 needs ARCFIRE_AI_EXPECT_MOVED=<n>; nothing was written").toBe(String(moved.length));
      writeFileSync(CORPUS, JSON.stringify(fresh, null, 1) + "\n");
    } else if (mode === "add" && movedTurn.length === 0 && movedDraft.length === 0) writeFileSync(CORPUS, JSON.stringify(fresh, null, 1) + "\n");
    expect(existsSync(CORPUS), "create it once with UPDATE_ARCFIRE_AI=1 ARCFIRE_AI_EXPECT_MOVED=0").toBe(true);
    if (mode !== "1" && mode !== "draft") {
      expect(movedTurn, "moved turn cases").toEqual([]);
      expect(movedDraft, "moved draft cases (a power write-back: UPDATE_ARCFIRE_AI=draft)").toEqual([]);
    }
    const pinned: CorpusFixture = JSON.parse(readFileSync(CORPUS, "utf8"));
    expect(Object.keys(corpus.turn).sort()).toEqual(Object.keys(pinned.turn).sort());
    expect(Object.keys(corpus.draft).sort()).toEqual(Object.keys(pinned.draft).sort());
    expect(fresh.turnDigest).toBe(pinned.turnDigest);
    expect(fresh.draftDigest).toBe(pinned.draftDigest);
  }, 120000);
});

interface GoldenCase { seed: number; commands: ArcfireCommand[]; hash: string; scores: number[]; winner: number }
interface VsAiGolden { win: GoldenCase; loss: GoldenCase }

describe("arcfire vs-AI goldens", () => {
  it("replays the human's commands alone to the live and the pinned hash", () => {
    const S = ai.STANDARD_SETTINGS;
    const fixture: VsAiGolden | null = existsSync(GOLDEN) ? JSON.parse(readFileSync(GOLDEN, "utf8")) : null;
    const mode = process.env.UPDATE_ARCFIRE_GOLDEN;
    const repin = mode === "vsai";
    const fresh: Partial<VsAiGolden> = {};
    for (const name of ["win", "loss"] as const) {
      const seed = fixture ? fixture[name].seed : name === "win" ? 20260934 : 20260928;
      const live = ai.playVsAi(seed, S, "veteran");
      const liveHash = ai.hashMatch(live.state);
      const r = ai.replayVsAi({ seed, settings: S, tier: "veteran", commands: live.commands });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.hash, `${name}: the human-only replay regenerates the live match`).toBe(liveHash);
      // not inert: finished, both sides scored, the human moved, the AI fired >= 6 tags
      expect(r.finished).toBe(true);
      expect(r.state.winner).toBe(name === "win" ? 0 : 1);
      expect(r.humanPoints).toBeGreaterThan(0);
      expect(r.aiPoints).toBeGreaterThan(0);
      expect(live.commands.some((c) => c.k === "turn" && c.move !== 0)).toBe(true);
      expect(new Set(live.aiTurns.map((c) => (c.k === "turn" ? ROSTER[c.w].tag : ""))).size).toBeGreaterThanOrEqual(6);
      // search-free resume of the full log lands on the same state
      const res = ai.resumeVsAi({ seed, settings: S, log: live.log });
      expect(res.ok && res.droppedFrom === -1 && ai.hashMatch(res.state) === liveHash).toBe(true);
      fresh[name] = { seed, commands: live.commands, hash: r.hash, scores: [r.humanPoints, r.aiPoints], winner: r.state.winner };
    }
    if (repin) {
      writeFileSync(GOLDEN, JSON.stringify(fresh, null, 1) + "\n");
      for (const name of ["win", "loss"] as const) {
        process.stderr.write(`golden vsai-${name}: ${fixture ? fixture[name].hash : "none"} -> ${fresh[name]!.hash} (scores ${fixture ? JSON.stringify(fixture[name].scores) : "none"} -> ${JSON.stringify(fresh[name]!.scores)})\n`);
      }
    }
    expect(existsSync(GOLDEN), "create it once with UPDATE_ARCFIRE_GOLDEN=vsai").toBe(true);
    const pinned: VsAiGolden = JSON.parse(readFileSync(GOLDEN, "utf8"));
    for (const name of ["win", "loss"] as const) {
      expect(fresh[name]!.commands, `${name}: the scripted human's log`).toEqual(pinned[name].commands);
      expect(fresh[name]!.hash, `${name} hash`).toBe(pinned[name].hash);
      expect(fresh[name]!.scores).toEqual(pinned[name].scores);
    }
  }, 120000);

  it("scores the win and rejects everything else (scoreVsAi)", () => {
    const g: VsAiGolden = JSON.parse(readFileSync(GOLDEN, "utf8"));
    const win = g.win.commands;
    expect(ai.scoreVsAi(g.win.seed, win)).toEqual({ score: g.win.scores[0] - g.win.scores[1], stat: g.win.scores[0], hash: g.win.hash });
    expect(ai.scoreVsAi(g.loss.seed, g.loss.commands)).toEqual({ rejected: "not_a_win" });
    expect(ai.scoreVsAi(g.win.seed, win.slice(0, 15))).toEqual({ rejected: "not_a_win" }); // unfinished
    expect(ai.scoreVsAi(g.win.seed + 1, win)).toEqual({ rejected: "invalid_command" }); // another pool
    const bent = win.map((c, i) => (i === win.length - 1 && c.k === "turn" ? { ...c, angle: 181 } : c));
    expect(ai.scoreVsAi(g.win.seed, bent)).toEqual({ rejected: "invalid_command" });
    expect(ai.scoreVsAi(g.win.seed, [...win.slice(0, 3), null])).toEqual({ rejected: "invalid_command_shape" });
    expect(ai.scoreVsAi(g.win.seed, [{ k: "turn", move: 2, w: 0, angle: 45, power: 50 }])).toEqual({ rejected: "invalid_command_shape" });
    expect(ai.scoreVsAi(g.win.seed, new Array(22).fill({ k: "pick", w: 0 }))).toEqual({ rejected: "too_long" });
    expect(ai.scoreVsAi(g.win.seed, "commands")).toEqual({ rejected: "invalid_command_shape" });
  }, 120000);
});
