// src/lib/leaderboard/blocklist.ts
//
// Server-side initials moderation. Identity is 3 arcade initials (no
// accounts/PII); this bounds the moderation surface to a small set of
// 3-letter combos. Extend as needed — data only, no secrets. Only imported
// by the verification route.
const BLOCKED = new Set<string>([
  "ASS", "FAG", "FUK", "FUC", "CUM", "COK", "COC", "DIC", "DIK",
  "NIG", "NGR", "SEX", "TIT", "JEW", "KKK", "GAY", "FUX", "PIS", "VAG",
]);

export function isBlockedInitials(initials: string): boolean {
  return BLOCKED.has(initials.toUpperCase());
}
