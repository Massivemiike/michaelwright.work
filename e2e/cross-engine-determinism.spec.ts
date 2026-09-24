// e2e/cross-engine-determinism.spec.ts
//
// §10.1 cross-engine determinism gate. Bundles the pure sim once with
// esbuild, then in Chromium, Firefox and WebKit recomputes every committed
// determinism pin and asserts each engine reproduces the Node value: Circle
// TD's golden, Arcfire's golden and the Arcfire corpus digest. Catches the
// single largest board-correctness risk: an honest Safari/Firefox run
// rejected by the V8 verifier over a ULP divergence.
//
// One table (PINS) drives every engine, so adding a pin is one row.
//
// Run via the dedicated playwright.cross-engine.config.ts (no webServer —
// this spec never touches the Next.js app, it launches each browser engine
// directly and injects the bundled sim into a blank page). See that config
// file's header comment for why it's separate from playwright.config.ts.
import { test, expect, chromium, firefox, webkit, type BrowserType, type Page } from "@playwright/test";
import { build } from "esbuild";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, "utf8")) as T;
const circleGolden = readJson<{ replay: unknown; hash: string }>("src/game/test/determinism.golden.json");
const arcfireGolden = readJson<{ replay: unknown; hash: string }>("src/game/titles/arcfire/determinism.golden.json");
const arcfireCorpus = readJson<{ digest: string }>("src/game/titles/arcfire/corpus.golden.json");

/** Every pin an engine must reproduce: its name, the committed Node value, and how the page computes it. */
const PINS: Array<{ label: string; expected: string; run: (page: Page) => Promise<string> }> = [
  {
    label: "Circle TD golden",
    expected: circleGolden.hash,
    run: (page) => page.evaluate((replay) => window.runGolden(replay as never), circleGolden.replay),
  },
  {
    label: "Arcfire golden",
    expected: arcfireGolden.hash,
    run: (page) => page.evaluate((replay) => window.runArcfireGolden(replay as never), arcfireGolden.replay),
  },
  {
    label: "Arcfire corpus digest",
    expected: arcfireCorpus.digest,
    run: (page) => page.evaluate(() => window.runArcfireCorpus()),
  },
];

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
  test(`${name} reproduces every Node determinism pin`, async () => {
    const js = await bundle();
    const browser = await engine.launch();
    try {
      const page = await browser.newPage();
      await page.addScriptTag({ content: js });
      for (const pin of PINS) expect.soft(await pin.run(page), `${name} must reproduce the ${pin.label}`).toBe(pin.expected);
    } finally {
      await browser.close();
    }
  });
}
