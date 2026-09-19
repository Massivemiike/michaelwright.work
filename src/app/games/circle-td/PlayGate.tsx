"use client";

// src/app/games/circle-td/PlayGate.tsx
//
// The click-to-play gate for /games/circle-td. The Server Component
// page.tsx above this never imports GameClient/@/game/** at all — this
// file is the only module in the whole site (besides src/app/games/**
// and src/game/** themselves) allowed to reference it, and even here the
// reference is a `next/dynamic` import so the actual game bundle (sim +
// renderer + loop + HUD — everything under @/game/**) is a separate
// chunk that is requested only once <GameClient/> is actually rendered
// below, which happens only after a real click. Nothing above this
// file's own `dynamic(...)` call (including the daily-seed helper) is
// game code: src/lib/dailySeed.ts deliberately lives outside @/game/**
// so this file's own top-level imports stay clean too — see that file's
// header comment.
//
// `next/dynamic` is called here at MODULE scope, not inside the click
// handler, per node_modules/next/dist/docs/01-app/02-guides/
// lazy-loading.md: "dynamic() can't be used inside of React rendering as
// it needs to be marked in the top level of the module for preloading to
// work, similar to React.lazy." That does NOT reopen "loads only on
// click": dynamic()/React.lazy only fetches its chunk when the lazy
// component is actually RENDERED, and `{session && <GameClient .../>}`
// below renders it for the first time only after handlePlay/
// handleFreePlay flips `session` from null — the same "Load on demand,
// only when/if the condition is met" pattern shown in that doc's own
// `{showMore && <ComponentB />}` example.
import { useState, type CSSProperties } from "react";
import dynamic from "next/dynamic";
import { motion } from "motion/react";
import { dailySeed, randomSeed, utcDateString } from "@/lib/dailySeed";

type Mode = "daily" | "free";
interface Session {
  seed: number;
  mode: Mode;
}

const GameClient = dynamic(() => import("./GameClient"), {
  ssr: false,
  loading: () => <GameLoading />,
});

function GameLoading() {
  return (
    <div style={frameStyle()}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
        <motion.span
          style={{ width: 8, height: 8, borderRadius: "50%", background: "#FF3B2F", display: "inline-block" }}
          animate={{ opacity: [1, 0.3, 1] }}
          transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
        />
        <span
          style={{
            fontFamily: "var(--font-mono-var,'JetBrains Mono'),monospace",
            fontSize: "0.75rem",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "#787F96",
          }}
        >
          Loading Circle TD…
        </span>
      </div>
    </div>
  );
}

function frameStyle(): CSSProperties {
  return {
    width: "100%",
    height: "min(80vh, 720px)",
    minHeight: 480,
    borderRadius: 12,
    overflow: "hidden",
    border: "1px solid #1F1F2E",
    background: "#08080C",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  };
}

function buttonStyle(variant: "primary" | "secondary"): CSSProperties {
  const primary = variant === "primary";
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "0.5rem",
    padding: "0.75rem 1.5rem",
    borderRadius: 8,
    fontWeight: 600,
    fontSize: "0.9375rem",
    fontFamily: "var(--font-body-var,'Outfit'),sans-serif",
    border: primary ? "1px solid rgba(255,59,47,0.4)" : "1px solid #27273A",
    background: primary ? "#FF3B2F" : "transparent",
    color: primary ? "#0A0A0F" : "#787F96",
    cursor: "pointer",
    // A real <button>, so it's already keyboard-reachable/focusable —
    // this only clears the UA default outline-on-hover jank some
    // browsers add to buttons with a custom background.
    outlineOffset: 2,
  };
}

export default function PlayGate() {
  const [session, setSession] = useState<Session | null>(null);

  if (session) {
    return (
      <div style={frameStyle()}>
        <GameClient seed={session.seed} mode={session.mode} />
      </div>
    );
  }

  const today = utcDateString();

  return (
    <div style={{ background: "rgba(15,15,21,0.9)", border: "1px solid #1F1F2E", borderRadius: 12, minHeight: 360, display: "flex", alignItems: "center" }}>
      <div style={{ padding: "2rem", display: "flex", flexDirection: "column", gap: "1.25rem", width: "100%" }}>
        <div>
          <div
            style={{
              fontSize: "0.6875rem",
              fontWeight: 600,
              letterSpacing: "0.18em",
              color: "#FF3B2F",
              textTransform: "uppercase",
              marginBottom: "0.75rem",
              fontFamily: "var(--font-mono-var,'JetBrains Mono'),monospace",
            }}
          >
            Ready when you are
          </div>
          <p style={{ margin: 0, color: "#787F96", fontSize: "0.9375rem", lineHeight: 1.7, maxWidth: 480 }}>
            No account, no download — the whole run happens in this tab. Pick a mode below.
          </p>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem" }}>
          <button
            type="button"
            onClick={() => setSession({ seed: dailySeed(), mode: "daily" })}
            style={buttonStyle("primary")}
          >
            Play today&rsquo;s run — {today}
          </button>
          <button
            type="button"
            onClick={() => setSession({ seed: randomSeed(), mode: "free" })}
            style={buttonStyle("secondary")}
          >
            Free play (random seed)
          </button>
        </div>

        <p style={{ margin: 0, fontSize: "0.75rem", color: "#3C3F52", lineHeight: 1.6 }}>
          Today&rsquo;s run uses the same seed for everyone, all day. Free play draws a fresh random one every time you click it.
        </p>
      </div>
    </div>
  );
}
