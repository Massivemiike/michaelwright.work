// src/lib/leaderboard/types.ts
//
// Plain, client-safe types shared by the route response, the Leaderboard
// component, and server-side reads. No server-only import here, so it is
// safe to import from a 'use client' component too.
export interface LeaderboardRow {
  rank: number;
  initials: string;
  score: number;
  wave: number;
  dailyDate: string | null;
}

export interface BoardResponse {
  ok: boolean;
  duplicate?: boolean;
  dailyRank: number | null;
  allTimeRank: number | null;
  daily: LeaderboardRow[];
  allTime: LeaderboardRow[];
  error?: string;
}
