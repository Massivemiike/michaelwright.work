// src/game/test/arcfire/aiCorpus.ts
//
// The AI corpus: fixed AI decisions, fingerprinted, so Node and every browser
// engine must decide identically (spec §8), and a change to the AI names the
// decision it moved. Two sections with their own digests:
//   turn|<tier>|<state>  a turn decision on a fixed state. States are
//     fixtures.ts's corpusState (the lowest-free-slot draft, never `power`,
//     then fixed shots: no AI); the specials
//     edit a hand, the wind or the phase so that every heuristic is
//     exercised (a coverage gate in ai.corpus.test.ts checks it). The
//     fingerprint is the command after noise, the sim and probe counts, the
//     chosen ev and the RNG state after the 7 draws. Power-independent;
//   draft|<tier>|s<seed> the tier's first six picks on the seed's pool, and
//     the RNG state after them. These read `power`, so a balance write-back
//     moves this section (and the vs-AI golden) only.
// Pure: the corpus test (bundled, Node) and the cross-engine harness run it.
import { FNV_OFFSET, fnvFold, fnvHex } from "@/game/sim/hash";
import { applyPick, createMatch } from "@/game/titles/arcfire/match";
import { STANDARD_SETTINGS, cloneMatch, type MatchState } from "@/game/titles/arcfire/state";
import { ROSTER_INDEX } from "@/game/titles/arcfire/weapons/roster";
import { aiPick, aiTurn } from "@/game/titles/arcfire/ai/policy";
import type { Plan } from "@/game/titles/arcfire/ai/plan";
import type { TurnCommand } from "@/game/titles/arcfire/match";
import type { AiTier } from "@/game/titles/arcfire/ai/tiers";
import { corpusState } from "./fixtures";

export const AI_TIERS: AiTier[] = ["rookie", "veteran", "ace"];
export const AI_CORPUS_SEEDS = [11, 23, 37, 41];

const hand = (ids: string[]): number[] => ids.map((id) => ROSTER_INDEX[id]).sort((a, b) => a - b);

/** Every turn state by name: 8 plain states, then the specials that exercise wind, sudden death, a beam, tier-3 saving, DIRT and moves. */
export function turnStates(): [string, MatchState][] {
  const out: [string, MatchState][] = [];
  for (const seed of AI_CORPUS_SEEDS) for (const shots of [0, 9]) out.push([`s${seed}t${shots}`, corpusState(seed, shots)]);
  const wind = corpusState(11, 0);
  wind.wind = 40;
  out.push(["wind", wind]);
  const sudden = corpusState(23, 0);
  sudden.phase = "suddenDeath";
  out.push(["sudden", sudden]);
  const beam = corpusState(37, 0);
  beam.hands[beam.shooter] = hand(["pulse", "lancer"]);
  out.push(["beam", beam]);
  const save = corpusState(11, 0);
  save.hands[save.shooter] = hand(["fan", "cascade"]);
  out.push(["saveT3", save]);
  const dirt = corpusState(67, 0);
  dirt.hands[dirt.shooter] = hand(["pulse", "rampart"]);
  dirt.hands[1 - dirt.shooter] = hand(["nova", "twinnova", "juggernaut"]);
  out.push(["dirt", dirt]);
  const move = corpusState(30, 15);
  move.hands[move.shooter] = hand(["pulse"]);
  out.push(["move", move]);
  out.push(["move2", corpusState(6, 0)]);
  return out;
}

export type AiFingerprint = number[];
export interface AiCorpus { turn: Record<string, AiFingerprint>; draft: Record<string, AiFingerprint> }

/** Every case's fingerprint. `onTurn` sees each turn case's state, command and plan (Node-only coverage checks). */
export function runAiCorpus(onTurn?: (id: string, m: MatchState, cmd: TurnCommand, plan: Plan) => void): AiCorpus {
  const turn: Record<string, AiFingerprint> = {};
  const draft: Record<string, AiFingerprint> = {};
  for (const [name, s] of turnStates()) {
    for (const tier of AI_TIERS) {
      const m = cloneMatch(s);
      const { cmd, plan } = aiTurn(m, tier);
      const id = `turn|${tier}|${name}`;
      turn[id] = [cmd.w, cmd.move, cmd.angle, cmd.power, plan.stats.sims, plan.stats.probes, plan.choices[0].ev, m.rng.state];
      if (onTurn) onTurn(id, s, cmd, plan);
    }
  }
  for (const seed of AI_CORPUS_SEEDS) {
    for (const tier of AI_TIERS) {
      const m = createMatch(seed, STANDARD_SETTINGS);
      const picks: number[] = [];
      for (let i = 0; i < 6; i++) {
        const w = aiPick(m, tier);
        picks.push(m.pool[w]);
        applyPick(m, w);
      }
      draft[`draft|${tier}|s${seed}`] = [...picks, m.rng.state];
    }
  }
  return { turn, draft };
}

/** One digest over a section's cases, in id order. */
export function aiDigest(cases: Record<string, AiFingerprint>): string {
  let h = FNV_OFFSET;
  for (const id of Object.keys(cases).sort()) {
    for (let i = 0; i < id.length; i++) h = fnvFold(h, id.charCodeAt(i));
    for (const v of cases[id]) h = fnvFold(h, v);
  }
  return fnvHex(h);
}
