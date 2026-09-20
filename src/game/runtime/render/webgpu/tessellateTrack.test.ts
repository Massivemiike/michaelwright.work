// src/game/runtime/render/webgpu/tessellateTrack.test.ts
import { describe, it, expect } from "vitest";
import { tessellateTrack } from "./tessellateTrack";

describe("tessellateTrack", () => {
  it("expands one horizontal segment into a width-wide band extended by half-width at both ends", () => {
    // segment (0,0)->(100,0), width 20 => hw 10; rect x in [-10,110], y in [-10,10]
    const v = tessellateTrack([0, 0, 100, 0], 20);
    expect(v.length).toBe(12); // 6 verts * (x,y) = 12 floats
    const xs = [v[0], v[2], v[4], v[6], v[8], v[10]];
    const ys = [v[1], v[3], v[5], v[7], v[9], v[11]];
    expect(Math.min(...xs)).toBeCloseTo(-10);
    expect(Math.max(...xs)).toBeCloseTo(110);
    expect(Math.min(...ys)).toBeCloseTo(-10);
    expect(Math.max(...ys)).toBeCloseTo(10);
  });

  it("skips a zero-length trailing segment (content.ts's wrap-closing duplicate point)", () => {
    // (0,0)->(50,0)->(50,0 duplicate): one real segment only.
    const v = tessellateTrack([0, 0, 50, 0, 50, 0], 8);
    expect(v.length).toBe(12); // still just one segment's 6 verts
  });

  it("emits two segments' worth of triangles for an L-shaped path", () => {
    const v = tessellateTrack([0, 0, 100, 0, 100, 100], 10);
    expect(v.length).toBe(24); // 2 segments * 12
  });
});
