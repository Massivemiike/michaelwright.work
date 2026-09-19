"use client";
// src/components/game/SpeedControls.tsx
//
// Pre-round GO button, Pause/Play toggle (Space), and 1x/2x/4x speed
// buttons (Task 7, Plan 2). `loop` is a narrow structural slice of
// GameLoop (setPaused/setSpeed only) so this is testable with a plain
// `{ setPaused: vi.fn(), setSpeed: vi.fn() }` mock — see
// SpeedControls.test.tsx — with no real GameLoop/rAF involved.
//
// `started` (true once RenderSnapshot.wave >= 1, i.e. the sim has run its
// first tick) decides which control renders: GO pre-round, or Pause/Play +
// speed buttons once the run is live. This is the GO/pause build-phase
// model from the brief — GameClient starts the loop PAUSED so the player
// can place towers at tick 0 before wave 1 spawns; GO is what calls
// loop.setPaused(false) to let the first tick actually run. `paused` and
// `speed` are controlled props (GameClient owns the source of truth as
// React state) rather than state mirrored off the loop itself, since
// GameLoop's interface (src/game/runtime/loop.ts) has no getter for its
// current paused/speed — onPauseChange/onSpeedChange are how this
// component reports a change back up for GameClient to store.
//
// setSpeed is only ever called here with 1, 2, or 4 — never a raw/
// unclamped multiplier — addressing Task 5's "setSpeed has no input
// clamp" note by construction: these three buttons are the only call
// sites in the whole HUD.
import { useEffect, type CSSProperties } from "react";

export interface SpeedControlsLoop {
  setPaused(paused: boolean): void;
  setSpeed(speed: number): void;
}

export type Speed = 1 | 2 | 4;
const SPEEDS: readonly Speed[] = [1, 2, 4];

export interface SpeedControlsProps {
  loop: SpeedControlsLoop;
  /** True once the sim has ticked at least once (wave >= 1) — see GameClient. */
  started: boolean;
  paused: boolean;
  speed: Speed;
  onPauseChange?: (paused: boolean) => void;
  onSpeedChange?: (speed: Speed) => void;
}

export default function SpeedControls({
  loop,
  started,
  paused,
  speed,
  onPauseChange,
  onSpeedChange,
}: SpeedControlsProps) {
  const go = (): void => {
    loop.setPaused(false);
    onPauseChange?.(false);
  };

  const togglePause = (): void => {
    const next = !paused;
    loop.setPaused(next);
    onPauseChange?.(next);
  };

  const changeSpeed = (s: Speed): void => {
    loop.setSpeed(s);
    onSpeedChange?.(s);
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key !== " ") return;
      // Final-review finding #8: a modified Space (e.g. Ctrl+Space is an
      // IME/input-source toggle on several platforms) is a different
      // shortcut entirely — pass it through rather than also toggling
      // pause AND swallowing the keystroke via preventDefault below.
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      e.preventDefault(); // don't let Space also scroll the page
      if (!started) return; // pre-round: GO is the only way to start, not Space
      const next = !paused;
      loop.setPaused(next);
      onPauseChange?.(next);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [started, paused, loop, onPauseChange]);

  return (
    <div
      style={{
        display: "flex",
        gap: "0.5rem",
        flexWrap: "wrap", // narrow viewports (360-414px): wrap rather than overflow
        justifyContent: "flex-end",
        alignItems: "center",
        padding: "0.5rem",
        background: "rgba(15,15,21,0.85)",
        border: "1px solid #1F1F2E",
        borderRadius: 10,
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        pointerEvents: "auto",
      }}
    >
      {!started ? (
        <button type="button" onClick={go} style={goButtonStyle}>
          GO
        </button>
      ) : (
        <>
          <button type="button" onClick={togglePause} aria-pressed={paused} style={iconButtonStyle}>
            {paused ? "Play" : "Pause"}
          </button>
          {SPEEDS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => changeSpeed(s)}
              aria-pressed={speed === s}
              style={speedButtonStyle(speed === s)}
            >
              {s}×
            </button>
          ))}
        </>
      )}
    </div>
  );
}

const goButtonStyle: CSSProperties = {
  minWidth: 64,
  minHeight: 44,
  borderRadius: 8,
  border: "1px solid #FF3B2F",
  background: "#FF3B2F",
  color: "#08080C",
  fontWeight: 700,
  fontSize: "0.875rem",
  cursor: "pointer",
};

const iconButtonStyle: CSSProperties = {
  minWidth: 64,
  minHeight: 44,
  borderRadius: 8,
  border: "1px solid #1F1F2E",
  background: "#16161F",
  color: "#F0F2F8",
  fontWeight: 600,
  fontSize: "0.8125rem",
  cursor: "pointer",
};

const speedButtonStyle = (active: boolean): CSSProperties => ({
  minWidth: 40,
  minHeight: 44,
  borderRadius: 8,
  border: active ? "1px solid #FF3B2F" : "1px solid #1F1F2E",
  background: active ? "rgba(255,59,47,0.09)" : "#16161F",
  color: active ? "#FF3B2F" : "#787F96",
  fontWeight: 600,
  fontSize: "0.8125rem",
  cursor: "pointer",
});
