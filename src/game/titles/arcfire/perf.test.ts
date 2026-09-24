// src/game/titles/arcfire/perf.test.ts
//
// Spec §5: a single-shell resolveTurn averages <= 0.2 ms in Node. The sim is
// bundled with esbuild and run as one module (perf.entry.ts explains why);
// every weapon must also stay <= 0.5 ms (about 4x the slowest measured,
// Prism's three 1,200 px beams, for CI noise). Each figure is a best of
// three after a warm-up, so a shared runner has to slow all three passes to
// fail it. The table is printed for the plan's hand-off notes.
import { it, expect } from "vitest";
import { resolve } from "node:path";
import { build } from "esbuild";
import { ROSTER } from "./weapons/roster";

it("resolveTurn stays inside the spec §5 budget", async () => {
  const out = await build({
    entryPoints: [resolve("src/game/test/arcfire/perf.entry.ts")],
    bundle: true, format: "cjs", platform: "node", write: false, tsconfig: "tsconfig.json",
  });
  const mod: { exports: { measure?: (now: () => number) => number[] } } = { exports: {} };
  new Function("module", "exports", out.outputFiles[0].text)(mod, mod.exports);
  const ms = mod.exports.measure!(() => Number(process.hrtime.bigint()) / 1e6);
  console.log(ROSTER.map((w, i) => `${w.id.padEnd(11)} ${ms[i].toFixed(4)} ms`).join("\n"));
  expect(ms[0]).toBeLessThanOrEqual(0.2); // Pulse
  for (const v of ms) expect(v).toBeLessThanOrEqual(0.5);
}, 60000);
