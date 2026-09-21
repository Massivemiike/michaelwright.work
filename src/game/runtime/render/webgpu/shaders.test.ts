// src/game/runtime/render/webgpu/shaders.test.ts
import { describe, it, expect } from "vitest";
import { BACKDROP_WGSL, TRACK_WGSL, SPRITE_WGSL, BLIT_WGSL, BLUR_WGSL, COMPOSITE_WGSL } from "./shaders";

// WGSL can't be validated without a GPU device (that's the Playwright smoke's
// job) — this only guards against an empty/garbled export or a renamed entry
// point that would desync from WebGpuRenderer's pipeline wiring.
const all = { BACKDROP_WGSL, TRACK_WGSL, SPRITE_WGSL, BLIT_WGSL, BLUR_WGSL, COMPOSITE_WGSL };

describe("WGSL shader exports", () => {
  for (const [name, src] of Object.entries(all)) {
    it(`${name} declares a vertex and a fragment entry point`, () => {
      expect(typeof src).toBe("string");
      expect(src.length).toBeGreaterThan(50);
      expect(src).toContain("@vertex");
      expect(src).toContain("@fragment");
    });
  }
  it("SPRITE_WGSL reads instances from a read-only storage buffer indexed by instance_index (spec §9.1)", () => {
    expect(SPRITE_WGSL).toContain("var<storage, read> instances");
    expect(SPRITE_WGSL).toContain("instance_index");
  });
  it("SPRITE_WGSL binds the sprite atlas texture + sampler and carries per-instance uv (Phase 1 texture art)", () => {
    // Instance grew a uv: vec4f (16 floats), matching pack.ts's SPRITE_FLOATS.
    expect(SPRITE_WGSL).toContain("uv: vec4f");
    // Atlas texture + sampler at bindings 2 and 3.
    expect(SPRITE_WGSL).toContain("@group(0) @binding(2) var atlasTex: texture_2d<f32>");
    expect(SPRITE_WGSL).toContain("@group(0) @binding(3) var atlasSamp: sampler");
    // Fragment shader has a textured branch that samples the atlas.
    expect(SPRITE_WGSL).toContain("textureSample(atlasTex, atlasSamp");
  });
  it("scene-writing shaders declare a two-target MRT fragment output", () => {
    for (const src of [BACKDROP_WGSL, TRACK_WGSL, SPRITE_WGSL]) {
      expect(src).toContain("@location(0)");
      expect(src).toContain("@location(1)");
    }
  });
});
