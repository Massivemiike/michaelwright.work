// src/game/runtime/render/atlas.ts
//
// Pure texture-atlas geometry, shared by both renderer backends. A `Frame` is
// a pixel rect within a sprite sheet; `frameUv` normalizes it to [0,1] UVs the
// WebGPU sprite shader samples (and Canvas2D's drawImage uses the pixel rect
// directly). Under src/game/runtime/** => outside the sim purity guard, but
// this leaf is pure float math anyway: no DOM, no globals, node-unit-tested.
export interface Frame {
  x: number;
  y: number;
  w: number;
  h: number;
}

// The JSON manifest shipped next to the atlas PNG (public/.../atlas.json).
export interface AtlasManifest {
  width: number;
  height: number;
  frames: Record<string, Frame>;
}

export interface Uv {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
}

// Textured atlas sprites read larger than the SDF primitives they replace: the
// art has internal padding and a unit should fill ~a tile, so both backends
// scale the drawn quad by these when drawing an atlas frame (vs the SDF size).
// Tuned visually against the shipped atlas.
export const TEX_TOWER_SCALE = 1.6;
export const TEX_CREEP_SCALE = 2.4;

// Normalized UV rect for a frame within an atlas of the given pixel size.
// Guards a zero-sized atlas (returns a zero rect) so a malformed manifest can
// never divide by zero into NaN UVs.
export function frameUv(atlasW: number, atlasH: number, f: Frame): Uv {
  if (atlasW <= 0 || atlasH <= 0) return { u0: 0, v0: 0, u1: 0, v1: 0 };
  return {
    u0: f.x / atlasW,
    v0: f.y / atlasH,
    u1: (f.x + f.w) / atlasW,
    v1: (f.y + f.h) / atlasH,
  };
}

// Whether a manifest actually contains a usable frame by name — the renderers
// gate "draw a textured sprite vs the SDF fallback" on this.
export function hasFrame(manifest: AtlasManifest | null, name: string): boolean {
  return manifest !== null && Object.prototype.hasOwnProperty.call(manifest.frames, name);
}
