"use client";
// src/components/game/SelectedTowerPanel.tsx
//
// Upgrade/sell controls for whichever placed tower is currently selected
// (Task 7, Plan 2) — level/damage/range readout plus an Upgrade button
// (shows the next level's cost, disabled at the level cap or when
// unaffordable) and a Sell button (shows the refund). `tile === -1` means
// nothing is selected; the component renders nothing in that case — every
// hook above still runs unconditionally either way, per the Rules of
// Hooks; only the returned JSX is conditional.
//
// Damage/range/upgrade-cost/refund are all recomputed here from the SAME
// formulas the sim itself uses (rules.ts's towerDamage; content.ts's
// range0/rangeStep and SELL_REFUND_PCT; replay.ts's upgradeCost and
// totalInvested) rather than reimplemented — this is DISPLAY ONLY, so a
// bug here could show a wrong number but could never charge or refund a
// wrong amount: the actual mutation goes through inputModel.upgrade/sell
// -> applyCommand, the exact path Plan 3's replay verifier calls.
import { useCallback, useEffect } from "react";
import { TOWERS, SELL_REFUND_PCT } from "@/game/titles/circle-td/content";
import { towerDamage } from "@/game/titles/circle-td/rules";
import { totalInvested, upgradeCost } from "@/game/sim/replay";
import { toFloat } from "@/game/sim/math/fixed";
import { formatCost, formatDamage, formatRange, formatRefund, formatTargets } from "@/game/runtime/hud/format";

// Mirrors replay.ts's applyCommand "upgrade" branch (`if (level >= 9)
// return;`) — level is 0-indexed there, so 9 is the first no-op level.
export const MAX_TOWER_LEVEL = 9;

// Narrow structural interface — a test can pass
// `{ upgrade: vi.fn(), sell: vi.fn() }` without a real sim/InputModel.
export interface SelectedTowerPanelInputModel {
  upgrade(tile: number): void;
  sell(tile: number): void;
}

export interface SelectedTowerPanelProps {
  /** Selected tile index, or -1 for "nothing selected" (renders nothing). */
  tile: number;
  type: number;
  level: number;
  bank: number;
  inputModel: SelectedTowerPanelInputModel;
}

export default function SelectedTowerPanel({ tile, type, level, bank, inputModel }: SelectedTowerPanelProps) {
  const doUpgrade = useCallback(() => {
    if (tile === -1) return;
    inputModel.upgrade(tile);
  }, [tile, inputModel]);

  const doSell = useCallback(() => {
    if (tile === -1) return;
    inputModel.sell(tile);
  }, [tile, inputModel]);

  useEffect(() => {
    if (tile === -1) return;
    const onKeyDown = (e: KeyboardEvent): void => {
      switch (e.key.toLowerCase()) {
        case "u":
          doUpgrade();
          return;
        case "s":
          doSell();
          return;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [tile, doUpgrade, doSell]);

  if (tile === -1) return null;

  const def = TOWERS[type];
  const damage = towerDamage(type, level);
  const range = toFloat(def.range0 + level * def.rangeStep);
  const maxed = level >= MAX_TOWER_LEVEL;
  const nextCost = maxed ? null : upgradeCost(def.cost, level);
  const canUpgrade = !maxed && nextCost !== null && bank >= nextCost;
  const refund = Math.floor((totalInvested(type, level) * SELL_REFUND_PCT) / 100);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "0.5rem",
        padding: "0.75rem",
        minWidth: 200,
        background: "rgba(15,15,21,0.85)",
        border: "1px solid #1F1F2E",
        borderRadius: 10,
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        pointerEvents: "auto",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span
          style={{
            fontFamily: "var(--font-display-var,'Syne'),sans-serif",
            fontWeight: 700,
            fontSize: "0.9375rem",
            color: "#F0F2F8",
          }}
        >
          {def.name}
        </span>
        <span
          style={{
            fontFamily: "var(--font-mono-var,'JetBrains Mono'),monospace",
            fontSize: "0.6875rem",
            color: "#787F96",
          }}
        >
          Lv {level + 1}
        </span>
      </div>
      <div
        style={{
          display: "flex",
          gap: "1rem",
          fontFamily: "var(--font-mono-var,'JetBrains Mono'),monospace",
          fontSize: "0.75rem",
          color: "#787F96",
        }}
      >
        <span>DMG {formatDamage(damage)}</span>
        <span>RNG {formatRange(range)}</span>
        <span>{formatTargets(def.targets)}</span>
      </div>
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <button
          type="button"
          onClick={doUpgrade}
          disabled={!canUpgrade}
          style={{
            flex: 1,
            minHeight: 44,
            borderRadius: 8,
            border: "1px solid #1F1F2E",
            background: canUpgrade ? "rgba(255,59,47,0.09)" : "#16161F",
            color: canUpgrade ? "#FF3B2F" : "#3C3F52",
            cursor: canUpgrade ? "pointer" : "not-allowed",
            fontWeight: 600,
            fontSize: "0.8125rem",
          }}
        >
          {maxed ? "Max level" : `Upgrade (U) · ${formatCost(nextCost!)}g`}
        </button>
        <button
          type="button"
          onClick={doSell}
          style={{
            flex: 1,
            minHeight: 44,
            borderRadius: 8,
            border: "1px solid #1F1F2E",
            background: "#16161F",
            color: "#F0F2F8",
            cursor: "pointer",
            fontWeight: 600,
            fontSize: "0.8125rem",
          }}
        >
          Sell (S) · {formatRefund(refund)}g
        </button>
      </div>
    </div>
  );
}
