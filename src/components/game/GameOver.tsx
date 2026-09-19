"use client";
// src/components/game/GameOver.tsx
//
// End-of-run overlay (Task 7, Plan 2) — final score/wave plus "Play again"
// and a stubbed leaderboard entry point for Plan 3, which will submit
// InputModel.inputLog as a verifiable replay; nothing here does that yet.
import { formatScore, formatWave } from "@/game/runtime/hud/format";

export interface GameOverProps {
  score: number;
  wave: number;
  onPlayAgain: () => void;
}

export default function GameOver({ score, wave, onPlayAgain }: GameOverProps) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Game over"
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(8,8,12,0.72)",
        backdropFilter: "blur(4px)",
        WebkitBackdropFilter: "blur(4px)",
        pointerEvents: "auto",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "0.75rem",
          alignItems: "center",
          padding: "2rem 2.5rem",
          background: "#0F0F15",
          border: "1px solid #1F1F2E",
          borderRadius: 16,
          minWidth: 260,
          maxWidth: "min(360px, 90vw)",
          textAlign: "center",
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-mono-var,'JetBrains Mono'),monospace",
            fontSize: "0.6875rem",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "#787F96",
          }}
        >
          Game over
        </span>
        <span
          style={{
            fontFamily: "var(--font-display-var,'Syne'),sans-serif",
            fontWeight: 800,
            fontSize: "2rem",
            color: "#F0F2F8",
          }}
        >
          {formatScore(score)}
        </span>
        <span
          style={{
            fontFamily: "var(--font-mono-var,'JetBrains Mono'),monospace",
            fontSize: "0.8125rem",
            color: "#787F96",
          }}
        >
          Reached wave {formatWave(wave)}
        </span>
        <button
          type="button"
          onClick={onPlayAgain}
          style={{
            marginTop: "0.5rem",
            minWidth: 140,
            minHeight: 44,
            borderRadius: 8,
            border: "1px solid #FF3B2F",
            background: "#FF3B2F",
            color: "#08080C",
            fontWeight: 700,
            fontSize: "0.875rem",
            cursor: "pointer",
          }}
        >
          Play again
        </button>
        <span
          aria-disabled="true"
          style={{
            fontFamily: "var(--font-mono-var,'JetBrains Mono'),monospace",
            fontSize: "0.6875rem",
            color: "#3C3F52",
          }}
        >
          Leaderboard coming soon
        </span>
      </div>
    </div>
  );
}
