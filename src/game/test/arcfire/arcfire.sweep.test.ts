// src/game/test/arcfire/arcfire.sweep.test.ts
//
// The weekly Arcfire sweeps, only under BALANCE_SWEEP=1 (spec §4.3, §8):
//   tier separation: 200 seeds each, power drafts, seats swapped on odd
//     seeds: Ace beats Rookie >= 85% and Veteran >= 60%, Veteran beats
//     Rookie >= 70%. Always enforced: these are AI-correctness properties.
//   the balance harness: seeds 1..400, Ace vs Ace, random draft. A weapon
//     fails outside its tier band (T1 15-40, T2 30-60, T3 50-90 net points
//     per shot; DIRT exempt) or above +12% win-rate contribution. A failure
//     on balance.allow.json is ACK (reported, not failed); anything else
//     fails the job; an allow-listed weapon now passing is STALE ACK. The
//     launch gate needs the allow-list empty.
// CI runs it as a matrix: ARCFIRE_SWEEP_SHARD=k/n plays shard k and writes
// test-results/arcfire-sweep/shard-k.json; ARCFIRE_SWEEP_MERGE=<dir> judges
// the merged shards, and refuses a seed that is in two shard files or in none
// (every group must hold seeds 1..N exactly). Locally, one run does everything
// on every core. A malformed ARCFIRE_SWEEP_SHARD or ARCFIRE_SWEEP_THREADS fails
// the run before any match is played.
// ARCFIRE_BALANCE_WRITE=1 (local only: a full run or a merge) writes the
// harness's `power` table into roster.ts and prints the AI re-pins it needs.
import { describe, it, expect } from "vitest";
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROSTER } from "@/game/titles/arcfire/weapons/roster";
import type { MatchRecord } from "./aiMatch";
import { STANDARD_SETTINGS } from "@/game/titles/arcfire/state";
import { bundleSweep, runMatches, separationJobs, shardOf, threadsOf, winRate, type MatchJob } from "./sweep";
import { aggregate, costTable, costs, judge, report, writePowers } from "./balance";

const SWEEP = process.env.BALANCE_SWEEP === "1";
const SHARD = process.env.ARCFIRE_SWEEP_SHARD;
const MERGE = process.env.ARCFIRE_SWEEP_MERGE;
const OUT = "test-results/arcfire-sweep";
const ALLOW = "src/game/titles/arcfire/balance.allow.json";
const ROSTER_TS = "src/game/titles/arcfire/weapons/roster.ts";

interface SweepData { ar: MatchRecord[]; av: MatchRecord[]; vr: MatchRecord[]; balance: MatchRecord[] }

const balanceJobs = (): MatchJob[] => Array.from({ length: 400 }, (_, i) => ({ seed: i + 1, tiers: ["ace", "ace"], draft: "random" }));

/**
 * Every group's full job list, seeds 1..N (a shard plays each group's share; the merge needs them all).
 * ONE queue, the slowest matches first (Ace-Ace about 4.2 s, Ace-Veteran 2.4, Ace-Rookie 2.2, Veteran-Rookie 0.45),
 * so no thread idles at the end of a group.
 */
const allJobs = (): [keyof SweepData, MatchJob[]][] => [
  ["balance", balanceJobs()],
  ["av", separationJobs("ace", "veteran", 200)],
  ["ar", separationJobs("ace", "rookie", 200)],
  ["vr", separationJobs("veteran", "rookie", 200)],
];

async function play(threads: number | undefined): Promise<SweepData> {
  // each group is sharded on its own, as the merge expects
  const groups = allJobs().map(([k, jobs]): [keyof SweepData, MatchJob[]] => [k, shardOf(jobs, SHARD)]);
  const code = await bundleSweep();
  const recs = await runMatches(code, groups.flatMap(([, jobs]) => jobs), threads);
  const data: SweepData = { ar: [], av: [], vr: [], balance: [] };
  let at = 0;
  for (const [k, jobs] of groups) {
    data[k] = recs.slice(at, at + jobs.length);
    at += jobs.length;
  }
  return data;
}

function merged(dir: string): SweepData {
  const all: SweepData = { ar: [], av: [], vr: [], balance: [] };
  for (const f of readdirSync(dir).filter((n) => n.endsWith(".json")).sort()) {
    const d: SweepData = JSON.parse(readFileSync(join(dir, f), "utf8"));
    for (const k of ["ar", "av", "vr", "balance"] as const) all[k].push(...d[k]);
  }
  const gaps: string[] = []; // complete: exactly the full run's seeds, so a lost shard file is never judged on what is left
  for (const [k, jobs] of allJobs()) {
    all[k].sort((a, b) => a.seed - b.seed);
    all[k].forEach((r, i) => {
      if (i > 0 && all[k][i - 1].seed === r.seed) throw new Error(`${dir}: seed ${r.seed} of "${k}" is in two shard files`);
    });
    const want = jobs.map((j) => j.seed);
    const have = all[k].map((r) => r.seed);
    const missing = want.filter((s) => !have.includes(s));
    const extra = have.filter((s) => !want.includes(s));
    if (missing.length > 0 || extra.length > 0) {
      gaps.push(`"${k}" must hold seeds 1..${want.length} exactly; missing ${missing.length}: ${missing.join(", ") || "none"}; unexpected: ${extra.join(", ") || "none"}`);
    }
  }
  if (gaps.length > 0) throw new Error(`${dir}: the shard files are incomplete\n${gaps.join("\n")}`);
  return all;
}

function publish(text: string): void {
  process.stderr.write(`${text}\n`); // outside Vitest's console capture: every reporter shows it
  mkdirSync("test-results/arcfire-balance", { recursive: true });
  writeFileSync("test-results/arcfire-balance/report.md", `${text}\n`);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${text}\n`);
}

describe.runIf(SWEEP)("arcfire sweeps (BALANCE_SWEEP=1)", () => {
  it("separates the tiers and judges every weapon", async () => {
    const threads = threadsOf(process.env.ARCFIRE_SWEEP_THREADS); // both knobs fail loudly before any work
    shardOf([], SHARD);
    const data = MERGE ? merged(MERGE) : await play(threads);
    if (!MERGE) { // the records, for a later merge: a matrix shard stops here, and the merge job judges
      mkdirSync(OUT, { recursive: true });
      writeFileSync(join(OUT, `shard-${SHARD ? SHARD.split("/")[0] : "all"}.json`), JSON.stringify(data));
      if (SHARD) return;
    }
    const sep = { ar: winRate(data.ar, "ace"), av: winRate(data.av, "ace"), vr: winRate(data.vr, "veteran") };
    const rows = aggregate(data.balance, ROSTER, 2 * STANDARD_SETTINGS.weaponsEach);
    const allow: Record<string, string> = existsSync(ALLOW) ? JSON.parse(readFileSync(ALLOW, "utf8")) : {};
    const j = judge(rows, allow);
    const pctOf = (v: number): string => `${(100 * v).toFixed(1)}%`;
    const cost = costs([...data.ar, ...data.av, ...data.vr, ...data.balance]);
    const n = [data.ar.length, data.av.length, data.vr.length]; // the matches each rate is over
    const seeds = n[0] === n[1] && n[1] === n[2] ? `${n[0]} seeds each` : `seeds: Ace-Rookie ${n[0]}, Ace-Veteran ${n[1]}, Veteran-Rookie ${n[2]}`;
    publish([
      `## Arcfire sweeps`,
      `tier separation (${seeds}): Ace-Rookie ${pctOf(sep.ar)} (>= 85%), Ace-Veteran ${pctOf(sep.av)} (>= 60%), Veteran-Rookie ${pctOf(sep.vr)} (>= 70%)`,
      "",
      report(j, data.balance, "Balance: Ace vs Ace, random draft, STANDARD_SETTINGS"),
      "",
      "Decision costs, every sweep match (sims and probe flights are exact; ms is wall time under the sweep's own load):",
      "",
      costTable(cost),
    ].join("\n"));
    writeFileSync("test-results/arcfire-balance/report.json", JSON.stringify({ sep, rows, cost }, null, 1));
    if (process.env.ARCFIRE_BALANCE_WRITE === "1" && !SHARD) {
      const w = writePowers(readFileSync(ROSTER_TS, "utf8"), Object.fromEntries(rows.map((r) => [r.id, r.power])));
      writeFileSync(ROSTER_TS, w.src);
      process.stderr.write(`power write-back (${w.changed.length}):\n${w.changed.join("\n")}\nnow re-pin the AI (declared):\n` +
        "  UPDATE_ARCFIRE_AI=draft npx vitest run src/game/titles/arcfire/ai.corpus.test.ts\n" +
        "  UPDATE_ARCFIRE_GOLDEN=vsai npx vitest run src/game/titles/arcfire/ai.corpus.test.ts\n");
    }
    expect(sep.ar, "Ace beats Rookie").toBeGreaterThanOrEqual(0.85);
    expect(sep.av, "Ace beats Veteran").toBeGreaterThanOrEqual(0.6);
    expect(sep.vr, "Veteran beats Rookie").toBeGreaterThanOrEqual(0.7);
    expect(j.failing, "weapons failing outside balance.allow.json").toEqual([]);
  }, 3_600_000);
});
