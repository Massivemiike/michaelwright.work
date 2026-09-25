// src/game/titles/arcfire/quickReject.test.ts — Plan 2B T2: the exact quick-reject sweep against the per-sample reference
import { describe, it, expect } from "vitest";
import { makeRng, nextRange, type Rng } from "@/game/sim/math/rng";
import { fromInt } from "@/game/sim/math/fixed";
import { shellAt, stepShell, type HitCircle, type Shell } from "./ballistics";
import { addInterval, carveCircle, makeTerrain, removeInterval, spansFromHeight } from "./terrain";

const r = (rng: Rng, lo: number, hi: number): number => lo + nextRange(rng, hi - lo + 1);

const shellKey = (s: Shell): string =>
  [s.x, s.y, s.vx, s.vy, s.gravityStep, s.steps, s.alive, s.speed, s.apexed, s.stopAtApex, s.homeDeg, s.bounces, s.wallBounces, s.restitutionPct, s.ignore].join();

describe("the quick-reject sweep", () => {
  it("steps 20,000 random shells exactly like the per-sample sweep", () => {
    const rng = makeRng(2026);
    let t = makeTerrain();
    let steps = 0;
    const bad: string[] = [];
    for (let n = 0; n < 20000; n++) {
      if (n % 50 === 0) { // a fresh random terrain every 50 shells: hills, floor gaps, craters, floating dirt, tunnels
        t = makeTerrain();
        for (let x = 0; x < 1200; x++) t.height[x] = r(rng, 0, 9) === 0 ? 500 : r(rng, 60, 480);
        spansFromHeight(t);
        for (let k = r(rng, 0, 12); k > 0; k--) {
          const kind = r(rng, 0, 2);
          const cx = r(rng, 0, 1199);
          const cy = r(rng, 0, 499);
          if (kind === 0) carveCircle(t, cx, cy, r(rng, 3, 60));
          else if (kind === 1) for (let x = cx; x < Math.min(1200, cx + r(rng, 1, 40)); x++) addInterval(t, x, cy - r(rng, 1, 60), cy);
          else for (let x = cx; x < Math.min(1200, cx + r(rng, 1, 40)); x++) removeInterval(t, x, cy, cy + r(rng, 1, 30));
        }
      }
      const tanks: HitCircle[] = [{ x: r(rng, 0, 1199), y: r(rng, -20, 510) }, { x: r(rng, 0, 1199), y: r(rng, -20, 510) }];
      const s: Shell = shellAt(fromInt(r(rng, -8, 1207)) + r(rng, 0, 65535), fromInt(r(rng, -300, 520)), fromInt(r(rng, -1400, 1400)), fromInt(r(rng, -1400, 1400)), fromInt(r(rng, 0, 1400)), r(rng, 0, fromInt(12)));
      s.bounces = r(rng, 0, 3) === 0 ? r(rng, 1, 6) : 0;
      s.wallBounces = r(rng, 0, 3) === 0 ? r(rng, 1, 2) : 0;
      s.restitutionPct = r(rng, 40, 100);
      s.homeDeg = r(rng, 0, 3) === 0 ? r(rng, 1, 3) : 0;
      s.homeX = tanks[1].x;
      s.homeY = tanks[1].y;
      s.stopAtApex = r(rng, 0, 7) === 0;
      s.apexed = r(rng, 0, 1) === 0;
      s.ignore = r(rng, 0, 3);
      s.steps = r(rng, 0, 1199);
      const q = { ...s };
      const wind = fromInt(r(rng, -40, 40)) / 60 | 0;
      for (let step = 0; step < 1300 && s.alive; step++) {
        const a = JSON.stringify(stepShell(s, t, tanks, wind));
        const b = JSON.stringify(stepShell(q, t, tanks, wind, true));
        steps++;
        if (a !== b || shellKey(s) !== shellKey(q)) bad.push(`shell ${n} step ${step}: ${a} vs ${b}`);
      }
    }
    expect(bad.slice(0, 5)).toEqual([]);
    expect(steps).toBeGreaterThan(500000);
  }, 120_000);
});
