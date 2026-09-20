// src/game/runtime/render/webgpu/pack.test.ts
import { describe, it, expect } from "vitest";
import {
  SPRITE_FLOATS, SHAPE_CIRCLE, SHAPE_DIAMOND, SHAPE_SQUARE,
  writeSprite, packTowers, packCreeps, type Rgb, type CreepPalette,
} from "./pack";
import type { InterpCreep } from "../Renderer";
import { CREEP_AIR, CREEP_FAST, CREEP_HARD } from "@/game/sim/state";

const RED: Rgb = { r: 1, g: 0, b: 0 };

describe("writeSprite", () => {
  it("writes 12 floats in the documented layout and returns the next offset", () => {
    const out = new Float32Array(SPRITE_FLOATS * 2);
    const next = writeSprite(out, 0, 100, 200, 8, 6, RED, 0.5, SHAPE_SQUARE, 0.7);
    // Compare Float32Array-to-Float32Array (not a widened plain-number
    // array): 0.7 has no exact binary32 representation, so both sides must
    // go through the same float32 rounding or a literal 0.7 double will
    // never bit-for-bit equal what got stored. The other operands round-trip
    // exactly (integers, 0.5, 3), so this isn't masking anything else.
    expect(out.slice(0, SPRITE_FLOATS)).toEqual(new Float32Array([100, 200, 8, 6, 1, 0, 0, 0.5, SHAPE_SQUARE, 0.7, 0, 0]));
    expect(next).toBe(SPRITE_FLOATS);
  });
});

describe("packTowers", () => {
  it("emits one sprite per tower, colored by type, bigger with level, brighter when selected", () => {
    const colors: Rgb[] = [{ r: 1, g: 0, b: 0 }, { r: 0, g: 1, b: 0 }];
    const xy = new Float32Array([10, 20, 30, 40]);
    const type = new Int32Array([0, 1]);
    const level = new Int32Array([0, 5]);
    const out = new Float32Array(SPRITE_FLOATS * 2);
    const next = packTowers(out, 0, 2, xy, type, level, colors, 1 /* second selected */);
    expect(next).toBe(SPRITE_FLOATS * 2);
    expect(out[0]).toBe(10); expect(out[1]).toBe(20);       // tower 0 center
    expect([out[4], out[5], out[6]]).toEqual([1, 0, 0]);    // tower 0 color[type 0]
    const halfA = out[2], halfB = out[SPRITE_FLOATS + 2];
    expect(halfB).toBeGreaterThan(halfA);                    // level 5 bigger than level 0
    expect(out[SPRITE_FLOATS + 9]).toBeGreaterThan(out[9]);  // selected emissive > unselected
  });
});

describe("packCreeps", () => {
  const pal: CreepPalette = {
    blue: { r: 0, g: 0.5, b: 1 }, blueDark: { r: 0, g: 0.2, b: 0.4 },
    white: { r: 1, g: 1, b: 1 }, accent: { r: 1, g: 0.2, b: 0.1 }, track: { r: 0.1, g: 0.1, b: 0.1 },
  };
  it("uses a diamond for AIR, a circle for ground, and writes a hp bar (body + 2 rects = 3 sprites)", () => {
    const air: InterpCreep = { id: 1, x: 5, y: 5, hp01: 1, flags: CREEP_AIR };
    const ground: InterpCreep = { id: 2, x: 9, y: 9, hp01: 1, flags: 0 };
    const out = new Float32Array(SPRITE_FLOATS * 8);
    const next = packCreeps(out, 0, [air, ground], pal);
    // 2 creeps * 3 sprites (body + bg rect + fill rect)
    expect(next).toBe(SPRITE_FLOATS * 6);
    expect(out[8]).toBe(SHAPE_DIAMOND);                 // air body shape
    expect(out[SPRITE_FLOATS * 3 + 8]).toBe(SHAPE_CIRCLE); // ground body shape
  });
  it("makes HARD bigger than a plain ground creep", () => {
    const hard: InterpCreep = { id: 1, x: 0, y: 0, hp01: 1, flags: CREEP_HARD };
    const soft: InterpCreep = { id: 2, x: 0, y: 0, hp01: 1, flags: 0 };
    const a = new Float32Array(SPRITE_FLOATS * 3); packCreeps(a, 0, [hard], pal);
    const b = new Float32Array(SPRITE_FLOATS * 3); packCreeps(b, 0, [soft], pal);
    expect(a[2]).toBeGreaterThan(b[2]); // hard halfX bigger
  });
  it("blends the hp-bar fill toward accent as hp drops (danger cue, no new hue)", () => {
    const full: InterpCreep = { id: 1, x: 0, y: 0, hp01: 1, flags: 0 };
    const low: InterpCreep = { id: 2, x: 0, y: 0, hp01: 0.1, flags: 0 };
    const a = new Float32Array(SPRITE_FLOATS * 3); packCreeps(a, 0, [full], pal);
    const b = new Float32Array(SPRITE_FLOATS * 3); packCreeps(b, 0, [low], pal);
    // fill rect is the 3rd sprite; its red channel rises as hp falls.
    expect(b[SPRITE_FLOATS * 2 + 4]).toBeGreaterThan(a[SPRITE_FLOATS * 2 + 4]);
  });
});
