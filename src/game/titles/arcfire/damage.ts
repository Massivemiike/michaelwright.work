// src/game/titles/arcfire/damage.ts
//
// Blast damage to one tank (spec §3.3), integer-only. Distance runs from the
// blast centre to the EDGE of the tank's hitbox circle (0 if they overlap), so
// a blast that swallows the hitbox deals full damage.
import type { Blast } from "./weapons/types";
import { isqrt } from "./imath";
import { TANK_HIT_R } from "./constants";

export function blastDamage(blast: Blast, bx: number, by: number, tx: number, ty: number): number {
  const dx = bx - tx;
  const dy = by - ty;
  const centre = isqrt(dx * dx + dy * dy);
  const d = centre > TANK_HIT_R ? centre - TANK_HIT_R : 0;
  const r = blast.radius;
  if (d >= r) return 0;
  if (blast.falloff === "quadratic") return Math.trunc((blast.damage * (r * r - d * d)) / (r * r));
  return Math.trunc((blast.damage * (r - d)) / r);
}
