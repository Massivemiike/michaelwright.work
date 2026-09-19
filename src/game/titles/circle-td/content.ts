// src/game/titles/circle-td/content.ts
//
// Track and tile geometry below are placeholders with the right *shape and
// scale* for the sim to be exercised and balanced; Plan 2's renderer and
// playtesting will refine the exact layout. They are marked INVENTED and
// carry no claim to match the original pixel-for-pixel (spec §5.3).
import type { Fx } from "@/game/sim/types";
import { fromInt, mul, div } from "@/game/sim/math/fixed";

export const TARGET_LAND = 1;
export const TARGET_AIR = 2;
export const TARGET_BOTH = 3;

export interface TowerDef {
  name: string; cost: number; targets: number; footprint: number;
  dmg0: number; dmgStep: number; range0: Fx; rangeStep: Fx;
  cooldownTicks: number;          // INVENTED
  slowPct0: number; slowStep: number;
  splashRadius0: Fx; splashStep: Fx;
}

const R = (px: number): Fx => fromInt(px);

// Damage/range curves SOURCED (spec §3.4). Cooldowns/splash radii INVENTED.
export const TOWERS: readonly TowerDef[] = [
  { name: "Fast",   cost: 50,  targets: TARGET_BOTH, footprint: 1,
    dmg0: 9,   dmgStep: 8,   range0: R(150), rangeStep: R(7),
    cooldownTicks: 6,  slowPct0: 0, slowStep: 0, splashRadius0: 0, splashStep: 0 },
  { name: "Air",    cost: 45,  targets: TARGET_AIR,  footprint: 1,
    dmg0: 18,  dmgStep: 16,  range0: R(180), rangeStep: R(9),
    cooldownTicks: 12, slowPct0: 0, slowStep: 0, splashRadius0: 0, splashStep: 0 },
  { name: "Slow",   cost: 45,  targets: TARGET_BOTH, footprint: 1,
    dmg0: 1,   dmgStep: 0,   range0: R(150), rangeStep: R(7),
    cooldownTicks: 15, slowPct0: 60, slowStep: 3, splashRadius0: 0, splashStep: 0 },
  { name: "Splash", cost: 125, targets: TARGET_LAND, footprint: 2,
    dmg0: 42,  dmgStep: 38,  range0: R(100), rangeStep: R(5),
    cooldownTicks: 30, slowPct0: 0, slowStep: 0, splashRadius0: R(40), splashStep: R(2) },
  { name: "Damage", cost: 260, targets: TARGET_LAND, footprint: 3,
    dmg0: 250, dmgStep: 227, range0: R(125), rangeStep: R(6),
    cooldownTicks: 60, slowPct0: 0, slowStep: 0, splashRadius0: 0, splashStep: 0 },
];

export const WAVE_SIZE = 30;             // SOURCED (15 per entrance × 2)
export const WAVE_INTERVAL_TICKS = 600;  // 20 s × 30 Hz  (interval SOURCED)
export const START_BANK = 125;           // SOURCED
export const ALIVE_CAP_NORMAL = 100;     // SOURCED
export const SELL_REFUND_PCT = 75;       // SOURCED

// --- Track: closed square-spiral polylines (INVENTED geometry) ---
// Each poly is [x0,y0, x1,y1, ...] in Q16.16, implicitly closed (last→first).
// NOTE (Controller ruling R5): segLen below is Manhattan (|dx|+|dy|), and the
// ring-to-ring connectors are diagonal, so segLen is not Euclidean there.
// This is intentional for Plan 1 — trackLength and posAt both use the same
// segLen, so they stay mutually consistent and the wrap test passes. Do not
// switch this to Euclidean/sqrt; the real layout is refined in Plan 2.
export const TRACK = {
  outer: buildLoop(40, 40, 660, 500, 4),
  inner: buildLoop(180, 160, 520, 380, 2),
};

function buildLoop(x0: number, y0: number, x1: number, y1: number, rings: number): Int32Array {
  const pts: number[] = [];
  let ax = x0, ay = y0, bx = x1, by = y1;
  for (let ring = 0; ring < rings; ring++) {
    pts.push(fromInt(ax), fromInt(ay), fromInt(bx), fromInt(ay),
             fromInt(bx), fromInt(by), fromInt(ax), fromInt(by));
    ax += 30; ay += 30; bx -= 30; by -= 30; // spiral inward
  }
  return Int32Array.from(pts);
}

export const trackLength = (poly: Int32Array): Fx => {
  let len = 0;
  const n = poly.length / 2;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    len += segLen(poly[i * 2], poly[i * 2 + 1], poly[j * 2], poly[j * 2 + 1]);
  }
  return len;
};

const segLen = (x0: Fx, y0: Fx, x1: Fx, y1: Fx): Fx => {
  const dx = x1 - x0, dy = y1 - y0;
  // segments are axis-aligned by construction, so length = |dx|+|dy|
  return Math.abs(dx) + Math.abs(dy);
};

export const posAt = (poly: Int32Array, dist: Fx): { x: Fx; y: Fx } => {
  const total = trackLength(poly);
  let d = ((dist % total) + total) % total;
  const n = poly.length / 2;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const x0 = poly[i * 2], y0 = poly[i * 2 + 1];
    const x1 = poly[j * 2], y1 = poly[j * 2 + 1];
    const L = segLen(x0, y0, x1, y1);
    if (d <= L || i === n - 1) {
      const t = L === 0 ? 0 : div(d, L); // fraction along segment, Q16.16
      return { x: x0 + mul(x1 - x0, t), y: y0 + mul(y1 - y0, t) };
    }
    d -= L;
  }
  return { x: poly[0], y: poly[1] };
};

// Buildable tile centres — INVENTED layout, generated deterministically.
const tileList: number[] = [];
for (let gy = 60; gy < 480; gy += 24)
  for (let gx = 60; gx < 640; gx += 24) { tileList.push(fromInt(gx), fromInt(gy)); }
export const TILES = Int32Array.from(tileList);
export const TILE_COUNT = TILES.length / 2;
