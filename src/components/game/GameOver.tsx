"use client";
// src/components/game/GameOver.tsx
//
// End-of-run overlay. Daily runs submit the recorded command log
// (InputModel.inputLog, passed as `commands`) to /api/games/scores, which
// re-simulates it server-side and returns both boards; the client never
// sends a score it computed itself and never holds a Supabase key. Free
// runs are local-only: a personal best kept in localStorage, never posted.
import { useEffect, useState, type CSSProperties } from "react";
import { formatScore, formatWave } from "@/game/runtime/hud/format";
import type { Command } from "@/game/sim/replay";
import type { BoardResponse } from "@/lib/leaderboard/types";
import Leaderboard from "./Leaderboard";

export interface GameOverProps {
  score: number;
  wave: number;
  onPlayAgain: () => void;
  mode: "daily" | "free";
  seed: number;
  simVersion: number;
  commands: Command[];
}

const mono = "var(--font-mono-var,'JetBrains Mono'),monospace";
const FREE_BEST_KEY = "circle-td:free-best";

function readFreeBest(): number {
  try { return Number(localStorage.getItem(FREE_BEST_KEY) ?? "0") || 0; } catch { return 0; }
}
function writeFreeBest(score: number): void {
  try { localStorage.setItem(FREE_BEST_KEY, String(score)); } catch { /* private mode / blocked */ }
}

export default function GameOver({ score, wave, onPlayAgain, mode, seed, simVersion, commands }: GameOverProps) {
  const [initials, setInitials] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "done" | "error">("idle");
  const [board, setBoard] = useState<BoardResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>("");

  // Free play: compute the personal best once at render (no network).
  const [freeBest] = useState(() => (mode === "free" ? readFreeBest() : 0));
  const freeIsNewBest = mode === "free" && score > freeBest;
  // Persist a new best as a commit-phase effect, not in the render body —
  // render must stay pure under reactCompiler:true.
  useEffect(() => {
    if (freeIsNewBest) writeFreeBest(score);
  }, [freeIsNewBest, score]);

  async function submit() {
    if (!/^[A-Za-z]{3}$/.test(initials)) { setErrorMsg("Enter exactly 3 letters."); return; }
    setStatus("submitting"); setErrorMsg("");
    try {
      const res = await fetch("/api/games/scores", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ gameSlug: "circle-td", simVersion, seed, mode, initials: initials.toUpperCase(), commands }),
      });
      const json = (await res.json()) as BoardResponse;
      if (!res.ok || !json.ok) { setStatus("error"); setErrorMsg(json.error ?? "Submission failed."); return; }
      setBoard(json); setStatus("done");
    } catch {
      setStatus("error"); setErrorMsg("Network error — try again.");
    }
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="Game over" style={overlay}>
      <div style={panel}>
        <span style={{ fontFamily: mono, fontSize: "0.6875rem", letterSpacing: "0.12em", textTransform: "uppercase", color: "#787F96" }}>Game over</span>
        <span style={{ fontFamily: "var(--font-display-var,'Syne'),sans-serif", fontWeight: 800, fontSize: "2rem", color: "#F0F2F8" }}>{formatScore(score)}</span>
        <span style={{ fontFamily: mono, fontSize: "0.8125rem", color: "#787F96" }}>Reached wave {formatWave(wave)}</span>

        {mode === "free" && (
          <span style={{ fontFamily: mono, fontSize: "0.75rem", color: freeIsNewBest ? "#7FDBFF" : "#787F96" }}>
            {freeIsNewBest ? "New personal best!" : `Personal best: ${formatScore(Math.max(freeBest, score))}`}
            <br />Free play is local — daily runs are ranked.
          </span>
        )}

        {mode === "daily" && status !== "done" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", alignItems: "center", width: "100%" }}>
            <input
              aria-label="Your initials"
              value={initials}
              maxLength={3}
              onChange={(e) => setInitials(e.target.value.replace(/[^A-Za-z]/g, "").toUpperCase())}
              placeholder="AAA"
              style={{ width: 120, textAlign: "center", letterSpacing: "0.3em", fontFamily: mono, fontSize: "1.25rem", padding: "0.4rem", background: "#08080C", color: "#F0F2F8", border: "1px solid #27273A", borderRadius: 6 }}
            />
            <button type="button" onClick={submit} disabled={status === "submitting"} style={primaryBtn}>
              {status === "submitting" ? "Verifying…" : "Submit to daily board"}
            </button>
            {errorMsg && <span style={{ fontFamily: mono, fontSize: "0.6875rem", color: "#FF3B2F" }}>{errorMsg}</span>}
          </div>
        )}

        {mode === "daily" && status === "done" && board && (
          <Leaderboard
            daily={board.daily}
            allTime={board.allTime}
            ownRank={{ daily: board.dailyRank, allTime: board.allTimeRank }}
            ownInitials={initials.toUpperCase()}
          />
        )}

        <button type="button" onClick={onPlayAgain} style={{ ...primaryBtn, marginTop: "0.25rem" }}>Play again</button>
      </div>
    </div>
  );
}

const overlay: CSSProperties = { position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(8,8,12,0.72)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)", pointerEvents: "auto", padding: "1rem" };
const panel: CSSProperties = { display: "flex", flexDirection: "column", gap: "0.75rem", alignItems: "center", padding: "1.75rem 2rem", background: "#0F0F15", border: "1px solid #1F1F2E", borderRadius: 16, minWidth: 280, maxWidth: "min(420px, 92vw)", textAlign: "center" };
const primaryBtn: CSSProperties = { minWidth: 140, minHeight: 44, borderRadius: 8, border: "1px solid #FF3B2F", background: "#FF3B2F", color: "#08080C", fontWeight: 700, fontSize: "0.875rem", cursor: "pointer" };
