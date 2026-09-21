// src/app/api/games/scores/route.ts
//
// Replay verification + the only write path for the leaderboard. Node
// runtime (node:crypto + @supabase/supabase-js). Mirrors
// src/app/api/contact/route.ts conventions (safeParse, try/catch,
// NextResponse.json). Trust model: the client's claimed score is IGNORED —
// verifyScore re-simulates and we insert its authoritative score/wave.
// AGENTS.md: route-handler + runtime conventions confirmed against
// node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md.
import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { scoreSubmissionSchema } from "@/lib/validations/score.schema";
import { verifyScore } from "@/game/sim/verify";
import { getTitle } from "@/game/sim/registry";
import { hashCommands } from "@/game/sim/replay";
import { SIM_VERSION } from "@/game/sim/types";
import { dailySeed, acceptableDailySeeds, utcDateString } from "@/lib/dailySeed";
import { getServiceClient } from "@/lib/supabase/server";
import { isBlockedInitials } from "@/lib/leaderboard/blocklist";
import type { BoardResponse, LeaderboardRow } from "@/lib/leaderboard/types";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 1_000_000; // §8.2 payload ceiling, enforced before parse
const MAX_TICKS = 5_000_000;      // DoS bound on run length
const BOARD_LIMIT = 25;
const RATE_10M = { seconds: 600, limit: 10 };
const RATE_1D = { seconds: 86_400, limit: 30 };

function clientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || req.headers.get("x-real-ip")?.trim()
    || "0.0.0.0";
}
function bucket(ip: string, label: string): string {
  const salt = process.env.RATE_LIMIT_SALT ?? "circle-td-dev-salt";
  return "circle-td:" + createHash("sha256").update(salt + ip).digest("hex") + ":" + label;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    // 1. Payload size BEFORE parse.
    const raw = await req.text();
    if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) {
      return NextResponse.json({ error: "Payload too large" }, { status: 413 });
    }
    let parsedBody: unknown;
    try { parsedBody = JSON.parse(raw); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

    // 2. Schema (types, initials shape, commands<=20000).
    const result = scoreSubmissionSchema.safeParse(parsedBody);
    if (!result.success) {
      return NextResponse.json({ error: "Invalid submission", issues: result.error.flatten() }, { status: 400 });
    }
    const sub = result.data;

    // 3. Ranked submit is daily-only; free play is local/unranked.
    if (sub.mode !== "daily") {
      return NextResponse.json({ error: "Free play is not ranked; keep your best locally." }, { status: 400 });
    }

    // 4. Title from slug (title-agnostic verification).
    const title = getTitle(sub.gameSlug);
    if (!title) return NextResponse.json({ error: "Unknown game" }, { status: 400 });

    // 5. Initials blocklist (uppercased).
    const initials = sub.initials.toUpperCase();
    if (isBlockedInitials(initials)) {
      return NextResponse.json({ error: "Those initials aren't allowed." }, { status: 403 });
    }

    // 6. Daily-seed authority + which UTC day this run belongs to.
    const now = new Date();
    const acceptable = acceptableDailySeeds(now); // [today] (+ yesterday within grace)
    if (!acceptable.includes(sub.seed)) {
      return NextResponse.json({ error: "Stale or invalid daily seed." }, { status: 400 });
    }
    const dailyDate = sub.seed === dailySeed(now)
      ? utcDateString(now)
      : utcDateString(new Date(now.getTime() - 24 * 60 * 60 * 1000));

    // 7. Per-IP rate limit (salted hash, TTL windows, zero-PII).
    const supabase = getServiceClient();
    const ip = clientIp(req);
    for (const w of [RATE_10M, RATE_1D]) {
      const { data: allowed, error } = await supabase.rpc("hit_rate_limit", {
        p_bucket: bucket(ip, String(w.seconds)), p_limit: w.limit, p_window_seconds: w.seconds,
      });
      if (error) return NextResponse.json({ error: "Rate limiter unavailable" }, { status: 500 });
      if (allowed === false) return NextResponse.json({ error: "Too many submissions — try again later." }, { status: 429 });
    }

    // 8. Recompute (server-authoritative). Never trust a client score.
    const verified = verifyScore(
      { gameSlug: sub.gameSlug, simVersion: sub.simVersion, seed: sub.seed, mode: sub.mode, commands: sub.commands },
      { title, expectedSimVersion: SIM_VERSION, acceptableSeeds: acceptable, maxTicks: MAX_TICKS }
    );
    if (!verified.ok) {
      return NextResponse.json({ error: "Verification failed", reason: verified.reason }, { status: 400 });
    }

    // 9. Dedupe key + insert the RECOMPUTED score/wave (not the client's).
    const replayHash = hashCommands(sub.commands);
    const row = {
      game_slug: sub.gameSlug, sim_version: SIM_VERSION, mode: "daily",
      seed: String(sub.seed), daily_date: dailyDate, initials,
      score: verified.score, wave: verified.wave, hash: verified.hash, replay_hash: replayHash,
    };
    const ins = await supabase.from("game_scores").insert(row).select("id, created_at").single();

    let duplicate = false;
    if (ins.error) {
      // 23505 = unique_violation → this exact log was already submitted; still
      // a 200 with duplicate:true (the run is already on the board). The old
      // created_at re-read here fed the rank helpers' now-dropped tie term, so
      // it's gone; any other insert error is a real failure.
      if ((ins.error as { code?: string }).code === "23505") {
        duplicate = true;
      } else {
        return NextResponse.json({ error: "Could not save score" }, { status: 500 });
      }
    }

    // 10. Ranks (strictly-greater-score count + 1) and top-N boards.
    const dailyRank = await rankDaily(supabase, sub.gameSlug, dailyDate, verified.score);
    const allTimeRank = await rankAllTime(supabase, sub.gameSlug, verified.score);
    const daily = await topDaily(supabase, sub.gameSlug, dailyDate);
    const allTime = await topAllTime(supabase, sub.gameSlug);

    const resp: BoardResponse = { ok: true, duplicate, dailyRank, allTimeRank, daily, allTime };
    return NextResponse.json(resp);
  } catch (err) {
    console.error("scores route error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// --- helpers (service-role reads; boards read the column-limited view) ---

// Plan-authorized strictly-greater-score fallback (Task 6 Step 7 note):
// competition ranking where same-score submitters share a rank — standard, and
// the board index already orders ties by created_at asc, so display order is
// unaffected. This drops the old fragile `created_at.lt.<ISO>` tie term whose
// embedded-ISO PostgREST `.or()` filter, if rejected, returned count=undefined
// → (undefined ?? 0)+1 → EVERY submitter told rank #1. A query error now yields
// a null rank ("unranked/unknown") instead of that false #1.
async function rankDaily(sb: ReturnType<typeof getServiceClient>, slug: string, dailyDate: string, score: number): Promise<number | null> {
  const { count, error } = await sb.from("game_scores").select("*", { count: "exact", head: true })
    .eq("game_slug", slug).eq("sim_version", SIM_VERSION).eq("mode", "daily").eq("daily_date", dailyDate)
    .gt("score", score);
  if (error) return null;
  return (count ?? 0) + 1;
}

async function rankAllTime(sb: ReturnType<typeof getServiceClient>, slug: string, score: number): Promise<number | null> {
  const { count, error } = await sb.from("game_scores").select("*", { count: "exact", head: true })
    .eq("game_slug", slug).eq("sim_version", SIM_VERSION).eq("mode", "daily")
    .gt("score", score);
  if (error) return null;
  return (count ?? 0) + 1;
}

function toRows(data: Array<{ initials: string; score: number; wave: number; daily_date: string | null }> | null): LeaderboardRow[] {
  return (data ?? []).map((r, i) => ({ rank: i + 1, initials: r.initials, score: r.score, wave: r.wave, dailyDate: r.daily_date }));
}

async function topDaily(sb: ReturnType<typeof getServiceClient>, slug: string, dailyDate: string): Promise<LeaderboardRow[]> {
  const { data } = await sb.from("game_scores_public")
    .select("initials, score, wave, daily_date")
    .eq("game_slug", slug).eq("sim_version", SIM_VERSION).eq("mode", "daily").eq("daily_date", dailyDate)
    .order("score", { ascending: false }).order("created_at", { ascending: true })
    .limit(BOARD_LIMIT);
  return toRows(data as never);
}

async function topAllTime(sb: ReturnType<typeof getServiceClient>, slug: string): Promise<LeaderboardRow[]> {
  const { data } = await sb.from("game_scores_public")
    .select("initials, score, wave, daily_date")
    .eq("game_slug", slug).eq("sim_version", SIM_VERSION).eq("mode", "daily")
    .order("score", { ascending: false }).order("created_at", { ascending: true })
    .limit(BOARD_LIMIT);
  return toRows(data as never);
}
