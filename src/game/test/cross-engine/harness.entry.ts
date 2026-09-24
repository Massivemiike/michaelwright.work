// src/game/test/cross-engine/harness.entry.ts
//
// esbuild bundles this into an IIFE injected into each Playwright browser.
// It exposes the SAME pure replay paths the Node verifier uses, so the
// cross-engine spec can assert every engine reproduces the Node golden
// hashes and the Arcfire corpus digest. Lives under src/game/test/**
// (outside the purity roots), so the `window` reference here is allowed.
import { runReplay, type Replay } from "@/game/titles/circle-td/replay";
import { circleTdTitle } from "@/game/titles/circle-td/title";
import { replayMatch, type ArcfireReplay } from "@/game/titles/arcfire/replay";
import { runCorpus, corpusDigest, type Fingerprint } from "@/game/test/arcfire/corpus";

declare global {
  interface Window {
    runGolden: (replay: Replay) => string;
    runArcfireGolden: (replay: ArcfireReplay) => string;
    runArcfireCorpus: () => string;
    runArcfireCorpusCases: () => Record<string, Fingerprint>;
  }
}

window.runGolden = (replay: Replay): string => runReplay(replay, circleTdTitle).hash;

window.runArcfireGolden = (replay: ArcfireReplay): string => {
  const r = replayMatch(replay);
  return r.ok ? r.hash : `invalid@${r.atIndex}`;
};

window.runArcfireCorpus = (): string => corpusDigest(runCorpus());

// Every corpus case's fingerprint, by id: the spec diffs it against corpus.golden.json on a digest mismatch.
window.runArcfireCorpusCases = (): Record<string, Fingerprint> => runCorpus();
