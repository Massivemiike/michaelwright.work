// src/game/runtime/render/Renderer.test.ts
import { describe, it, expect } from "vitest";
import { makeRenderSnapshot, type RenderSnapshot } from "@/game/sim/engine";
import { interpolateById } from "./Renderer";

// Hand-built snapshot fixture: only the creep-related fields matter for
// interpolateById, but makeRenderSnapshot gives us correctly-typed arrays
// (Float32Array/Int32Array) matching production shape rather than plain
// number[] stand-ins.
function snap(ids: number[], xy: number[], hp01: number[], flags: number[]): RenderSnapshot {
  const s = makeRenderSnapshot(ids.length, 0);
  s.creepId.set(ids);
  s.creepXY.set(xy);
  s.creepHp01.set(hp01);
  s.creepFlags.set(flags);
  return s;
}

describe("interpolateById", () => {
  it("lerps x/y halfway at alpha=0.5 for an id present in both snapshots", () => {
    const prev = snap([7], [0, 0], [1], [0]);
    const curr = snap([7], [10, 20], [1], [0]);
    const [c] = interpolateById(prev, curr, 0.5);
    expect(c.id).toBe(7);
    expect(c.x).toBeCloseTo(5);
    expect(c.y).toBeCloseTo(10);
  });

  it("matches creeps by id, not by array index", () => {
    // prev lists id 9 before id 5 — the opposite order from curr — so a
    // by-index (rather than by-id) lookup would lerp each creep against the
    // wrong counterpart.
    const prev = snap([9, 5], [100, 100, 0, 0], [1, 1], [0, 0]);
    const curr = snap([5, 9], [10, 20, 200, 200], [1, 1], [0, 0]);
    const result = interpolateById(prev, curr, 0.5);
    const byId = new Map(result.map((c) => [c.id, c]));
    expect(byId.get(5)!.x).toBeCloseTo(5); // lerp(0, 10, 0.5)
    expect(byId.get(5)!.y).toBeCloseTo(10); // lerp(0, 20, 0.5)
    expect(byId.get(9)!.x).toBeCloseTo(150); // lerp(100, 200, 0.5)
    expect(byId.get(9)!.y).toBeCloseTo(150); // lerp(100, 200, 0.5)
  });

  it("uses curr's own position verbatim for an id absent from prev (spawned this frame)", () => {
    const prev = snap([1], [999, 999], [1], [0]);
    const curr = snap([1, 2], [999, 999, 50, 60], [1, 0.4], [0, 3]);
    const result = interpolateById(prev, curr, 0.5);
    const spawned = result.find((c) => c.id === 2)!;
    expect(spawned.x).toBe(50);
    expect(spawned.y).toBe(60);
  });

  it("reads hp01/flags from curr only — never lerped, never from prev", () => {
    const prev = snap([4], [0, 0], [1], [0]);
    const curr = snap([4], [10, 10], [0.25], [6]);
    const [c] = interpolateById(prev, curr, 0.5);
    expect(c.hp01).toBe(0.25);
    expect(c.flags).toBe(6);
  });

  it("orders and sizes output by curr's creep list, not prev's", () => {
    const prev = snap([1, 2, 3], [0, 0, 0, 0, 0, 0], [1, 1, 1], [0, 0, 0]);
    const curr = snap([3, 1], [1, 1, 2, 2], [1, 1], [0, 0]);
    const result = interpolateById(prev, curr, 0);
    expect(result.length).toBe(2);
    expect(result.map((c) => c.id)).toEqual([3, 1]);
  });
});
