/// <reference types="@webgpu/types" />
// src/game/runtime/render/createRenderer.ts
//
// The single construction seam GameClient uses. Runtime-PROBES the full
// WebGPU chain (navigator.gpu -> requestAdapter -> an adapter.limits check
// -> requestDevice -> pipeline build under a validation error scope, ALL
// inside WebGpuRenderer.init() -> only then getContext('webgpu') ->
// configure), retries once with featureLevel 'compatibility', then returns
// an INITIALIZED Canvas2DRenderer. Presence of navigator.gpu is NOT enough —
// an adapter can be null, lack a limit a pipeline needs, or fail pipeline
// validation, and players must never hit a blank canvas (spec §9.2). Power
// preference is deliberately NOT 'high-performance'.
//
// Canvas-commitment ordering is load-bearing here, not just tidiness:
// canvas.getContext('webgpu') PERMANENTLY sets a canvas element's
// context-mode — a later canvas.getContext('2d') on that SAME element
// returns null forever (HTML spec). A real, common trigger: a
// compatibility-mode adapter reporting maxStorageBuffersInVertexStage = 0
// (the sprite pipeline binds a storage buffer in the vertex stage), which
// reliably fails pipeline validation on the 'compatibility' retry. If
// getContext('webgpu') had already run before that failure — as it used to,
// right here in acquireGpu — the Canvas2D fallback below would call
// canvas.getContext('2d') on an already-webgpu-committed canvas, get null,
// throw, and reject this whole promise: a dead end, exactly the blank-canvas
// outcome the fallback exists to prevent. So acquireGpu below never touches
// `canvas` at all — it only builds a device — and WebGpuRenderer.init()
// (which DOES take the canvas) defers getContext('webgpu')/configure()
// until after its pipelines are already confirmed to validate.
//
// NEVER throws synchronously when navigator.gpu is absent: it returns a
// promise that resolves to Canvas2D. The promise rejects ONLY if Canvas2D's
// own init throws (jsdom's stub canvas), which GameClient's try/catch already
// handles — that is what keeps GameClient.test.tsx green.
//
// The WebGPU backend is a SEPARATE async chunk (`await import(...)`), so a
// Canvas2D-only visitor downloads zero WebGPU bytes.
import type { Renderer } from "./Renderer";
import type { GpuBundle } from "./webgpu/WebGpuRenderer";
import { Canvas2DRenderer } from "./canvas2d/Canvas2DRenderer";

export interface CreateRendererOptions {
  /** Force the Canvas2D fallback (the ?renderer=canvas2d escape hatch). Default true. */
  preferWebgpu?: boolean;
}

// Deliberately takes no `canvas` — see the file header. Acquires an adapter
// + device + preferred format only; never calls canvas.getContext('webgpu'),
// so it can never commit a canvas to WebGPU context-mode on a path that
// might still end up falling back to Canvas2D.
//
// featureLevel is a newer requestAdapter option; some @webgpu/types releases
// do not type it yet, hence the localized options builder + cast.
async function acquireGpu(featureLevel?: "compatibility"): Promise<GpuBundle> {
  const gpu = typeof navigator !== "undefined" ? navigator.gpu : undefined;
  if (!gpu) throw new Error("createRenderer: navigator.gpu absent");
  const adapterOpts: GPURequestAdapterOptions = {};
  if (featureLevel) (adapterOpts as GPURequestAdapterOptions & { featureLevel?: string }).featureLevel = featureLevel;
  const adapter = await gpu.requestAdapter(adapterOpts);
  if (!adapter) throw new Error("createRenderer: requestAdapter returned null");
  // The sprite pipeline (shaders.ts SPRITE_WGSL) binds a read-only storage
  // buffer at the VERTEX stage (the per-instance `instances` array, read in
  // `vs`). Compatibility-mode adapters commonly report 0 here — checking it
  // up front means that realistic failure throws right here, before
  // requestDevice or any pipeline build, and (critically) before `canvas` is
  // ever touched by anything in this module. @webgpu/types marks this limit
  // optional ("temporarily... until all browsers have implemented it"), so
  // an unreported value is treated as fine — today's ordinary (non-compat)
  // desktop adapters don't populate it because it doesn't constrain them —
  // and only an explicit value below 1 fails here.
  const vertexStorageLimit = adapter.limits.maxStorageBuffersInVertexStage;
  if (vertexStorageLimit !== undefined && vertexStorageLimit < 1) {
    throw new Error(
      "createRenderer: adapter.limits.maxStorageBuffersInVertexStage < 1 (sprite pipeline needs a vertex-stage storage buffer)"
    );
  }
  const device = await adapter.requestDevice();
  const format = gpu.getPreferredCanvasFormat();
  return { adapter, device, format };
}

export async function createRenderer(canvas: HTMLCanvasElement, opts?: CreateRendererOptions): Promise<Renderer> {
  const preferWebgpu = opts?.preferWebgpu ?? true;
  if (preferWebgpu && typeof navigator !== "undefined" && navigator.gpu) {
    const attempts: Array<"compatibility" | undefined> = [undefined, "compatibility"];
    for (const featureLevel of attempts) {
      let bundle: GpuBundle | null = null;
      try {
        bundle = await acquireGpu(featureLevel);
        const { WebGpuRenderer } = await import("./webgpu/WebGpuRenderer");
        const r = new WebGpuRenderer(bundle);
        // init() builds every pipeline under pushErrorScope and only calls
        // canvas.getContext('webgpu') afterward, once they're confirmed to
        // validate — see the file header. So if this line throws, `canvas`
        // is guaranteed to still be untouched, and the Canvas2D fallback
        // below can still claim it.
        await r.init(canvas);
        return r;
      } catch (err) {
        console.warn(`createRenderer: WebGPU init failed (featureLevel=${featureLevel ?? "default"}) — trying fallback`, err);
        try { bundle?.device?.destroy(); } catch { /* ignore */ }
        // try next attempt, then Canvas2D
      }
    }
  }
  // Canvas2D fallback. Awaited init throws under jsdom's stub canvas -> the
  // returned promise rejects -> GameClient logs "renderer failed to
  // initialize" and bails (keeps GameClient.test.tsx green).
  const fallback = new Canvas2DRenderer();
  await fallback.init(canvas);
  return fallback;
}
