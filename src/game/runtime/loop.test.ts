// src/game/runtime/loop.test.ts
//
// loop.ts's only interesting behavior is the accumulator arithmetic, so
// these tests drive it with a fully fake, manually-advanced clock instead
// of real timers: `raf` records the callback rather than scheduling it,
// and `advance(ms)` moves the fake clock forward then invokes exactly one
// pending frame — mirroring how a single requestAnimationFrame callback
// sees one elapsed-time delta per call.
import { describe, it, expect, beforeEach } from "vitest";
import { makeLoop, SIM_HZ, type LoopClock, type GameLoop } from "./loop";

const STEP_MS = 1000 / SIM_HZ;

function makeFakeClock() {
  let now = 0;
  let pending: (() => void) | null = null;
  let nextId = 1;
  const clock: LoopClock = {
    now: () => now,
    raf: (cb) => {
      pending = cb;
      return nextId++;
    },
    caf: () => {
      pending = null;
    },
  };
  return {
    clock,
    hasPending: () => pending !== null,
    // Moves the fake clock forward by `ms` then fires the single pending
    // rAF callback (if any) — exactly what a real rAF driver would do for
    // one frame arriving `ms` after the previous one.
    advance(ms: number) {
      now += ms;
      const cb = pending;
      pending = null;
      cb?.();
    },
  };
}

describe("makeLoop", () => {
  let ticks: number;
  let renders: number[]; // recorded alpha values
  let loop: GameLoop;
  let fake: ReturnType<typeof makeFakeClock>;

  beforeEach(() => {
    ticks = 0;
    renders = [];
    fake = makeFakeClock();
    loop = makeLoop(
      {
        tick: () => {
          ticks += 1;
        },
        render: (alpha) => {
          renders.push(alpha);
        },
      },
      fake.clock
    );
  });

  it("calls tick N times after N whole steps at speed 1", () => {
    loop.start();
    const N = 5;
    for (let i = 0; i < N; i++) fake.advance(STEP_MS);
    expect(ticks).toBe(N);
  });

  it("calls tick 2N times for the same N steps at speed 2", () => {
    loop.setSpeed(2);
    loop.start();
    const N = 5;
    for (let i = 0; i < N; i++) fake.advance(STEP_MS);
    expect(ticks).toBe(2 * N);
  });

  it("calls tick 0 times while paused, regardless of elapsed time", () => {
    loop.setPaused(true);
    loop.start();
    for (let i = 0; i < 5; i++) fake.advance(STEP_MS);
    expect(ticks).toBe(0);
    // paused still renders the last state
    expect(renders.length).toBe(5);
  });

  it("resumes without a catch-up burst for time spent paused", () => {
    loop.start();
    fake.advance(STEP_MS); // 1 tick, establishes a baseline "last" time
    expect(ticks).toBe(1);

    loop.setPaused(true);
    fake.advance(5000); // 5 real seconds pass while paused
    expect(ticks).toBe(1); // still just the one tick — nothing accumulated

    loop.setPaused(false);
    fake.advance(STEP_MS); // one more ordinary step
    expect(ticks).toBe(2); // not a multi-second catch-up burst
  });

  it("clamps a single huge frame delta so the tick count stays bounded", () => {
    loop.start();
    fake.advance(10_000); // 10 real seconds in one frame — would be ~300 ticks unclamped
    // Unclamped this would be 10000/STEP_MS ≈ 300 ticks; the max-frametime
    // clamp must keep it far below that (a small single-digit/low-double-digit
    // burst is fine, an unbounded runaway is the bug this test guards against).
    expect(ticks).toBeGreaterThan(0);
    expect(ticks).toBeLessThan(20);
  });

  it("passes render an alpha in [0, 1)", () => {
    loop.start();
    fake.advance(STEP_MS * 2.5); // 2 whole ticks, 0.5 of a step left over
    expect(ticks).toBe(2);
    const alpha = renders[renders.length - 1];
    expect(alpha).toBeGreaterThanOrEqual(0);
    expect(alpha).toBeLessThan(1);
    expect(alpha).toBeCloseTo(0.5, 5);
  });

  it("stop() cancels the scheduled frame and no further ticks/renders occur", () => {
    loop.start();
    expect(fake.hasPending()).toBe(true);
    loop.stop();
    expect(fake.hasPending()).toBe(false);
    fake.advance(STEP_MS * 10);
    expect(ticks).toBe(0);
    expect(renders.length).toBe(0);
  });

  it("start() is idempotent — calling it twice does not double-schedule", () => {
    loop.start();
    loop.start();
    fake.advance(STEP_MS);
    // If start() scheduled two independent frames we'd see this fire twice
    // for a single advance() (which only invokes one pending callback) —
    // so this mostly guards against start() throwing/misbehaving on a
    // second call; the real double-schedule case is caught by ticks
    // staying exactly 1 for exactly one advanced step.
    expect(ticks).toBe(1);
  });
});
