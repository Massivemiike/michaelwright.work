// src/game/runtime/render/webgpu/tessellateTrack.ts
//
// Pure track-band tessellator for the WebGPU backend. Expands an
// axis-aligned closed polyline (float stage-px pairs [x0,y0,x1,y1,...], the
// toFloat-converted content.ts TRACK.outer/inner) into a filled triangle
// band `width` px wide, centered on the polyline. Each segment becomes a
// rectangle extended by width/2 at both ends so the right-angle joins fill
// with no gaps (miter fill for 90-degree corners — the whole board is
// axis-aligned by construction). Zero-length segments (the wrap-closing
// duplicate point content.ts appends) are skipped. Returns a flat
// Float32Array of triangle vertices [x,y, x,y, ...], 6 vertices per segment.
// No DOM/GPU; float math only — node-unit-tested.
export function tessellateTrack(points: ArrayLike<number>, width: number): Float32Array {
  const hw = width / 2;
  const verts: number[] = [];
  const n = points.length / 2;
  for (let i = 0; i < n - 1; i++) {
    const x0 = points[i * 2], y0 = points[i * 2 + 1];
    const x1 = points[(i + 1) * 2], y1 = points[(i + 1) * 2 + 1];
    const dx = x1 - x0, dy = y1 - y0;
    if (dx === 0 && dy === 0) continue; // zero-length wrap edge
    const len = Math.hypot(dx, dy);
    const ux = dx / len, uy = dy / len;   // unit tangent
    const nx = -uy, ny = ux;              // unit normal
    const ax = x0 - ux * hw, ay = y0 - uy * hw; // extended start
    const bx = x1 + ux * hw, by = y1 + uy * hw; // extended end
    const p0x = ax + nx * hw, p0y = ay + ny * hw;
    const p1x = bx + nx * hw, p1y = by + ny * hw;
    const p2x = bx - nx * hw, p2y = by - ny * hw;
    const p3x = ax - nx * hw, p3y = ay - ny * hw;
    verts.push(p0x, p0y, p1x, p1y, p2x, p2y, p0x, p0y, p2x, p2y, p3x, p3y);
  }
  return new Float32Array(verts);
}
