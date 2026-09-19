// src/lib/dailySeed.ts
//
// Seed derivation for /games/circle-td's click-to-play gate
// (src/app/games/circle-td/PlayGate.tsx). Deliberately lives OUTSIDE
// src/game/** even though its output feeds `makeSim({ seed, mode })`
// there: PlayGate.tsx imports this module at module scope — i.e. it
// ships as part of the /games/circle-td page's INITIAL client bundle,
// before any click — and the whole point of the lazy boundary (see
// src/game/test/lazy-boundary.test.ts and
// docs/superpowers/specs/2026-09-18-circle-td-arcade-design.md §6.1) is
// that visiting the page and reading the poster never downloads a byte
// of the actual sim/renderer/HUD. Only clicking Play does, via the
// dynamic `import("./GameClient")` inside PlayGate.tsx. A ~30-line date
// hash living under src/game/ would defeat that even though it's tiny —
// so it lives here instead, and PlayGate.tsx has no static import of
// anything under @/game/** at all.
//
// Per docs/superpowers/specs/2026-09-18-circle-td-arcade-design.md §5.5:
// "seed = hash(UTC date string), computed identically on client and
// server, so no coordination or storage is required and no clock skew
// can desynchronise them." There is no server-side verification route
// yet to actually check that agreement against (that's Plan 3's
// replay-verified leaderboard) — the derivation is written to that
// contract now so it doesn't need to change when Plan 3 lands.

/**
 * Today's date as `YYYY-MM-DD`, always UTC regardless of the caller's
 * local timezone. `toISOString()` is always UTC, so slicing its date
 * portion needs no manual `getUTC*()` offset math.
 */
export function utcDateString(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/**
 * FNV-1a, 32-bit. Chosen for being simple to hand-verify and free of any
 * floating-point transcendental math — the same discipline
 * src/game/sim/** enforces for cross-engine determinism (see its purity
 * guard), even though this file isn't inside sim/ and isn't
 * purity-guarded, since it never runs inside a replay-verified tick.
 */
export function hashToSeed(input: string): number {
  let hash = 0x811c9dc5; // FNV offset basis
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193); // FNV prime
  }
  return hash | 0;
}

/**
 * Today's ranked seed (spec §5.6 "Daily run"). The same UTC calendar day
 * always yields the same seed, on any machine, with no network round
 * trip and no stored state.
 */
export function dailySeed(now: Date = new Date()): number {
  return hashToSeed(utcDateString(now));
}

/**
 * Free play (spec §5.6 "Free play") — unranked, so an ordinary
 * `Math.random()` here carries none of src/game/sim/**'s no-Math.random
 * obligation; that ban exists for replay-verifiable determinism, which
 * a free-play run never claims to have.
 */
export function randomSeed(): number {
  return (Math.random() * 0xffffffff) | 0;
}
