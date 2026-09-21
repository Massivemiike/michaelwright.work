// src/game/runtime/render/particles.test.ts
import { describe, it, expect } from "vitest";
import {
  spawnDeathBurst, spawnMuzzle, advanceParticles, particleDraw, type Particle,
} from "./particles";

function makeParticle(over: Partial<Particle> = {}): Particle {
  return {
    x: 0, y: 0, vx: 0, vy: 0,
    ageMs: 0, lifeMs: 1000,
    size0: 4, size1: 20,
    rot: 0, spin: 0,
    alpha0: 1,
    frame: "fx-glow", tint: "core",
    ...over,
  };
}

describe("spawnDeathBurst", () => {
  it("returns the expected mix: a glow, a big star, several sparks, and a smoke puff", () => {
    // Run several times so the random spark count (3-5) can't make a lucky
    // single draw pass by accident.
    for (let run = 0; run < 25; run++) {
      const ps = spawnDeathBurst(100, 200);

      // Every particle starts unaged, with a positive lifetime, at the origin.
      for (const p of ps) {
        expect(p.ageMs).toBe(0);
        expect(p.lifeMs).toBeGreaterThan(0);
        expect(p.x).toBe(100);
        expect(p.y).toBe(200);
      }

      expect(ps.some((p) => p.frame === "fx-glow")).toBe(true);
      expect(ps.some((p) => p.frame === "fx-star")).toBe(true);
      expect(ps.filter((p) => p.frame === "fx-smoke").length).toBe(1);

      // 3-5 outward sparks (tint "spark"), each actually moving outward.
      const sparks = ps.filter((p) => p.tint === "spark" && (p.vx !== 0 || p.vy !== 0));
      expect(sparks.length).toBeGreaterThanOrEqual(3);
      expect(sparks.length).toBeLessThanOrEqual(5);
      for (const s of sparks) expect(Math.hypot(s.vx, s.vy)).toBeGreaterThan(0);

      // Total = 1 glow + 1 star + (3..5) sparks + 1 smoke.
      expect(ps.length).toBeGreaterThanOrEqual(6);
      expect(ps.length).toBeLessThanOrEqual(8);
    }
  });
});

describe("spawnMuzzle", () => {
  it("returns one short-lived fx-muzzle oriented to the given angle", () => {
    const ps = spawnMuzzle(50, 60, 1.25);
    expect(ps.length).toBe(1);
    const p = ps[0];
    expect(p.frame).toBe("fx-muzzle");
    expect(p.tint).toBe("muzzle");
    expect(p.rot).toBe(1.25);
    expect(p.x).toBe(50);
    expect(p.y).toBe(60);
    expect(p.ageMs).toBe(0);
    expect(p.lifeMs).toBeGreaterThan(0);
    expect(p.lifeMs).toBeLessThan(200); // "short life"
  });
});

describe("advanceParticles", () => {
  it("integrates linear motion, spin, and age by dt", () => {
    const p = makeParticle({ x: 10, y: 20, vx: 100, vy: -50, spin: 2, ageMs: 0, lifeMs: 5000 });
    const out = advanceParticles([p], 1000); // 1s
    expect(out.length).toBe(1);
    expect(out[0].x).toBeCloseTo(110); // +100 px/s * 1s
    expect(out[0].y).toBeCloseTo(-30); // -50 px/s * 1s
    expect(out[0].rot).toBeCloseTo(2); // +2 rad/s * 1s
    expect(out[0].ageMs).toBe(1000);
  });

  it("removes particles whose age has reached their lifetime", () => {
    const live = makeParticle({ lifeMs: 500, ageMs: 100 });
    const dying = makeParticle({ lifeMs: 500, ageMs: 450 });
    const out = advanceParticles([live, dying], 100); // both age +100
    // live -> 200 (< 500, kept); dying -> 550 (>= 500, dropped).
    expect(out.length).toBe(1);
    expect(out[0]).toBe(live);
    expect(out[0].ageMs).toBe(200);
  });

  it("treats a non-positive dt as no motion and no aging", () => {
    const p = makeParticle({ x: 5, vx: 100, ageMs: 10 });
    const out = advanceParticles([p], 0);
    expect(out[0].x).toBe(5);
    expect(out[0].ageMs).toBe(10);
    const out2 = advanceParticles([p], -50);
    expect(out2[0].x).toBe(5);
    expect(out2[0].ageMs).toBe(10);
  });
});

describe("particleDraw", () => {
  it("lerps size from size0 to size1 across the lifetime", () => {
    const p = makeParticle({ size0: 4, size1: 20 });
    expect(particleDraw(p, 0).size).toBeCloseTo(4);
    expect(particleDraw(p, 0.5).size).toBeCloseTo(12);
    expect(particleDraw(p, 1).size).toBeCloseTo(20);
  });

  it("fades alpha from alpha0 down to ~0 at the end, monotonically", () => {
    const p = makeParticle({ alpha0: 0.8 });
    expect(particleDraw(p, 0).alpha).toBeCloseTo(0.8);
    expect(particleDraw(p, 1).alpha).toBeCloseTo(0); // ~0 at end
    const mid = particleDraw(p, 0.5).alpha;
    expect(mid).toBeLessThan(0.8);
    expect(mid).toBeGreaterThan(0);
    // monotonic decreasing
    expect(particleDraw(p, 0.25).alpha).toBeGreaterThan(particleDraw(p, 0.75).alpha);
  });

  it("passes through the particle's current rotation and clamps t out of range", () => {
    const p = makeParticle({ rot: 1.5, size0: 4, size1: 20, alpha0: 1 });
    expect(particleDraw(p, 0.3).rot).toBe(1.5);
    // t clamped: <0 behaves as 0, >1 behaves as 1.
    expect(particleDraw(p, -1).size).toBeCloseTo(4);
    expect(particleDraw(p, 2).size).toBeCloseTo(20);
    expect(particleDraw(p, 2).alpha).toBeCloseTo(0);
  });
});
