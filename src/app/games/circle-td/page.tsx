// src/app/games/circle-td/page.tsx
//
// Server Component — no "use client", no game/canvas code. This is the
// page's LCP element: a <canvas> is never an LCP candidate, so the poster
// below (title, blurb, controls, tower reference) has to paint as real
// server-rendered markup before a single byte of the game engine loads.
// <PlayGate/> (a Client Component) is what actually gates that engine
// behind a click — see its own header comment for the lazy-boundary
// mechanics.
//
// This file lives under src/app/games/**, which — like src/game/**
// itself — is explicitly exempt from the lazy-boundary guard (see
// src/game/test/lazy-boundary.test.ts): importing pure data constants
// from @/game/titles/circle-td/content below is safe specifically
// BECAUSE this is a Server Component. Server Components never ship their
// own module graph to the client (only the Client Components they render
// — here, just <PlayGate/> — contribute client-side JS), so these
// constants are read once at build/render time on the server and baked
// into static HTML text; the client bundle gains zero bytes from it.
// Sourcing the copy from content.ts (rather than duplicating the numbers
// by hand) means this page can't drift from the actual balance the game
// ships with.
import { Gamepad2, MousePointerClick, Layers, Ban } from "lucide-react";
import SectionReveal from "@/components/sections/SectionReveal";
import PlayGate from "./PlayGate";
import { buildMetadata } from "@/lib/metadata";
import {
  TOWERS,
  WAVE_SIZE,
  WAVE_INTERVAL_TICKS,
  START_BANK,
  ALIVE_CAP_NORMAL,
} from "@/game/titles/circle-td/content";
import { getDailyBoard, getAllTimeBoard } from "@/lib/leaderboard/queries";
import { LEADERBOARD_PUBLIC } from "@/lib/leaderboard/config";
import Leaderboard from "@/components/game/Leaderboard";

export const metadata = buildMetadata({
  title: "Circle TD",
  description:
    "Circle TD — a from-scratch, deterministic recreation of the 2007 Flash tower-defense classic. No exits, no lives: the run ends when the creep population overruns you. Free to play, right in the browser.",
  path: "/games/circle-td",
});

// ISR: this page is prerendered at build time and regenerated in the
// background at most once every 60s with fresh board data (see
// node_modules/next/dist/docs/01-app/02-guides/caching-without-cache-
// components.md — Cache Components is not enabled here, so this route
// segment `revalidate` config is what governs it). With
// LEADERBOARD_PUBLIC false, no board is read/rendered, so this has no
// visible effect yet.
export const revalidate = 60;

// 30 Hz fixed-timestep sim (see src/game/runtime/loop.ts) — ticks to
// seconds for the wave-cadence line below.
const SIM_HZ = 30;
const waveIntervalSeconds = WAVE_INTERVAL_TICKS / SIM_HZ;

function sectionLabel(icon: React.ReactNode, label: string) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.5rem",
        fontSize: "0.6875rem",
        fontWeight: 600,
        letterSpacing: "0.12em",
        color: "#3C3F52",
        textTransform: "uppercase",
        fontFamily: "var(--font-mono-var,'JetBrains Mono'),monospace",
        marginBottom: "0.75rem",
      }}
    >
      {icon}
      {label}
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd
      style={{
        display: "inline-block",
        padding: "1px 6px",
        background: "rgba(31,31,46,0.8)",
        border: "1px solid #27273A",
        borderRadius: 4,
        fontFamily: "var(--font-mono-var,'JetBrains Mono'),monospace",
        fontSize: "0.75rem",
        color: "#F0F2F8",
      }}
    >
      {children}
    </kbd>
  );
}

export default async function CircleTdPage() {
  const daily = LEADERBOARD_PUBLIC ? await getDailyBoard("circle-td") : [];
  const allTime = LEADERBOARD_PUBLIC ? await getAllTimeBoard("circle-td") : [];
  return (
    <div style={{ minHeight: "100vh", paddingTop: 66, position: "relative", zIndex: 10 }}>
      {/* Hero / poster */}
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
            Games / Circle TD
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
            Circle TD
          </h1>
          <p style={{ color: "#787F96", fontSize: "1rem", maxWidth: 640, lineHeight: 1.7, margin: 0 }}>
            A from-scratch recreation of David Scott&rsquo;s 2007 Flash tower-defense original.
            There are no exits and no lives — creeps that survive a lap keep looping, and the run
            ends the instant {ALIVE_CAP_NORMAL} of them are alive at once. Population control, not
            defense.
          </p>
        </div>
      </div>

      {/* Below ~900px, `minmax(260px, 1fr)` on the sidebar column has
          nowhere to shrink to, so the grid does NOT wrap on its own —
          it holds both tracks and crushes the PlayGate column instead
          (verified: 51px wide at a 375px viewport, no overflow but
          unusable). A real breakpoint is needed, same idiom Nav.tsx
          already uses for its own responsive collapse. */}
      <style>{`
        @media (max-width: 900px) {
          .circle-td-layout { grid-template-columns: 1fr !important; }
        }
      `}</style>
      <div
        className="circle-td-layout"
        style={{
          maxWidth: 1200,
          margin: "0 auto",
          padding: "clamp(2rem, 6vw, 4rem) clamp(1.25rem, 5vw, 4rem)",
          display: "grid",
          gap: "1.5rem",
          gridTemplateColumns: "minmax(0, 2fr) minmax(260px, 1fr)",
        }}
      >
        {/* Left: the click-to-play gate */}
        <SectionReveal>
          <PlayGate />
        </SectionReveal>

        {/* Right: controls + rules reference — on-screen before any
            click, not hidden behind a HUD tooltip once playing. */}
        <SectionReveal delay={0.06}>
          <div
            style={{
              background: "rgba(15,15,21,0.9)",
              border: "1px solid #1F1F2E",
              borderRadius: 12,
              padding: "1.5rem",
              display: "flex",
              flexDirection: "column",
              gap: "1.5rem",
            }}
          >
            <div>
              {sectionLabel(<MousePointerClick size={13} />, "Controls")}
              <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                <li style={{ fontSize: "0.8125rem", color: "#787F96", lineHeight: 1.6 }}>
                  Click an empty wall tile to place the selected tower
                </li>
                <li style={{ fontSize: "0.8125rem", color: "#787F96", lineHeight: 1.6 }}>
                  Click a placed tower to select it — upgrade or sell
                </li>
                <li style={{ fontSize: "0.8125rem", color: "#787F96", lineHeight: 1.8 }}>
                  <Kbd>1</Kbd>–<Kbd>5</Kbd> select tower &nbsp; <Kbd>U</Kbd> upgrade &nbsp;{" "}
                  <Kbd>S</Kbd> sell &nbsp; <Kbd>Esc</Kbd> cancel &nbsp; <Kbd>Space</Kbd> pause
                </li>
              </ul>
            </div>

            <div>
              {sectionLabel(<Layers size={13} />, "Towers")}
              <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "0.375rem" }}>
                {TOWERS.map((tower) => (
                  <li
                    key={tower.name}
                    style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8125rem", color: "#787F96" }}
                  >
                    <span>{tower.name}</span>
                    <span style={{ fontFamily: "var(--font-mono-var,'JetBrains Mono'),monospace", color: "#3C3F52" }}>
                      ${tower.cost}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              {sectionLabel(<Ban size={13} />, "No leaks, no lives")}
              <p style={{ margin: 0, fontSize: "0.8125rem", color: "#787F96", lineHeight: 1.65 }}>
                ${START_BANK} to start, a new wave of {WAVE_SIZE} creeps every {waveIntervalSeconds}s,
                forever. Game over at {ALIVE_CAP_NORMAL} creeps alive at once — there&rsquo;s no exit
                to defend.
              </p>
            </div>

            {LEADERBOARD_PUBLIC && (
              <div>
                {sectionLabel(<Gamepad2 size={13} />, "Today's board")}
                <Leaderboard daily={daily} allTime={allTime} />
              </div>
            )}
          </div>
        </SectionReveal>
      </div>
    </div>
  );
}
