// src/game/test/arcfire/sweep.ts
//
// The sweep runner (Node only, test support): bundle sweep.entry.ts once with
// esbuild, then play AI-vs-AI matches on worker_threads. Results come back in
// job order, so every aggregate is identical whatever the thread count.
// ARCFIRE_SWEEP_SHARD=k/n keeps the jobs whose index is k - 1 mod n (a CI
// matrix shard); ARCFIRE_SWEEP_THREADS caps the threads (default: all cores).
import { Worker } from "node:worker_threads";
import { availableParallelism } from "node:os";
import { resolve } from "node:path";
import { build } from "esbuild";
import type { MatchRecord } from "./aiMatch";
import type { AiTier } from "@/game/titles/arcfire/ai/tiers";

export interface MatchJob { seed: number; tiers: [AiTier, AiTier]; draft: "power" | "random" }

export async function bundleSweep(): Promise<string> {
  const out = await build({
    entryPoints: [resolve("src/game/test/arcfire/sweep.entry.ts")],
    bundle: true, format: "cjs", platform: "node", write: false, tsconfig: "tsconfig.json",
  });
  return out.outputFiles[0].text;
}

const WORKER = `
const { parentPort, workerData } = require("node:worker_threads");
const mod = { exports: {} };
new Function("module", "exports", workerData.code)(mod, mod.exports);
parentPort.on("message", ({ i, job }) => {
  try { parentPort.postMessage({ i, rec: mod.exports.playAiMatch(job.seed, job.tiers, job.draft, undefined, () => performance.now()) }); }
  catch (e) { parentPort.postMessage({ i, error: String((e && e.stack) || e) }); }
});`;

/** The jobs of shard `spec` ("k/n"), or all of them. */
export function shardOf<T>(jobs: T[], spec: string | undefined): T[] {
  if (!spec) return jobs;
  const [k, n] = spec.split("/").map(Number);
  return jobs.filter((_, i) => i % n === k - 1);
}

export async function runMatches(code: string, jobs: MatchJob[], threads = availableParallelism()): Promise<MatchRecord[]> {
  const out: MatchRecord[] = new Array(jobs.length);
  let next = 0;
  let done = 0;
  const n = Math.max(1, Math.min(threads, jobs.length));
  await new Promise<void>((res, rej) => {
    if (jobs.length === 0) return res();
    for (let k = 0; k < n; k++) {
      const w = new Worker(WORKER, { eval: true, workerData: { code } });
      const feed = (): void => {
        if (next >= jobs.length) { void w.terminate(); return; }
        const i = next++;
        w.postMessage({ i, job: jobs[i] });
      };
      w.on("message", (msg: { i: number; rec?: MatchRecord; error?: string }) => {
        if (msg.error !== undefined) { rej(new Error(`job ${msg.i}: ${msg.error}`)); void w.terminate(); return; }
        out[msg.i] = msg.rec!;
        if (++done === jobs.length) res();
        feed();
      });
      w.on("error", rej);
      feed();
    }
  });
  return out;
}

/** Seeds first..first+n-1, the two tiers swapping seats on odd seeds, drafting by power (spec §8 tier separation). */
export function separationJobs(a: AiTier, b: AiTier, n: number, first = 1): MatchJob[] {
  const jobs: MatchJob[] = [];
  for (let s = first; s < first + n; s++) jobs.push({ seed: s, tiers: s % 2 === 0 ? [a, b] : [b, a], draft: "power" });
  return jobs;
}

/** How often tier `a` won the separation matches (draws are not wins). */
export function winRate(recs: MatchRecord[], a: AiTier): number {
  let wins = 0;
  for (const r of recs) if (r.winner !== 2 && r.tiers[r.winner] === a && r.tiers[1 - r.winner] !== a) wins++;
  return wins / recs.length;
}
