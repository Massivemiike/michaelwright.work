import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the Supabase server client so the route's DB calls are observable
// and no real network/env is needed. vi.mock also prevents server-only
// from loading.
const rpc = vi.fn();
const from = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  getServiceClient: () => ({ rpc, from }),
}));
// Fix "now" so daily-seed authority is deterministic in the test.
vi.mock("@/lib/dailySeed", async (orig) => {
  const real = await orig<typeof import("@/lib/dailySeed")>();
  return { ...real };
});

import { POST } from "./route";
import { dailySeed } from "@/lib/dailySeed";
import { SIM_VERSION } from "@/game/sim/types";
import { runReplay, hashCommands, type Command } from "@/game/sim/replay";
import { circleTdTitle } from "@/game/titles/circle-td/title";

// Captures the exact row the route hands to game_scores.insert(), so the
// happy-path test can prove the persisted score/wave/hash are the
// server-recomputed values — never anything the client could supply.
let lastInsertedRow: Record<string, unknown> | null = null;

const SEED = dailySeed(new Date());
const body = (over: Record<string, unknown> = {}) => ({
  gameSlug: "circle-td", simVersion: SIM_VERSION, seed: SEED, mode: "daily",
  initials: "ABC", commands: [{ tick: 0, type: "place", tower: 0, tile: 10 }], ...over,
});
const req = (b: unknown) =>
  new Request("http://localhost/api/games/scores", {
    method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "1.2.3.4" },
    body: JSON.stringify(b),
  });

// Faithful mirror of the route's real Supabase call chains. Filter/modifier
// methods (.eq/.order) return the same chainable — exactly as PostgREST's
// PostgrestFilterBuilder returns `this` — so the mock is robust to how many
// times the route chains them (rankDaily uses 4 .eq() then .gt(), rankAllTime
// 3 .eq() then .gt(); topDaily 4 .eq(), topAllTime 3). Terminals resolve to the
// shape the route destructures: .single() → { data, error }, .gt() →
// { count, error }, .limit() → { data, error }.
function scoresTable() {
  // rank query: from("game_scores").select("*",{count,head}).eq()...gt()
  const rankChain: Record<string, unknown> = {};
  rankChain.eq = () => rankChain;
  rankChain.gt = () => Promise.resolve({ count: 0, error: null });
  // dedupe read (only hit on 23505): .select("created_at").eq()...single()
  rankChain.single = () =>
    Promise.resolve({ data: { created_at: "2026-09-19T00:00:00Z" }, error: null });
  return {
    // insert().select("id, created_at").single()
    insert: (row: Record<string, unknown>) => {
      lastInsertedRow = row;
      return {
        select: () => ({
          single: () =>
            Promise.resolve({ data: { id: 1, created_at: "2026-09-19T00:00:00Z" }, error: null }),
        }),
      };
    },
    select: () => rankChain,
  };
}
function publicTable() {
  // board read: from("game_scores_public").select(...).eq()...order().order().limit()
  const boardChain: Record<string, unknown> = {};
  boardChain.eq = () => boardChain;
  boardChain.order = () => boardChain;
  boardChain.limit = () => Promise.resolve({ data: [], error: null });
  return { select: () => boardChain };
}

beforeEach(() => {
  rpc.mockReset(); from.mockReset();
  lastInsertedRow = null;
  rpc.mockResolvedValue({ data: true, error: null }); // rate limit: allowed
  from.mockImplementation((table: string) =>
    (table === "game_scores" ? scoresTable() : publicTable()) as unknown
  );
});

describe("POST /api/games/scores", () => {
  it("rejects an invalid body with 400", async () => {
    const res = await POST(req(body({ initials: "AB" })) as never);
    expect(res.status).toBe(400);
  });
  it("rejects free mode with 400 (local-only/unranked)", async () => {
    const res = await POST(req(body({ mode: "free" })) as never);
    expect(res.status).toBe(400);
  });
  it("rejects blocked initials with 403", async () => {
    const res = await POST(req(body({ initials: "ASS" })) as never);
    expect(res.status).toBe(403);
  });
  it("rejects when the rate limiter says over-limit with 429", async () => {
    rpc.mockResolvedValue({ data: false, error: null });
    const res = await POST(req(body()) as never);
    expect(res.status).toBe(429);
  });
  it("rejects a wrong daily seed with 400", async () => {
    const res = await POST(req(body({ seed: 999999 })) as never);
    expect(res.status).toBe(400);
  });
  it("accepts a valid submission and inserts the server-recomputed score", async () => {
    const commands = body().commands as Command[];
    const res = await POST(req(body()) as never);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);

    // The persisted row must carry the SERVER recompute, not any client value.
    const authoritative = runReplay(
      { seed: SEED, simVersion: SIM_VERSION, mode: "daily", commands },
      circleTdTitle
    );
    expect(lastInsertedRow).not.toBeNull();
    expect(lastInsertedRow!.score).toBe(authoritative.score);
    expect(lastInsertedRow!.wave).toBe(authoritative.wave);
    expect(lastInsertedRow!.hash).toBe(authoritative.hash);
    expect(lastInsertedRow!.replay_hash).toBe(hashCommands(commands));
    expect(lastInsertedRow!.sim_version).toBe(SIM_VERSION);
  });
});
