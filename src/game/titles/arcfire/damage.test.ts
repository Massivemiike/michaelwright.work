import { describe, it, expect } from "vitest";
import { blastDamage } from "./damage";
import { TANK_HIT_R } from "./constants";
import { ROSTER } from "./weapons/roster";
import type { Blast } from "./weapons/types";

/** The exact damage in BigInt: the largest n with n <= the real formula, by bisection. (BigInt(...) calls: the repo targets ES2017, which has no 0n literals.) */
function reference(b: Blast, dx: number, dy: number): number {
  const q = BigInt(dx * dx + dy * dy);
  const R = BigInt(b.radius);
  const D = BigInt(b.damage);
  const H = BigInt(TANK_HIT_R);
  const zero = BigInt(0);
  if (q >= (R + H) * (R + H)) return 0;
  if (q <= H * H) return b.damage;
  const ok = (n: bigint): boolean => {
    if (b.falloff === "quadratic") { // n·R^2 <= D(R^2 - q - 196) + 28·D·s
      const need = n * R * R - D * (R * R - q - H * H);
      return need <= zero || BigInt(784) * D * D * q >= need * need;
    }
    const room = D * (R + H) - n * R; // n·R <= D(R + 14) - D·s
    return room >= zero && D * D * q <= room * room;
  };
  let lo = zero;
  let hi = D;
  while (lo < hi) {
    const mid = (lo + hi + BigInt(1)) / BigInt(2);
    if (ok(mid)) lo = mid;
    else hi = mid - BigInt(1);
  }
  return Number(lo);
}

/** Plan 1's floored-distance formula, for comparison. */
function floored(b: Blast, dx: number, dy: number): number {
  const c = Math.floor(Math.sqrt(dx * dx + dy * dy));
  const d = c > TANK_HIT_R ? c - TANK_HIT_R : 0;
  const r = b.radius;
  if (d >= r) return 0;
  return b.falloff === "quadratic" ? Math.trunc((b.damage * (r * r - d * d)) / (r * r)) : Math.trunc((b.damage * (r - d)) / r);
}

function rosterBlasts(): Blast[] {
  const out: Blast[] = [];
  const walk = (v: unknown): void => {
    if (!v || typeof v !== "object") return;
    const o = v as Record<string, unknown>;
    if (typeof o.radius === "number" && typeof o.damage === "number" && !("kind" in o)) out.push(o as unknown as Blast);
    for (const x of Object.values(o)) walk(x);
  };
  walk(ROSTER);
  return out;
}

describe("blastDamage", () => {
  const pulse = { radius: 28, damage: 40 };
  it("deals full damage when the blast overlaps the hitbox", () => {
    expect(blastDamage(pulse, 100, 100, 100, 100)).toBe(40);
    expect(blastDamage(pulse, 100, 100, 100 + TANK_HIT_R, 100)).toBe(40);
  });
  it("falls off linearly from the hitbox edge out to the blast radius", () => {
    expect(blastDamage(pulse, 100, 100, 100 + TANK_HIT_R + 14, 100)).toBe(20);
    expect(blastDamage(pulse, 100, 100, 100 + TANK_HIT_R + 28, 100)).toBe(0);
    expect(blastDamage(pulse, 100, 100, 100 + TANK_HIT_R + 100, 100)).toBe(0);
  });
  it("uses the quadratic curve when asked", () => {
    const needle = { radius: 10, damage: 110, falloff: "quadratic" as const };
    expect(blastDamage(needle, 0, 0, TANK_HIT_R + 5, 0)).toBe(82); // 110 × (100 − 25) / 100 = 82.5
  });
  it("measures true (euclidean) distance", () => {
    expect(blastDamage(pulse, 0, 0, 12, 16)).toBe(blastDamage(pulse, 0, 0, 20, 0));
    expect(blastDamage(pulse, 0, 0, 20, 0)).toBe(31); // d = 6 → 40 × 22 / 28 = 31.4
  });
  it("is exact at non-integer distances (Plan 1's floored distance overstated these)", () => {
    const needle = { radius: 10, damage: 110, falloff: "quadratic" as const };
    expect(blastDamage(needle, 0, 0, 21, 9)).toBe(23); // floored: 39
    expect(blastDamage(needle, 0, 0, 19, 5)).toBe(74); // floored: 82
    expect(blastDamage(pulse, 0, 0, 20, 5)).toBe(30); // floored: 31
  });
  it("equals a BigInt reference for every roster blast over its whole reach, and never exceeds the floored value", () => {
    let samples = 0;
    for (const b of rosterBlasts()) {
      const k = b.radius + TANK_HIT_R + 1;
      for (let dx = 0; dx <= k; dx++) {
        for (let dy = 0; dy <= k; dy++) {
          const got = blastDamage(b, 0, 0, dx, dy);
          expect(got).toBe(reference(b, dx, dy));
          expect(got).toBeLessThanOrEqual(floored(b, dx, dy));
          samples++;
        }
      }
    }
    expect(samples).toBeGreaterThan(20000); // 28,780 with Plan 1's eight weapons, 81,276 with all 32
  });
  it("deals nothing for a non-positive radius or damage (the divisor guard)", () => {
    expect(blastDamage({ radius: 0, damage: 40 }, 0, 0, 0, 0)).toBe(0);
    expect(blastDamage({ radius: 28, damage: 0 }, 0, 0, 0, 0)).toBe(0);
  });
});
