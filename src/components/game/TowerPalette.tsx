"use client";
// src/components/game/TowerPalette.tsx
//
// The five placeable tower types (Task 7, Plan 2) — cost, target
// restriction, and current affordability against the live bank. Selecting
// a tower here only arms it (InputModel.selectedTowerType); it costs
// nothing and never touches SimState — placement itself happens on the
// canvas (GameClient's own pointerdown handler), through the SAME
// InputModel instance this component is handed.
//
// Owns its own "1".."5" keyboard shortcut (mirroring the five slots below)
// so it's independently testable with a mock InputModel and no GameClient
// involved at all — see TowerPalette.test.tsx. In production, GameClient
// passes a stable wrapper around the real InputModel that also resyncs the
// canvas's ghost/range-preview highlight after every selection (see
// GameClient.tsx's `paletteInputModel`) — this component itself knows
// nothing about the canvas.
import { useCallback, useEffect } from "react";
import { TOWERS } from "@/game/titles/circle-td/content";
import { formatCost, formatTargets } from "@/game/runtime/hud/format";

// Narrow structural interface — a test can pass `{ selectTower: vi.fn() }`
// without constructing a real sim/InputModel. The real
// src/game/runtime/input/pointer.ts InputModel satisfies this trivially.
export interface TowerPaletteInputModel {
  selectTower(type: number): void;
}

export interface TowerPaletteProps {
  bank: number;
  selectedType: number;
  inputModel: TowerPaletteInputModel;
}

export default function TowerPalette({ bank, selectedType, inputModel }: TowerPaletteProps) {
  const select = useCallback(
    (type: number) => {
      // Mirrors the disabled-button gate below for the keyboard path too —
      // arming a tower the player can't afford would only ever show a
      // ghost preview they can never actually place. Keeping both input
      // paths consistent is the "DIM/disable an unaffordable tower" rule
      // from the brief, applied uniformly rather than just visually.
      if (bank < TOWERS[type].cost) return;
      inputModel.selectTower(type);
    },
    [bank, inputModel]
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key >= "1" && e.key <= "5") {
        select(Number(e.key) - 1); // '1'..'5' -> tower index 0..4
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [select]);

  return (
    <div
      role="toolbar"
      aria-label="Tower palette"
      style={{
        display: "flex",
        gap: "0.5rem",
        flexWrap: "wrap",
        justifyContent: "center",
        padding: "0.625rem",
        background: "rgba(15,15,21,0.85)",
        border: "1px solid #1F1F2E",
        borderRadius: 10,
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        pointerEvents: "auto",
      }}
    >
      {TOWERS.map((tower, i) => {
        const affordable = bank >= tower.cost;
        const selected = i === selectedType;
        return (
          <button
            key={tower.name}
            type="button"
            aria-pressed={selected}
            aria-label={`${tower.name} tower — ${formatCost(tower.cost)} gold, targets ${formatTargets(tower.targets)}`}
            disabled={!affordable}
            onClick={() => select(i)}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-start",
              gap: 2,
              minWidth: 68,
              minHeight: 44, // tap target
              padding: "0.375rem 0.5rem",
              borderRadius: 8,
              border: selected ? "1px solid #FF3B2F" : "1px solid #1F1F2E",
              background: selected ? "rgba(255,59,47,0.09)" : "#16161F",
              color: "#F0F2F8",
              opacity: affordable ? 1 : 0.4,
              cursor: affordable ? "pointer" : "not-allowed",
              fontFamily: "var(--font-body-var,'Outfit'),sans-serif",
            }}
          >
            <span
              style={{
                fontFamily: "var(--font-mono-var,'JetBrains Mono'),monospace",
                fontSize: "0.625rem",
                letterSpacing: "0.04em",
                color: "#787F96",
              }}
            >
              {i + 1} · {formatTargets(tower.targets)}
            </span>
            <span style={{ fontWeight: 600, fontSize: "0.8125rem" }}>{tower.name}</span>
            <span
              style={{
                fontFamily: "var(--font-mono-var,'JetBrains Mono'),monospace",
                fontSize: "0.75rem",
                color: selected ? "#FF3B2F" : "#787F96",
              }}
            >
              {formatCost(tower.cost)}g
            </span>
          </button>
        );
      })}
    </div>
  );
}
