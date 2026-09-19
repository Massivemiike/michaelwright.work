// src/game/titles/circle-td/content.ts
//
// Track and tile geometry (Task 2, Plan 2; re-geometried for final-review
// findings #4/#5, 2026-09-19; tiles replaced with an open-area grid,
// 2026-09-19 map fix): a real, deterministic board replacing Plan 1's
// placeholder rectangles (which were "the right shape and scale" but not a
// genuine connected path, and whose TILES were a uniform grid over the
// whole stage rather than buildable cells actually tied to the track). This
// is still not final-art geometry — Plan 2's renderer/playtesting may
// refine the exact layout further — but it is a genuine playable board:
// two independently closed rectangular loops (one per wave entrance,
// genuinely NESTED rather than interleaved — see the fix note further
// down) and a buildable-tile set covering every open (non-track) area of
// the board on a fixed 32px lattice — the faithful "open building ground"
// of the original game, not a thin strip flanking the path (that strip
// model left the inner-loop interior and the pinched left lane entirely
// unbuildable; see the tile section further down for the fix).
import type { Fx } from "@/game/sim/types";
import { fromInt, mul, div } from "@/game/sim/math/fixed";

export const TARGET_LAND = 1;
export const TARGET_AIR = 2;
export const TARGET_BOTH = 3;

export interface TowerDef {
  name: string; cost: number; targets: number; footprint: number;
  dmg0: number; dmgStep: number; range0: Fx; rangeStep: Fx;
  cooldownTicks: number;          // INVENTED
  slowPct: readonly number[];     // per-level table; [] = tower has no slow effect
  splashRadius0: Fx; splashStep: Fx;
}

const R = (px: number): Fx => fromInt(px);

// Damage/range curves SOURCED (spec §3.4). Cooldowns/splash radii INVENTED.
// `footprint` (multi-cell occupancy for Splash/Damage) is DEFERRED to a
// later task — every tower still occupies exactly the one tile it's
// placed on (see applyCommand in replay.ts); this file only generates
// single tile centres, no multi-cell reservation helper.
export const TOWERS: readonly TowerDef[] = [
  { name: "Fast",   cost: 50,  targets: TARGET_BOTH, footprint: 1,
    dmg0: 9,   dmgStep: 8,   range0: R(150), rangeStep: R(7),
    cooldownTicks: 6,  slowPct: [], splashRadius0: 0, splashStep: 0 },
  { name: "Air",    cost: 45,  targets: TARGET_AIR,  footprint: 1,
    dmg0: 18,  dmgStep: 16,  range0: R(180), rangeStep: R(9),
    cooldownTicks: 12, slowPct: [], splashRadius0: 0, splashStep: 0 },
  { name: "Slow",   cost: 45,  targets: TARGET_BOTH, footprint: 1,
    dmg0: 1,   dmgStep: 0,   range0: R(150), rangeStep: R(7),
    cooldownTicks: 15,
    // SOURCED per-level slow% (original game's exact sequence): +3 for the
    // first 7 steps, then +4, +4 — NOT a uniform step, so it can't be a
    // base+step pair. Must stay a literal table.
    slowPct: [60, 63, 66, 69, 72, 75, 78, 81, 85, 89],
    splashRadius0: 0, splashStep: 0 },
  { name: "Splash", cost: 125, targets: TARGET_LAND, footprint: 2,
    dmg0: 42,  dmgStep: 38,  range0: R(100), rangeStep: R(5),
    cooldownTicks: 30, slowPct: [], splashRadius0: R(40), splashStep: R(2) },
  { name: "Damage", cost: 260, targets: TARGET_LAND, footprint: 3,
    dmg0: 250, dmgStep: 227, range0: R(125), rangeStep: R(6),
    cooldownTicks: 60, slowPct: [], splashRadius0: 0, splashStep: 0 },
];

export const WAVE_SIZE = 30;             // SOURCED (15 per entrance × 2)
export const WAVE_INTERVAL_TICKS = 600;  // 20 s × 30 Hz  (interval SOURCED)
// START_BANK restored to the SOURCED 125 (was 250 INVENTED under Plan 1's
// placeholder geometry) — confirmed 2026-09-19 winnable-and-climbing on the
// real spiral geometry once paired with the by-maxHp bounty fix and
// GAMMA=5 (see balance.ts and docs/superpowers/2026-09-18-circle-td-balance-tuning.md
// "Real-geometry re-tune"). This resolves the Plan-2 P3 fidelity decision in
// favor of the faithful value — no INVENTED bank figure needed after all.
export const START_BANK = 125;           // SOURCED
export const ALIVE_CAP_NORMAL = 100;     // SOURCED
export const SELL_REFUND_PCT = 75;       // SOURCED

// --- Coordinate space ---
// Stage pixels, origin top-left, +x right, +y down. This is the shared
// space the sim, the (future) Canvas2D renderer, and input hit-testing all
// use — nothing here is normalized/relative.
export const STAGE_W = 840;
export const STAGE_H = 680;
export const TILE_SIZE = 32; // px — buildable-tile footprint, AND the pitch
                              // of the buildable-cell lattice (see the tile
                              // section below) — pointer.ts's hit-test radius
                              // (HALF_TILE = TILE_SIZE/2) depends on tile
                              // centres actually sitting on this lattice.

// --- Track: two nested rectangular loops ---
// Each poly is [x0,y0, x1,y1, ...] in Q16.16, implicitly closed
// (posAt/trackLength wrap the last point back to the first). Built by
// buildLoopPoints() below in plain stage-px integers, then scaled to Fx.
//
// EVERY segment — including the corridor that closes the loop — is
// strictly horizontal or vertical by construction, so segLen()'s Manhattan
// sum below is always exactly the Euclidean length.
//
// Final-review finding #5 fix (2026-09-19): the previous version of this
// file built each loop as a multi-ring inward spiral (successive rings
// inset from one another by a fixed amount), with OUTER's and INNER's
// bounds/insets picked independently of each other and of TRACK_WIDTH. On
// an 840x680 board that produced ring-to-ring gaps as small as 15-90px —
// well under TRACK_WIDTH (64px) — so consecutive rings' painted bands
// overlapped: OUTER self-crossed twice, INNER self-crossed once, and the
// two loops crossed each other four times, painting the board centre as
// one solid ~170px blob with no visible lanes and no room for build tiles.
// Two structural changes fix this:
//
//   1. Each loop is now a SINGLE rectangular ring (buildLoopPoints below),
//      not an inward multi-ring spiral — an 840x680 board isn't big enough
//      to fit a second inward ring on either loop while ALSO keeping the
//      required gap (point 2 below) to the other loop, so multi-ring
//      spiraling was the direct cause of the interleaving here, not an
//      incidental bug fixable by just widening the old insets.
//      A ring's fourth (left) edge is replaced by a corridor that detours
//      outside the rectangle — down past the bottom-left corner, left by
//      `margin`, up past the top-left corner, back to the start — so the
//      loop closes without retracing anything and never re-enters the
//      rectangle it just traced (no self-crossing).
//   2. OUTER's and INNER's bounds are chosen so the minimum distance
//      between ANY point of one loop and ANY point of the other — main
//      edges AND corridors, the actual measured gap, not just the nominal
//      rectangles — is >= TRACK_WIDTH + 2*TILE_SIZE (128px): enough for a
//      visible non-track lane plus a flanking build-tile row on each side
//      of the gap. The bounds below (OUTER (60,60)-(780,620), INNER
//      (210,210)-(630,450)) measure out to a uniform ~150px gap on every
//      side, comfortably clearing the 128px floor — checked directly in
//      content.test.ts (both the bounding-box nesting and the minimum
//      inter-loop distance). INNER sits entirely inside OUTER's one ring,
//      near the board's centre, with real clear space around it — that
//      centre region is exactly where build tiles now flank INNER's ring
//      from the inside (finding #5's "no build tiles in the centre").
//
// Each loop's corridor is routed through stage margin the OTHER loop never
// reaches (OUTER's corridor hugs the board's bottom-left corner; INNER's
// corridor stays inside the clear gap between the two rings), so neither
// corridor crosses the other loop, and (per point 1) never crosses its own
// ring either.
function buildLoopPoints(
  x0: number, y0: number, x1: number, y1: number, margin: number
): number[] {
  return [
    x0, y0,
    x1, y0,
    x1, y1,
    x0, y1,
    x0, y1 + margin,
    x0 - margin, y1 + margin,
    x0 - margin, y0,
    x0, y0, // == pts[0], pts[1] — zero-length wrap edge (trackLength/posAt's
            // own modulo wraparound only; segmentsOf below never walks this
            // last pair — see its `i < n - 1` loop bound).
  ];
}

const toFx = (pts: readonly number[]): Int32Array => {
  const out = new Int32Array(pts.length);
  for (let i = 0; i < pts.length; i++) out[i] = fromInt(pts[i]);
  return out;
};

// Two independently closed loops, one per wave entrance (same contract as
// Plan 1's TRACK.outer/TRACK.inner): OUTER is the larger lap near the
// board's edge; INNER nests entirely inside OUTER's ring, near the board's
// centre, with a real measured gap on every side (see the fix note above)
// — genuinely nested, not the previous version's overlapping rings.
const OUTER_BOUNDS = { x0: 60, y0: 60, x1: 780, y1: 620 } as const;
const INNER_BOUNDS = { x0: 210, y0: 210, x1: 630, y1: 450 } as const;
const OUTER_PTS = buildLoopPoints(OUTER_BOUNDS.x0, OUTER_BOUNDS.y0, OUTER_BOUNDS.x1, OUTER_BOUNDS.y1, 40);
const INNER_PTS = buildLoopPoints(INNER_BOUNDS.x0, INNER_BOUNDS.y0, INNER_BOUNDS.x1, INNER_BOUNDS.y1, 20);

export const TRACK = {
  outer: toFx(OUTER_PTS),
  inner: toFx(INNER_PTS),
};

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
  // Every segment is axis-aligned by construction, so Manhattan == Euclidean.
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

// --- Buildable tiles: open-area grid ---
// Map fix (2026-09-19): buildable tiles are now a deterministic grid of
// cells covering every OPEN area of the board — the interior of the inner
// loop, the gap between the two loops, and the outer margins — clearance-
// tested against both track loops, rather than the previous model's thin
// "flanking strips" generated only alongside the path (which left the
// inner-loop interior and the pinched left lane completely unbuildable).
// Candidate centres sit at (16 + TILE_SIZE*i, 16 + TILE_SIZE*j) for every
// i, j that keep the centre a full TILE_SIZE in from the stage edge — this
// offset means cell BOUNDARIES fall on exact multiples of TILE_SIZE, so the
// grid tiles the plane with no gaps or overlaps against pointer.ts's
// HALF_TILE=TILE_SIZE/2 hit-test radius. Generated deterministically in
// plain stage-px integers, then scaled to Fx.

type Seg = readonly [number, number, number, number];

function segmentsOf(pts: readonly number[]): Seg[] {
  const segs: Seg[] = [];
  const n = pts.length / 2;
  for (let i = 0; i < n - 1; i++) {
    const x0 = pts[i * 2], y0 = pts[i * 2 + 1];
    const x1 = pts[(i + 1) * 2], y1 = pts[(i + 1) * 2 + 1];
    if (x0 === x1 && y0 === y1) continue; // the zero-length wrap-closing edge
    segs.push([x0, y0, x1, y1]);
  }
  return segs;
}

// Squared distance from a point to an axis-aligned segment (every track
// segment is one or the other by construction).
const pointSegDistSq = (px: number, py: number, x0: number, y0: number, x1: number, y1: number): number => {
  if (y0 === y1) {
    const lo = Math.min(x0, x1), hi = Math.max(x0, x1);
    const cx = px < lo ? lo : px > hi ? hi : px;
    const dx = px - cx, dy = py - y0;
    return dx * dx + dy * dy;
  }
  const lo = Math.min(y0, y1), hi = Math.max(y0, y1);
  const cy = py < lo ? lo : py > hi ? hi : py;
  const dx = px - x0, dy = py - cy;
  return dx * dx + dy * dy;
};

const minDistSqToTracks = (px: number, py: number, segs: readonly Seg[]): number => {
  let best = Infinity;
  for (const [x0, y0, x1, y1] of segs) {
    const d = pointSegDistSq(px, py, x0, y0, x1, y1);
    if (d < best) best = d;
  }
  return best;
};

// Stroke width the renderer draws each track polyline at — exported so
// Canvas2DRenderer.ts imports this instead of keeping its own copy (the two
// values were only coupled by a comment before; final-review finding #5's
// nesting-gap sizing above depends on them actually matching, so now they
// also feed MIN_CLEARANCE below, so a buildable tile's near edge sits just
// clear of the drawn track edge, never on top of it).
export const TRACK_WIDTH = TILE_SIZE * 2;

// Minimum clearance a candidate's centre must keep from EVERY track segment
// (both loops) to avoid a drawn tile ever visually overlapping the
// TRACK_WIDTH-wide painted band: half the band's width, plus half a tile,
// so a tile's near edge sits ~TILE_SIZE/2 clear of the band's own edge —
// right beside the path (faithful) without ever painting on it. Exported
// so content.test.ts and the renderer can both reference the same value.
export const MIN_CLEARANCE = TRACK_WIDTH / 2 + TILE_SIZE / 2; // 32 + 16 = 48

// How far a candidate's lattice centre must sit in from the stage edge so
// its full footprint stays on-stage. One TILE_SIZE is enough (the brief
// calls this "fine") since the lattice offset (16 + TILE_SIZE*i) already
// keeps every centre off the literal edge.
const GRID_MARGIN = TILE_SIZE;

// The open-area grid: every lattice centre (16 + TILE_SIZE*i, 16 +
// TILE_SIZE*j) that stays GRID_MARGIN clear of the stage edge and
// MIN_CLEARANCE clear of every segment of both track loops. Pure function
// of the constants above — same output every call, no randomness, no
// external state.
function buildTiles(): number[] {
  const outerSegs = segmentsOf(OUTER_PTS);
  const innerSegs = segmentsOf(INNER_PTS);
  const allSegs = [...outerSegs, ...innerSegs];
  const minClearSq = MIN_CLEARANCE * MIN_CLEARANCE;
  const tiles: number[] = [];
  for (let y = 16; y <= STAGE_H; y += TILE_SIZE) {
    if (y < GRID_MARGIN || y > STAGE_H - GRID_MARGIN) continue; // stay on-stage
    for (let x = 16; x <= STAGE_W; x += TILE_SIZE) {
      if (x < GRID_MARGIN || x > STAGE_W - GRID_MARGIN) continue; // stay on-stage
      if (minDistSqToTracks(x, y, allSegs) < minClearSq) continue; // never on/under the track
      tiles.push(x, y);
    }
  }
  return tiles;
}

export const TILES = toFx(buildTiles());
export const TILE_COUNT = TILES.length / 2;
