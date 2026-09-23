// src/game/sim/hash.ts
//
// FNV-1a (32-bit) primitives shared by every title's state and command-log
// hashes. Pure integer ops only (|0, >>>, Math.imul), so a digest is
// bit-identical in every JS engine — the property the determinism goldens,
// the cross-engine gate, and leaderboard verification all depend on.

export const FNV_OFFSET = 0x811c9dc5;

/** Fold one 32-bit integer into the running hash, little-endian bytes. */
export function fnvFold(h: number, x: number): number {
  x = x | 0;
  for (let b = 0; b < 4; b++) {
    h ^= (x >>> (b * 8)) & 0xff;
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** The 8-char lowercase hex digest of a finished hash. */
export const fnvHex = (h: number): string => (h >>> 0).toString(16).padStart(8, "0");
