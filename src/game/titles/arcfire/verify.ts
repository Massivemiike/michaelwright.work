// src/game/titles/arcfire/verify.ts
//
// The verifier-facing result of a vs-AI match (spec §7): the function Plan
// 4's Arcfire TitleDef binding wraps. Input: the seed and the HUMAN's
// commands only; the settings and the tier are trusted (the binding derives
// them from the mode: the daily challenge is STANDARD_SETTINGS vs Veteran).
// Every AI pick and shot is regenerated. Never throws on any JSON `commands`
// value (plain data properties); an illegal AI command still throws, on
// purpose (a bug: the route answers 500, never a verdict on the player).
import type { ReplayOutcome, ReplayRejection } from "@/game/sim/title";
import { STANDARD_SETTINGS, type MatchSettings } from "./state";
import { maxHumanCommands, replayVsAi } from "./vsai";
import type { ArcfireCommand } from "./replay";
import type { AiTier } from "./ai/tiers";

/** The daily challenge's opponent (spec §6.4, §7). */
export const DAILY_TIER: AiTier = "veteran";

const isInt = (v: unknown): boolean => typeof v === "number" && Number.isInteger(v);

/** A structurally valid command (spec §7's shape); legality (whose move, which weapon, the ranges) is the replay's job. */
export function isArcfireCommand(c: unknown): c is ArcfireCommand {
  if (typeof c !== "object" || c === null) return false;
  const o = c as Record<string, unknown>;
  if (o.k === "pick") return isInt(o.w);
  if (o.k === "turn") return (o.move === -1 || o.move === 0 || o.move === 1) && isInt(o.w) && isInt(o.angle) && isInt(o.power);
  return false;
}

/**
 * Score a finished vs-AI match from the human's log: score = the margin (human - AI points), stat = the
 * human's points, hash = hashMatch of the final state. Rejections, cheapest first: invalid_command_shape
 * (not an array), too_long (more than 2 x weaponsEach + 1 commands, before any AI work),
 * invalid_command_shape (an entry of the wrong shape), invalid_command (an illegal command at any index),
 * not_a_win (unfinished, lost, or drawn). Never throws on any JSON `commands` value (plain data properties);
 * an illegal AI command throws on purpose (a bug).
 */
export function scoreVsAi(
  seed: number, commands: unknown, settings: MatchSettings = STANDARD_SETTINGS, tier: AiTier = DAILY_TIER,
): ReplayOutcome | { rejected: ReplayRejection } {
  if (!Array.isArray(commands)) return { rejected: "invalid_command_shape" };
  if (commands.length > maxHumanCommands(settings)) return { rejected: "too_long" };
  for (const c of commands) if (!isArcfireCommand(c)) return { rejected: "invalid_command_shape" };
  const r = replayVsAi({ seed, settings, tier, commands });
  if (!r.ok) return { rejected: r.reason };
  if (!r.finished || !r.humanWon) return { rejected: "not_a_win" };
  return { score: r.margin, stat: r.humanPoints, hash: r.hash };
}
