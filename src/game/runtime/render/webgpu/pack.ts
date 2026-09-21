// src/game/runtime/render/webgpu/pack.ts
//
// Pure per-instance sprite packers for the WebGPU backend. Each sprite is 16
// floats / 64 bytes, matching `Instance` in shaders.ts (std430 storage):
//   center.xy (0..1), half.xy (2..3), color.rgba (4..7),
//   params.xyzw (8..11), uv.xyzw (12..15)
//   params.x = shape id (SHAPE_*), params.y = emissive strength,
//   params.z = rot (radians; beams), params.w = textured flag (0 SDF / 1 atlas)
//   uv = u0,v0,u1,v1 atlas rect (all 0 when untextured)
// Colors arrive already resolved to [0,1] RGB (the renderer reads CSS vars);
// for a textured sprite `color` is the multiply TINT applied to the sampled
// texel. This module is float-only, DOM-free, and node-unit-tested. Under
// src/game/runtime/** => outside the sim purity guard (Math.*/float allowed).
import type { InterpCreep } from "../Renderer";
import type { Uv } from "../atlas";
import { CREEP_AIR, CREEP_FAST, CREEP_HARD } from "@/game/sim/state";
import { TOWERS } from "@/game/titles/circle-td/content";
import { towerFrame, creepFrame } from "@/game/titles/circle-td/sprites";

// A frame-name -> atlas UV resolver the renderer passes in when the atlas is
// loaded (name present -> its UV rect; name absent / atlas unloaded -> null,
// so the packer falls back to the SDF shape). Kept as an injected callback so
// this module stays pure (no manifest/DOM coupling here).
export type FrameUvFor = (frameName: string) => Uv | null;

export const SPRITE_FLOATS = 16;

// Shape ids — MUST match sprite.wgsl's fragment dispatch in shaders.ts.
export const SHAPE_CIRCLE = 0;
export const SHAPE_TRIANGLE = 1;
export const SHAPE_DIAMOND = 2;
export const SHAPE_SQUARE = 3;
export const SHAPE_HEX = 4;
export const SHAPE_RING = 5;        // hollow circle (range highlight)
export const SHAPE_SQUARE_LINE = 6; // hollow square (tile / hover outline)

export interface Rgb { r: number; g: number; b: number; }

function clamp01(v: number): number { return v < 0 ? 0 : v > 1 ? 1 : v; }
function mix(a: Rgb, b: Rgb, t: number): Rgb {
  const tt = clamp01(t);
  return { r: a.r + (b.r - a.r) * tt, g: a.g + (b.g - a.g) * tt, b: a.b + (b.b - a.b) * tt };
}

// Writes one sprite into `out` at float offset `o`; returns the next offset.
// `rot` (radians, default 0) rotates the quad about its center in the sprite
// vertex shader (params.z) — used to draw a beam as a thin rotated box. The
// SDF fragment works in un-rotated local space, so rotation only orients the
// quad; every existing caller omits it and gets the axis-aligned behavior.
//
// `uv` + `textured` are the atlas path (spec: Phase 1 sprite art). When
// `textured` is true the fragment shader samples the atlas at `uv` and
// multiplies by `color` (the tint) instead of running the SDF dispatch;
// `uv` is the frame's normalized rect. Both are optional trailing params, so
// every existing caller omits them → textured flag 0, uv all 0 → the SDF
// behavior is byte-for-byte unchanged (params.w and the four uv floats just
// go to 0, which is exactly what they were before the record grew).
export function writeSprite(
  out: Float32Array, o: number,
  cx: number, cy: number, halfX: number, halfY: number,
  color: Rgb, alpha: number, shape: number, emissive: number, rot: number = 0,
  uv?: Uv, textured: boolean = false
): number {
  out[o] = cx; out[o + 1] = cy; out[o + 2] = halfX; out[o + 3] = halfY;
  out[o + 4] = color.r; out[o + 5] = color.g; out[o + 6] = color.b; out[o + 7] = alpha;
  out[o + 8] = shape; out[o + 9] = emissive; out[o + 10] = rot; out[o + 11] = textured ? 1 : 0;
  out[o + 12] = uv ? uv.u0 : 0; out[o + 13] = uv ? uv.v0 : 0;
  out[o + 14] = uv ? uv.u1 : 0; out[o + 15] = uv ? uv.v1 : 0;
  return o + SPRITE_FLOATS;
}

// Shape per tower type (Fast=circle, Air=triangle, Slow=diamond,
// Splash=square, Damage=hex — TOWERS declaration order, mirrors Canvas2D).
const TOWER_SHAPE = [SHAPE_CIRCLE, SHAPE_TRIANGLE, SHAPE_DIAMOND, SHAPE_SQUARE, SHAPE_HEX];

// One body sprite per tower, colored by `colors[type]`, size from footprint +
// level (mirrors Canvas2D drawTowerShape's baseR), brighter emissive when
// selected. Range rings are the renderer's job (they need TOWERS.range + the
// accent color), kept out of here so this stays a pure body packer.
//
// `frameUvFor` (optional) is the atlas path: when it resolves the tower's
// frame name (towerFrame(type)) to a UV, the body is emitted as a TEXTURED
// sprite (same center/half, `color` becomes the tint) instead of the SDF
// shape; when it's absent or returns null the SDF `writeSprite` is used
// exactly as before.
export function packTowers(
  out: Float32Array, o: number, count: number,
  xy: Float32Array, type: Int32Array, level: Int32Array,
  colors: readonly Rgb[], selectedIndex: number,
  frameUvFor?: FrameUvFor
): number {
  let off = o;
  for (let i = 0; i < count; i++) {
    const t = Math.max(0, Math.min(TOWERS.length - 1, type[i]));
    const lv = Math.max(0, Math.min(9, level[i]));
    const footprint = TOWERS[t] ? TOWERS[t].footprint : 1;
    const r = 7 + footprint * 2.5 + t * 0.4 + lv * 0.5;
    const selected = i === selectedIndex;
    const color = colors[t] ?? colors[0];
    const emissive = selected ? 0.95 : 0.6;
    const shape = TOWER_SHAPE[t] ?? SHAPE_CIRCLE;
    const uv = frameUvFor ? frameUvFor(towerFrame(t)) : null;
    if (uv) {
      off = writeSprite(out, off, xy[i * 2], xy[i * 2 + 1], r, r, color, 1, shape, emissive, 0, uv, true);
    } else {
      off = writeSprite(out, off, xy[i * 2], xy[i * 2 + 1], r, r, color, 1, shape, emissive);
    }
  }
  return off;
}

export interface CreepPalette {
  blue: Rgb; blueDark: Rgb; white: Rgb; accent: Rgb; track: Rgb;
}

// Body + hp bar (background rect + danger-blended fill rect) per creep.
// AIR => diamond, ground => circle; HARD bigger + darker; FAST brighter
// emissive. hp bar fill blends blue->accent as hp drops (brightness/hue-pull
// danger cue — the palette has no green, mirrors Canvas2D drawHpBar).
//
// `frameUvFor` (optional) is the atlas path: when it resolves the creep's
// frame name (creepFrame(flags)) to a UV, ONLY the BODY becomes a textured
// sprite (tinted by `body`). The hp-bar sprites stay SDF squares (untextured)
// regardless — they're UI, not art.
export function packCreeps(
  out: Float32Array, o: number, creeps: readonly InterpCreep[], pal: CreepPalette,
  frameUvFor?: FrameUvFor
): number {
  let off = o;
  for (const c of creeps) {
    const isAir = (c.flags & CREEP_AIR) !== 0;
    const isFast = (c.flags & CREEP_FAST) !== 0;
    const isHard = (c.flags & CREEP_HARD) !== 0;
    const baseR = (isHard ? 8 : 5.5) + (isAir ? 1 : 0);
    const body = isHard ? pal.blueDark : pal.blue;
    const shape = isAir ? SHAPE_DIAMOND : SHAPE_CIRCLE;
    const half = isAir ? baseR * 1.35 : baseR;
    const bodyAlpha = isFast ? 1 : 0.9;
    const bodyEmissive = isFast ? 0.9 : 0.5;
    const uv = frameUvFor ? frameUvFor(creepFrame(c.flags)) : null;
    if (uv) {
      off = writeSprite(out, off, c.x, c.y, half, half, body, bodyAlpha, shape, bodyEmissive, 0, uv, true);
    } else {
      off = writeSprite(out, off, c.x, c.y, half, half, body, bodyAlpha, shape, bodyEmissive);
    }

    // hp bar just above the body.
    const width = Math.max(14, baseR * 2.4);
    const barHalfX = width / 2;
    const barHalfY = 1.5;
    const topY = c.y - baseR - 6;
    off = writeSprite(out, off, c.x, topY, barHalfX, barHalfY, pal.track, 0.9, SHAPE_SQUARE, 0);
    const hp = clamp01(c.hp01);
    const fill = mix(pal.blue, pal.accent, (1 - hp) * 0.85);
    const fillHalfX = Math.max(0.001, barHalfX * hp);
    const fillCx = c.x - barHalfX + fillHalfX;
    off = writeSprite(out, off, fillCx, topY, fillHalfX, barHalfY, fill, 1, SHAPE_SQUARE, 0);
  }
  return off;
}
