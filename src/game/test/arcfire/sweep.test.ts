// src/game/test/arcfire/sweep.test.ts — the sweep runner's knobs and failure paths (always on; no AI match is played)
import { describe, it, expect, vi, afterEach } from "vitest";
import { Worker } from "node:worker_threads";
import { runMatches, shardOf, threadsOf, type MatchJob } from "./sweep";

const jobs = (n: number): MatchJob[] => Array.from({ length: n }, (_, i) => ({ seed: i + 1, tiers: ["rookie", "rookie"], draft: "power" }));

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the sweep's knobs", () => {
  it("ARCFIRE_SWEEP_THREADS: unset, or an integer >= 1; anything else throws, naming the variable", () => {
    expect([undefined, "", "1", "64"].map(threadsOf)).toEqual([undefined, undefined, 1, 64]);
    for (const bad of ["0", "-1", "1.5", "abc", "NaN", "4x", " 4", "1e2"]) {
      expect(() => threadsOf(bad), bad).toThrow(`ARCFIRE_SWEEP_THREADS must be an integer >= 1, got "${bad}"`);
    }
  });

  it("ARCFIRE_SWEEP_SHARD: unset, or k/n with 1 <= k <= n; anything else throws instead of playing no job", () => {
    const all = jobs(10);
    expect(shardOf(all, undefined)).toBe(all);
    expect(shardOf(all, "")).toBe(all);
    expect(shardOf(all, "1/1")).toEqual(all);
    expect(shardOf(all, "2/4").map((j) => j.seed)).toEqual([2, 6, 10]);
    expect(shardOf(all, "4/4").map((j) => j.seed)).toEqual([4, 8]);
    for (const bad of ["1", "0/4", "5/4", "a/b", "1/0", "1/4x", "2/4/", " 1/4", "-1/4"]) {
      expect(() => shardOf(all, bad), bad).toThrow(`ARCFIRE_SWEEP_SHARD must be k/n with 1 <= k <= n, got "${bad}"`);
    }
  });
});

describe("runMatches", () => {
  it("refuses a thread count that is not an integer >= 1 instead of starting no worker", async () => {
    await expect(runMatches("", jobs(2), Number.NaN)).rejects.toThrow("runMatches: threads must be an integer >= 1, got NaN");
    await expect(runMatches("", jobs(2), 0)).rejects.toThrow("runMatches: threads must be an integer >= 1, got 0");
  });

  it("rejects when a worker exits with its job pending", async () => {
    const code = "module.exports.playAiMatch = () => process.exit(3);";
    await expect(runMatches(code, jobs(2), 1)).rejects.toThrow("a sweep worker exited (code 3) while playing job 0");
  }, 30_000);

  it("rejects on the first failed job and stops every worker", async () => {
    const terminate = vi.spyOn(Worker.prototype, "terminate");
    // job 0 fails at once; job 1 would keep its worker busy for 20 s
    const code = "module.exports.playAiMatch = (seed) => { if (seed === 1) throw new Error('boom'); const t = Date.now(); while (Date.now() - t < 20000) {} return {}; };";
    const t0 = Date.now();
    await expect(runMatches(code, jobs(2), 2)).rejects.toThrow(/^job 0: Error: boom/);
    expect(new Set(terminate.mock.contexts).size, "both workers terminated").toBe(2);
    expect(Date.now() - t0).toBeLessThan(15_000);
  }, 30_000);
});
