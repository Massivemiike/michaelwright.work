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
// `init()` builds every buffer, pipeline, bind group, AND the static render
// bundle, under a validation error scope, before it ever calls
// `canvas.getContext('webgpu')`. That call permanently sets a canvas
// element's context-mode — a later `canvas.getContext('2d')` on the SAME
// element returns null forever — so if it happened earlier and any of those
// fallible GPU steps then failed to validate (e.g. a compat-mode adapter
// missing a vertex-stage storage buffer), createRenderer.ts's Canvas2D
// fallback would be defeated on an already-committed canvas. See GpuBundle's
// comment and this class's init() for the mechanics.
import type { Renderer, RendererCaps, HitEvent, InterpCreep } from "../Renderer";
import { interpolateById } from "../Renderer";
import type { RenderSnapshot } from "@/game/titles/circle-td/snapshot";
import { toFloat } from "@/game/sim/math/fixed";
import { TILE_SIZE, TRACK_WIDTH, TILES, TRACK, TOWERS } from "@/game/titles/circle-td/content";
import { computeFit, screenToWorld as sharedScreenToWorld, worldToClip, type Fit } from "../transform";
import { buildTrackBands, TRACK_BAND_STRIDE } from "./trackBands";
import {
  SPRITE_FLOATS, SHAPE_RING, SHAPE_SQUARE, SHAPE_SQUARE_LINE, SHAPE_CIRCLE,
  SHAPE_ROUND_SQUARE, SHAPE_ROUND_SQUARE_LINE,
  writeSprite, packTowers, packCreeps, type Rgb, type CreepPalette, type FrameUvFor,
} from "./pack";
import { BACKDROP_WGSL, TRACK_WGSL, SPRITE_WGSL, BLIT_WGSL, BLUR_WGSL, COMPOSITE_WGSL } from "./shaders";
import { loadAtlas } from "../loadAtlas";
import { frameUv, hasFrame, type AtlasManifest } from "../atlas";
import { spawnDeathBurst, spawnMuzzle, advanceParticles, particleDraw, type Particle, type ParticleTint } from "../particles";

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
const MAX_SPRITES = 4096;       // tiles(186*2: fill+border)+towers+ghost+creeps*3(<=300)+bursts+particles — ample headroom
// Hard cap on live FX particles — bounds per-frame cost (each is one extra
// instanced quad) well inside MAX_SPRITES. A death burst is 6-8 particles, so
// this holds ~50-65 concurrent deaths' worth before it stops spawning.
const MAX_PARTICLES = 400;
const HDR_FORMAT: GPUTextureFormat = "rgba16float";

// Backdrop tunables (Phase 2 board art, S1) — mirror the Canvas2D twin
// (Canvas2DRenderer.ts BACKDROP_*) and the WGSL consts in shaders.ts
// BACKDROP_WGSL. These two feed the center/edge COLOR uniforms uploaded in
// init(); the vignette strength + grid pitch/alpha live as WGSL consts. Keep
// all three places' numbers in sync or the two backends drift apart.
const BACKDROP_CENTER_LIFT = 0.7;  // centre lifted from bg-surface toward bg-elevated
const BACKDROP_EDGE_DEEPEN = 0.35; // edge pushed past bg-base toward black

// Track lane tunables (Phase 2 board art, S2) — mirror the Canvas2D twin
// (Canvas2DRenderer.ts TRACK_*). Each loop is a recessed dark channel with a
// thin bright NEUTRAL neon rim that blooms (brighter OUTER) plus a faint center
// strip. The rim/center colors are brightness steps of the border/text
// neutrals (NEVER the enemy blue, NEVER a new hue): mix(borderMuted ->
// textPrimary). OUTER is brighter than INNER purely via that mix ratio; the
// emissive is a single constant so the bloom radius is uniform across loops.
// Keep these in sync with the Canvas2D twin EXCEPT TRACK_EDGE_MIX_* (see below).
const TRACK_EDGE_PX = 3;              // visible bright rim width on each side
const TRACK_CENTER_PX = 2;           // faint center light-strip width
const TRACK_EDGE_EMISSIVE = 0.5;     // rim bloom — modest so it stays in-palette
const TRACK_CENTER_EMISSIVE = 0.15;  // center strip glow — barely there
// DELIBERATELY dimmer than the Canvas2D twin (0.85/0.55): the WebGPU rim also
// receives additive emissive bloom (TRACK_EDGE_EMISSIVE) on top, so its base
// colour is toned down to land at the same perceived brightness. Do NOT re-sync
// these to Canvas2D's values (commit 813b6bf) — that reblows the rim to white.
const TRACK_EDGE_MIX_OUTER = 0.72;   // borderMuted -> textPrimary for OUTER rim (steel, not blown-white)
const TRACK_EDGE_MIX_INNER = 0.45;   // borderMuted -> textPrimary for INNER rim
const TRACK_DARK_MIX = 0.2;          // bgBase -> black for the recessed lane
const TRACK_CENTER_MIX = 0.35;       // borderMuted -> textPrimary for center strip

// Build-tile HUD-pad tunables (Phase 2 board art, S3) — mirror the Canvas2D
// twin (Canvas2DRenderer.ts TILE_*). Each buildable tile is an inset ROUNDED
// pad: a fill a step above the floor (bgElevated mixed toward textSecondary,
// then nudged toward textPrimary for a lifted/raised read), a thin raised
// top-edge highlight, and a thin rounded border. Neutral brightness steps only
// (NEVER a hue). The pad's corner radius lives in the WGSL (sdRoundBox r=0.30)
// and in Canvas2D's TILE_CORNER_FRAC — keep those two in sync. Keep the rest of
// these in sync with the Canvas2D twin or the two backends drift apart.
const TILE_FILL_MIX = 0.9;           // bgElevated -> textSecondary for the pad fill
const TILE_FILL_LIFT = 0.06;         // then nudge the fill toward textPrimary (raised)
const TILE_FILL_ALPHA = 0.82;        // pad fill alpha
const TILE_BORDER_ALPHA = 0.85;      // rounded border alpha
const TILE_HILITE_MIX = 0.5;         // fill -> textPrimary for the top-edge highlight
const TILE_HILITE_ALPHA = 0.5;       // top-highlight alpha (subtle, low)
const TILE_HILITE_WIDTH_FRAC = 0.68; // highlight bar half-width as a fraction of tileHalf (clears the rounded corners)
const TILE_HILITE_HALF_Y = 1;        // highlight bar half-height (px) — a thin line
const TILE_HILITE_OFFSET_PX = 3;     // highlight bar centre, px below the pad's top edge

interface HitFlash { x: number; y: number; tx: number; ty: number; kind: number; ageMs: number; }

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
  // Findings 1 & 5: set true at the top of destroy() so the device.lost
  // handler (which device.destroy() itself resolves) can tell an intentional
  // teardown apart from a genuine, unexpected device loss and stay quiet on
  // the former.
  private destroyed = false;
  private palette: GpuPalette = readGpuPaletteSafe();

  // Persistent GPU resources (init).
  private globalsBuf!: GPUBuffer;      // mat4 clip + vec4 params (80 bytes)
  private backdropBuf!: GPUBuffer;     // 4x vec4 colors (64 bytes): center/mid/edge/grid
  private instanceBuf!: GPUBuffer;     // storage, MAX_SPRITES sprites
  private trackBuf!: GPUBuffer;        // vertex: [x,y,r,g,b,e] per vertex (stride 24)
  private trackVertCount = 0;
  private sampler!: GPUSampler;
  private backdropPipeline!: GPURenderPipeline;
  private trackPipeline!: GPURenderPipeline;
  private spritePipeline!: GPURenderPipeline;
  private blitPipeline!: GPURenderPipeline;
  private blurPipeline!: GPURenderPipeline;
  private compositePipeline!: GPURenderPipeline;
  private globalsBind!: GPUBindGroup;   // globals only (track)
  private spriteBind!: GPUBindGroup;    // globals + instances + atlas tex/sampler (sprite)
  private backdropBind!: GPUBindGroup;
  private trackBundle!: GPURenderBundle;
  private blurBufH!: GPUBuffer;
  private blurBufV!: GPUBuffer;

  // Sprite atlas (Phase 1 texture art). Until the async load resolves,
  // spriteBind samples `placeholderTex` (1x1 white) and every sprite is
  // untextured (SDF), so the game renders immediately and correctly. On a
  // successful load `atlasTex` holds the uploaded sheet, spriteBind is rebuilt
  // to sample it, and `atlasReady` flips true so packFrame starts emitting
  // textured tower/creep bodies. Any load/upload failure leaves this all off
  // => SDF stays forever ("never a blank board").
  private placeholderTex: GPUTexture | null = null;
  private atlasTex: GPUTexture | null = null;
  private atlasManifest: AtlasManifest | null = null;
  private atlasReady = false;

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
  private readonly globalsData = new Float32Array(20); // 16 mat clip + 4 params (params unused — no shader reads them)
  private readonly instanceData = new Float32Array(MAX_SPRITES * SPRITE_FLOATS);
  private hits: HitFlash[] = [];
  private lastFrameAtMs: number | null = null;
  private tilesPx: Float32Array = new Float32Array(0);

  // Textured FX particles (death bursts + muzzle flashes) — render-only,
  // shared pure logic in ../particles.ts. `lastCreepPos` maps a live creep id
  // to its last-seen world position so a death (an id present last render but
  // gone this render) is detected once, independent of render rate (see
  // stepParticles).
  private particles: Particle[] = [];
  private lastCreepPos = new Map<number, [number, number]>();

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
    // before the first real use of it (canvas.getContext('webgpu')), for why
    // that has to wait until after every fallible GPU step has validated.
    this.palette = readGpuPaletteSafe();

    const device = this.device;

    // Static track bands (both loops), Phase 2 (S2): each loop is a recessed
    // dark channel with a bright neutral neon rim that blooms + a faint center
    // strip, built by the pure trackBands module (interleaved [x,y,r,g,b,e],
    // 6 floats/vert). The rim/center colors are brightness steps of the
    // border/text neutrals — no hue — and OUTER's rim is a brighter step than
    // INNER's for the depth hierarchy. Emissive is constant; only the rim band
    // carries it (>0) so only the rim feeds the bloom target (TRACK_WGSL emits
    // color*e). See trackBands.ts for the band/draw-order mechanism.
    this.tilesPx = toFloatPairs(TILES);
    const pal = this.palette;
    const rimOuter = mix(pal.borderMuted, pal.textPrimary, TRACK_EDGE_MIX_OUTER);
    const rimInner = mix(pal.borderMuted, pal.textPrimary, TRACK_EDGE_MIX_INNER);
    const darkLane = mix(pal.bgBase, BLACK, TRACK_DARK_MIX);
    const centerCol = mix(pal.borderMuted, pal.textPrimary, TRACK_CENTER_MIX);
    const trackData = buildTrackBands(
      [toFloatPairs(TRACK.outer), toFloatPairs(TRACK.inner)],
      {
        trackWidth: TRACK_WIDTH,
        edgePx: TRACK_EDGE_PX,
        centerPx: TRACK_CENTER_PX,
        edgeEmissive: TRACK_EDGE_EMISSIVE,
        centerEmissive: TRACK_CENTER_EMISSIVE,
        colors: [
          { rim: rimOuter, dark: darkLane, center: centerCol },
          { rim: rimInner, dark: darkLane, center: centerCol },
        ],
      },
    );
    this.trackVertCount = trackData.length / TRACK_BAND_STRIDE;
    this.trackBuf = device.createBuffer({ size: trackData.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(this.trackBuf, 0, trackData);

    // Uniform + storage buffers.
    this.globalsBuf = device.createBuffer({ size: 80, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    // Backdrop color uniforms: center/mid/edge/grid (4x vec4f = 64 bytes).
    // center and edge mirror the Canvas2D gradient stops — centre lifted
    // BACKDROP_CENTER_LIFT of the way from bg-surface toward bg-elevated, edge
    // pushed BACKDROP_EDGE_DEEPEN past bg-base toward black. grid is the
    // neutral border-subtle tone the WGSL grid overlay tints toward; the
    // vignette strength + grid pitch/alpha live as consts in BACKDROP_WGSL.
    this.backdropBuf = device.createBuffer({ size: 64, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    const bg = new Float32Array(16);
    const center = mix(this.palette.bgSurface, this.palette.bgElevated, BACKDROP_CENTER_LIFT);
    const edge = mix(this.palette.bgBase, BLACK, BACKDROP_EDGE_DEEPEN);
    const grid = this.palette.borderSubtle;
    bg.set([center.r, center.g, center.b, 1], 0);
    bg.set([this.palette.bgSurface.r, this.palette.bgSurface.g, this.palette.bgSurface.b, 1], 4);
    bg.set([edge.r, edge.g, edge.b, 1], 8);
    bg.set([grid.r, grid.g, grid.b, 1], 12);
    device.queue.writeBuffer(this.backdropBuf, 0, bg);
    this.instanceBuf = device.createBuffer({ size: this.instanceData.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    this.blurBufH = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.blurBufV = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.sampler = device.createSampler({ magFilter: "linear", minFilter: "linear", addressModeU: "clamp-to-edge", addressModeV: "clamp-to-edge" });

    // Build every pipeline, every bind group, AND the static track bundle
    // under a SINGLE validation error scope; on ANY error, throw the marker
    // so the factory falls back to Canvas2D. None of these need the canvas or
    // context — only `device`, `this.format` (a string, from
    // navigator.gpu.getPreferredCanvasFormat() — see createRenderer.ts), and
    // the persistent buffers created above — which is exactly what lets them
    // ALL be validated before the next step below ever touches `canvas`.
    // (Finding 2: the bind groups and bundle used to be built AFTER
    // getContext('webgpu'), leaving a residual window in which a failure
    // there would strand the Canvas2D fallback on an already-committed
    // canvas. They are fallible device calls, so they belong before the
    // commit, under the same scope as the pipelines.)
    device.pushErrorScope("validation");
    this.buildPipelines();

    // Bind groups that never change (buffers are persistent).
    this.globalsBind = device.createBindGroup({ layout: this.trackPipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: this.globalsBuf } }] });
    // 1x1 white placeholder atlas texture so the sprite bind group is valid
    // from the first frame — before (and if) the real atlas ever loads. The
    // sprite shader only samples it when a sprite's textured flag is set, and
    // nothing sets that flag until atlasReady, so this white texel is never
    // actually read on the SDF path; it just satisfies the bind-group layout.
    // writeTexture (not copyExternalImageToTexture) uploads the texel, so
    // TEXTURE_BINDING | COPY_DST is sufficient here.
    this.placeholderTex = device.createTexture({
      size: { width: 1, height: 1 }, format: "rgba8unorm",
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
    device.queue.writeTexture(
      { texture: this.placeholderTex }, new Uint8Array([255, 255, 255, 255]),
      { bytesPerRow: 4, rowsPerImage: 1 }, { width: 1, height: 1 }
    );
    // spriteBind reuses this.sampler (linear, clamp-to-edge — built above for
    // the post pipelines) as the atlas sampler at binding 3.
    this.spriteBind = this.makeSpriteBind(this.placeholderTex.createView());
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

    const err = await device.popErrorScope();
    if (err) throw new Error(`${WEBGPU_BUNDLE_MARKER}: ${err.message}`);

    // Only NOW, with every pipeline, bind group, and bundle already
    // known-good, do we touch the canvas. canvas.getContext('webgpu')
    // PERMANENTLY commits that canvas element's context-mode — a later
    // canvas.getContext('2d') on the same element returns null forever, per
    // the HTML spec. If this ran any earlier (e.g. before validation, as
    // createRenderer.ts's acquireGpu used to do), a failure discovered
    // afterward would strand createRenderer's Canvas2D fallback on a canvas
    // that can no longer produce a "2d" context, defeating the fallback and
    // leaving the player with a blank canvas (spec D7/§9.2 — never a blank
    // canvas). By this point, adapter-limit, pipeline, bind-group, and bundle
    // validation failures — the realistic ways WebGPU init fails on real
    // hardware — have already thrown, on a canvas that is still completely
    // untouched. getContext + configure are the LAST fallible GPU steps; only
    // assignments and the device.lost handler follow.
    const context = canvas.getContext("webgpu");
    if (!context) throw new Error(`${WEBGPU_BUNDLE_MARKER}: getContext('webgpu') returned null`);
    context.configure({ device, format: this.format, alphaMode: "opaque" });
    this.context = context;
    this.canvas = canvas;

    // v1: no-op-until-reload on device loss. device.destroy() (in destroy())
    // itself resolves device.lost, so an intentional teardown must not warn
    // (finding 5: skip when this.destroyed) — only a genuine, unexpected loss
    // should log.
    device.lost.then((info) => {
      if (this.destroyed) return;
      this.deviceLost = true;
      console.warn("WebGpuRenderer: device lost (no auto-reinit in v1)", info.message);
    });

    // Kick the atlas load WITHOUT awaiting — init() (and the first frame) must
    // not block on the network. The game renders SDF sprites until this
    // resolves; on success it rebuilds spriteBind + flips atlasReady, on
    // failure it stays SDF. Deliberately fire-and-forget (void).
    void this.loadAtlasIntoTexture();
  }

  // Builds the sprite bind group against `texView` as the atlas texture
  // (binding 2) with the shared linear sampler (binding 3). Called once in
  // init() with the 1x1 placeholder, then again from loadAtlasIntoTexture()
  // with the real atlas view once it's uploaded.
  private makeSpriteBind(texView: GPUTextureView): GPUBindGroup {
    return this.device.createBindGroup({
      layout: this.spritePipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.globalsBuf } },
        { binding: 1, resource: { buffer: this.instanceBuf } },
        { binding: 2, resource: texView },
        { binding: 3, resource: this.sampler },
      ],
    });
  }

  // Async, non-blocking (fired from init without await). Fetches+decodes the
  // atlas, uploads it to an rgba8unorm GPUTexture, rebuilds spriteBind to
  // sample it, and flips atlasReady. Bails silently on any failure (or if the
  // renderer was destroyed / the device lost while the fetch was in flight),
  // leaving the SDF path in place.
  private async loadAtlasIntoTexture(): Promise<void> {
    const res = await loadAtlas(
      "/games/circle-td/sprites/atlas.png",
      "/games/circle-td/sprites/atlas.json"
    );
    if (!res || this.destroyed || this.deviceLost) {
      // res itself may hold a decoded ImageBitmap even on the destroyed/lost
      // path; free it rather than leak it.
      res?.bitmap.close?.();
      return;
    }
    try {
      const { bitmap, manifest } = res;
      const tex = this.device.createTexture({
        size: { width: bitmap.width, height: bitmap.height },
        format: "rgba8unorm",
        // copyExternalImageToTexture writes via the GPU's blit path, which the
        // WebGPU spec requires to have COPY_DST | RENDER_ATTACHMENT on the
        // destination (TEXTURE_BINDING is then needed to sample it). Without
        // RENDER_ATTACHMENT the copy fails validation and the atlas would
        // never bind — so the flag IS needed here despite the plan's note.
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
      });
      this.device.queue.copyExternalImageToTexture(
        { source: bitmap },
        { texture: tex },
        { width: bitmap.width, height: bitmap.height }
      );
      bitmap.close?.();
      this.atlasTex = tex;
      this.atlasManifest = manifest;
      this.spriteBind = this.makeSpriteBind(tex.createView());
      this.atlasReady = true;
    } catch (err) {
      console.warn("WebGpuRenderer: atlas upload failed — staying on SDF sprites", err);
      res.bitmap.close?.();
    }
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
        // Stride 24 = [x,y (float32x2 @0), r,g,b (float32x3 @8), e (float32 @20)].
        // Matches trackBands.ts's interleaved output and TRACK_WGSL's vs inputs.
        buffers: [{ arrayStride: 24, attributes: [{ shaderLocation: 0, offset: 0, format: "float32x2" }, { shaderLocation: 1, offset: 8, format: "float32x3" }, { shaderLocation: 2, offset: 20, format: "float32" }] }],
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
    // One wall-clock dt for both hit flashes and particles (they age off real
    // elapsed time, not sim ticks — like the existing hit system).
    const now = nowMs();
    const dt = this.lastFrameAtMs === null ? 0 : Math.max(0, now - this.lastFrameAtMs);
    this.lastFrameAtMs = now;
    this.advanceHits(hits, dt);
    this.stepParticles(curr, hits, dt);
    const count = this.packFrame(prev, curr, alpha);
    const device = this.device;
    device.queue.writeBuffer(this.instanceBuf, 0, this.instanceData, 0, count * SPRITE_FLOATS);
    // globalsBuf holds only the clip matrix, uploaded once per resize(). No
    // shader reads g.params, so there is nothing to push per frame (finding
    // 3: the old per-frame time write gated nothing and is gone).

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

    // Atlas resolver, only once the sheet is uploaded. Maps a frame name to
    // its UV rect (or null when the sheet lacks it) so packTowers/packCreeps
    // emit textured bodies; undefined while unloaded => they stay SDF. Tints
    // are the exact palette colors the SDF path already uses (red-family
    // towerColors, blue-family creepPalette), so sprites come out on-brand.
    const manifest = this.atlasManifest;
    const frameUvFor: FrameUvFor | undefined =
      this.atlasReady && manifest
        ? (name: string) => (hasFrame(manifest, name) ? frameUv(manifest.width, manifest.height, manifest.frames[name]) : null)
        : undefined;

    // Idle build tiles: inset ROUNDED HUD-PADS (Phase 2 S3) — a fill a step
    // above the floor, a thin raised top-edge highlight, and a thin rounded
    // border, with the dark inter-tile gutter kept (half = TILE_SIZE*0.44,
    // ~28px pad on the 32px lattice) so they still read as a grid. Three
    // sprites per tile mirror the Canvas2D twin (drawTiles: roundRect fill +
    // top-highlight line + roundRect border): a rounded fill (SHAPE_ROUND_
    // SQUARE), a short top-highlight SHAPE_SQUARE near the top edge, and a
    // rounded border (SHAPE_ROUND_SQUARE_LINE). 3 x 186 = 558 sprites, well
    // under cap(). The fill lifts bgElevated toward text-secondary then a
    // touch toward text-primary; the border is text-secondary; the highlight
    // is the fill mixed further toward text-primary at low alpha with zero
    // emissive (a raised edge, not a glow). All three carry the same
    // armed-unaffordable 0.6 dim as Canvas2D. Neutral brightness steps only.
    const armedUnaffordable = this.highlightTowerType >= 0 && !this.highlightAffordable;
    const dim = armedUnaffordable ? 0.6 : 1;
    const tileFill = mix(mix(pal.bgElevated, pal.textSecondary, TILE_FILL_MIX), pal.textPrimary, TILE_FILL_LIFT);
    const tileHilite = mix(tileFill, pal.textPrimary, TILE_HILITE_MIX);
    const tileHalf = TILE_SIZE * 0.44;
    const hiliteHalfX = tileHalf * TILE_HILITE_WIDTH_FRAC;
    for (let i = 0; i < this.tilesPx.length && cap(); i += 2) {
      const tx = this.tilesPx[i];
      const ty = this.tilesPx[i + 1];
      // Rounded fill.
      o = writeSprite(out, o, tx, ty, tileHalf, tileHalf, tileFill, TILE_FILL_ALPHA * dim, SHAPE_ROUND_SQUARE, 0);
      // Thin raised top-edge highlight (short flat bar just inside the top edge).
      o = writeSprite(out, o, tx, ty - tileHalf + TILE_HILITE_OFFSET_PX, hiliteHalfX, TILE_HILITE_HALF_Y, tileHilite, TILE_HILITE_ALPHA * dim, SHAPE_SQUARE, 0);
      // Rounded border.
      o = writeSprite(out, o, tx, ty, tileHalf, tileHalf, pal.textSecondary, TILE_BORDER_ALPHA * dim, SHAPE_ROUND_SQUARE_LINE, 0);
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
    o = packTowers(out, o, Math.min(curr.towerCount, MAX_SPRITES - 8 - o / SPRITE_FLOATS | 0), curr.towerXY, curr.towerType, curr.towerLevel, pal.towerColors, this.highlightTowerIndex ?? -1, frameUvFor);

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
    o = packCreeps(out, o, slice, pal.creepPalette, frameUvFor);

    // Shooting FX (instanced quads / "particles"): a tower->creep tracer beam
    // that snaps out and fades fast, plus a white-hot impact core + expanding
    // accent ring at the struck creep. The beam is a thin SHAPE_SQUARE rotated
    // to point at the target (params.z angle); its accentHover hue reads over
    // the dark board and against the blue creeps, unlike the old red-on-red
    // flash that sat on the (also-red) tower and was invisible.
    for (const h of this.hits) {
      if (!cap()) break;
      const t = h.ageMs / HIT_LIFETIME_MS;
      const inv = t >= 1 ? 0 : 1 - t;
      if (inv <= 0) continue;
      const dx = h.tx - h.x, dy = h.ty - h.y;
      const len = Math.hypot(dx, dy);
      const beamInv = t >= 0.35 ? 0 : 1 - t / 0.35; // tracer gone by ~35% of lifetime
      if (len > 2 && beamInv > 0) {
        const ang = Math.atan2(dy, dx);
        o = writeSprite(out, o, (h.x + h.tx) / 2, (h.y + h.ty) / 2, len / 2, 0.5 + 1.1 * beamInv, pal.accentHover, 0.85 * beamInv, SHAPE_SQUARE, 1.5 * beamInv, ang);
        if (!cap()) break;
      }
      // Impact at the creep: white-hot core (bloom) + expanding accent ring.
      o = writeSprite(out, o, h.tx, h.ty, 1.5 + 3 * inv, 1.5 + 3 * inv, pal.textPrimary, inv, SHAPE_CIRCLE, 1.5 * inv);
      if (!cap()) break;
      const rr = 3 + t * 12;
      o = writeSprite(out, o, h.tx, h.ty, rr, rr, pal.accent, inv * 0.9, SHAPE_RING, 0.8 * inv);
    }

    // Textured FX particles (death bursts + muzzle flashes) — one emissive
    // tinted atlas quad each, drawn last (over everything). Only spawned when
    // fxReady(), and frameUvFor is defined whenever the atlas is loaded, so a
    // missing individual frame just skips that particle. High emissive feeds
    // the bloom pass so the glows/sparks bloom like the hit cores do.
    if (frameUvFor) {
      for (const p of this.particles) {
        if (!cap()) break;
        const uv = frameUvFor(p.frame);
        if (!uv) continue;
        const tt = p.lifeMs > 0 ? p.ageMs / p.lifeMs : 1;
        const d = particleDraw(p, tt);
        if (d.alpha <= 0) continue;
        const tint = this.particleTint(p.tint);
        o = writeSprite(out, o, p.x, p.y, d.size, d.size, tint, d.alpha, SHAPE_CIRCLE, 1.4, d.rot, uv, true);
      }
    }

    return o / SPRITE_FLOATS;
  }

  // `dt` (wall-clock ms since the last frame) is computed once in frame() and
  // shared with stepParticles so both effects age off the exact same clock.
  private advanceHits(incoming: HitEvent[], dt: number): void {
    for (const h of incoming) this.hits.push({ x: h.x, y: h.y, tx: h.tx, ty: h.ty, kind: h.kind, ageMs: 0 });
    if (dt > 0) for (const h of this.hits) h.ageMs += dt;
    if (this.hits.length > 0) this.hits = this.hits.filter((h) => h.ageMs < HIT_LIFETIME_MS);
  }

  // Whether the atlas is loaded AND actually carries all four FX frames — the
  // gate for spawning/drawing particles at all (else the SDF fallback path
  // draws no particles, matching "never a blank board" and the plan's "skip
  // particles entirely" when the art is unavailable).
  private fxReady(): boolean {
    const m = this.atlasManifest;
    return (
      this.atlasReady && m !== null &&
      hasFrame(m, "fx-glow") && hasFrame(m, "fx-star") &&
      hasFrame(m, "fx-muzzle") && hasFrame(m, "fx-smoke")
    );
  }

  // Spawns death bursts + muzzle flashes and ages the particle list by `dt`.
  //
  // Death detection is render-rate-independent: prev/curr snapshots are stable
  // between sim ticks, so `lastCreepPos` (rebuilt every render from curr) holds
  // exactly the ids that were alive at the previous render. Any id in it but
  // NOT in curr this render = a creep that died (or left) since — spawn ONE
  // burst at its last-known position, then rebuild the map so the next render
  // no longer has that id and never re-spawns it. Skipped on gameOver so the
  // end-of-run creep wipe doesn't fire dozens of bursts at once.
  private stepParticles(curr: RenderSnapshot, hits: HitEvent[], dt: number): void {
    if (!this.fxReady()) return;

    if (!curr.gameOver) {
      const currIds = new Set<number>();
      for (let i = 0; i < curr.creepCount; i++) currIds.add(curr.creepId[i]);
      for (const [id, pos] of this.lastCreepPos) {
        if (!currIds.has(id) && this.particles.length < MAX_PARTICLES) {
          this.particles.push(...spawnDeathBurst(pos[0], pos[1]));
        }
      }
    }

    // Rebuild lastCreepPos from curr (always — so a new run / gameOver resets
    // it and stale ids can't linger to false-trigger later).
    this.lastCreepPos.clear();
    for (let i = 0; i < curr.creepCount; i++) {
      this.lastCreepPos.set(curr.creepId[i], [curr.creepXY[i * 2], curr.creepXY[i * 2 + 1]]);
    }

    // Muzzle flash per incoming hit: the fx-muzzle art points "up" (-y), so
    // aim it along the tower->creep vector with +pi/2 (0 = +x).
    for (const h of hits) {
      if (this.particles.length >= MAX_PARTICLES) break;
      const ang = Math.atan2(h.ty - h.y, h.tx - h.x) + Math.PI / 2;
      this.particles.push(...spawnMuzzle(h.x, h.y, ang));
    }

    this.particles = advanceParticles(this.particles, dt);
    if (this.particles.length > MAX_PARTICLES) this.particles.length = MAX_PARTICLES;
  }

  // Maps a particle's `tint` to a concrete palette RGB (0..1). Mirrors the
  // Canvas2D mapping so both backends read on-brand.
  private particleTint(tint: ParticleTint): Rgb {
    const p = this.palette;
    switch (tint) {
      case "core": return mix(p.accentHover, WHITE, 0.4); // white-hot flash center
      case "spark": return p.textPrimary;                 // white sparks
      case "smoke": return mix(p.textSecondary, p.blue, 0.35); // desaturated grey/blue
      case "muzzle": return p.accentHover;                // hot muzzle flame
    }
  }

  destroy(): void {
    // Set first so the device.lost handler (device.destroy() below resolves
    // it) sees this loss as intentional and stays quiet (finding 5).
    // Idempotent: a repeat destroy() just re-sets flags and no-ops the
    // already-null textures / already-destroyed device.
    this.destroyed = true;
    for (const t of [this.sceneTex, this.emitTex, this.downTex, this.blurTemp]) t?.destroy();
    this.sceneTex = this.emitTex = this.downTex = this.blurTemp = null;
    // Atlas + placeholder textures (guard nulls — a load may never have
    // resolved, and destroy() is idempotent under StrictMode's double-mount).
    this.atlasTex?.destroy();
    this.placeholderTex?.destroy();
    this.atlasTex = this.placeholderTex = null;
    this.atlasManifest = null;
    this.atlasReady = false;
    // Finding 1: do NOT unconfigure the canvas context here. Under React
    // StrictMode both setup passes run createRenderer to completion on the
    // SAME <canvas>, and getContext('webgpu') hands back the SAME
    // GPUCanvasContext to each pass. A discarded pass's unconfigure() can
    // land AFTER the surviving pass has already configure()'d that shared
    // context, leaving the survivor's context unconfigured — getCurrentTexture()
    // then throws in the rAF loop and the canvas goes blank. device.destroy()
    // below frees THIS pass's own resources; the surviving pass's own
    // configure() already overrode the shared context, so there is nothing
    // here that needs unconfiguring.
    //
    // Buffers are freed with the device. Destroying the device releases the
    // adapter and all resources — v1 has no reuse path.
    try { this.device.destroy(); } catch { /* device may already be lost */ }
    this.canvas = null;
    this.hits = [];
    this.lastFrameAtMs = null;
    this.particles = [];
    this.lastCreepPos.clear();
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
