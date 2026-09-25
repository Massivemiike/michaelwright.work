// src/game/test/cross-engine/harness.entry.ts
//
// esbuild bundles this into an IIFE injected into each Playwright browser.
// It exposes the SAME pure replay paths the Node verifier uses, so the
// cross-engine spec can assert every engine reproduces the Node golden
// hashes, the Arcfire corpus digest, the Arcfire AI corpus digests and the
// vs-AI goldens. Lives under src/game/test/**
// (outside the purity roots), so the `window` reference here is allowed.
import { runReplay, type Replay } from "@/game/titles/circle-td/replay";
import { circleTdTitle } from "@/game/titles/circle-td/title";
import { replayMatch, type ArcfireReplay } from "@/game/titles/arcfire/replay";
import { runCorpus, corpusDigest, type Fingerprint } from "@/game/test/arcfire/corpus";
import { runAiCorpus, aiDigest, type AiFingerprint } from "@/game/test/arcfire/aiCorpus";
import { replayVsAi } from "@/game/titles/arcfire/vsai";
import { STANDARD_SETTINGS } from "@/game/titles/arcfire/state";
import type { ArcfireCommand } from "@/game/titles/arcfire/replay";

declare global {
  interface Window {
    runGolden: (replay: Replay) => string;
    runArcfireGolden: (replay: ArcfireReplay) => string;
    runArcfireCorpus: () => string;
    runArcfireCorpusCases: () => Record<string, Fingerprint>;
    runArcfireAiCorpus: () => { turn: string; draft: string };
    runArcfireAiCorpusCases: () => Record<string, AiFingerprint>;
    runArcfireVsAi: (seed: number, commands: ArcfireCommand[]) => string;
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

// Plan 2B: the AI corpus (its two digests, and every case for the failure
// message) and the vs-AI goldens, replayed from the human's commands alone.
window.runArcfireAiCorpus = () => {
  const c = runAiCorpus();
  return { turn: aiDigest(c.turn), draft: aiDigest(c.draft) };
};
window.runArcfireAiCorpusCases = () => {
  const c = runAiCorpus();
  return { ...c.turn, ...c.draft };
};
window.runArcfireVsAi = (seed, commands) => {
  const r = replayVsAi({ seed, settings: STANDARD_SETTINGS, tier: "veteran", commands });
  return r.ok ? r.hash : `${r.reason}@${r.atIndex}`;
};
