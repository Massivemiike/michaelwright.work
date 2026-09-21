// src/lib/leaderboard/queries.ts
//
// Server-only board reads for Server Components (the play-gate poster and
// the arcade index). Transitively server-only via getServiceClient's
// `import "server-only"`, so it can never be imported into a client bundle.
// Reads go through the column-limited public view. Every error is swallowed
// to [] so a DB/env hiccup (including a keyless CI build) renders an empty
// board rather than breaking the page. Imports NO @/game module — src/lib is
// a guarded lazy-boundary root — so the sim version comes from the ./config
// mirror (asserted equal to SIM_VERSION by a test).
import { getServiceClient } from "@/lib/supabase/server";
import { utcDateString } from "@/lib/dailySeed";
import { LEADERBOARD_SIM_VERSION } from "./config";
import type { LeaderboardRow } from "./types";

function toRows(data: Array<{ initials: string; score: number; wave: number; daily_date: string | null }> | null): LeaderboardRow[] {
  return (data ?? []).map((r, i) => ({ rank: i + 1, initials: r.initials, score: r.score, wave: r.wave, dailyDate: r.daily_date }));
}

export async function getDailyBoard(slug: string, limit = 25): Promise<LeaderboardRow[]> {
  try {
    const sb = getServiceClient();
    const { data } = await sb.from("game_scores_public")
      .select("initials, score, wave, daily_date")
      .eq("game_slug", slug).eq("sim_version", LEADERBOARD_SIM_VERSION).eq("mode", "daily").eq("daily_date", utcDateString())
      .order("score", { ascending: false }).order("created_at", { ascending: true })
      .limit(limit);
    return toRows(data as never);
  } catch { return []; }
}

export async function getAllTimeBoard(slug: string, limit = 25): Promise<LeaderboardRow[]> {
  try {
    const sb = getServiceClient();
    const { data } = await sb.from("game_scores_public")
      .select("initials, score, wave, daily_date")
      .eq("game_slug", slug).eq("sim_version", LEADERBOARD_SIM_VERSION).eq("mode", "daily")
      .order("score", { ascending: false }).order("created_at", { ascending: true })
      .limit(limit);
    return toRows(data as never);
  } catch { return []; }
}
