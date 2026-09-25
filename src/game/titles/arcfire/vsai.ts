// src/game/titles/arcfire/vsai.ts
//
// vs-AI matches (spec §1.3, §7). The human is player 0 (left, red), the AI
// player 1 (right, blue); the seeded coin flip still decides who picks first.
// A vs-AI match is seed + settings + tier + the HUMAN's commands only: the
// AI's picks and shots are regenerated. The interleaving rule: the AI acts
// whenever it is its move, right after createMatch and after every human
// command, until the human is to act or the match is over (between two human
// commands it makes 0, 1 or 2 actions: its last pick, then the opening shot).
// The AI's commands are legal by construction; an illegal one is a bug and
// throws (the verifier's route answers 500, never a verdict on the player).
import { nextU32 } from "@/game/sim/math/rng";
import { applyPick, applyTurn, createMatch, toAct, type TurnCommand } from "./match";
import { applyCommand, type ArcfireCommand } from "./replay";
import { hashMatch } from "./hash";
import type { MatchSettings, MatchState } from "./state";
import type { Timeline } from "./timeline";
import { AI_PICK_DRAWS, AI_TURN_DRAWS, aiPick, aiTurn } from "./ai/policy";
import type { Plan } from "./ai/plan";
import type { AiTier } from "./ai/tiers";

export const HUMAN = 0;
export const AI = 1;

export type AiAction =
  | { k: "pick"; w: number }
  | { k: "turn"; cmd: TurnCommand; timeline: Timeline; plan: Plan };

export const aiToAct = (m: MatchState): boolean => toAct(m) === AI;

/** The most commands a human can send in a vs-AI match: every pick and shot, plus one sudden-death shot (21 for the daily). */
export const maxHumanCommands = (s: MatchSettings): number => 2 * s.weaponsEach + 1;

/** One AI action if it is the AI's move, else null. */
export function stepAi(m: MatchState, tier: AiTier): AiAction | null {
  if (!aiToAct(m)) return null;
  if (m.phase === "draft") {
    const w = aiPick(m, tier);
    if (!applyPick(m, w).ok) throw new Error("arcfire AI made an illegal pick");
    return { k: "pick", w };
  }
  const { cmd, plan } = aiTurn(m, tier);
  const r = applyTurn(m, cmd);
  if (!r.ok) throw new Error("arcfire AI made an illegal turn");
  return { k: "turn", cmd, timeline: r.timeline, plan };
}

/** Let the AI act until it is the human's move or the match is over. */
export function advanceAi(m: MatchState, tier: AiTier): AiAction[] {
  const out: AiAction[] = [];
  for (let a = stepAi(m, tier); a !== null; a = stepAi(m, tier)) out.push(a);
  return out;
}

export interface VsAiReplay {
  seed: number;
  settings: MatchSettings; // trusted (the verifier derives them from the mode)
  tier: AiTier; // trusted, likewise
  commands: unknown; // the human's commands only
}

export type VsAiResult =
  | { ok: true; state: MatchState; hash: string; finished: boolean; humanPoints: number; aiPoints: number; margin: number; humanWon: boolean }
  | { ok: false; reason: "invalid_command" | "too_long"; atIndex: number };

/**
 * Replay a vs-AI match from the human's commands alone, regenerating every AI pick and shot (the
 * leaderboard's core guarantee). Never throws on the commands: a non-array or an illegal or malformed
 * entry is invalid_command at its index, and more than maxHumanCommands is too_long before any AI
 * work. Like replayMatch it accepts an unfinished log, so a verifier also requires `finished`.
 */
export function replayVsAi(r: VsAiReplay): VsAiResult {
  if (!Array.isArray(r.commands)) return { ok: false, reason: "invalid_command", atIndex: 0 };
  const max = maxHumanCommands(r.settings);
  if (r.commands.length > max) return { ok: false, reason: "too_long", atIndex: max };
  const m = createMatch(r.seed, r.settings);
  advanceAi(m, r.tier);
  for (let i = 0; i < r.commands.length; i++) {
    if (toAct(m) !== HUMAN || !applyCommand(m, r.commands[i]).ok) return { ok: false, reason: "invalid_command", atIndex: i };
    advanceAi(m, r.tier);
  }
  const hp = m.scores[HUMAN];
  const ap = m.scores[AI];
  return {
    ok: true, state: m, hash: hashMatch(m), finished: m.phase === "over",
    humanPoints: hp, aiPoints: ap, margin: hp - ap, humanWon: m.phase === "over" && m.winner === HUMAN,
  };
}

export type VsAiResume =
  | { ok: true; state: MatchState; log: ArcfireCommand[]; humanLog: ArcfireCommand[]; droppedFrom: number }
  | { ok: false };

/**
 * Resume a vs-AI match from its local blob's FULL log (both seats, in order) without a single
 * search: an AI entry is applied as recorded after advancing the RNG by the draws its decision
 * consumed (AI_PICK_DRAWS / AI_TURN_DRAWS). The state equals replayVsAi of the human sub-log whenever
 * the AI entries came from this code at this simVersion (the blob key carries it). Never throws: the
 * first entry that is malformed or illegal, and everything after it, is dropped (droppedFrom; -1 when
 * none was), and a non-array log is { ok: false }. It does not run the AI: if the log ends on the AI's
 * move, the caller's advanceAi continues. Local resume only: a submission is the human sub-log, and
 * the server regenerates every AI decision from it.
 */
export function resumeVsAi(r: { seed: number; settings: MatchSettings; log: unknown }): VsAiResume {
  if (!Array.isArray(r.log)) return { ok: false };
  const m = createMatch(r.seed, r.settings);
  const log: ArcfireCommand[] = [];
  const humanLog: ArcfireCommand[] = [];
  for (let i = 0; i < r.log.length; i++) {
    const entry: unknown = r.log[i];
    const ai = aiToAct(m);
    const before = m.rng.state;
    if (ai) for (let d = 0; d < (m.phase === "draft" ? AI_PICK_DRAWS : AI_TURN_DRAWS); d++) nextU32(m.rng);
    if (!applyCommand(m, entry).ok) {
      m.rng.state = before; // an illegal entry changed nothing else
      return { ok: true, state: m, log, humanLog, droppedFrom: i };
    }
    log.push(entry as ArcfireCommand);
    if (!ai) humanLog.push(entry as ArcfireCommand);
  }
  return { ok: true, state: m, log, humanLog, droppedFrom: -1 };
}
