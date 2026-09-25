// src/game/titles/arcfire/ai.perf.test.ts
//
// Spec §5/§8: verifying a full daily-challenge match (10 Veteran turns, 10 AI
// picks, 20 human commands) takes < 5 s on CI hardware. Timed on the bundled
// sim (ai.entry.ts), like perf.test.ts: the FIRST replay after the bundle is
// evaluated is the verifier's real, cold case, and it is the one asserted.
// Informational: the best of three warm replays and each tier's decision
// times on the AI corpus's 8 plain states (4 openings with full hands, also
// printed apart, and 4 states after 9 shots), with a loose Ace tripwire (the
// mean over the 8 <= 1,500 ms) that only catches pathological regressions.
// If CI ever flakes, raise ARCFIRE_PERF_MARGIN (a multiplier), never the literals.
import { it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { build } from "esbuild";
import type { MatchSettings } from "./state";
import type { VsAiResult } from "./vsai";

interface PerfEntry {
  replayVsAi(r: { seed: number; settings: MatchSettings; tier: "veteran"; commands: unknown }): VsAiResult;
  turnTimes(tier: "rookie" | "veteran" | "ace", now: () => number): [string, number][];
  STANDARD_SETTINGS: MatchSettings;
}

it("verifies a daily-challenge match in < 5 s, cold", async () => {
  const out = await build({
    entryPoints: [resolve("src/game/test/arcfire/ai.entry.ts")],
    bundle: true, format: "cjs", platform: "node", write: false, tsconfig: "tsconfig.json",
  });
  const mod: { exports: Partial<PerfEntry> } = { exports: {} };
  new Function("module", "exports", out.outputFiles[0].text)(mod, mod.exports);
  const ai = mod.exports as PerfEntry;
  const now = (): number => Number(process.hrtime.bigint()) / 1e6;
  const margin = Number(process.env.ARCFIRE_PERF_MARGIN ?? "1");
  const g = JSON.parse(readFileSync("src/game/titles/arcfire/determinism.vsai.golden.json", "utf8")).win;
  const verify = (): { ms: number; r: VsAiResult } => {
    const t0 = now();
    const r = ai.replayVsAi({ seed: g.seed, settings: ai.STANDARD_SETTINGS, tier: "veteran", commands: g.commands });
    return { ms: now() - t0, r };
  };
  const cold = verify();
  expect(cold.r.ok && cold.r.hash).toBe(g.hash);
  let warm = Infinity;
  for (let i = 0; i < 3; i++) warm = Math.min(warm, verify().ms);
  const lines = [`daily verification: cold ${cold.ms.toFixed(0)} ms, warm best of 3 ${warm.toFixed(0)} ms`];
  let aceMean = 0;
  const meanOf = (v: number[]): number => v.reduce((a, b) => a + b, 0) / v.length;
  for (const tier of ["rookie", "veteran", "ace"] as const) {
    ai.turnTimes(tier, now); // warm-up pass
    const t = ai.turnTimes(tier, now);
    const all = t.map(([, ms]) => ms);
    const openings = t.filter(([name]) => name.endsWith("t0")).map(([, ms]) => ms); // full hands: the heaviest decisions
    if (tier === "ace") aceMean = meanOf(all);
    lines.push(`${tier.padEnd(7)} decision: mean ${meanOf(all).toFixed(1)} ms, max ${Math.max(...all).toFixed(1)} ms (${all.length} plain states); ` +
      `openings: mean ${meanOf(openings).toFixed(1)} ms, max ${Math.max(...openings).toFixed(1)} ms (${openings.length}, full hands)`);
  }
  console.log(lines.join("\n"));
  expect(cold.ms).toBeLessThan(5000 * margin);
  expect(aceMean).toBeLessThanOrEqual(1500 * margin);
}, 120000);
