// src/game/runtime/arcfire/worker.bundle.test.ts — the worker bundles alone: sim + AI + host, nothing else
import { it, expect } from "vitest";
import { resolve } from "node:path";
import { build } from "esbuild";

it("bundles the worker for the browser: no Node, no React or Next, under 64 KiB", async () => {
  const out = await build({
    entryPoints: [resolve("src/game/runtime/arcfire/worker.ts")],
    bundle: true, format: "esm", platform: "browser", minify: true, write: false, metafile: true, tsconfig: "tsconfig.json",
  });
  const js = out.outputFiles[0].text;
  const inputs = Object.keys(out.metafile.inputs);
  expect(inputs.filter((p) => /src[\\/](app|components)[\\/]|node_modules/.test(p))).toEqual([]);
  expect(js).not.toMatch(/\brequire\(|node:/);
  console.log(`worker bundle: ${(js.length / 1024).toFixed(1)} KiB minified, ${inputs.length} inputs`);
  expect(js.length).toBeLessThan(64 * 1024);
}, 60_000); // esbuild's first service spawn on a loaded CI runner, like the other bundling tests
