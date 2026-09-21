"use client";
// src/components/game/Leaderboard.tsx
//
// Top-25 board with DAILY / ALL-TIME tabs and a pinned own-rank row when
// the player is outside the visible top. Carbon Forge tokens + JetBrains
// Mono numerals. Presentational only — no Supabase import — so it renders
// both server-side (the play-gate LCP poster) and client-side (GameOver
// after a submit).
import { useState, type CSSProperties } from "react";
import type { LeaderboardRow } from "@/lib/leaderboard/types";

export interface LeaderboardProps {
  daily: LeaderboardRow[];
  allTime: LeaderboardRow[];
  ownRank?: { daily: number | null; allTime: number | null };
  ownInitials?: string;
}

const mono = "var(--font-mono-var,'JetBrains Mono'),monospace";

function tabStyle(active: boolean): CSSProperties {
  return {
    flex: 1, padding: "0.4rem 0.5rem", fontFamily: mono, fontSize: "0.6875rem",
    letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer",
    background: active ? "rgba(255,59,47,0.12)" : "transparent",
    color: active ? "#FF3B2F" : "#787F96",
    border: "1px solid " + (active ? "rgba(255,59,47,0.4)" : "#1F1F2E"),
    borderRadius: 6,
  };
}

function Row({ r, own }: { r: LeaderboardRow; own: boolean }) {
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "2.5rem 1fr auto auto", gap: "0.75rem",
      alignItems: "baseline", padding: "0.3rem 0.5rem", borderRadius: 4,
      background: own ? "rgba(127,219,255,0.08)" : "transparent",
    }}>
      <span style={{ fontFamily: mono, fontSize: "0.75rem", color: "#3C3F52" }}>#{r.rank}</span>
      <span style={{ fontFamily: mono, fontWeight: 700, color: own ? "#7FDBFF" : "#F0F2F8", letterSpacing: "0.08em" }}>{r.initials}</span>
      <span style={{ fontFamily: mono, fontSize: "0.8125rem", color: "#F0F2F8" }}>{r.score.toLocaleString()}</span>
      <span style={{ fontFamily: mono, fontSize: "0.6875rem", color: "#787F96" }}>w{r.wave}</span>
    </div>
  );
}

export default function Leaderboard({ daily, allTime, ownRank, ownInitials }: LeaderboardProps) {
  const [tab, setTab] = useState<"daily" | "allTime">("daily");
  const rows = tab === "daily" ? daily : allTime;
  const rank = tab === "daily" ? ownRank?.daily ?? null : ownRank?.allTime ?? null;
  const ownInView = ownInitials != null && rank != null && rows.some((r) => r.rank === rank && r.initials === ownInitials);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", width: "100%" }}>
      <div style={{ display: "flex", gap: "0.4rem" }}>
        <button type="button" style={tabStyle(tab === "daily")} onClick={() => setTab("daily")}>Daily</button>
        <button type="button" style={tabStyle(tab === "allTime")} onClick={() => setTab("allTime")}>All-time</button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.1rem", maxHeight: 300, overflowY: "auto" }}>
        {rows.length === 0 && (
          <span style={{ fontFamily: mono, fontSize: "0.75rem", color: "#3C3F52", padding: "0.5rem" }}>No scores yet — be the first.</span>
        )}
        {rows.map((r) => <Row key={`${r.rank}-${r.initials}-${r.dailyDate ?? ""}`} r={r} own={ownInitials === r.initials && r.rank === rank} />)}
        {rank != null && !ownInView && ownInitials != null && (
          <>
            <span style={{ textAlign: "center", color: "#3C3F52", fontFamily: mono, fontSize: "0.75rem" }}>···</span>
            <Row r={{ rank, initials: ownInitials, score: 0, wave: 0, dailyDate: null }} own />
          </>
        )}
      </div>
    </div>
  );
}
