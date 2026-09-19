// src/game/runtime/hud/format.ts
//
// Pure display-formatting helpers for the HUD (Task 7, Plan 2). Every
// function here takes plain numbers already read off a RenderSnapshot (or
// a TowerDef from titles/circle-td/content) and returns a display string —
// no React, no DOM, no SimState. That's what makes this file unit-testable
// with plain `expect()` calls (format.test.ts) and safe to import from any
// HUD component without dragging browser globals into src/game/runtime.
//
// Deliberately does NOT include upgrade-cost/refund arithmetic — those are
// derived values (from replay.ts's upgradeCost/totalInvested and
// content.ts's SELL_REFUND_PCT), not string formatting, and live in
// SelectedTowerPanel.tsx next to the one place they're used, to avoid a
// second copy of an R11-governed formula drifting from replay.ts's own.
import { TARGET_AIR, TARGET_BOTH, TARGET_LAND } from "@/game/titles/circle-td/content";

// Locale-formatted non-negative-looking integer — the shared base every
// other formatter here builds on. `Math.round` guards against a stray
// float (e.g. a Fx value a caller forgot to fully reduce) landing a hair
// off a whole number; every real HUD quantity (bank/score/wave/cost/
// damage/range) is conceptually an integer already.
export const formatInt = (n: number): string => Math.round(n).toLocaleString("en-US");

export const formatGold = (bank: number): string => formatInt(Math.max(0, bank));

export const formatScore = (score: number): string => formatInt(Math.max(0, score));

// Pre-round (wave 0, before GO/the first tick — see GameClient's build-
// phase model) reads as an em dash rather than "0": there IS no wave yet,
// and printing "0" would read as "wave zero" mid-run instead of "not
// started."
export const formatWave = (wave: number): string => (wave > 0 ? formatInt(wave) : "—");

export const formatCreeps = (count: number, cap: number): string =>
  `${formatInt(count)}/${formatInt(cap)}`;

export const formatCost = (cost: number): string => formatInt(cost);

export const formatDamage = (dmg: number): string => formatInt(dmg);

// `range` is expected to already be a plain float — see SelectedTowerPanel,
// which converts the Fx range0/rangeStep sum via toFloat before calling
// this. This function itself stays Fx-agnostic.
export const formatRange = (range: number): string => formatInt(range);

export const formatRefund = (refund: number): string => `+${formatInt(refund)}`;

// TOWERS (content.ts) only ever uses TARGET_LAND=1/AIR=2/BOTH=3 — never 0 —
// so the default case is unreachable for any real tower but still returns
// something sane rather than "undefined" if it's ever called with a raw
// bitmask outside that closed set.
export const formatTargets = (targets: number): string => {
  switch (targets) {
    case TARGET_LAND:
      return "Land";
    case TARGET_AIR:
      return "Air";
    case TARGET_BOTH:
      return "Land/Air";
    default:
      return "—";
  }
};
