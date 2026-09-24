// src/game/titles/arcfire/damage.ts
//
// Blast damage to one tank (spec §3.3), integer-only and EXACT. With s the
// true (real) distance from the blast centre to the tank's hitbox centre and
// d = max(0, s - TANK_HIT_R) the distance to the hitbox edge:
//   linear     floor(D * (R - d) / R)
//   quadratic  floor(D * (R^2 - d^2) / R^2)
// for d < R, else 0. s is irrational in general, so each formula is split
// into an integer part plus one isqrt term. Flooring that term first is exact:
// for an integer a, a real u in [a, a + 1) and an integer m >= 1,
// floor(u / m) = floor(a / m), because no multiple of m lies inside (a, a + 1).
import type { Blast } from "./weapons/types";
import { isqrt } from "./imath";
import { TANK_HIT_R } from "./constants";

export function blastDamage(blast: Blast, bx: number, by: number, tx: number, ty: number): number {
  const r = blast.radius;
  const D = blast.damage;
  if (r <= 0 || D <= 0) return 0; // divisor guard: bad data deals nothing (the roster validator rejects it)
  const dx = bx - tx;
  const dy = by - ty;
  const q = dx * dx + dy * dy; // s^2
  const k = r + TANK_HIT_R;
  if (q >= k * k) return 0; // d >= R
  if (q <= TANK_HIT_R * TANK_HIT_R) return D; // the blast centre is inside the hitbox: d = 0
  if (blast.falloff === "quadratic") {
    // D(R^2 - d^2) = D(R^2 - q - 196) + 28·D·s, and floor(28·D·s) = isqrt(784·D^2·q)
    const a = D * (r * r - q - TANK_HIT_R * TANK_HIT_R);
    return Math.floor((a + isqrt(4 * TANK_HIT_R * TANK_HIT_R * D * D * q)) / (r * r));
  }
  // D(R - d) = D·k - D·s, and ceil(D·s) = ceil(sqrt(D^2·q))
  const d2q = D * D * q;
  const fs = isqrt(d2q);
  return Math.floor((D * k - (fs * fs === d2q ? fs : fs + 1)) / r);
}
