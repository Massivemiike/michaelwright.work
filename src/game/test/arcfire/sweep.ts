// src/game/test/arcfire/sweep.ts
//
// The sweep runner (Node only, test support): bundle sweep.entry.ts once with
// esbuild, then play AI-vs-AI matches on worker_threads. Results come back in
// job order, so every aggregate is identical whatever the thread count.
// ARCFIRE_SWEEP_SHARD=k/n keeps the jobs whose index is k - 1 mod n (a CI
// matrix shard); ARCFIRE_SWEEP_THREADS caps the threads (default: all cores).
// A malformed value of either throws, naming the variable. A job that throws,
// a worker that fails, or a worker that exits with its job pending rejects the
// run, and the first rejection stops every worker.
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

/** ARCFIRE_SWEEP_THREADS: undefined when unset (or empty), else an integer >= 1; anything else throws. */
export function threadsOf(spec: string | undefined): number | undefined {
  if (!spec) return undefined;
  if (!/^\d+$/.test(spec) || Number(spec) < 1) throw new Error(`ARCFIRE_SWEEP_THREADS must be an integer >= 1, got "${spec}"`);
  return Number(spec);
}

/** The jobs of shard `spec` (ARCFIRE_SWEEP_SHARD, "k/n" with 1 <= k <= n), or all of them when unset (or empty); anything else throws. */
export function shardOf<T>(jobs: T[], spec: string | undefined): T[] {
  if (!spec) return jobs;
  const hit = /^(\d+)\/(\d+)$/.exec(spec);
  const k = hit === null ? 0 : Number(hit[1]);
  const n = hit === null ? 0 : Number(hit[2]);
  if (k < 1 || k > n) throw new Error(`ARCFIRE_SWEEP_SHARD must be k/n with 1 <= k <= n, got "${spec}"`);
  return jobs.filter((_, i) => i % n === k - 1);
}

export async function runMatches(code: string, jobs: MatchJob[], threads = availableParallelism()): Promise<MatchRecord[]> {
  if (!Number.isInteger(threads) || threads < 1) throw new RangeError(`runMatches: threads must be an integer >= 1, got ${threads}`);
  const out: MatchRecord[] = new Array(jobs.length);
  let next = 0;
  let done = 0;
  const n = Math.min(threads, jobs.length);
  await new Promise<void>((res, rej) => {
    if (jobs.length === 0) return res();
    const workers: Worker[] = [];
    let failed = false;
    const fail = (e: Error): void => { // the first failure rejects the run and stops every worker
      if (failed) return;
      failed = true;
      for (const w of workers) void w.terminate();
      rej(e);
    };
    for (let k = 0; k < n; k++) {
      const w = new Worker(WORKER, { eval: true, workerData: { code } });
      workers.push(w);
      let held = -1; // the job this worker is playing (-1: none)
      const feed = (): void => {
        held = -1;
        if (failed || next >= jobs.length) { void w.terminate(); return; }
        held = next++;
        w.postMessage({ i: held, job: jobs[held] });
      };
      w.on("message", (msg: { i: number; rec?: MatchRecord; error?: string }) => {
        if (msg.error !== undefined) { fail(new Error(`job ${msg.i}: ${msg.error}`)); return; }
        out[msg.i] = msg.rec!;
        if (++done === jobs.length) res();
        feed();
      });
      w.on("error", fail);
      w.on("exit", (exitCode: number) => {
        if (held !== -1) fail(new Error(`a sweep worker exited (code ${exitCode}) while playing job ${held}`));
      });
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
