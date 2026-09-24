// src/game/test/arcfire/perf.entry.ts
//
// Bundled by perf.test.ts with esbuild and run as ONE module, the way the
// worker and the server verifier run the sim. (Run through vitest's module
// runner, the same code measured 4-5x slower than bundled — most likely its
// per-call live-binding lookups across modules — which would make a timing budget
// meaningless.) Returns, per roster weapon, the mean ms of one resolveTurn: the
// best of three timed passes after a warm-up pass. A busy CI neighbour can only
// slow a pass down, so the minimum is the least noisy estimate.
import { createMatch } from "@/game/titles/arcfire/match";
import { cloneMatch, type MatchState } from "@/game/titles/arcfire/state";
import { resolveTurn } from "@/game/titles/arcfire/resolve";
import { ROSTER } from "@/game/titles/arcfire/weapons/roster";
import { CORPUS_SEED, CORPUS_SETTINGS } from "./corpus";

export function measure(now: () => number): number[] {
  const base = createMatch(CORPUS_SEED, CORPUS_SETTINGS);
  base.phase = "battle";
  base.shooter = 0;
  const aims: [number, number][] = [];
  for (let a = 20; a <= 160; a += 10) for (let p = 40; p <= 100; p += 15) aims.push([a, p]);
  const out: number[] = ROSTER.map(() => Infinity);
  for (let pass = 0; pass < 4; pass++) { // pass 0 warms the JIT; passes 1-3 keep each weapon's best mean
    for (let w = 0; w < ROSTER.length; w++) {
      const clones: MatchState[] = aims.map(() => cloneMatch(base));
      const t0 = now();
      for (let i = 0; i < aims.length; i++) resolveTurn(clones[i], { move: 0, weapon: w, angle: aims[i][0], power: aims[i][1] });
      const ms = (now() - t0) / aims.length;
      if (pass > 0 && ms < out[w]) out[w] = ms;
    }
  }
  return out;
}
