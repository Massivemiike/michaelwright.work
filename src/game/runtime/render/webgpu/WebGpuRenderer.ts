/// <reference types="@webgpu/types" />
// src/game/runtime/render/webgpu/WebGpuRenderer.ts
//
// WebGPU backend for the Renderer interface (../Renderer.ts). Read-only over
// RenderSnapshot + static content geometry — mutates NO sim state, so the
// determinism golden hash (off SimState) is unaffected. Lives under
// src/game/runtime/** => outside the sim purity guard; GPU/DOM/Math.* allowed.
//
// Pipeline: instanced SDF quads (per-instance data in a storage buffer
// indexed by @builtin(instance_index), one queue.writeBuffer/frame for
// instances) rendered into an rgba16float MRT (scene + emissive); the
// emissive target is downsampled, separably gaussian-blurred, and composited
// additively onto the swapchain for bloom (spec §9.1). The static track band
// is a render bundle. Hit bursts are GPU-instanced quads (NOT a compute
// shader — entities bounded <=100 creeps; spec §9.1's compute acceptance is
// deferred), which is why caps.particles is true.
//
// device.lost => v1 no-op-until-reload (register handler, log, do NOT
// auto-reinit): the sim is CPU-side, a lost device costs frames not a run,
// and re-fallback is a later decision.
//
// Canvas-commitment ordering (spec D7/§9.2's "never a blank canvas"):
// `init()` builds every buffer AND every pipeline, under a validation error
// scope, before it ever calls `canvas.getContext('webgpu')`. That call
// permanently sets a canvas element's context-mode — a later
// `canvas.getContext('2d')` on the SAME element returns null forever — so if
// it happened earlier and a pipeline then failed to validate (e.g. a
// compat-mode adapter missing a vertex-stage storage buffer),
// createRenderer.ts's Canvas2D fallback would be defeated on an
// already-committed canvas. See GpuBundle's comment and this class's init()
// for the mechanics.
import type { Renderer, RendererCaps, HitEvent, InterpCreep } from "../Renderer";
import { interpolateById } from "../Renderer";
import type { RenderSnapshot } from "@/game/sim/engine";
import { toFloat } from "@/game/sim/math/fixed";
import { TILE_SIZE, TRACK_WIDTH, TILES, TRACK, TOWERS } from "@/game/titles/circle-td/content";
import { computeFit, screenToWorld as sharedScreenToWorld, worldToClip, type Fit } from "../transform";
import { tessellateTrack } from "./tessellateTrack";
import {
  SPRITE_FLOATS, SHAPE_RING, SHAPE_SQUARE_LINE, SHAPE_CIRCLE,
  writeSprite, packTowers, packCreeps, type Rgb, type CreepPalette,
} from "./pack";
import { BACKDROP_WGSL, TRACK_WGSL, SPRITE_WGSL, BLIT_WGSL, BLUR_WGSL, COMPOSITE_WGSL } from "./shaders";

// Bundle-budget marker — thrown on pipeline-build failure so the string is
// load-bearing (survives minification) in this dynamically-imported chunk.
// MUST stay in scripts/check-bundle-budget.mjs GAME_MARKERS.
export const WEBGPU_BUNDLE_MARKER = "WebGpuRenderer: WebGPU pipeline build failed";

// Deliberately does NOT include a GPUCanvasContext. canvas.getContext(
// 'webgpu') permanently commits a canvas's context-mode (a later
// canvas.getContext('2d') on the same element returns null forever), so it
// must not happen until every realistically-failing WebGPU step (adapter
// limits, device request, pipeline build) has already succeeded — seeing
// this bundle through construction and init() up to that point never
// touches the canvas at all. See createRenderer.ts and this class's init().
export interface GpuBundle {
  adapter: GPUAdapter;
  device: GPUDevice;
  format: GPUTextureFormat;
}

const HIT_LIFETIME_MS = 240;
const MAX_SPRITES = 4096;       // tiles(186)+towers+ghost+creeps*3(<=300)+bursts — ample headroom
const HDR_FORMAT: GPUTextureFormat = "rgba16float";

interface HitFlash { x: number; y: number; kind: number; ageMs: number; }

const FALLBACK = {
  bgBase: "#08080C", bgSurface: "#0F0F15", bgElevated: "#16161F",
  borderSubtle: "#1F1F2E", borderMuted: "#27273A",
  accent: "#FF3B2F", accentHover: "#FF5045", blue: "#7FDBFF",
  textPrimary: "#F0F2F8", textSecondary: "#787F96",
};

function hexToRgb01(hex: string): Rgb {
  const h = hex.trim().replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = Number.parseInt(full, 16);
  const v = Number.isFinite(n) ? n : 0;
  return { r: ((v >> 16) & 255) / 255, g: ((v >> 8) & 255) / 255, b: (v & 255) / 255 };
}
function mix(a: Rgb, b: Rgb, t: number): Rgb {
  const tt = t < 0 ? 0 : t > 1 ? 1 : t;
  return { r: a.r + (b.r - a.r) * tt, g: a.g + (b.g - a.g) * tt, b: a.b + (b.b - a.b) * tt };
}
const WHITE: Rgb = { r: 1, g: 1, b: 1 };
const BLACK: Rgb = { r: 0, g: 0, b: 0 };

interface GpuPalette {
  bgBase: Rgb; bgSurface: Rgb; bgElevated: Rgb; borderMuted: Rgb; borderSubtle: Rgb;
  accent: Rgb; accentHover: Rgb; blue: Rgb; textPrimary: Rgb; textSecondary: Rgb;
  towerColors: Rgb[]; creepPalette: CreepPalette;
}

function readGpuPalette(): GpuPalette {
  const read = (name: string, fb: string): Rgb => {
    try {
      const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      return v.length > 0 ? hexToRgb01(v) : hexToRgb01(fb);
    } catch {
      return hexToRgb01(fb);
    }
  };
  const accent = read("--color-accent", FALLBACK.accent);
  const accentHover = read("--color-accent-hover", FALLBACK.accentHover);
  const blue = read("--color-blue", FALLBACK.blue);
  const bgBase = read("--color-bg-base", FALLBACK.bgBase);
  const bgElevated = read("--color-bg-elevated", FALLBACK.bgElevated);
  const textSecondary = read("--color-text-secondary", FALLBACK.textSecondary);
  const borderMuted = read("--color-border-muted", FALLBACK.borderMuted);
  return {
    bgBase, bgSurface: read("--color-bg-surface", FALLBACK.bgSurface), bgElevated,
    borderMuted, borderSubtle: read("--color-border-subtle", FALLBACK.borderSubtle),
    accent, accentHover, blue,
    textPrimary: read("--color-text-primary", FALLBACK.textPrimary), textSecondary,
    // Five accent-family tints per tower type (mirrors Canvas2D towerColorFor).
    towerColors: [accent, mix(accent, WHITE, 0.32), mix(accent, BLACK, 0.3), mix(accent, BLACK, 0.12), accentHover],
    creepPalette: { blue, blueDark: mix(blue, BLACK, 0.45), white: WHITE, accent, track: bgBase },
  };
}

function toFloatPairs(fx: Int32Array): Float32Array {
  const out = new Float32Array(fx.length);
  for (let i = 0; i < fx.length; i++) out[i] = toFloat(fx[i]);
  return out;
}
function nowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

export class WebGpuRenderer implements Renderer {
  readonly caps: RendererCaps = { kind: "webgpu", particles: true };

  private readonly device: GPUDevice;
  // Not readonly, not set by the constructor: acquired inside init(), only
  // after pipeline validation succeeds (see init()'s comment) — the whole
  // point of the fix is that this canvas-committing call happens as late as
  // possible.
  private context!: GPUCanvasContext;
  private readonly format: GPUTextureFormat;
  private canvas: HTMLCanvasElement | null = null;
  private fit: Fit = { scale: 1, offsetX: 0, offsetY: 0 };
  private deviceLost = false;
  private reducedMotion = false;
  private palette: GpuPalette = readGpuPaletteSafe();

  // Persistent GPU resources (init).
  private globalsBuf!: GPUBuffer;      // mat4 clip + vec4 params (80 bytes)
  private backdropBuf!: GPUBuffer;     // 3x vec4 colors (48 bytes)
  private instanceBuf!: GPUBuffer;     // storage, MAX_SPRITES sprites
  private trackBuf!: GPUBuffer;        // vertex: [x,y,r,g,b] per vertex
  private trackVertCount = 0;
  private sampler!: GPUSampler;
  private backdropPipeline!: GPURenderPipeline;
  private trackPipeline!: GPURenderPipeline;
  private spritePipeline!: GPURenderPipeline;
  private blitPipeline!: GPURenderPipeline;
  private blurPipeline!: GPURenderPipeline;
  private compositePipeline!: GPURenderPipeline;
  private globalsBind!: GPUBindGroup;   // globals only (track)
  private spriteBind!: GPUBindGroup;    // globals + instances (sprite)
  private backdropBind!: GPUBindGroup;
  private trackBundle!: GPURenderBundle;
  private blurBufH!: GPUBuffer;
  private blurBufV!: GPUBuffer;

  // Size-dependent (resize).
  private sceneTex: GPUTexture | null = null;
  private emitTex: GPUTexture | null = null;
  private downTex: GPUTexture | null = null;    // half-res
  private blurTemp: GPUTexture | null = null;   // half-res
  private blitBind: GPUBindGroup | null = null;
  private blurBindH: GPUBindGroup | null = null;
  private blurBindV: GPUBindGroup | null = null;
  private compositeBind: GPUBindGroup | null = null;

  // Frame scratch.
  private readonly globalsData = new Float32Array(20); // 16 mat + 4 params
  private readonly instanceData = new Float32Array(MAX_SPRITES * SPRITE_FLOATS);
  private hits: HitFlash[] = [];
  private lastFrameAtMs: number | null = null;
  private tilesPx: Float32Array = new Float32Array(0);

  // Highlight/ghost state (same contract as Canvas2D).
  private highlightTowerIndex: number | null = null;
  private highlightTile = -1;
  private highlightTowerType = -1;
  private highlightAffordable = true;

  constructor(gpu: GpuBundle) {
    this.device = gpu.device;
    this.format = gpu.format;
  }

  async init(canvas: HTMLCanvasElement): Promise<void> {
    // `canvas` is not touched/assigned yet — see the comment below, right
    // before the first real use of it (canvas.getContext('webgpu')), for
    // why that has to wait until after pipeline validation.
    this.palette = readGpuPaletteSafe();
    this.reducedMotion =
      typeof window !== "undefined" && typeof window.matchMedia === "function"
        ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
        : false;

    const device = this.device;

    // Static track band (both loops), colored by loop (brightness only).
    this.tilesPx = toFloatPairs(TILES);
    const outerTris = tessellateTrack(toFloatPairs(TRACK.outer), TRACK_WIDTH);
    const innerTris = tessellateTrack(toFloatPairs(TRACK.inner), TRACK_WIDTH);
    const outerCol = this.palette.borderMuted;
    const innerCol = mix(this.palette.borderSubtle, this.palette.borderMuted, 0.5);
    const totalVerts = (outerTris.length + innerTris.length) / 2;
    const trackData = new Float32Array(totalVerts * 5); // x,y,r,g,b
    let w = 0;
    const writeBand = (tris: Float32Array, col: Rgb) => {
      for (let i = 0; i < tris.length; i += 2) {
        trackData[w++] = tris[i]; trackData[w++] = tris[i + 1];
        trackData[w++] = col.r; trackData[w++] = col.g; trackData[w++] = col.b;
      }
    };
    writeBand(outerTris, outerCol);
    writeBand(innerTris, innerCol);
    this.trackVertCount = totalVerts;
    this.trackBuf = device.createBuffer({ size: trackData.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(this.trackBuf, 0, trackData);

    // Uniform + storage buffers.
    this.globalsBuf = device.createBuffer({ size: 80, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.backdropBuf = device.createBuffer({ size: 48, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    const bg = new Float32Array(12);
    const center = mix(this.palette.bgElevated, this.palette.bgSurface, 0.5);
    bg.set([center.r, center.g, center.b, 1], 0);
    bg.set([this.palette.bgSurface.r, this.palette.bgSurface.g, this.palette.bgSurface.b, 1], 4);
    bg.set([this.palette.bgBase.r, this.palette.bgBase.g, this.palette.bgBase.b, 1], 8);
    device.queue.writeBuffer(this.backdropBuf, 0, bg);
    this.instanceBuf = device.createBuffer({ size: this.instanceData.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    this.blurBufH = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.blurBufV = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.sampler = device.createSampler({ magFilter: "linear", minFilter: "linear", addressModeU: "clamp-to-edge", addressModeV: "clamp-to-edge" });

    // Build all pipelines under a validation error scope; on ANY error,
    // throw the marker so the factory falls back to Canvas2D. Pipelines only
    // need `device` + `this.format` (a string, from
    // navigator.gpu.getPreferredCanvasFormat() — see createRenderer.ts),
    // never the canvas itself, which is exactly what makes it possible to
    // validate them before the next step below ever touches `canvas`.
    device.pushErrorScope("validation");
    this.buildPipelines();
    const err = await device.popErrorScope();
    if (err) throw new Error(`${WEBGPU_BUNDLE_MARKER}: ${err.message}`);

    // Only NOW, with every pipeline already known-good, do we touch the
    // canvas. canvas.getContext('webgpu') PERMANENTLY commits that canvas
    // element's context-mode — a later canvas.getContext('2d') on the same
    // element returns null forever, per the HTML spec. If this ran any
    // earlier (e.g. before pipeline validation, as createRenderer.ts's
    // acquireGpu used to do), a pipeline failure discovered afterward would
    // strand createRenderer's Canvas2D fallback on a canvas that can no
    // longer produce a "2d" context, defeating the fallback and leaving the
    // player with a blank canvas (spec D7/§9.2 — never a blank canvas). By
    // this point, adapter-limit and pipeline-validation failures — the
    // realistic ways WebGPU init fails on real hardware — have already
    // thrown, on a canvas that is still completely untouched.
    const context = canvas.getContext("webgpu");
    if (!context) throw new Error(`${WEBGPU_BUNDLE_MARKER}: getContext('webgpu') returned null`);
    context.configure({ device, format: this.format, alphaMode: "opaque" });
    this.context = context;
    this.canvas = canvas;

    // Bind groups that never change (buffers are persistent).
    this.globalsBind = device.createBindGroup({ layout: this.trackPipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: this.globalsBuf } }] });
    this.spriteBind = device.createBindGroup({
      layout: this.spritePipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: this.globalsBuf } }, { binding: 1, resource: { buffer: this.instanceBuf } }],
    });
    this.backdropBind = device.createBindGroup({ layout: this.backdropPipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: this.backdropBuf } }] });

    // Static track render bundle (spec §9.1 "a render bundle covers the
    // static map layer"). References persistent buffers; the clip matrix
    // lives in globalsBuf (updated per-resize via writeBuffer) so the bundle
    // stays valid across resizes.
    const be = device.createRenderBundleEncoder({ colorFormats: [HDR_FORMAT, HDR_FORMAT] });
    be.setPipeline(this.trackPipeline);
    be.setBindGroup(0, this.globalsBind);
    be.setVertexBuffer(0, this.trackBuf);
    be.draw(this.trackVertCount);
    this.trackBundle = be.finish();

    // v1: no-op-until-reload on device loss.
    device.lost.then((info) => {
      this.deviceLost = true;
      console.warn("WebGpuRenderer: device lost (no auto-reinit in v1)", info.message);
    });
  }

  private buildPipelines(): void {
    const device = this.device;
    const sceneTargets: GPUColorTargetState[] = [
      // scene: premultiplied over
      { format: HDR_FORMAT, blend: { color: { srcFactor: "one", dstFactor: "one-minus-src-alpha" }, alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha" } } },
      // emissive: additive so glows accumulate
      { format: HDR_FORMAT, blend: { color: { srcFactor: "one", dstFactor: "one" }, alpha: { srcFactor: "one", dstFactor: "one" } } },
    ];
    const opaqueSceneTargets: GPUColorTargetState[] = [{ format: HDR_FORMAT }, { format: HDR_FORMAT }];

    const backdropMod = device.createShaderModule({ code: BACKDROP_WGSL });
    this.backdropPipeline = device.createRenderPipeline({
      layout: "auto",
      vertex: { module: backdropMod, entryPoint: "vs" },
      fragment: { module: backdropMod, entryPoint: "fs", targets: opaqueSceneTargets },
      primitive: { topology: "triangle-list" },
    });

    const trackMod = device.createShaderModule({ code: TRACK_WGSL });
    this.trackPipeline = device.createRenderPipeline({
      layout: "auto",
      vertex: {
        module: trackMod, entryPoint: "vs",
        buffers: [{ arrayStride: 20, attributes: [{ shaderLocation: 0, offset: 0, format: "float32x2" }, { shaderLocation: 1, offset: 8, format: "float32x3" }] }],
      },
      fragment: { module: trackMod, entryPoint: "fs", targets: opaqueSceneTargets },
      primitive: { topology: "triangle-list" },
    });

    const spriteMod = device.createShaderModule({ code: SPRITE_WGSL });
    this.spritePipeline = device.createRenderPipeline({
      layout: "auto",
      vertex: { module: spriteMod, entryPoint: "vs" },
      fragment: { module: spriteMod, entryPoint: "fs", targets: sceneTargets },
      primitive: { topology: "triangle-list" },
    });

    const blitMod = device.createShaderModule({ code: BLIT_WGSL });
    this.blitPipeline = device.createRenderPipeline({
      layout: "auto",
      vertex: { module: blitMod, entryPoint: "vs" },
      fragment: { module: blitMod, entryPoint: "fs", targets: [{ format: HDR_FORMAT }] },
      primitive: { topology: "triangle-list" },
    });

    const blurMod = device.createShaderModule({ code: BLUR_WGSL });
    this.blurPipeline = device.createRenderPipeline({
      layout: "auto",
      vertex: { module: blurMod, entryPoint: "vs" },
      fragment: { module: blurMod, entryPoint: "fs", targets: [{ format: HDR_FORMAT }] },
      primitive: { topology: "triangle-list" },
    });

    const compMod = device.createShaderModule({ code: COMPOSITE_WGSL });
    this.compositePipeline = device.createRenderPipeline({
      layout: "auto",
      vertex: { module: compMod, entryPoint: "vs" },
      fragment: { module: compMod, entryPoint: "fs", targets: [{ format: this.format }] },
      primitive: { topology: "triangle-list" },
    });
  }

  resize(cssW: number, cssH: number, dpr: number): void {
    if (this.deviceLost || !this.canvas) return;
    const pxW = Math.max(1, Math.round(cssW * dpr));
    const pxH = Math.max(1, Math.round(cssH * dpr));
    this.canvas.width = pxW;
    this.canvas.height = pxH;
    this.fit = computeFit(pxW, pxH);
    const m = worldToClip(this.fit, pxW, pxH);
    this.globalsData.set(m, 0);
    this.device.queue.writeBuffer(this.globalsBuf, 0, this.globalsData);
    this.makeTargets(pxW, pxH);
  }

  private makeTargets(pxW: number, pxH: number): void {
    const device = this.device;
    for (const t of [this.sceneTex, this.emitTex, this.downTex, this.blurTemp]) t?.destroy();
    const hw = Math.max(1, pxW >> 1), hh = Math.max(1, pxH >> 1);
    const mk = (w: number, h: number) => device.createTexture({ size: { width: w, height: h }, format: HDR_FORMAT, usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING });
    this.sceneTex = mk(pxW, pxH);
    this.emitTex = mk(pxW, pxH);
    this.downTex = mk(hw, hh);
    this.blurTemp = mk(hw, hh);
    // Blur direction uniforms, texel-scaled for the half-res targets.
    device.queue.writeBuffer(this.blurBufH, 0, new Float32Array([1 / hw, 0, 0, 0]));
    device.queue.writeBuffer(this.blurBufV, 0, new Float32Array([0, 1 / hh, 0, 0]));
    const view = (t: GPUTexture) => t.createView();
    this.blitBind = device.createBindGroup({ layout: this.blitPipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: this.sampler }, { binding: 1, resource: view(this.emitTex) }] });
    this.blurBindH = device.createBindGroup({ layout: this.blurPipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: this.sampler }, { binding: 1, resource: view(this.downTex) }, { binding: 2, resource: { buffer: this.blurBufH } }] });
    this.blurBindV = device.createBindGroup({ layout: this.blurPipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: this.sampler }, { binding: 1, resource: view(this.blurTemp) }, { binding: 2, resource: { buffer: this.blurBufV } }] });
    this.compositeBind = device.createBindGroup({ layout: this.compositePipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: this.sampler }, { binding: 1, resource: view(this.sceneTex) }, { binding: 2, resource: view(this.downTex) }] });
  }

  setHighlightTower(index: number | null): void { this.highlightTowerIndex = index; }
  setHighlight(tile: number, towerType: number, affordable: boolean): void {
    this.highlightTile = tile; this.highlightTowerType = towerType; this.highlightAffordable = affordable;
  }

  screenToWorld(clientX: number, clientY: number, canvas: HTMLCanvasElement): { x: number; y: number } {
    return sharedScreenToWorld(clientX, clientY, canvas, this.fit);
  }

  frame(prev: RenderSnapshot, curr: RenderSnapshot, alpha: number, hits: HitEvent[]): void {
    if (this.deviceLost || !this.canvas || !this.sceneTex || !this.emitTex || !this.downTex || !this.blurTemp) return;
    this.advanceHits(hits);
    const count = this.packFrame(prev, curr, alpha);
    const device = this.device;
    device.queue.writeBuffer(this.instanceBuf, 0, this.instanceData, 0, count * SPRITE_FLOATS);
    this.globalsData[16] = this.reducedMotion ? 0 : nowMs() / 1000;
    device.queue.writeBuffer(this.globalsBuf, 0, this.globalsData);

    const enc = device.createCommandEncoder();
    const scenePass = enc.beginRenderPass({
      colorAttachments: [
        { view: this.sceneTex.createView(), clearValue: { r: this.palette.bgBase.r, g: this.palette.bgBase.g, b: this.palette.bgBase.b, a: 1 }, loadOp: "clear", storeOp: "store" },
        { view: this.emitTex.createView(), clearValue: { r: 0, g: 0, b: 0, a: 1 }, loadOp: "clear", storeOp: "store" },
      ],
    });
    scenePass.setPipeline(this.backdropPipeline);
    scenePass.setBindGroup(0, this.backdropBind);
    scenePass.draw(3);
    scenePass.executeBundles([this.trackBundle]);
    if (count > 0) {
      scenePass.setPipeline(this.spritePipeline);
      scenePass.setBindGroup(0, this.spriteBind);
      scenePass.draw(6, count);
    }
    scenePass.end();

    // Bloom: downsample emissive -> blur H -> blur V -> composite.
    this.postPass(enc, this.blitPipeline, this.blitBind!, this.downTex.createView());
    this.postPass(enc, this.blurPipeline, this.blurBindH!, this.blurTemp.createView());
    this.postPass(enc, this.blurPipeline, this.blurBindV!, this.downTex.createView());
    this.postPass(enc, this.compositePipeline, this.compositeBind!, this.context.getCurrentTexture().createView());

    device.queue.submit([enc.finish()]);
  }

  private postPass(enc: GPUCommandEncoder, pipeline: GPURenderPipeline, bind: GPUBindGroup, target: GPUTextureView): void {
    const pass = enc.beginRenderPass({ colorAttachments: [{ view: target, clearValue: { r: 0, g: 0, b: 0, a: 1 }, loadOp: "clear", storeOp: "store" }] });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bind);
    pass.draw(3);
    pass.end();
  }

  // Builds the frame's instance array in draw order (painter's algorithm; no
  // depth buffer): tiles -> towers(+selected ring) -> ghost/hover -> creeps
  // (+hp bars) -> hit bursts. Returns the sprite count.
  private packFrame(prev: RenderSnapshot, curr: RenderSnapshot, alpha: number): number {
    const out = this.instanceData;
    const pal = this.palette;
    let o = 0;
    const cap = () => o / SPRITE_FLOATS < MAX_SPRITES - 8;

    // Tiles (dimmed when an unaffordable type is armed — mirrors Canvas2D).
    const armedUnaffordable = this.highlightTowerType >= 0 && !this.highlightAffordable;
    const dim = armedUnaffordable ? 0.6 : 1;
    const tileFill = mix(pal.bgElevated, pal.textSecondary, 0.9);
    const tileHalf = TILE_SIZE * 0.44;
    for (let i = 0; i < this.tilesPx.length && cap(); i += 2) {
      o = writeSprite(out, o, this.tilesPx[i], this.tilesPx[i + 1], tileHalf, tileHalf, tileFill, 0.82 * dim, SHAPE_SQUARE_LINE, 0);
    }

    // Selected tower range ring (drawn under bodies).
    if (this.highlightTowerIndex !== null && this.highlightTowerIndex < curr.towerCount && cap()) {
      const idx = this.highlightTowerIndex;
      const type = Math.max(0, Math.min(TOWERS.length - 1, curr.towerType[idx]));
      const level = curr.towerLevel[idx];
      const def = TOWERS[type];
      if (def) {
        const range = toFloat(def.range0 + level * def.rangeStep);
        o = writeSprite(out, o, curr.towerXY[idx * 2], curr.towerXY[idx * 2 + 1], range, range, pal.accent, 0.35, SHAPE_RING, 0.4);
      }
    }

    // Tower bodies.
    o = packTowers(out, o, Math.min(curr.towerCount, MAX_SPRITES - 8 - o / SPRITE_FLOATS | 0), curr.towerXY, curr.towerType, curr.towerLevel, pal.towerColors, this.highlightTowerIndex ?? -1);

    // Placement ghost / hover outline.
    if (this.highlightTile >= 0 && this.highlightTile * 2 + 1 < this.tilesPx.length && cap()) {
      const gx = this.tilesPx[this.highlightTile * 2];
      const gy = this.tilesPx[this.highlightTile * 2 + 1];
      o = writeSprite(out, o, gx, gy, tileHalf, tileHalf, pal.accent, this.highlightAffordable ? 0.85 : 0.35, SHAPE_SQUARE_LINE, this.highlightAffordable ? 0.5 : 0);
      const type = this.highlightTowerType;
      if (type >= 0 && type < TOWERS.length && cap()) {
        const def = TOWERS[type];
        const alphaGhost = this.highlightAffordable ? 0.5 : 0.16;
        if (this.highlightAffordable && def) {
          const range = toFloat(def.range0);
          o = writeSprite(out, o, gx, gy, range, range, pal.accent, 0.3, SHAPE_RING, 0.3);
        }
        const ghostColor = pal.towerColors[type] ?? pal.towerColors[0];
        const r = 7 + (def ? def.footprint : 1) * 2.5 + type * 0.4;
        const shape = [SHAPE_CIRCLE, 1, 2, 3, 4][type] ?? SHAPE_CIRCLE;
        o = writeSprite(out, o, gx, gy, r, r, ghostColor, alphaGhost, shape, 0.3);
      }
    }

    // Creeps (+ hp bars). interpolateById is the tested, shared id-matcher.
    const creeps: InterpCreep[] = interpolateById(prev, curr, alpha);
    const room = Math.floor((MAX_SPRITES - 8 - o / SPRITE_FLOATS) / 3);
    const slice = creeps.length > room ? creeps.slice(0, room) : creeps;
    o = packCreeps(out, o, slice, pal.creepPalette);

    // Hit bursts as instanced quads (particles): glow core + expanding ring.
    for (const h of this.hits) {
      if (!cap()) break;
      const t = h.ageMs / HIT_LIFETIME_MS;
      const inv = t >= 1 ? 0 : 1 - t;
      if (inv <= 0) continue;
      o = writeSprite(out, o, h.x, h.y, 2 + 3 * inv, 2 + 3 * inv, pal.accentHover, inv, SHAPE_CIRCLE, 1.2 * inv);
      const rr = 3 + t * 14;
      o = writeSprite(out, o, h.x, h.y, rr, rr, pal.accent, inv * 0.9, SHAPE_RING, 0.8 * inv);
    }

    return o / SPRITE_FLOATS;
  }

  private advanceHits(incoming: HitEvent[]): void {
    const now = nowMs();
    const dt = this.lastFrameAtMs === null ? 0 : Math.max(0, now - this.lastFrameAtMs);
    this.lastFrameAtMs = now;
    for (const h of incoming) this.hits.push({ x: h.x, y: h.y, kind: h.kind, ageMs: 0 });
    if (dt > 0) for (const h of this.hits) h.ageMs += dt;
    if (this.hits.length > 0) this.hits = this.hits.filter((h) => h.ageMs < HIT_LIFETIME_MS);
  }

  destroy(): void {
    for (const t of [this.sceneTex, this.emitTex, this.downTex, this.blurTemp]) t?.destroy();
    this.sceneTex = this.emitTex = this.downTex = this.blurTemp = null;
    try { this.context.unconfigure(); } catch { /* context may already be gone */ }
    // Buffers are freed with the device. Destroying the device releases the
    // adapter and all resources — v1 has no reuse path.
    try { this.device.destroy(); } catch { /* device may already be lost */ }
    this.canvas = null;
    this.hits = [];
    this.lastFrameAtMs = null;
  }
}

// getComputedStyle can throw in exotic embeddings; never let palette reading
// abort renderer construction.
function readGpuPaletteSafe(): GpuPalette {
  try { return readGpuPalette(); } catch { return readGpuPaletteFallback(); }
}
function readGpuPaletteFallback(): GpuPalette {
  const accent = hexToRgb01(FALLBACK.accent);
  const accentHover = hexToRgb01(FALLBACK.accentHover);
  const blue = hexToRgb01(FALLBACK.blue);
  const bgBase = hexToRgb01(FALLBACK.bgBase);
  const bgElevated = hexToRgb01(FALLBACK.bgElevated);
  return {
    bgBase, bgSurface: hexToRgb01(FALLBACK.bgSurface), bgElevated,
    borderMuted: hexToRgb01(FALLBACK.borderMuted), borderSubtle: hexToRgb01(FALLBACK.borderSubtle),
    accent, accentHover, blue,
    textPrimary: hexToRgb01(FALLBACK.textPrimary), textSecondary: hexToRgb01(FALLBACK.textSecondary),
    towerColors: [accent, mix(accent, WHITE, 0.32), mix(accent, BLACK, 0.3), mix(accent, BLACK, 0.12), accentHover],
    creepPalette: { blue, blueDark: mix(blue, BLACK, 0.45), white: WHITE, accent, track: bgBase },
  };
}
