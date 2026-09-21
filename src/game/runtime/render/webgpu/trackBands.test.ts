// src/game/runtime/render/webgpu/trackBands.test.ts
import { describe, it, expect } from "vitest";
import { buildTrackBands, TRACK_BAND_STRIDE, type TrackBandOpts } from "./trackBands";

const rim = { r: 0.8, g: 0.82, b: 0.9 };
const dark = { r: 0.03, g: 0.03, b: 0.05 };
const center = { r: 0.4, g: 0.42, b: 0.5 };

const opts: TrackBandOpts = {
  trackWidth: 64,
  edgePx: 3,
  centerPx: 2,
  edgeEmissive: 0.6,
  centerEmissive: 0.15,
  colors: [{ rim, dark, center }],
};

// A single horizontal segment loop => tessellateTrack emits exactly 6 verts per
// band, so band boundaries land at known vertex offsets: rim = verts 0..5,
// inset dark lane = verts 6..11, center strip = verts 12..17.
const loop = [0, 0, 100, 0];

const eOf = (v: Float32Array, vert: number) => v[vert * TRACK_BAND_STRIDE + 5];
const yOf = (v: Float32Array, vert: number) => v[vert * TRACK_BAND_STRIDE + 1];
const rOf = (v: Float32Array, vert: number) => v[vert * TRACK_BAND_STRIDE + 2];

describe("buildTrackBands", () => {
  it("returns an interleaved array whose length is a multiple of the 6-float stride", () => {
    const v = buildTrackBands([loop], opts);
    expect(v).toBeInstanceOf(Float32Array);
    expect(TRACK_BAND_STRIDE).toBe(6);
    expect(v.length % TRACK_BAND_STRIDE).toBe(0);
    // one loop * 3 bands * 6 verts/band * 6 floats/vert
    expect(v.length).toBe(3 * 6 * TRACK_BAND_STRIDE);
  });

  it("tags rim-band verts with EDGE_EMISSIVE, inset-lane verts with 0, center verts with the low emissive", () => {
    const v = buildTrackBands([loop], opts);
    for (let vert = 0; vert < 6; vert++) expect(eOf(v, vert)).toBeCloseTo(0.6); // rim
    for (let vert = 6; vert < 12; vert++) expect(eOf(v, vert)).toBe(0); // inset dark lane
    for (let vert = 12; vert < 18; vert++) expect(eOf(v, vert)).toBeCloseTo(0.15); // center
  });

  it("makes the inset dark lane narrower than the rim band (recessed channel with a rim on each side)", () => {
    const v = buildTrackBands([loop], opts);
    const span = (from: number) => {
      const ys = [0, 1, 2, 3, 4, 5].map((i) => yOf(v, from + i));
      return Math.max(...ys) - Math.min(...ys);
    };
    const rimSpan = span(0);
    const insetSpan = span(6);
    expect(rimSpan).toBeCloseTo(64); // trackWidth
    expect(insetSpan).toBeCloseTo(58); // trackWidth - 2*edgePx
    expect(insetSpan).toBeLessThan(rimSpan);
  });

  it("carries each band's color, and matches rim colors to loops by index (brighter OUTER, dimmer INNER)", () => {
    const v = buildTrackBands([loop], opts);
    // rim vert carries rim color, inset vert carries dark color, center vert carries center color
    expect(rOf(v, 0)).toBeCloseTo(rim.r);
    expect(rOf(v, 6)).toBeCloseTo(dark.r);
    expect(rOf(v, 12)).toBeCloseTo(center.r);

    const outerRim = { r: 0.9, g: 0.9, b: 1.0 };
    const innerRim = { r: 0.5, g: 0.5, b: 0.6 };
    const twoLoopOpts: TrackBandOpts = {
      ...opts,
      colors: [
        { rim: outerRim, dark, center },
        { rim: innerRim, dark, center },
      ],
    };
    const v2 = buildTrackBands([loop, loop], twoLoopOpts);
    expect(v2.length).toBe(2 * 3 * 6 * TRACK_BAND_STRIDE);
    // loop 0 rim (vert 0) is the brighter outer color; loop 1 rim starts at vert 18
    expect(rOf(v2, 0)).toBeCloseTo(outerRim.r);
    expect(rOf(v2, 18)).toBeCloseTo(innerRim.r);
  });

  it("skips zero-length wrap edges just like tessellateTrack does", () => {
    // (0,0)->(50,0)->(50,0 dup): one real segment per band, 3 bands => 18 verts.
    const v = buildTrackBands([[0, 0, 50, 0, 50, 0]], opts);
    expect(v.length).toBe(3 * 6 * TRACK_BAND_STRIDE);
  });
});
