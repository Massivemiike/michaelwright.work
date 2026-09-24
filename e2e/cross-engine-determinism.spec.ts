// e2e/cross-engine-determinism.spec.ts
//
// §10.1 cross-engine determinism gate. Bundles the pure sim once with
// esbuild, then in Chromium, Firefox and WebKit recomputes every committed
// determinism pin and asserts each engine reproduces the Node value: Circle
// TD's golden, Arcfire's two goldens and the Arcfire corpus digest. Catches the
// single largest board-correctness risk: an honest Safari/Firefox run
// rejected by the V8 verifier over a ULP divergence.
//
// One table (PINS) drives every engine, so adding a pin is one row. When an
// engine's corpus digest differs, the failure names the case ids whose
// fingerprints differ from corpus.golden.json, like the Node corpus test.
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
const arcfireFullGolden = readJson<{ replay: unknown; hash: string }>("src/game/titles/arcfire/determinism.full.golden.json");
type Fingerprint = { board: string; points: number[] };
const arcfireCorpus = readJson<{ digest: string; cases: Record<string, Fingerprint> }>("src/game/titles/arcfire/corpus.golden.json");

/** The corpus case ids whose browser fingerprint differs from corpus.golden.json's `cases` (missing on either side counts). */
async function movedCorpusCases(page: Page): Promise<string> {
  const got = await page.evaluate(() => window.runArcfireCorpusCases());
  const pinned = arcfireCorpus.cases;
  const ids = [...new Set([...Object.keys(pinned), ...Object.keys(got)])].sort()
    .filter((id) => JSON.stringify(got[id] ?? null) !== JSON.stringify(pinned[id] ?? null));
  return `cases that differ from corpus.golden.json: ${ids.length > 0 ? ids.join(", ") : "none (only the digest differs)"}`;
}

/**
 * Every pin an engine must reproduce: its name, the committed Node value, how
 * the page computes it, and (optionally) what to add to the failure message
 * when an engine's value differs.
 */
const PINS: Array<{ label: string; expected: string; run: (page: Page) => Promise<string>; explain?: (page: Page) => Promise<string> }> = [
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
    label: "Arcfire full-roster golden",
    expected: arcfireFullGolden.hash,
    run: (page) => page.evaluate((replay) => window.runArcfireGolden(replay as never), arcfireFullGolden.replay),
  },
  {
    label: "Arcfire corpus digest",
    expected: arcfireCorpus.digest,
    run: (page) => page.evaluate(() => window.runArcfireCorpus()),
    explain: movedCorpusCases,
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
      for (const pin of PINS) {
        const got = await pin.run(page);
        const detail = got !== pin.expected && pin.explain ? ` (${await pin.explain(page)})` : "";
        expect.soft(got, `${name} must reproduce the ${pin.label}${detail}`).toBe(pin.expected);
      }
    } finally {
      await browser.close();
    }
  });
}
