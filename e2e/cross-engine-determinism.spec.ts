// e2e/cross-engine-determinism.spec.ts
//
// §10.1 cross-engine determinism gate. Bundles the pure sim once with
// esbuild, then runs the committed golden replay in Chromium, Firefox and
// WebKit and asserts each reproduces the Node golden hash. Catches the
// single largest board-correctness risk: an honest Safari/Firefox run
// rejected by the V8 verifier over a ULP divergence.
//
// Run via the dedicated playwright.cross-engine.config.ts (no webServer —
// this spec never touches the Next.js app, it launches each browser engine
// directly and injects the bundled sim into a blank page). See that config
// file's header comment for why it's separate from playwright.config.ts.
import { test, expect, chromium, firefox, webkit, type BrowserType } from "@playwright/test";
import { build } from "esbuild";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const golden = JSON.parse(readFileSync("src/game/test/determinism.golden.json", "utf8")) as {
  replay: unknown; hash: string;
};

async function bundle(): Promise<string> {
  const out = await build({
    entryPoints: [resolve("src/game/test/cross-engine/harness.entry.ts")],
    bundle: true, format: "iife", write: false, platform: "browser",
    tsconfig: "tsconfig.json", // picks up the @/* path mapping
  });
  return out.outputFiles[0].text;
}

const engines: Array<[string, BrowserType]> = [["chromium", chromium], ["firefox", firefox], ["webkit", webkit]];

for (const [name, engine] of engines) {
  test(`${name} reproduces the Node golden hash ${golden.hash}`, async () => {
    const js = await bundle();
    const browser = await engine.launch();
    try {
      const page = await browser.newPage();
      await page.addScriptTag({ content: js });
      const hash = await page.evaluate((replay) => window.runGolden(replay as never), golden.replay);
      expect(hash, `${name} must reproduce the Node golden hash`).toBe(golden.hash);
    } finally {
      await browser.close();
    }
  });
}
