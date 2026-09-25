// src/game/test/arcfire/ai.entry.ts
//
// Bundled by ai.corpus.test.ts and ai.perf.test.ts with esbuild and run as
// ONE module (vitest's module runner slows the sim 4-5x, 2A K3): the AI
// corpus, the vs-AI goldens, verification and the per-turn timings.
export { runAiCorpus, aiDigest, turnStates } from "./aiCorpus";
export { goldenHuman, playVsAi } from "./vsaiGolden";
export { advanceAi, replayVsAi, resumeVsAi } from "@/game/titles/arcfire/vsai";
export { hashMatch } from "@/game/titles/arcfire/hash";
export { scoreVsAi } from "@/game/titles/arcfire/verify";
export { STANDARD_SETTINGS } from "@/game/titles/arcfire/state";
import { cloneMatch } from "@/game/titles/arcfire/state";
import { aiTurn } from "@/game/titles/arcfire/ai/policy";
import { turnStates } from "./aiCorpus";
import type { AiTier } from "@/game/titles/arcfire/ai/tiers";

/** Per-tier decision times (ms) on the corpus's 8 plain states, by name (s<seed>t0: an opening, full hands; s<seed>t9: after 9 shots): informational, printed for the hand-off. */
export function turnTimes(tier: AiTier, now: () => number): [string, number][] {
  const out: [string, number][] = [];
  for (const [name, s] of turnStates()) {
    if (!/^s\d+t\d+$/.test(name)) continue; // the 8 plain states
    const m = cloneMatch(s);
    const t0 = now();
    aiTurn(m, tier);
    out.push([name, now() - t0]);
  }
  return out;
}
