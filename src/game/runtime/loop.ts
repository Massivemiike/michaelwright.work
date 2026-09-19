// src/game/runtime/loop.ts
//
// Fixed-timestep accumulator driving the sim at a constant SIM_HZ,
// decoupled from however often the host actually delivers frames. This is
// the ONE place tick-rate policy (speed multiplier, pause, the
// spiral-of-death clamp) lives — the sim itself (src/game/sim +
// src/game/titles/circle-td) knows nothing about wall-clock time, `speed`,
// or pausing; it just has a `tick()` that advances exactly one fixed step.
//
// `now`/`raf`/`caf` are injected (LoopClock) rather than read from the
// global `performance`/`window` directly, so this file can be unit-tested
// with a fully deterministic fake clock (see loop.test.ts) instead of real
// timers. Production wiring (GameClient.tsx) passes thin wrappers around
// `performance.now`/`requestAnimationFrame`/`cancelAnimationFrame`.
//
// This file lives under src/game/runtime/** — outside the sim purity guard
// (src/game/sim/purity.test.ts only walks src/game/sim and
// src/game/titles/circle-td) — so nothing here needs the sim's
// deterministic-math discipline; it operates purely on wall-clock
// milliseconds, which are allowed to be as float-y and platform-dependent
// as any other rendering concern.

export const SIM_HZ = 30;

// One fixed sim step, in milliseconds.
const STEP_MS = 1000 / SIM_HZ;

// Caps how much wall-clock time a single frame can contribute to the
// accumulator, regardless of `speed`. Without this, a tab coming back from
// being backgrounded/throttled (or a slow frame after a GC pause) would
// hand the loop a multi-second `elapsed`, which would then try to run
// hundreds of catch-up ticks in one frame — the classic "spiral of death"
// where catching up takes longer than the time it's catching up for, so
// the backlog never shrinks. Clamping `elapsed` bounds the worst case to a
// small, fixed burst of ticks no matter how long the real gap was.
const MAX_FRAME_MS = 250;

// Repeatedly summing/subtracting a non-terminating binary fraction like
// STEP_MS (1000/30) drifts by a few ULPs after enough frames — e.g. after
// exactly 3 real steps' worth of elapsed time has accumulated, `acc` can
// land at 33.33333333333332 instead of 33.333333333333336, a hair under
// STEP_MS. Without this slack, `acc >= STEP_MS` reads false right at the
// boundary and silently drops a tick that should have fired, so ticks/sec
// would slowly fall behind real time over a long play session. 1e-9ms is
// many orders of magnitude smaller than any real frame delta (or even the
// smallest deltas these tests exercise), so it only ever papers over
// float noise, never masks a genuinely-short frame.
const EPSILON_MS = 1e-9;

export interface LoopCallbacks {
  /** Advance the sim exactly one fixed step. Called 0+ times per frame. */
  tick(): void;
  /**
   * Draw the current frame. `alpha` in [0, 1) is how far between the last
   * two ticks this frame falls (0 = right at the last tick, approaching 1
   * = right before the next one) — the renderer's interpolation factor.
   */
  render(alpha: number): void;
}

export interface LoopClock {
  /** Current time in milliseconds. Only ever used to compute deltas. */
  now(): number;
  /** Schedule `cb` to run for the next frame; returns a handle for `caf`. */
  raf(cb: () => void): number;
  /** Cancel a handle previously returned by `raf`. */
  caf(id: number): void;
}

export interface GameLoop {
  /** Begin scheduling frames. Safe to call again while already running (no-op). */
  start(): void;
  /** Stop scheduling frames and cancel any pending one. Idempotent. */
  stop(): void;
  /** Ticks-per-second multiplier (1/2/4 in practice; any positive number works). */
  setSpeed(s: number): void;
  /** While paused, no time accumulates and `tick` is never called; `render` still runs. */
  setPaused(p: boolean): void;
}

export function makeLoop(cb: LoopCallbacks, clock: LoopClock): GameLoop {
  let running = false;
  let paused = false;
  let speed = 1;
  let rafId: number | null = null;
  // Set by start() before the first frame() can possibly run, so frame()
  // never has to special-case "no previous frame yet" — the first delta is
  // measured against the real moment start() was called, not against
  // whenever the platform happens to deliver the first frame.
  let lastNow = 0;
  let acc = 0;

  function frame(): void {
    const now = clock.now();
    const elapsedRaw = now - lastNow;
    lastNow = now;

    if (!paused) {
      // Clamp to non-negative too, in case a (mis-)implemented clock ever
      // moves backward — treat that as "no time passed" rather than
      // subtracting from the accumulator.
      const elapsed = Math.min(Math.max(elapsedRaw, 0), MAX_FRAME_MS);
      acc += elapsed * speed;
      while (acc + EPSILON_MS >= STEP_MS) {
        cb.tick();
        acc -= STEP_MS;
      }
    }

    cb.render(acc / STEP_MS);
    rafId = clock.raf(frame);
  }

  return {
    start() {
      if (running) return;
      running = true;
      lastNow = clock.now();
      rafId = clock.raf(frame);
    },
    stop() {
      running = false;
      if (rafId !== null) {
        clock.caf(rafId);
        rafId = null;
      }
    },
    setSpeed(s: number) {
      // Guard against a negative/NaN multiplier turning the accumulator
      // negative (which would just stall ticks forever, not "run time
      // backwards," but there's no legitimate caller intent it could mean).
      speed = Number.isFinite(s) && s > 0 ? s : speed;
    },
    setPaused(p: boolean) {
      paused = p;
    },
  };
}
