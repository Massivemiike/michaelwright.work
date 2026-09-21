import { describe, it, expect } from "vitest";
import { frameUv, hasFrame, type AtlasManifest } from "./atlas";

describe("frameUv", () => {
  it("normalizes a pixel rect to [0,1] UVs", () => {
    const uv = frameUv(256, 128, { x: 64, y: 32, w: 64, h: 32 });
    expect(uv.u0).toBeCloseTo(0.25);
    expect(uv.v0).toBeCloseTo(0.25);
    expect(uv.u1).toBeCloseTo(0.5);
    expect(uv.v1).toBeCloseTo(0.5);
  });
  it("maps a full-sheet frame to the unit square", () => {
    expect(frameUv(100, 100, { x: 0, y: 0, w: 100, h: 100 })).toEqual({ u0: 0, v0: 0, u1: 1, v1: 1 });
  });
  it("returns a zero rect for a degenerate atlas size (no NaN)", () => {
    const uv = frameUv(0, 0, { x: 0, y: 0, w: 10, h: 10 });
    expect(uv).toEqual({ u0: 0, v0: 0, u1: 0, v1: 0 });
    expect(Number.isNaN(uv.u1)).toBe(false);
  });
});

describe("hasFrame", () => {
  const m: AtlasManifest = { width: 64, height: 64, frames: { "tower-fast": { x: 0, y: 0, w: 32, h: 32 } } };
  it("is true for a present frame", () => {
    expect(hasFrame(m, "tower-fast")).toBe(true);
  });
  it("is false for a missing frame or a null manifest", () => {
    expect(hasFrame(m, "creep-air")).toBe(false);
    expect(hasFrame(null, "tower-fast")).toBe(false);
  });
});
