// src/app/games/page.tsx
//
// Server Component — the arcade index. Card list is derived entirely
// from src/data/games.data.ts (mirroring how src/app/projects/page.tsx
// reads from src/data/projects.data.ts), so a second title needs only a
// new entry there, not a change here. No @/game/** import at all: the
// index doesn't need anything from the engine, only the plain
// {slug,name,blurb,status,tags} catalog.
import type { CSSProperties } from "react";
import Link from "next/link";
import { Gamepad2, ArrowRight } from "lucide-react";
import SectionReveal from "@/components/sections/SectionReveal";
import { games, type Game } from "@/data/games.data";
import { buildMetadata } from "@/lib/metadata";
import { getDailyBoard } from "@/lib/leaderboard/queries";
import { LEADERBOARD_PUBLIC } from "@/lib/leaderboard/config";
import type { LeaderboardRow } from "@/lib/leaderboard/types";

export const metadata = buildMetadata({
  title: "Games",
  description:
    "A small arcade of from-scratch recreations of classic Flash-era games — deterministic simulations, built and played entirely in the browser.",
  path: "/games",
});

// ISR: prerendered at build time, regenerated in the background at most
// once every 60s with a fresh top-3 preview (see node_modules/next/dist/
// docs/01-app/02-guides/caching-without-cache-components.md). With
// LEADERBOARD_PUBLIC false, no preview is read/rendered, so this has no
// visible effect yet.
export const revalidate = 60;

function badgeStyle(playable: boolean): CSSProperties {
  return {
    fontSize: "0.625rem",
    fontWeight: 600,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    color: playable ? "#FF3B2F" : "#787F96",
    background: playable ? "rgba(255,59,47,0.08)" : "rgba(120,127,150,0.08)",
    border: `1px solid ${playable ? "rgba(255,59,47,0.2)" : "rgba(120,127,150,0.2)"}`,
    padding: "3px 8px",
    borderRadius: 4,
    fontFamily: "var(--font-mono-var,'JetBrains Mono'),monospace",
    whiteSpace: "nowrap",
  };
}

function GameCard({ game, index, preview }: { game: Game; index: number; preview?: LeaderboardRow[] }) {
  const playable = game.status === "playable";

  const card = (
    <div
      style={{
        background: "rgba(15,15,21,0.9)",
        border: "1px solid #1F1F2E",
        borderRadius: 12,
        overflow: "hidden",
        height: "100%",
      }}
    >
      <div style={{ padding: "1.5rem", display: "flex", flexDirection: "column", height: "100%" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "0.75rem",
            marginBottom: "0.75rem",
          }}
        >
          <h3
            style={{
              fontFamily: "var(--font-display-var,'Syne'),sans-serif",
              fontWeight: 700,
              fontSize: "1.125rem",
              color: "#F0F2F8",
              margin: 0,
            }}
          >
            {game.name}
          </h3>
          <span style={badgeStyle(playable)}>{playable ? "Playable" : "Coming soon"}</span>
        </div>

        <p style={{ color: "#787F96", fontSize: "0.9rem", lineHeight: 1.65, margin: "0 0 1.25rem", flex: 1 }}>
          {game.blurb}
        </p>

        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.375rem", marginBottom: playable ? "1.25rem" : 0 }}>
          {game.tags.map((tag) => (
            <span
              key={tag}
              style={{
                padding: "0.25rem 0.625rem",
                background: "rgba(31,31,46,0.8)",
                border: "1px solid #27273A",
                borderRadius: 4,
                fontSize: "0.6875rem",
                color: "#3C3F52",
                fontFamily: "var(--font-mono-var,'JetBrains Mono'),monospace",
              }}
            >
              {tag}
            </span>
          ))}
        </div>

        {preview && preview.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.2rem", marginBottom: "0.9rem" }}>
            <span style={{ fontFamily: "var(--font-mono-var,'JetBrains Mono'),monospace", fontSize: "0.625rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "#3C3F52" }}>Today&rsquo;s top</span>
            {preview.map((r) => (
              <div key={`${r.rank}-${r.initials}`} style={{ display: "flex", justifyContent: "space-between", fontFamily: "var(--font-mono-var,'JetBrains Mono'),monospace", fontSize: "0.75rem", color: "#787F96" }}>
                <span style={{ color: "#F0F2F8", letterSpacing: "0.08em" }}>#{r.rank} {r.initials}</span>
                <span>{r.score.toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}

        {playable && (
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.375rem",
              color: "#FF3B2F",
              fontSize: "0.875rem",
              fontWeight: 600,
              fontFamily: "var(--font-body-var,'Outfit'),sans-serif",
            }}
          >
            Play now <ArrowRight size={14} />
          </div>
        )}
      </div>
    </div>
  );

  return (
    <SectionReveal delay={index * 0.06}>
      {playable ? (
        <Link href={`/games/${game.slug}`} style={{ textDecoration: "none", display: "block", height: "100%" }}>
          {card}
        </Link>
      ) : (
        <div style={{ opacity: 0.6, height: "100%" }} aria-disabled="true">
          {card}
        </div>
      )}
    </SectionReveal>
  );
}

export default async function GamesPage() {
  const circleDaily = LEADERBOARD_PUBLIC ? await getDailyBoard("circle-td", 3) : [];
  return (
    <div style={{ minHeight: "100vh", paddingTop: 66, position: "relative", zIndex: 10 }}>
      {/* Header */}
      <div
        style={{
          background: "rgba(8,8,12,0.85)",
          backdropFilter: "blur(12px)",
          borderBottom: "1px solid #1F1F2E",
          padding: "3rem clamp(1.25rem, 5vw, 4rem)",
        }}
      >
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.5rem",
              fontSize: "0.6875rem",
              fontWeight: 600,
              letterSpacing: "0.18em",
              color: "#FF3B2F",
              textTransform: "uppercase",
              marginBottom: "0.75rem",
              fontFamily: "var(--font-mono-var,'JetBrains Mono'),monospace",
            }}
          >
            <Gamepad2 size={13} />
            Games
          </div>
          <h1
            style={{
              fontFamily: "var(--font-display-var,'Syne'),sans-serif",
              fontWeight: 800,
              fontSize: "clamp(2rem,4vw,3rem)",
              color: "#F0F2F8",
              marginBottom: "0.5rem",
            }}
          >
            The arcade
          </h1>
          <p style={{ color: "#787F96", fontSize: "1rem", maxWidth: 560, margin: 0 }}>
            Small, from-scratch recreations of classic Flash-era games — built the same way as
            everything else on this site: deterministic, tested, and entirely client-side once
            you hit Play.
          </p>
        </div>
      </div>

      {/* Card grid */}
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "clamp(2rem, 6vw, 4rem) clamp(1.25rem, 5vw, 4rem)" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(min(320px, 100%), 1fr))",
            gap: "1.25rem",
          }}
        >
          {games.map((game, i) => (
            <GameCard
              key={game.slug}
              game={game}
              index={i}
              preview={game.slug === "circle-td" ? circleDaily : undefined}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
