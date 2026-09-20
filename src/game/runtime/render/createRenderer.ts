/// <reference types="@webgpu/types" />
// src/game/runtime/render/createRenderer.ts
//
// The single construction seam GameClient uses. Runtime-PROBES the full
// WebGPU chain (navigator.gpu -> requestAdapter -> requestDevice ->
// getContext('webgpu') -> configure -> initial pipeline build under a
// validation error scope inside WebGpuRenderer.init), retries once with
// featureLevel 'compatibility', then returns an INITIALIZED Canvas2DRenderer.
// Presence of navigator.gpu is NOT enough — an adapter can be null or a
// configure/pipeline step can throw, and players must never hit a blank
// canvas (spec §9.2). Power preference is deliberately NOT 'high-performance'.
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

// featureLevel is a newer requestAdapter option; some @webgpu/types releases
// do not type it yet, hence the localized options builder + cast.
async function acquireGpu(canvas: HTMLCanvasElement, featureLevel?: "compatibility"): Promise<GpuBundle> {
  const gpu = typeof navigator !== "undefined" ? navigator.gpu : undefined;
  if (!gpu) throw new Error("createRenderer: navigator.gpu absent");
  const adapterOpts: GPURequestAdapterOptions = {};
  if (featureLevel) (adapterOpts as GPURequestAdapterOptions & { featureLevel?: string }).featureLevel = featureLevel;
  const adapter = await gpu.requestAdapter(adapterOpts);
  if (!adapter) throw new Error("createRenderer: requestAdapter returned null");
  const device = await adapter.requestDevice();
  const context = canvas.getContext("webgpu");
  if (!context) throw new Error("createRenderer: getContext('webgpu') returned null");
  const format = gpu.getPreferredCanvasFormat();
  context.configure({ device, format, alphaMode: "opaque" });
  return { adapter, device, context, format };
}

export async function createRenderer(canvas: HTMLCanvasElement, opts?: CreateRendererOptions): Promise<Renderer> {
  const preferWebgpu = opts?.preferWebgpu ?? true;
  if (preferWebgpu && typeof navigator !== "undefined" && navigator.gpu) {
    const attempts: Array<"compatibility" | undefined> = [undefined, "compatibility"];
    for (const featureLevel of attempts) {
      let bundle: GpuBundle | null = null;
      try {
        bundle = await acquireGpu(canvas, featureLevel);
        const { WebGpuRenderer } = await import("./webgpu/WebGpuRenderer");
        const r = new WebGpuRenderer(bundle);
        await r.init(canvas); // builds pipelines under pushErrorScope; throws on validation error
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
