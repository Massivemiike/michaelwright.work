"use client";
// src/components/game/Hud.tsx
//
// Bank / score / wave / creep-population readout (Task 7, Plan 2) — pure
// DOM overlay, nothing drawn on the canvas. Every prop is a plain number
// lifted out of a THROTTLED RenderSnapshot (see GameClient.tsx's
// useSyncExternalStore wiring over src/game/runtime/hud/snapshotStore.ts,
// updated at ~10Hz, not the sim's 30Hz tick rate or the render loop's
// 60Hz) — this component itself has no opinion about that cadence, it
// just renders whatever numbers it's given.
//
// `creepCap` is passed in rather than read off the snapshot because it
// isn't part of RenderSnapshot — ALIVE_CAP_NORMAL (content.ts) never
// changes mid-run (see titles/circle-td/index.ts's makeSimState), so
// GameClient passes that constant straight through.
import { formatCreeps, formatGold, formatInt, formatScore, formatWave } from "@/game/runtime/hud/format";

export interface HudProps {
  bank: number;
  score: number;
  wave: number;
  // Final-review finding #3: the primary creep-meter figure is now the
  // FULL live population (on-track + still-staged) — RenderSnapshot's
  // `creepAlive`, which matches SimState.creeps.count, the number the
  // population-cap lose condition actually compares against `creepCap`.
  // `creepCount` (on-track only, RenderSnapshot's original field) is kept
  // as a secondary parenthetical — previously it was ALSO the primary
  // figure, which undercounted the meter (sometimes badly, right after a
  // wave spawns and most of it is still staged off-track).
  creepAlive: number;
  creepCount: number;
  creepCap: number;
  /** True when a wave is due soon — drives the small pulsing "imminent" dot. Optional per the brief. */
  waveImminent?: boolean;
}

export default function Hud({ bank, score, wave, creepAlive, creepCount, creepCap, waveImminent = false }: HudProps) {
  return (
    <div
      style={{
        display: "flex",
        gap: "1.25rem",
        flexWrap: "wrap",
        alignItems: "center",
        padding: "0.625rem 0.875rem",
        background: "rgba(15,15,21,0.85)",
        border: "1px solid #1F1F2E",
        borderRadius: 10,
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        pointerEvents: "auto",
      }}
    >
      <Stat label="Bank" value={formatGold(bank)} />
      <Stat label="Score" value={formatScore(score)} />
      <Stat label="Wave" value={formatWave(wave)} accent={waveImminent} />
      <Stat label="Creeps" value={formatCreeps(creepAlive, creepCap)} sub={`${formatInt(creepCount)} on track`} />
      {waveImminent && (
        <span
          aria-label="Wave imminent"
          className="td-hud-dot"
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: "#FF3B2F",
            boxShadow: "0 0 0 3px rgba(255,59,47,0.2)",
            display: "inline-block",
          }}
        />
      )}
      <style>{`
        @keyframes td-hud-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
        .td-hud-dot { animation: td-hud-pulse 1.5s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .td-hud-dot { animation: none; }
        }
      `}</style>
    </div>
  );
}

function Stat({
  label,
  value,
  accent = false,
  sub,
}: {
  label: string;
  value: string;
  accent?: boolean;
  /** Optional smaller secondary line under the main value — e.g. Creeps' on-track figure alongside its live-population primary (finding #3). */
  sub?: string;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 56 }}>
      <span
        style={{
          fontFamily: "var(--font-mono-var,'JetBrains Mono'),monospace",
          fontSize: "0.625rem",
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "#787F96",
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontFamily: "var(--font-display-var,'Syne'),sans-serif",
          fontSize: "1.0625rem",
          fontWeight: 700,
          color: accent ? "#FF3B2F" : "#F0F2F8",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </span>
      {sub && (
        <span
          style={{
            fontFamily: "var(--font-mono-var,'JetBrains Mono'),monospace",
            fontSize: "0.5625rem",
            color: "#3C3F52",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {sub}
        </span>
      )}
    </div>
  );
}
