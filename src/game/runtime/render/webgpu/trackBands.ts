// src/game/runtime/render/webgpu/trackBands.ts
//
// Pure builder for the Phase-2 (S2) track geometry consumed by the WebGPU
// track pipeline. Each of the two track loops is turned into three concentric
// filled bands so it reads as a RECESSED DARK CHANNEL with a THIN BRIGHT
// NEUTRAL NEON EDGE that blooms plus a faint center light-strip:
//
//   1. rim band    — tessellateTrack(poly, trackWidth), the bright neutral
//                     neon edge color, e = edgeEmissive (>0 => feeds bloom).
//   2. inset lane   — tessellateTrack(poly, trackWidth - 2*edgePx), the dark
//                     recessed color, e = 0. Drawn ON TOP of the rim (later in
//                     the triangle-list vertex order) so the bright rim shows
//                     only as an edgePx-wide rim on each side, which blooms.
//   3. center strip — tessellateTrack(poly, centerPx), a faint bright color at
//                     a low emissive — the subtle direction/center cue.
//
// Output is one INTERLEAVED Float32Array, stride 6 floats = [x,y, r,g,b, e],
// concatenated PER LOOP (bands in the draw order above; later verts overdraw
// earlier ones in the flat triangle list). The WebGPU vertex layout mirrors
// this stride (arrayStride 24: pos float32x2 @0, col float32x3 @8, e float32
// @20) and TRACK_WGSL emits `emit = color * e` so the rim (and only the rim)
// blooms while the dark lane and backdrop stay flat.
//
// Depth hierarchy (OUTER brighter than INNER) comes from the per-loop rim
// COLOR (a brightness step of the neutral border/text family), not from a hue
// and not from a per-loop emissive — edgeEmissive stays a single constant so
// the bloom radius is uniform across both loops.
//
// Pure, float-only, DOM/GPU-free (lives under render/** so Math.* is fine).
// Reuses tessellateTrack verbatim (called at three widths). Node-unit-tested.
import { tessellateTrack } from "./tessellateTrack";
import type { Rgb } from "./pack";

// Floats per emitted vertex: x, y, r, g, b, e.
export const TRACK_BAND_STRIDE = 6;

// Per-loop band colors (index-matched to the loops passed to buildTrackBands).
export interface TrackBandColors {
  rim: Rgb; // bright neutral neon edge — brighter for the OUTER loop
  dark: Rgb; // recessed dark lane (toward bg-base), darker than the floor
  center: Rgb; // faint bright center strip
}

export interface TrackBandOpts {
  trackWidth: number; // full lane width (content.ts TRACK_WIDTH)
  edgePx: number; // visible bright rim width on each side of the channel
  centerPx: number; // center light-strip width
  edgeEmissive: number; // rim band emissive (>0 => blooms); constant across loops
  centerEmissive: number; // center strip emissive (low)
  colors: TrackBandColors[]; // one entry per loop; shorter arrays reuse the last
}

// Builds the interleaved [x,y,r,g,b,e] vertex array for every loop's three
// bands. `loops` is an array of stage-px point-pair arrays (Float32Array or
// number[], e.g. toFloat-converted content.ts TRACK.outer/inner).
export function buildTrackBands(
  loops: ReadonlyArray<ArrayLike<number>>,
  opts: TrackBandOpts,
): Float32Array<ArrayBuffer> {
  const { trackWidth, edgePx, centerPx, edgeEmissive, centerEmissive, colors } = opts;
  const out: number[] = [];

  // Appends one tessellated band (positions-only [x,y,...]) as interleaved
  // [x,y, r,g,b, e] verts.
  const pushBand = (tris: Float32Array, col: Rgb, e: number): void => {
    for (let i = 0; i < tris.length; i += 2) {
      out.push(tris[i], tris[i + 1], col.r, col.g, col.b, e);
    }
  };

  for (let li = 0; li < loops.length; li++) {
    const poly = loops[li];
    const c = colors[li] ?? colors[colors.length - 1];
    // Vertex order == draw order (flat triangle list, no depth buffer):
    // rim first, dark lane over it, then the center strip on top.
    pushBand(tessellateTrack(poly, trackWidth), c.rim, edgeEmissive);
    pushBand(tessellateTrack(poly, trackWidth - 2 * edgePx), c.dark, 0);
    pushBand(tessellateTrack(poly, centerPx), c.center, centerEmissive);
  }

  return new Float32Array(out);
}
