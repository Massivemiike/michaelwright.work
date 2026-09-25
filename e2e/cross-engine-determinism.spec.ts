// e2e/cross-engine-determinism.spec.ts
//
// §10.1 cross-engine determinism gate. Bundles the pure sim once with
// esbuild, then in Chromium, Firefox and WebKit recomputes every committed
// determinism pin and asserts each engine reproduces the Node value: Circle
// TD's golden, Arcfire's two goldens, the Arcfire corpus digest, the Arcfire
// AI corpus digests and the vs-AI goldens. Catches the single largest
// board-correctness risk: an honest Safari/Firefox run rejected by the V8
// verifier over a ULP divergence. Each engine also plays the vs-AI win golden
// through the worker's host in a real Web Worker, and resumes it in a fresh one.
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

const aiCorpus = readJson<{ turnDigest: string; draftDigest: string; turn: Record<string, number[]>; draft: Record<string, number[]> }>(
  "src/game/titles/arcfire/ai.corpus.golden.json");
type VsAiCase = { seed: number; commands: unknown[]; hash: string };
const vsai = readJson<{ win: VsAiCase; loss: VsAiCase }>("src/game/titles/arcfire/determinism.vsai.golden.json");

/** The AI corpus case ids whose browser fingerprint differs from ai.corpus.golden.json. */
async function movedAiCases(page: Page): Promise<string> {
  const got = await page.evaluate(() => window.runArcfireAiCorpusCases());
  const pinned: Record<string, number[]> = { ...aiCorpus.turn, ...aiCorpus.draft };
  const ids = [...new Set([...Object.keys(pinned), ...Object.keys(got)])].sort()
    .filter((id) => JSON.stringify(got[id] ?? null) !== JSON.stringify(pinned[id] ?? null));
  return `AI cases that differ from ai.corpus.golden.json: ${ids.length > 0 ? ids.join(", ") : "none (only a digest differs)"}`;
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
  {
    label: "Arcfire AI corpus digests (turn/draft)",
    expected: `${aiCorpus.turnDigest}/${aiCorpus.draftDigest}`,
    run: (page) => page.evaluate(() => { const d = window.runArcfireAiCorpus(); return `${d.turn}/${d.draft}`; }),
    explain: movedAiCases,
  },
  {
    label: "Arcfire vs-AI goldens (win/loss)",
    expected: `${vsai.win.hash}/${vsai.loss.hash}`,
    run: (page) => page.evaluate(([w, l]) =>
      `${window.runArcfireVsAi(w.seed, w.commands as never)}/${window.runArcfireVsAi(l.seed, l.commands as never)}`, [vsai.win, vsai.loss] as const),
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

// after the PINS loop: the vs-AI golden through the host in a real Worker, then resumed in a FRESH Worker
for (const [name, engine] of engines) {
  test(`${name} plays the vs-AI golden in a Worker and resumes it in a fresh one`, async () => {
    const out = await build({
      entryPoints: [resolve("src/game/runtime/arcfire/worker.ts")],
      bundle: true, format: "iife", write: false, platform: "browser", tsconfig: "tsconfig.json",
    });
    const browser = await engine.launch();
    try {
      const page = await browser.newPage();
      const hashes = await page.evaluate(async ([code, g]) => {
        const url = URL.createObjectURL(new Blob([code], { type: "text/javascript" }));
        const settings = { weaponsEach: 10, poolSize: 24, wind: false, guaranteeTags: ["BLAST", "SPLIT", "DIRT"], rosterSize: 32 };
        type Ev = { t: string; snap?: { toAct: number; phase: string; hash: string }; humanLog?: unknown[]; poolIndex?: number; cmd?: object };
        /** Start with `log`, send the golden's remaining human commands whenever the human is to act; resolve at the end, and fail at once on a rejected or error event. */
        const run = (log: unknown[]): Promise<{ hash: string; log: unknown[] }> => new Promise((done, fail) => {
          const w = new Worker(url);
          const full: unknown[] = log.slice();
          let next = -1;
          let id = 2;
          w.onmessage = (e: MessageEvent<Ev>) => {
            const ev = e.data;
            if (ev.t === "rejected" || ev.t === "error") { w.terminate(); fail(new Error(JSON.stringify(ev))); return; }
            if (ev.t === "state") next = ev.humanLog!.length;
            if (ev.t === "picked") full.push({ k: "pick", w: ev.poolIndex });
            if (ev.t === "shot") full.push({ k: "turn", ...ev.cmd });
            if (!ev.snap) return;
            if (ev.snap.phase === "over") { w.terminate(); done({ hash: ev.snap.hash, log: full }); return; }
            if (ev.snap.toAct === 0 && ev.t !== "thinking") {
              const c = g.commands[next++] as { k: string; w: number; move?: number; angle?: number; power?: number };
              w.postMessage(c.k === "pick" ? { t: "pick", id: id++, poolIndex: c.w }
                : { t: "turn", id: id++, cmd: { move: c.move, w: c.w, angle: c.angle, power: c.power } });
            }
          };
          w.postMessage({ t: "start", id: 1, seed: g.seed, settings, opponent: "veteran", log });
        });
        const live = await run([]);
        const resumed = await run(live.log.slice(0, 25));
        return [live.hash, resumed.hash];
      }, [out.outputFiles[0].text, vsai.win] as const);
      expect(hashes).toEqual([vsai.win.hash, vsai.win.hash]);
    } finally {
      await browser.close();
    }
  });
}
