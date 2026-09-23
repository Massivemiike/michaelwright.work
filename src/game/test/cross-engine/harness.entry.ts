// src/game/test/cross-engine/harness.entry.ts
//
// esbuild bundles this into an IIFE injected into each Playwright browser.
// It exposes the SAME pure replay paths the Node verifier uses, so the
// cross-engine spec can assert every engine reproduces the Node golden
// hashes. Lives under src/game/test/** (outside the purity roots), so the
// `window` reference here is allowed.
import { runReplay, type Replay } from "@/game/titles/circle-td/replay";
import { circleTdTitle } from "@/game/titles/circle-td/title";
import { replayMatch, type ArcfireReplay } from "@/game/titles/arcfire/replay";

declare global {
  interface Window {
    runGolden: (replay: Replay) => string;
    runArcfireGolden: (replay: ArcfireReplay) => string;
  }
}

window.runGolden = (replay: Replay): string => runReplay(replay, circleTdTitle).hash;

window.runArcfireGolden = (replay: ArcfireReplay): string => {
  const r = replayMatch(replay);
  return r.ok ? r.hash : `invalid@${r.atIndex}`;
};
