// src/game/runtime/render/transform.ts
//
// The ONE place the world<->screen transform lives, shared by every title's
// Canvas2D and WebGPU renderers so pointer hit-testing (screenToWorld ->
// tileAtWorld) can never drift between backends. Title-agnostic: each caller
// passes its own stage size. Lives under src/game/runtime/** (outside the sim
// purity guard AND exempt from the lazy-boundary guard) so DOM types and
// Math.* are fair game here.

// Letterbox+center fit of a fixed stageW x stageH stage into a device-pixel
// backing store. Field-identical to Canvas2DRenderer's old private
// Transform, so both renderers can hold one of these.
export interface Fit {
  scale: number;
  offsetX: number;
  offsetY: number;
}

// Verbatim reproduction of Canvas2DRenderer.resize()'s fit math (lines
// 350-366 as of HEAD 4ff3cd4). pxW/pxH are the device-pixel backing-store
// dimensions (already round(cssW*dpr)).
export function computeFit(pxW: number, pxH: number, stageW: number, stageH: number): Fit {
  const scale = pxW > 0 && pxH > 0 ? Math.min(pxW / stageW, pxH / stageH) : 1;
  const offsetX = (pxW - stageW * scale) / 2;
  const offsetY = (pxH - stageH * scale) / 2;
  return { scale, offsetX, offsetY };
}

// Verbatim reproduction of Canvas2DRenderer.screenToWorld() (lines 396-405).
// Returns Y-DOWN stage-px world coords regardless of backend — the WebGPU
// backend's internal projection is Y-flipped, but this inverse is not.
export function screenToWorld(
  clientX: number, clientY: number, canvas: HTMLCanvasElement, fit: Fit
): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  const { scale, offsetX, offsetY } = fit;
  if (scale <= 0 || rect.width <= 0 || rect.height <= 0) {
    return { x: 0, y: 0 };
  }
  const deviceX = (clientX - rect.left) * (canvas.width / rect.width);
  const deviceY = (clientY - rect.top) * (canvas.height / rect.height);
  return { x: (deviceX - offsetX) / scale, y: (deviceY - offsetY) / scale };
}

// Column-major 4x4 (WGSL mat4x4<f32> memory order) mapping a world point
// (stage-px, y-DOWN, origin top-left) to WebGPU clip space (x right in
// [-1,1], y UP in [-1,1], z=0, w=1). Derivation:
//   deviceX = worldX*scale + offsetX ; clipX = deviceX/pxW*2 - 1
//   deviceY = worldY*scale + offsetY ; clipY = 1 - deviceY/pxH*2   (Y flip)
export function worldToClip(fit: Fit, pxW: number, pxH: number): Float32Array {
  const { scale, offsetX, offsetY } = fit;
  const sx = pxW > 0 ? (2 * scale) / pxW : 0;
  const sy = pxH > 0 ? (2 * scale) / pxH : 0;
  const tx = pxW > 0 ? (2 * offsetX) / pxW - 1 : -1;
  const ty = pxH > 0 ? 1 - (2 * offsetY) / pxH : 1;
  // col0, col1 (y flip via -sy), col2, col3 (translation)
  return new Float32Array([
    sx, 0, 0, 0,
    0, -sy, 0, 0,
    0, 0, 1, 0,
    tx, ty, 0, 1,
  ]);
}
