// src/game/runtime/render/particles.ts
//
// Shared, pure particle-FX logic for BOTH renderer backends (WebGPU + Canvas2D).
// A particle is a short-lived, textured atlas quad (fx-glow / fx-star /
// fx-muzzle / fx-smoke) spawned on a creep death or a tower muzzle-flash and
// aged off wall-clock dt — purely cosmetic, never touching the sim.
//
// Lives under src/game/runtime/** => OUTSIDE the sim purity guard
// (src/game/sim/purity.test.ts only walks src/game/sim and
// src/game/titles/circle-td). So Math.* — including Math.random for spark
// spread/variation — is fair game here: particles are render-only decoration
// and are never read back into simulation state, so their randomness can never
// perturb the determinism golden hash (computed straight off SimState).
//
// This module is DOM-free and GPU-free: it produces/advances plain data and
// returns the per-frame draw params; each backend does the actual textured
// draw (WebGPU packs an instanced quad; Canvas2D blits a tinted frame with
// "lighter"). That keeps the tuning + integration unit-testable in node
// (see particles.test.ts).

// The four FX atlas frames (keys in public/games/circle-td/sprites/atlas.json).
// All white-ish art, tinted by multiply like the unit sprites, so a renderer
// maps `tint` (below) to a palette color.
export type ParticleFrame = "fx-glow" | "fx-star" | "fx-muzzle" | "fx-smoke";

// A renderer maps this to a concrete palette color:
//   core   -> accentHover / white-hot (the death flash center)
//   spark  -> textPrimary (white outward sparks)
//   smoke  -> a desaturated grey/blue puff
//   muzzle -> accentHover (the tower muzzle flame)
export type ParticleTint = "core" | "spark" | "smoke" | "muzzle";

export interface Particle {
  x: number;
  y: number;
  vx: number; // px/sec
  vy: number; // px/sec
  ageMs: number;
  lifeMs: number;
  size0: number; // half-size at birth (world px)
  size1: number; // half-size at death — lerped by age
  rot: number; // radians
  spin: number; // radians/sec
  alpha0: number; // starting alpha (fades to 0 by lifeMs)
  frame: ParticleFrame;
  tint: ParticleTint;
}

const TAU = Math.PI * 2;

// Uniform random in [lo, hi). Math.random is allowed here (render-only, see
// the file header) — the sim never observes any of this.
function rand(lo: number, hi: number): number {
  return lo + Math.random() * (hi - lo);
}

// A creep death: a soft glow + a bright star pop at the center, a handful of
// outward sparks, and one slow smoke puff drifting up. Tuned for a ~13px creep
// on a 32px-tile board (STAGE-scale world px).
export function spawnDeathBurst(x: number, y: number): Particle[] {
  const out: Particle[] = [];

  // Soft round glow — grows and fades, the "flash" body of the burst.
  out.push({
    x, y, vx: 0, vy: 0,
    ageMs: 0, lifeMs: 320,
    size0: 6, size1: 22,
    rot: rand(0, TAU), spin: 0,
    alpha0: 0.9,
    frame: "fx-glow", tint: "core",
  });

  // One big bright 4-point star sparkle over the glow.
  out.push({
    x, y, vx: 0, vy: 0,
    ageMs: 0, lifeMs: 280,
    size0: 10, size1: 26,
    rot: rand(0, TAU), spin: rand(-2, 2),
    alpha0: 1,
    frame: "fx-star", tint: "spark",
  });

  // 3-5 outward sparks (alternating star/glow), thrown radially and shrinking.
  const sparkCount = 3 + Math.floor(Math.random() * 3); // 3..5
  for (let i = 0; i < sparkCount; i++) {
    const ang = rand(0, TAU);
    const speed = rand(40, 110);
    const s0 = rand(3, 6);
    out.push({
      x, y,
      vx: Math.cos(ang) * speed,
      vy: Math.sin(ang) * speed,
      ageMs: 0, lifeMs: rand(360, 460),
      size0: s0, size1: s0 * 0.4,
      rot: ang, spin: rand(-6, 6),
      alpha0: 0.95,
      frame: i % 2 === 0 ? "fx-star" : "fx-glow",
      tint: "spark",
    });
  }

  // One slow smoke puff, drifting up and expanding, the lingering tail.
  out.push({
    x, y,
    vx: rand(-6, 6), vy: -18,
    ageMs: 0, lifeMs: 560,
    size0: 8, size1: 26,
    rot: rand(0, TAU), spin: rand(-1, 1),
    alpha0: 0.5,
    frame: "fx-smoke", tint: "smoke",
  });

  return out;
}

// A tower muzzle flash: one short-lived flame burst at the tower, oriented by
// `angleRad`. The fx-muzzle art points "up" (-y), so the caller passes the
// tower->creep angle + pi/2 (see the renderers) to aim the flame down the shot.
export function spawnMuzzle(x: number, y: number, angleRad: number): Particle[] {
  return [{
    x, y, vx: 0, vy: 0,
    ageMs: 0, lifeMs: 110,
    size0: 10, size1: 14,
    rot: angleRad, spin: 0,
    alpha0: 0.95,
    frame: "fx-muzzle", tint: "muzzle",
  }];
}

// Ages every particle by `dtMs`, integrating linear motion + spin, and returns
// only those still alive (ageMs < lifeMs). Mutates the passed particles in
// place (position/age/rot) — the renderer reassigns its list to the result, so
// expired particles are dropped. dtMs <= 0 is treated as 0 (no motion/aging),
// so a paused or first frame never rewinds or NaNs anything.
export function advanceParticles(list: Particle[], dtMs: number): Particle[] {
  const dt = dtMs > 0 ? dtMs : 0;
  const sec = dt / 1000;
  const alive: Particle[] = [];
  for (const p of list) {
    p.ageMs += dt;
    p.x += p.vx * sec;
    p.y += p.vy * sec;
    p.rot += p.spin * sec;
    if (p.ageMs < p.lifeMs) alive.push(p);
  }
  return alive;
}

// The shared per-frame draw params for one particle, given its normalized age
// tNorm (= ageMs / lifeMs, clamped to [0,1] here). size lerps size0->size1;
// alpha eases alpha0 -> ~0 with a soft (1 - t^2) curve (holds bright, then
// drops off at the end — reads better than a flat linear fade for glows); rot
// is the already-integrated rotation. Both backends feed this straight into
// their textured draw.
export function particleDraw(p: Particle, tNorm: number): { size: number; alpha: number; rot: number } {
  const t = tNorm < 0 ? 0 : tNorm > 1 ? 1 : tNorm;
  const size = p.size0 + (p.size1 - p.size0) * t;
  const alpha = p.alpha0 * (1 - t * t);
  return { size, alpha, rot: p.rot };
}
