// src/game/runtime/render/transform.test.ts
import { describe, it, expect } from "vitest";
import { computeFit, screenToWorld, worldToClip, type Fit } from "./transform";
import { STAGE_W, STAGE_H } from "@/game/titles/circle-td/content";

// The old Canvas2D screenToWorld formula, inlined verbatim, so this test
// pins the shared implementation to byte-identical behaviour forever.
function oldCanvas2dScreenToWorld(
  clientX: number, clientY: number, canvas: HTMLCanvasElement, t: Fit
): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  const { scale, offsetX, offsetY } = t;
  if (scale <= 0 || rect.width <= 0 || rect.height <= 0) return { x: 0, y: 0 };
  const deviceX = (clientX - rect.left) * (canvas.width / rect.width);
  const deviceY = (clientY - rect.top) * (canvas.height / rect.height);
  return { x: (deviceX - offsetX) / scale, y: (deviceY - offsetY) / scale };
}

function fakeCanvas(bw: number, bh: number, rect: { left: number; top: number; width: number; height: number }): HTMLCanvasElement {
  return {
    width: bw, height: bh,
    getBoundingClientRect: () => ({ ...rect, right: rect.left + rect.width, bottom: rect.top + rect.height, x: rect.left, y: rect.top, toJSON() {} }),
  } as unknown as HTMLCanvasElement;
}

// Column-major mat4 * (x,y,0,1) -> (clipX, clipY)
function mul(m: Float32Array, x: number, y: number): { x: number; y: number } {
  return { x: m[0] * x + m[4] * y + m[12], y: m[1] * x + m[5] * y + m[13] };
}

describe("computeFit", () => {
  it("scales 2x with no letterbox when the box is exactly 2x the stage", () => {
    const f = computeFit(STAGE_W * 2, STAGE_H * 2, STAGE_W, STAGE_H);
    expect(f.scale).toBeCloseTo(2);
    expect(f.offsetX).toBeCloseTo(0);
    expect(f.offsetY).toBeCloseTo(0);
  });
  it("letterboxes on the constrained axis and centers", () => {
    // Very wide box: height constrains -> vertical fit, horizontal bars.
    const f = computeFit(STAGE_W * 4, STAGE_H * 2, STAGE_W, STAGE_H);
    expect(f.scale).toBeCloseTo(2); // min(4,2) = 2
    expect(f.offsetX).toBeGreaterThan(0);
    expect(f.offsetY).toBeCloseTo(0);
  });
  it("returns scale 1 for a zero-size box", () => {
    expect(computeFit(0, 0, STAGE_W, STAGE_H).scale).toBe(1);
  });
  it("fits any title's stage, not just Circle TD's (Arcfire's 1200×500)", () => {
    const f = computeFit(2400, 1200, 1200, 500);
    expect(f.scale).toBeCloseTo(2); // min(2400/1200, 1200/500) = min(2, 2.4)
    expect(f.offsetX).toBeCloseTo(0);
    expect(f.offsetY).toBeCloseTo(100); // (1200 − 500×2) / 2
  });
});

describe("screenToWorld matches the old Canvas2D formula exactly", () => {
  it("agrees on a letterboxed, dpr-stretched canvas", () => {
    const fit = computeFit(1680, 1360, STAGE_W, STAGE_H);
    const canvas = fakeCanvas(1680, 1360, { left: 10, top: 20, width: 840, height: 680 });
    for (const [cx, cy] of [[10, 20], [430, 360], [850, 700]] as const) {
      const got = screenToWorld(cx, cy, canvas, fit);
      const want = oldCanvas2dScreenToWorld(cx, cy, canvas, fit);
      expect(got.x).toBeCloseTo(want.x, 9);
      expect(got.y).toBeCloseTo(want.y, 9);
    }
  });
  it("returns (0,0) on a degenerate transform", () => {
    const canvas = fakeCanvas(0, 0, { left: 0, top: 0, width: 0, height: 0 });
    expect(screenToWorld(5, 5, canvas, { scale: 0, offsetX: 0, offsetY: 0 })).toEqual({ x: 0, y: 0 });
  });
});

describe("worldToClip", () => {
  it("maps stage corners into clip with a Y flip", () => {
    const fit = computeFit(STAGE_W * 2, STAGE_H * 2, STAGE_W, STAGE_H); // scale 2, no offset
    const m = worldToClip(fit, STAGE_W * 2, STAGE_H * 2);
    const tl = mul(m, 0, 0);
    const br = mul(m, STAGE_W, STAGE_H);
    expect(tl.x).toBeCloseTo(-1); expect(tl.y).toBeCloseTo(1);   // top-left -> clip (-1, +1)
    expect(br.x).toBeCloseTo(1);  expect(br.y).toBeCloseTo(-1);  // bottom-right -> clip (+1, -1)
  });
  it("keeps the fitted stage centered under letterboxing", () => {
    const fit = computeFit(STAGE_W * 4, STAGE_H * 2, STAGE_W, STAGE_H);
    const m = worldToClip(fit, STAGE_W * 4, STAGE_H * 2);
    const center = mul(m, STAGE_W / 2, STAGE_H / 2);
    expect(center.x).toBeCloseTo(0);
    expect(center.y).toBeCloseTo(0);
  });
});
