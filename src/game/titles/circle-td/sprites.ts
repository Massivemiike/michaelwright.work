// src/game/titles/circle-td/sprites.ts
//
// Circle-TD's mapping from a sim unit to a sprite-atlas frame NAME. Frame
// names are the keys in public/games/circle-td/sprites/atlas.json; the
// renderer resolves a name to UVs (atlas.ts) and tints the sprite with the
// unit's existing palette color (red-family towers, blue-family creeps), so no
// color lives here. Pure: string/array/bitwise only — no banned tokens, so it
// passes the sim purity guard even though it sits under the guarded
// src/game/titles/circle-td root.
import { CREEP_AIR, CREEP_FAST, CREEP_HARD } from "@/game/titles/circle-td/state";

// TOWERS declaration order (content.ts): Fast, Air, Slow, Splash, Damage.
const TOWER_FRAMES = ["tower-fast", "tower-air", "tower-slow", "tower-splash", "tower-damage"] as const;

export function towerFrame(type: number): string {
  return TOWER_FRAMES[type] ?? TOWER_FRAMES[0];
}

// Creep look by modifier, checked most-distinctive first so a creep with
// multiple flags gets one stable frame (Air > Hard > Fast > normal).
export function creepFrame(flags: number): string {
  if ((flags & CREEP_AIR) !== 0) return "creep-air";
  if ((flags & CREEP_HARD) !== 0) return "creep-hard";
  if ((flags & CREEP_FAST) !== 0) return "creep-fast";
  return "creep-normal";
}
