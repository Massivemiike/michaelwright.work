# WebGPU Renderer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax.

**Goal:** Add a WebGPU rendering backend behind the existing 8-member `Renderer` interface — instanced sprites + real bloom within the Carbon Forge palette — that drops in via an async `createRenderer()` factory with a robust, never-dead-ending Canvas2D fallback.   **Architecture:** A pure shared `transform.ts` (fit / `screenToWorld` / `worldToClip`) feeds both renderers so hit-testing never drifts; the WebGPU backend renders instanced SDF quads (per-instance data in a storage buffer indexed by `instance_index`) into an rgba16float MRT, then downsamples + separably blurs the emissive target and composites bloom to the swapchain; an async factory runtime-probes the full GPU chain and falls back to an initialized `Canvas2DRenderer`. GameClient changes at exactly one seam.   **Tech Stack:** TypeScript strict, WebGPU (`@webgpu/types`, inline WGSL template strings), Canvas2D fallback, Vitest (pure-module node tests), Playwright (chromium render smoke + webkit/firefox fallback smoke).

**Spec:** docs/superpowers/specs/2026-09-18-circle-td-arcade-design.md (NOTE: the spec has DRIFTED from code — see the research map source-of-truth hierarchy; code + balance-tuning doc + progress ledger WIN over the spec on wire-format/economy/geometry. Renderer specifics live in spec §9; treat shipped `src/game/runtime/render/**` interfaces as ground truth.)

## Global Constraints (one line each, exact values): Next 16.2.4 + React 19.2.4 (reactCompiler on); TS strict; vitest; CI order = `tsc --noEmit` -> `npm test` (lazy-boundary + purity + determinism golden) -> `npm run build` -> `npm run check:bundle-budget`; do NOT break the lazy-boundary guard (never add an `@/game` import to a GUARDED file), the bundle-budget marker string (`"Canvas2DRenderer: 2D canvas context unavailable"` must stay in `scripts/check-bundle-budget.mjs` `GAME_MARKERS`), or the sim purity guard (integer/deterministic only under `src/game/sim/**` and `src/game/titles/circle-td/**`); AGENTS.md: READ `node_modules/next/dist/docs/` before writing any Next.js routing/rendering code; commit messages end with the trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`; branch is `games/circle-td`, do NOT push.

---

## Scope note (3A only)

This plan is the **WebGPU renderer only**. It does NOT touch: the leaderboard, `/api/**`, Supabase, `TitleDef`/sim-layering refactor, `fireTowers` perf, the balance sweep, or the cross-engine determinism gate — those are **Plan 3B**. The renderer is read-only over `RenderSnapshot`; it changes **no** sim code, so the golden determinism hash is unaffected. The Playwright harness stood up here is **designed for 3B to reuse** for its cross-engine gate (same `playwright.config.ts`, add a spec + all-three-engine project).

**Load-bearing invariants (verified 2026-09-19 against HEAD `4ff3cd4`):**
- Seam file is `src/app/games/circle-td/GameClient.tsx` (NOT `src/components/game/`). Current construction: `import { Canvas2DRenderer }` (line 40), `const renderer: Renderer = new Canvas2DRenderer()` (line 309), `await renderer.init(canvas!)` (line 326), `if (!alive){ renderer.destroy(); return; }` (lines 341-344), cleanup `renderer.destroy()` (line 583). The loop `tick`/`render` closures are declared **inside** `setup()`, so they may close over a `setup()`-local `renderer`. Pointer/sync handlers read `rendererRef.current`, never the local — so cleanup must destroy via the ref.
- `RendererCaps.kind` **already** is `"canvas2d" | "webgpu"` (Renderer.ts:22) — no interface edit needed. Nothing outside the two renderer files reads `.caps` or `.caps.particles` (verified by grep) — the value is a pure hint.
- Static geometry (all from `@/game/titles/circle-td/content`): `STAGE_W=840`, `STAGE_H=680`, `TILE_SIZE=32`, `TRACK_WIDTH=64` (`=TILE_SIZE*2`), `TILES` (Int32Array Q16.16 centres), `TILE_COUNT=186`, `TRACK.outer`/`TRACK.inner` (Int32Array Q16.16 polylines, last point == first, one zero-length wrap edge), `TOWERS[5]` with `.range0`/`.rangeStep` as `Fx`, `.cost`, `.footprint`, `.name`. Convert Q16.16→float via `toFloat` from `@/game/sim/math/fixed` **once** at init.
- Creep flags from `@/game/sim/state`: `CREEP_FAST=1`, `CREEP_AIR=2`, `CREEP_HARD=4`.
- Fit transform (must reproduce EXACTLY, Canvas2DRenderer.ts:350-366): `pxW=round(cssW*dpr)`, `pxH=round(cssH*dpr)`, `scale = pxW>0&&pxH>0 ? min(pxW/STAGE_W, pxH/STAGE_H) : 1`, `offsetX=(pxW-STAGE_W*scale)/2`, `offsetY=(pxH-STAGE_H*scale)/2`.
- `screenToWorld` MUST stay byte-identical to Canvas2DRenderer.ts:396-405 (feeds `tileAtWorld`); WebGPU's internal projection is Y-flipped NDC but `screenToWorld` still returns Y-down stage-px.
- New files under `src/game/runtime/render/**` are exempt from the lazy-boundary guard AND outside the purity guard (both verified) — GPU/DOM/float/`Math.*` all allowed there.
- **Never `next dev`** to visually verify (space-in-path Turbopack bug per MEMORY); **never `curl`** the live site (Vercel 429 per MEMORY). Human visual pass = `next build && next start` in a real WebGPU browser (Chrome/Edge).

---

## File Structure

| File | Create/Modify | One responsibility |
|---|---|---|
| `src/game/runtime/render/transform.ts` | Create | Pure fit/`screenToWorld`/`worldToClip` math shared by BOTH renderers (single source of the world↔screen transform). |
| `src/game/runtime/render/transform.test.ts` | Create | Node unit tests: `computeFit` letterbox, `screenToWorld` == old Canvas2D formula, `worldToClip` Y-flip + round-trip. |
| `src/game/runtime/render/canvas2d/Canvas2DRenderer.ts` | Modify | Refactor `resize()`/`screenToWorld()` to consume `transform.ts` — behaviour-identical. |
| `src/game/runtime/render/webgpu/tessellateTrack.ts` | Create | Pure: expand a Q16.16-derived float polyline into a triangle band of `TRACK_WIDTH`. |
| `src/game/runtime/render/webgpu/tessellateTrack.test.ts` | Create | Node unit tests for band geometry + zero-length-segment skip. |
| `src/game/runtime/render/webgpu/pack.ts` | Create | Pure per-instance sprite packers (writer + `packTowers` + `packCreeps`) from typed arrays → instance floats. |
| `src/game/runtime/render/webgpu/pack.test.ts` | Create | Node unit tests: field layout, offsets, flag→shape/size, hp-bar danger blend. |
| `src/game/runtime/render/webgpu/shaders.ts` | Create | Inline WGSL template strings (backdrop, solid track, instanced sprite, blit, blur, composite). |
| `src/game/runtime/render/webgpu/shaders.test.ts` | Create | Structural test: each shader export non-empty and declares expected entry points/bindings. |
| `src/game/runtime/render/webgpu/WebGpuRenderer.ts` | Create | `class WebGpuRenderer implements Renderer` — negotiation-agnostic; pipelines, MRT scene pass, bloom post, instanced draw; owns the WebGPU bundle marker string. |
| `src/game/runtime/render/createRenderer.ts` | Create | `async createRenderer(canvas, opts?)` — runtime-probe GPU chain (retry w/ compatibility), fall back to initialized Canvas2D; `?renderer=canvas2d` respected via `opts`. |
| `src/app/games/circle-td/GameClient.tsx` | Modify | Single seam edit: `await createRenderer` in `setup()`, second `!alive` destroy, cleanup via `rendererRef.current?.destroy()`, escape hatch, `canvas.dataset.renderer`. |
| `package.json` | Modify | Add `@webgpu/types` + `@playwright/test` devDeps; add `test:e2e` script. |
| `scripts/check-bundle-budget.mjs` | Modify | Extend `GAME_MARKERS` with the WebGPU-unique marker (Canvas2D one kept intact). |
| `playwright.config.ts` | Create | Reusable Playwright config (3 browser projects, `build && start` webServer) — 3B extends it. |
| `e2e/circle-td-render.smoke.spec.ts` | Create | Chromium render smoke: backend engages, a frame draws, canvas not blank, no console errors. |
| `e2e/circle-td-fallback.smoke.spec.ts` | Create | WebKit/Firefox fallback smoke: `?renderer=canvas2d` engages Canvas2D, draws, playable. |
| `.github/workflows/ci.yml` | Modify | Add a `browser-smokes` job (per-commit) running the Playwright smokes. |
| `.gitignore` | Modify | Ignore `test-results/`, `playwright-report/`, `.playwright/`. |

---

### Task 1: Shared pure `transform.ts` + refactor Canvas2D to consume it

**Files:**
- Create: `src/game/runtime/render/transform.ts`
- Create (Test): `src/game/runtime/render/transform.test.ts`
- Modify: `src/game/runtime/render/canvas2d/Canvas2DRenderer.ts`

**Interfaces:**
- **Consumes:** `STAGE_W`, `STAGE_H` from `@/game/titles/circle-td/content` (both `=840`/`=680`).
- **Produces:**
  ```ts
  export interface Fit { scale: number; offsetX: number; offsetY: number; }
  export function computeFit(pxW: number, pxH: number): Fit;
  export function screenToWorld(clientX: number, clientY: number, canvas: HTMLCanvasElement, fit: Fit): { x: number; y: number };
  export function worldToClip(fit: Fit, pxW: number, pxH: number): Float32Array; // column-major mat4, world stage-px (y-down) -> WebGPU clip (y-up)
  ```
  `Fit` is field-identical to Canvas2D's private `Transform`, so the refactor is a drop-in.

Steps:

- [ ] **Step 1: Write the failing test for `transform.ts`.** Create `src/game/runtime/render/transform.test.ts`:
  ```ts
  // src/game/runtime/render/transform.test.ts
  import { describe, it, expect } from "vitest";
  import { computeFit, screenToWorld, worldToClip, type Fit } from "./transform";
  import { STAGE_W, STAGE_H } from "@/game/titles/circle-td/content";

  // The old Canvas2D screenToWorld formula, inlined verbatim, so this test
  // pins the shared implementation to byte-identical behaviour forever.
  function oldCanvas2dScreenToWorld(
    clientX: number, clientY: number, canvas: HTMLCanvasElement, t: Fit
  ): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect();
    const { scale, offsetX, offsetY } = t;
    if (scale <= 0 || rect.width <= 0 || rect.height <= 0) return { x: 0, y: 0 };
    const deviceX = (clientX - rect.left) * (canvas.width / rect.width);
    const deviceY = (clientY - rect.top) * (canvas.height / rect.height);
    return { x: (deviceX - offsetX) / scale, y: (deviceY - offsetY) / scale };
  }

  function fakeCanvas(bw: number, bh: number, rect: { left: number; top: number; width: number; height: number }): HTMLCanvasElement {
    return {
      width: bw, height: bh,
      getBoundingClientRect: () => ({ ...rect, right: rect.left + rect.width, bottom: rect.top + rect.height, x: rect.left, y: rect.top, toJSON() {} }),
    } as unknown as HTMLCanvasElement;
  }

  // Column-major mat4 * (x,y,0,1) -> (clipX, clipY)
  function mul(m: Float32Array, x: number, y: number): { x: number; y: number } {
    return { x: m[0] * x + m[4] * y + m[12], y: m[1] * x + m[5] * y + m[13] };
  }

  describe("computeFit", () => {
    it("scales 2x with no letterbox when the box is exactly 2x the stage", () => {
      const f = computeFit(STAGE_W * 2, STAGE_H * 2);
      expect(f.scale).toBeCloseTo(2);
      expect(f.offsetX).toBeCloseTo(0);
      expect(f.offsetY).toBeCloseTo(0);
    });
    it("letterboxes on the constrained axis and centers", () => {
      // Very wide box: height constrains -> vertical fit, horizontal bars.
      const f = computeFit(STAGE_W * 4, STAGE_H * 2);
      expect(f.scale).toBeCloseTo(2); // min(4,2) = 2
      expect(f.offsetX).toBeGreaterThan(0);
      expect(f.offsetY).toBeCloseTo(0);
    });
    it("returns scale 1 for a zero-size box", () => {
      expect(computeFit(0, 0).scale).toBe(1);
    });
  });

  describe("screenToWorld matches the old Canvas2D formula exactly", () => {
    it("agrees on a letterboxed, dpr-stretched canvas", () => {
      const fit = computeFit(1680, 1360);
      const canvas = fakeCanvas(1680, 1360, { left: 10, top: 20, width: 840, height: 680 });
      for (const [cx, cy] of [[10, 20], [430, 360], [850, 700]] as const) {
        const got = screenToWorld(cx, cy, canvas, fit);
        const want = oldCanvas2dScreenToWorld(cx, cy, canvas, fit);
        expect(got.x).toBeCloseTo(want.x, 9);
        expect(got.y).toBeCloseTo(want.y, 9);
      }
    });
    it("returns (0,0) on a degenerate transform", () => {
      const canvas = fakeCanvas(0, 0, { left: 0, top: 0, width: 0, height: 0 });
      expect(screenToWorld(5, 5, canvas, { scale: 0, offsetX: 0, offsetY: 0 })).toEqual({ x: 0, y: 0 });
    });
  });

  describe("worldToClip", () => {
    it("maps stage corners into clip with a Y flip", () => {
      const fit = computeFit(STAGE_W * 2, STAGE_H * 2); // scale 2, no offset
      const m = worldToClip(fit, STAGE_W * 2, STAGE_H * 2);
      const tl = mul(m, 0, 0);
      const br = mul(m, STAGE_W, STAGE_H);
      expect(tl.x).toBeCloseTo(-1); expect(tl.y).toBeCloseTo(1);   // top-left -> clip (-1, +1)
      expect(br.x).toBeCloseTo(1);  expect(br.y).toBeCloseTo(-1);  // bottom-right -> clip (+1, -1)
    });
    it("keeps the fitted stage centered under letterboxing", () => {
      const fit = computeFit(STAGE_W * 4, STAGE_H * 2);
      const m = worldToClip(fit, STAGE_W * 4, STAGE_H * 2);
      const center = mul(m, STAGE_W / 2, STAGE_H / 2);
      expect(center.x).toBeCloseTo(0);
      expect(center.y).toBeCloseTo(0);
    });
  });
  ```
  Run `npx vitest run src/game/runtime/render/transform.test.ts`. **Expected FAIL:** `Failed to resolve import "./transform"` (module does not exist yet).

- [ ] **Step 2: Implement `transform.ts` to pass.** Create `src/game/runtime/render/transform.ts`:
  ```ts
  // src/game/runtime/render/transform.ts
  //
  // The ONE place the Circle TD world<->screen transform lives, shared by
  // Canvas2DRenderer and WebGpuRenderer so pointer hit-testing (screenToWorld
  // -> tileAtWorld) can never drift between backends. Lives under
  // src/game/runtime/** (outside the sim purity guard AND exempt from the
  // lazy-boundary guard) so DOM types and Math.* are fair game here.
  import { STAGE_W, STAGE_H } from "@/game/titles/circle-td/content";

  // Letterbox+center fit of the fixed STAGE_W x STAGE_H stage into a device-
  // pixel backing store. Field-identical to Canvas2DRenderer's old private
  // Transform, so both renderers can hold one of these.
  export interface Fit {
    scale: number;
    offsetX: number;
    offsetY: number;
  }

  // Verbatim reproduction of Canvas2DRenderer.resize()'s fit math (lines
  // 350-366 as of HEAD 4ff3cd4). pxW/pxH are the device-pixel backing-store
  // dimensions (already round(cssW*dpr)).
  export function computeFit(pxW: number, pxH: number): Fit {
    const scale = pxW > 0 && pxH > 0 ? Math.min(pxW / STAGE_W, pxH / STAGE_H) : 1;
    const offsetX = (pxW - STAGE_W * scale) / 2;
    const offsetY = (pxH - STAGE_H * scale) / 2;
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
  ```
  Run `npx vitest run src/game/runtime/render/transform.test.ts`. **Expected PASS** (all cases green).

- [ ] **Step 3: Refactor Canvas2DRenderer to consume `transform.ts`.** In `src/game/runtime/render/canvas2d/Canvas2DRenderer.ts`: (a) add to the imports block (after line 32's `import { interpolateById } ...`):
  ```ts
  import { computeFit, screenToWorld as sharedScreenToWorld, type Fit } from "../transform";
  ```
  (b) Delete the local `interface Transform { scale; offsetX; offsetY; }` (lines 71-75) and change `const IDENTITY_TRANSFORM: Transform = ...` (line 98) to `const IDENTITY_TRANSFORM: Fit = { scale: 1, offsetX: 0, offsetY: 0 };`. (c) Change the field declaration `private transform: Transform = IDENTITY_TRANSFORM;` (line 278) to `private transform: Fit = IDENTITY_TRANSFORM;`. (d) Replace the body of `resize()` (lines 350-367) with:
  ```ts
    resize(cssW: number, cssH: number, dpr: number): void {
      const canvas = this.canvas;
      if (!canvas) return;
      const pxW = Math.round(cssW * dpr);
      const pxH = Math.round(cssH * dpr);
      canvas.width = pxW;
      canvas.height = pxH;
      // Fit math now lives in the shared transform module (see
      // ../transform.ts) so WebGpuRenderer computes the identical letterbox.
      this.transform = computeFit(pxW, pxH);
    }
  ```
  (e) Replace the body of `screenToWorld()` (lines 396-405) with:
  ```ts
    screenToWorld(clientX: number, clientY: number, canvas: HTMLCanvasElement): { x: number; y: number } {
      return sharedScreenToWorld(clientX, clientY, canvas, this.transform);
    }
  ```
  Keep every draw method unchanged (they read `this.transform.scale/offsetX/offsetY`, unchanged field shape).

- [ ] **Step 4: Verify behaviour-identical + commit.** Run `npx tsc --noEmit` (**expected: clean**), then `npx vitest run src/game/runtime/render src/app/games/circle-td/GameClient.test.tsx` (**expected: all PASS** — `transform.test.ts`, `Renderer.test.ts`, and the jsdom `GameClient.test.tsx` are green; the Canvas2D refactor is a pure delegation so no behavioural test changes). Commit:
  ```
  refactor(circle-td): extract shared pure world<->screen transform.ts; Canvas2D consumes it

  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
  ```

---

### Task 2: Pure instance packers + track tessellator

**Files:**
- Create: `src/game/runtime/render/webgpu/tessellateTrack.ts`
- Create (Test): `src/game/runtime/render/webgpu/tessellateTrack.test.ts`
- Create: `src/game/runtime/render/webgpu/pack.ts`
- Create (Test): `src/game/runtime/render/webgpu/pack.test.ts`

**Interfaces:**
- **Consumes:** `InterpCreep` from `../../Renderer` (`{ id; x; y; hp01; flags }`), `CREEP_AIR|FAST|HARD` from `@/game/sim/state`, `TOWERS` from `@/game/titles/circle-td/content`.
- **Produces:**
  ```ts
  // tessellateTrack.ts
  export function tessellateTrack(points: ArrayLike<number>, width: number): Float32Array; // [x,y, x,y, ...] triangles

  // pack.ts
  export const SPRITE_FLOATS = 12;              // stride 48 bytes; matches Instance in shaders.ts
  export const SHAPE_CIRCLE=0, SHAPE_TRIANGLE=1, SHAPE_DIAMOND=2, SHAPE_SQUARE=3,
               SHAPE_HEX=4, SHAPE_RING=5, SHAPE_SQUARE_LINE=6;
  export interface Rgb { r: number; g: number; b: number; }
  export function writeSprite(out: Float32Array, o: number, cx: number, cy: number,
    halfX: number, halfY: number, color: Rgb, alpha: number, shape: number, emissive: number): number;
  export function packTowers(out: Float32Array, o: number, count: number, xy: Float32Array,
    type: Int32Array, level: Int32Array, colors: readonly Rgb[], selectedIndex: number): number;
  export interface CreepPalette { blue: Rgb; blueDark: Rgb; white: Rgb; accent: Rgb; track: Rgb; }
  export function packCreeps(out: Float32Array, o: number, creeps: readonly InterpCreep[], pal: CreepPalette): number;
  ```
  Every packer returns the **next free float offset** so the renderer chains them into one instance buffer. Instance float layout (per sprite): `[cx, cy, halfX, halfY, r, g, b, a, shape, emissive, 0, 0]`.

Steps:

- [ ] **Step 1: Write the failing test for `tessellateTrack`.** Create `src/game/runtime/render/webgpu/tessellateTrack.test.ts`:
  ```ts
  // src/game/runtime/render/webgpu/tessellateTrack.test.ts
  import { describe, it, expect } from "vitest";
  import { tessellateTrack } from "./tessellateTrack";

  describe("tessellateTrack", () => {
    it("expands one horizontal segment into a width-wide band extended by half-width at both ends", () => {
      // segment (0,0)->(100,0), width 20 => hw 10; rect x in [-10,110], y in [-10,10]
      const v = tessellateTrack([0, 0, 100, 0], 20);
      expect(v.length).toBe(12); // 6 verts * (x,y) = 12 floats
      const xs = [v[0], v[2], v[4], v[6], v[8], v[10]];
      const ys = [v[1], v[3], v[5], v[7], v[9], v[11]];
      expect(Math.min(...xs)).toBeCloseTo(-10);
      expect(Math.max(...xs)).toBeCloseTo(110);
      expect(Math.min(...ys)).toBeCloseTo(-10);
      expect(Math.max(...ys)).toBeCloseTo(10);
    });

    it("skips a zero-length trailing segment (content.ts's wrap-closing duplicate point)", () => {
      // (0,0)->(50,0)->(50,0 duplicate): one real segment only.
      const v = tessellateTrack([0, 0, 50, 0, 50, 0], 8);
      expect(v.length).toBe(12); // still just one segment's 6 verts
    });

    it("emits two segments' worth of triangles for an L-shaped path", () => {
      const v = tessellateTrack([0, 0, 100, 0, 100, 100], 10);
      expect(v.length).toBe(24); // 2 segments * 12
    });
  });
  ```
  Run `npx vitest run src/game/runtime/render/webgpu/tessellateTrack.test.ts`. **Expected FAIL:** cannot resolve `./tessellateTrack`.

- [ ] **Step 2: Implement `tessellateTrack.ts`.** Create `src/game/runtime/render/webgpu/tessellateTrack.ts`:
  ```ts
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
  ```
  Run the test. **Expected PASS.**

- [ ] **Step 3: Write the failing test for `pack.ts`.** Create `src/game/runtime/render/webgpu/pack.test.ts`:
  ```ts
  // src/game/runtime/render/webgpu/pack.test.ts
  import { describe, it, expect } from "vitest";
  import {
    SPRITE_FLOATS, SHAPE_CIRCLE, SHAPE_DIAMOND, SHAPE_SQUARE,
    writeSprite, packTowers, packCreeps, type Rgb, type CreepPalette,
  } from "./pack";
  import type { InterpCreep } from "../../Renderer";
  import { CREEP_AIR, CREEP_FAST, CREEP_HARD } from "@/game/sim/state";

  const RED: Rgb = { r: 1, g: 0, b: 0 };

  describe("writeSprite", () => {
    it("writes 12 floats in the documented layout and returns the next offset", () => {
      const out = new Float32Array(SPRITE_FLOATS * 2);
      const next = writeSprite(out, 0, 100, 200, 8, 6, RED, 0.5, SHAPE_SQUARE, 0.7);
      expect(Array.from(out.slice(0, SPRITE_FLOATS))).toEqual([100, 200, 8, 6, 1, 0, 0, 0.5, SHAPE_SQUARE, 0.7, 0, 0]);
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
  ```
  Run `npx vitest run src/game/runtime/render/webgpu/pack.test.ts`. **Expected FAIL:** cannot resolve `./pack`.

- [ ] **Step 4: Implement `pack.ts`.** Create `src/game/runtime/render/webgpu/pack.ts`:
  ```ts
  // src/game/runtime/render/webgpu/pack.ts
  //
  // Pure per-instance sprite packers for the WebGPU backend. Each sprite is 12
  // floats / 48 bytes, matching `Instance` in shaders.ts (std430 storage):
  //   center.xy (0..1), half.xy (2..3), color.rgba (4..7), params.xyzw (8..11)
  //   params.x = shape id (SHAPE_*), params.y = emissive strength, zw reserved.
  // Colors arrive already resolved to [0,1] RGB (the renderer reads CSS vars);
  // this module is float-only, DOM-free, and node-unit-tested. Under
  // src/game/runtime/** => outside the sim purity guard (Math.*/float allowed).
  import type { InterpCreep } from "../../Renderer";
  import { CREEP_AIR, CREEP_FAST, CREEP_HARD } from "@/game/sim/state";
  import { TOWERS } from "@/game/titles/circle-td/content";

  export const SPRITE_FLOATS = 12;

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
  export function writeSprite(
    out: Float32Array, o: number,
    cx: number, cy: number, halfX: number, halfY: number,
    color: Rgb, alpha: number, shape: number, emissive: number
  ): number {
    out[o] = cx; out[o + 1] = cy; out[o + 2] = halfX; out[o + 3] = halfY;
    out[o + 4] = color.r; out[o + 5] = color.g; out[o + 6] = color.b; out[o + 7] = alpha;
    out[o + 8] = shape; out[o + 9] = emissive; out[o + 10] = 0; out[o + 11] = 0;
    return o + SPRITE_FLOATS;
  }

  // Shape per tower type (Fast=circle, Air=triangle, Slow=diamond,
  // Splash=square, Damage=hex — TOWERS declaration order, mirrors Canvas2D).
  const TOWER_SHAPE = [SHAPE_CIRCLE, SHAPE_TRIANGLE, SHAPE_DIAMOND, SHAPE_SQUARE, SHAPE_HEX];

  // One body sprite per tower, colored by `colors[type]`, size from footprint +
  // level (mirrors Canvas2D drawTowerShape's baseR), brighter emissive when
  // selected. Range rings are the renderer's job (they need TOWERS.range + the
  // accent color), kept out of here so this stays a pure body packer.
  export function packTowers(
    out: Float32Array, o: number, count: number,
    xy: Float32Array, type: Int32Array, level: Int32Array,
    colors: readonly Rgb[], selectedIndex: number
  ): number {
    let off = o;
    for (let i = 0; i < count; i++) {
      const t = Math.max(0, Math.min(TOWERS.length - 1, type[i]));
      const lv = Math.max(0, Math.min(9, level[i]));
      const footprint = TOWERS[t] ? TOWERS[t].footprint : 1;
      const r = 7 + footprint * 2.5 + t * 0.4 + lv * 0.5;
      const selected = i === selectedIndex;
      const color = colors[t] ?? colors[0];
      off = writeSprite(out, off, xy[i * 2], xy[i * 2 + 1], r, r, color, 1, TOWER_SHAPE[t] ?? SHAPE_CIRCLE, selected ? 0.95 : 0.6);
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
  export function packCreeps(
    out: Float32Array, o: number, creeps: readonly InterpCreep[], pal: CreepPalette
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
      off = writeSprite(out, off, c.x, c.y, half, half, body, isFast ? 1 : 0.9, shape, isFast ? 0.9 : 0.5);

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
  ```
  Run the pack test. **Expected PASS** (all cases). Note: `packCreeps` writes 3 sprites/creep; the renderer sizes its instance buffer accordingly.

- [ ] **Step 5: Typecheck + commit.** Run `npx tsc --noEmit` (**expected clean**) and `npx vitest run src/game/runtime/render/webgpu` (**expected PASS**). Commit:
  ```
  feat(circle-td): pure WebGPU instance packers + track tessellator (node-tested)

  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
  ```

---

### Task 3: WGSL shaders module (inline template strings)

**Files:**
- Create: `src/game/runtime/render/webgpu/shaders.ts`
- Create (Test): `src/game/runtime/render/webgpu/shaders.test.ts`

**Interfaces:**
- **Consumes:** nothing (self-contained WGSL string constants).
- **Produces:**
  ```ts
  export const BACKDROP_WGSL: string;   // fullscreen radial gradient + vignette -> MRT (scene, emit=0)
  export const TRACK_WGSL: string;      // per-vertex-colored solid triangles -> MRT (scene, emit=0)
  export const SPRITE_WGSL: string;     // instanced SDF quads from a storage buffer -> MRT (scene premul, emit additive)
  export const BLIT_WGSL: string;       // fullscreen texture sample (emissive downsample)
  export const BLUR_WGSL: string;       // fullscreen separable 9-tap gaussian (direction via uniform)
  export const COMPOSITE_WGSL: string;  // scene + bloom -> swapchain
  ```
  Struct/binding contracts the renderer MUST honour:
  - `Globals { clip: mat4x4<f32>, params: vec4<f32> }` at `@group(0) @binding(0)` (uniform) for TRACK + SPRITE. `params.x` = time seconds (0 when reduced-motion).
  - SPRITE instance storage `Instance { center: vec2<f32>, half: vec2<f32>, color: vec4<f32>, params: vec4<f32> }` at `@group(0) @binding(1)` (read-only storage), `params.x`=shape, `params.y`=emissive.
  - BACKDROP `BgColors { center: vec4<f32>, mid: vec4<f32>, edge: vec4<f32> }` at `@group(0) @binding(0)` (uniform).
  - BLIT/BLUR/COMPOSITE: `@binding(0)` sampler, `@binding(1..)` textures; BLUR adds `Blur { dir: vec2<f32>, _pad: vec2<f32> }` uniform at `@binding(2)`; COMPOSITE samples scene `@binding(1)` + bloom `@binding(2)`.

Steps:

- [ ] **Step 1: Write the failing structural test.** Create `src/game/runtime/render/webgpu/shaders.test.ts`:
  ```ts
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
    it("scene-writing shaders declare a two-target MRT fragment output", () => {
      for (const src of [BACKDROP_WGSL, TRACK_WGSL, SPRITE_WGSL]) {
        expect(src).toContain("@location(0)");
        expect(src).toContain("@location(1)");
      }
    });
  });
  ```
  Run `npx vitest run src/game/runtime/render/webgpu/shaders.test.ts`. **Expected FAIL:** cannot resolve `./shaders`.

- [ ] **Step 2: Implement `shaders.ts`.** Create `src/game/runtime/render/webgpu/shaders.ts` with the exact content below (a shared fullscreen-VS snippet + the six shaders). WGSL SDFs are standard math (no third-party asset — spec §9.4 satisfied):
  ````ts
  // src/game/runtime/render/webgpu/shaders.ts
  //
  // Inline WGSL as template-literal strings (no `.wgsl` file imports => no
  // Turbopack loader config => `npm run build` stays green with zero config
  // change). All geometry is procedural/original (spec §9.4). The Carbon Forge
  // palette (spec §D4) is enforced by the renderer feeding palette-sourced
  // colors into every uniform/instance; nothing here invents a hue.

  // Shared fullscreen-triangle vertex stage. uv is texture-space (y-down).
  const FULLSCREEN_VS = /* wgsl */ `
  struct VsOut { @builtin(position) pos: vec4f, @location(0) uv: vec2f };
  @vertex fn vs(@builtin(vertex_index) vi: u32) -> VsOut {
    var p = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
    var o: VsOut;
    let xy = p[vi];
    o.pos = vec4f(xy, 0.0, 1.0);
    o.uv = vec2f((xy.x + 1.0) * 0.5, 1.0 - (xy.y + 1.0) * 0.5);
    return o;
  }`;

  export const BACKDROP_WGSL = /* wgsl */ `
  struct BgColors { center: vec4f, mid: vec4f, edge: vec4f };
  @group(0) @binding(0) var<uniform> bg: BgColors;
  ${FULLSCREEN_VS}
  struct FragOut { @location(0) scene: vec4f, @location(1) emit: vec4f };
  @fragment fn fs(@location(0) uv: vec2f) -> FragOut {
    let d = clamp(distance(uv, vec2f(0.5, 0.5)) / 0.7071, 0.0, 1.0);
    var c: vec3f;
    if (d < 0.5) { c = mix(bg.center.rgb, bg.mid.rgb, d / 0.5); }
    else { c = mix(bg.mid.rgb, bg.edge.rgb, (d - 0.5) / 0.5); }
    let vig = 1.0 - smoothstep(0.5, 1.0, d) * 0.5; // photographic vignette
    var o: FragOut;
    o.scene = vec4f(c * vig, 1.0);
    o.emit = vec4f(0.0, 0.0, 0.0, 1.0);
    return o;
  }`;

  export const TRACK_WGSL = /* wgsl */ `
  struct Globals { clip: mat4x4f, params: vec4f };
  @group(0) @binding(0) var<uniform> g: Globals;
  struct VsOut { @builtin(position) pos: vec4f, @location(0) color: vec3f };
  @vertex fn vs(@location(0) p: vec2f, @location(1) col: vec3f) -> VsOut {
    var o: VsOut;
    o.pos = g.clip * vec4f(p, 0.0, 1.0);
    o.color = col;
    return o;
  }
  struct FragOut { @location(0) scene: vec4f, @location(1) emit: vec4f };
  @fragment fn fs(in: VsOut) -> FragOut {
    var o: FragOut;
    o.scene = vec4f(in.color, 1.0);
    o.emit = vec4f(0.0, 0.0, 0.0, 1.0);
    return o;
  }`;

  export const SPRITE_WGSL = /* wgsl */ `
  struct Globals { clip: mat4x4f, params: vec4f };
  @group(0) @binding(0) var<uniform> g: Globals;
  struct Instance { center: vec2f, half: vec2f, color: vec4f, params: vec4f };
  @group(0) @binding(1) var<storage, read> instances: array<Instance>;
  struct VsOut {
    @builtin(position) pos: vec4f,
    @location(0) local: vec2f,
    @location(1) color: vec4f,
    @location(2) shape: f32,
    @location(3) emissive: f32,
  };
  @vertex fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VsOut {
    var corners = array<vec2f, 6>(
      vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0),
      vec2f(-1.0, -1.0), vec2f(1.0, 1.0), vec2f(-1.0, 1.0));
    let c = corners[vi];
    let inst = instances[ii];
    let world = inst.center + c * inst.half;
    var o: VsOut;
    o.pos = g.clip * vec4f(world, 0.0, 1.0);
    o.local = c;
    o.color = inst.color;
    o.shape = inst.params.x;
    o.emissive = inst.params.y;
    return o;
  }
  fn sdCircle(p: vec2f) -> f32 { return length(p) - 1.0; }
  fn sdBox(p: vec2f, b: vec2f) -> f32 { let d = abs(p) - b; return length(max(d, vec2f(0.0))) + min(max(d.x, d.y), 0.0); }
  fn sdDiamond(p: vec2f) -> f32 { return abs(p.x) + abs(p.y) - 1.0; }
  fn sdTriangle(pin: vec2f) -> f32 {
    let k = sqrt(3.0);
    var p = pin;
    p.x = abs(p.x) - 1.0;
    p.y = p.y + 1.0 / k;
    if (p.x + k * p.y > 0.0) { p = vec2f(p.x - k * p.y, -k * p.x - p.y) / 2.0; }
    p.x = p.x - clamp(p.x, -2.0, 0.0);
    return -length(p) * sign(p.y);
  }
  fn sdHex(pin: vec2f) -> f32 {
    let k = vec3f(-0.8660254, 0.5, 0.5773503);
    var p = abs(pin);
    p = p - 2.0 * min(dot(k.xy, p), 0.0) * k.xy;
    p = p - vec2f(clamp(p.x, -k.z, k.z), 1.0);
    return length(p) * sign(p.y);
  }
  struct FragOut { @location(0) scene: vec4f, @location(1) emit: vec4f };
  @fragment fn fs(in: VsOut) -> FragOut {
    let p = in.local;
    let s = in.shape;
    var d: f32;
    if (s < 0.5) { d = sdCircle(p); }
    else if (s < 1.5) { d = sdTriangle(p); }
    else if (s < 2.5) { d = sdDiamond(p); }
    else if (s < 3.5) { d = sdBox(p, vec2f(1.0)); }
    else if (s < 4.5) { d = sdHex(p); }
    else if (s < 5.5) { d = abs(sdCircle(p)) - 0.08; }        // ring
    else { d = abs(sdBox(p, vec2f(1.0))) - 0.08; }            // hollow square
    let aa = fwidth(d) + 1e-4;
    let cov = 1.0 - smoothstep(-aa, aa, d);
    if (cov <= 0.0) { discard; }
    let a = in.color.a * cov;
    var o: FragOut;
    o.scene = vec4f(in.color.rgb * a, a);                     // premultiplied
    o.emit = vec4f(in.color.rgb * a * in.emissive, a);        // additive-friendly
    return o;
  }`;

  export const BLIT_WGSL = /* wgsl */ `
  @group(0) @binding(0) var samp: sampler;
  @group(0) @binding(1) var tex: texture_2d<f32>;
  ${FULLSCREEN_VS}
  @fragment fn fs(@location(0) uv: vec2f) -> @location(0) vec4f {
    return textureSample(tex, samp, uv);
  }`;

  export const BLUR_WGSL = /* wgsl */ `
  @group(0) @binding(0) var samp: sampler;
  @group(0) @binding(1) var tex: texture_2d<f32>;
  struct Blur { dir: vec2f, pad: vec2f };
  @group(0) @binding(2) var<uniform> b: Blur;
  ${FULLSCREEN_VS}
  @fragment fn fs(@location(0) uv: vec2f) -> @location(0) vec4f {
    // 9-tap gaussian (normalized weights) along b.dir (already texel-scaled).
    let w = array<f32, 5>(0.227027, 0.1945946, 0.1216216, 0.054054, 0.016216);
    var acc = textureSample(tex, samp, uv) * w[0];
    for (var i = 1; i < 5; i = i + 1) {
      let off = b.dir * f32(i);
      acc = acc + textureSample(tex, samp, uv + off) * w[i];
      acc = acc + textureSample(tex, samp, uv - off) * w[i];
    }
    return acc;
  }`;

  export const COMPOSITE_WGSL = /* wgsl */ `
  @group(0) @binding(0) var samp: sampler;
  @group(0) @binding(1) var sceneTex: texture_2d<f32>;
  @group(0) @binding(2) var bloomTex: texture_2d<f32>;
  ${FULLSCREEN_VS}
  @fragment fn fs(@location(0) uv: vec2f) -> @location(0) vec4f {
    let scene = textureSample(sceneTex, samp, uv).rgb;
    let bloom = textureSample(bloomTex, samp, uv).rgb;
    // Additive bloom kept modest so glows stay within the Carbon Forge palette
    // (spec §D4) rather than blowing highlights to white.
    let c = scene + bloom * 0.55;
    return vec4f(c, 1.0);
  }`;
  ````
  Run the shaders test. **Expected PASS.**

- [ ] **Step 3: Typecheck + commit.** `npx tsc --noEmit` (**clean**), `npx vitest run src/game/runtime/render/webgpu/shaders.test.ts` (**PASS**). Commit:
  ```
  feat(circle-td): inline WGSL shaders (backdrop, track, instanced sprite SDF, bloom post)

  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
  ```

---

### Task 4: `@webgpu/types`, bundle marker, `WebGpuRenderer`, and the `createRenderer` factory

**Files:**
- Modify: `package.json` (add `@webgpu/types` devDep)
- Modify: `scripts/check-bundle-budget.mjs` (extend `GAME_MARKERS`)
- Create: `src/game/runtime/render/webgpu/WebGpuRenderer.ts`
- Create: `src/game/runtime/render/createRenderer.ts`

**Interfaces:**
- **Consumes:** the `Renderer`/`RendererCaps`/`HitEvent`/`InterpCreep`/`interpolateById` contract from `./Renderer`; `RenderSnapshot` from `@/game/sim/engine`; `toFloat` from `@/game/sim/math/fixed`; `STAGE_W/STAGE_H/TILE_SIZE/TRACK_WIDTH/TILES/TRACK/TOWERS` from `@/game/titles/circle-td/content`; `CREEP_*` from `@/game/sim/state`; `computeFit/screenToWorld/worldToClip` from `./transform`; `tessellateTrack` from `./webgpu/tessellateTrack`; all `pack.ts` + `shaders.ts` exports.
- **Produces:**
  ```ts
  // WebGpuRenderer.ts
  export const WEBGPU_BUNDLE_MARKER = "WebGpuRenderer: WebGPU pipeline build failed"; // bundle-budget marker
  export interface GpuBundle { adapter: GPUAdapter; device: GPUDevice; context: GPUCanvasContext; format: GPUTextureFormat; }
  export class WebGpuRenderer implements Renderer { constructor(gpu: GpuBundle); /* 8-member Renderer */ readonly caps = { kind: "webgpu", particles: true }; }

  // createRenderer.ts
  export interface CreateRendererOptions { preferWebgpu?: boolean; } // default true
  export async function createRenderer(canvas: HTMLCanvasElement, opts?: CreateRendererOptions): Promise<Renderer>;
  ```
  `createRenderer` NEVER throws synchronously when `navigator.gpu` is absent (returns a promise that resolves to Canvas2D, or rejects only if Canvas2D's own `init` throws — the jsdom case GameClient already catches). `caps.particles = true` because WebGPU renders GPU-instanced hit bursts (instanced quads, NOT a compute shader — spec §9.1's compute-particle acceptance is deferred; entities are bounded ≤100 creeps).

Steps:

- [ ] **Step 1: Add `@webgpu/types` and confirm it resolves.** Edit `package.json` `devDependencies`, adding (alphabetical, keep existing entries):
  ```json
      "@webgpu/types": "^0.1.60",
  ```
  Run `npm install`. Then run `npx tsc --noEmit` — **expected: still clean** (types installed but not yet referenced anywhere, so nothing changes). If the installed version differs, that is fine; any recent `@webgpu/types` provides the global `navigator.gpu`/`GPUDevice`/`GPUCanvasContext` declarations this task needs.

- [ ] **Step 2: Extend the bundle-budget markers (keep Canvas2D one intact).** In `scripts/check-bundle-budget.mjs`, replace the `GAME_MARKERS` declaration (line 63) with:
  ```js
  // String literal(s) that only ever appear in compiled src/game/** output.
  // Sourced from Canvas2DRenderer.ts (init throw) and WebGpuRenderer.ts
  // (WEBGPU_BUNDLE_MARKER — the pipeline-build failure throw). Two markers so
  // BOTH the always-loaded game chunk (Canvas2D) AND the separate
  // dynamically-imported WebGPU chunk are verified never to be referenced by a
  // prerendered marketing route's initial HTML. If NEITHER matches anything,
  // the "no chunk contains any marker" check below fails loudly (stale guard).
  const GAME_MARKERS = [
    "Canvas2DRenderer: 2D canvas context unavailable",
    "WebGpuRenderer: WebGPU pipeline build failed",
  ];
  ```
  (Do NOT remove or alter the Canvas2D string.) No build exists yet in this step, so do not run `check:bundle-budget` here — Task 6 verifies both markers appear after a real build.

- [ ] **Step 3: Create `WebGpuRenderer.ts`.** Create `src/game/runtime/render/webgpu/WebGpuRenderer.ts` with the full content below. It is negotiation-agnostic (the factory hands it an already-configured `GpuBundle`); `init()` builds all pipelines under a validation error scope and throws `WEBGPU_BUNDLE_MARKER` on failure so the factory can fall back:
  ```ts
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
  import type { Renderer, RendererCaps, HitEvent, InterpCreep } from "../Renderer";
  import { interpolateById } from "../Renderer";
  import type { RenderSnapshot } from "@/game/sim/engine";
  import { toFloat } from "@/game/sim/math/fixed";
  import { CREEP_AIR, CREEP_FAST, CREEP_HARD } from "@/game/sim/state";
  import { STAGE_W, STAGE_H, TILE_SIZE, TRACK_WIDTH, TILES, TRACK, TOWERS } from "@/game/titles/circle-td/content";
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

  export interface GpuBundle {
    adapter: GPUAdapter;
    device: GPUDevice;
    context: GPUCanvasContext;
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
    private readonly context: GPUCanvasContext;
    private readonly format: GPUTextureFormat;
    private canvas: HTMLCanvasElement | null = null;
    private fit: Fit = { scale: 1, offsetX: 0, offsetY: 0 };
    private pxW = 0;
    private pxH = 0;
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
    private tilesPx = new Float32Array(0);

    // Highlight/ghost state (same contract as Canvas2D).
    private highlightTowerIndex: number | null = null;
    private highlightTile = -1;
    private highlightTowerType = -1;
    private highlightAffordable = true;

    constructor(gpu: GpuBundle) {
      this.device = gpu.device;
      this.context = gpu.context;
      this.format = gpu.format;
    }

    async init(canvas: HTMLCanvasElement): Promise<void> {
      this.canvas = canvas;
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
      // throw the marker so the factory falls back to Canvas2D.
      device.pushErrorScope("validation");
      this.buildPipelines();
      const err = await device.popErrorScope();
      if (err) throw new Error(`${WEBGPU_BUNDLE_MARKER}: ${err.message}`);

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
      this.pxW = pxW;
      this.pxH = pxH;
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
  ```

- [ ] **Step 4: Create the `createRenderer` factory.** Create `src/game/runtime/render/createRenderer.ts`:
  ```ts
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
  ```

- [ ] **Step 5: Typecheck + build + commit.** Run `npx tsc --noEmit` — **expected clean** (GPU globals resolve via `@webgpu/types`; the `featureLevel` cast avoids version drift). Run `npm test` — **expected PASS** (existing suites unaffected; `GameClient.test.tsx` still uses the old Canvas2D construction until Task 5). Run `npm run build` then `npm run check:bundle-budget` — **expected PASS**, and the console line should now list TWO game chunk basenames (the always-loaded game chunk with the Canvas2D marker + the separate WebGPU chunk with the WebGPU marker), referenced by none of the prerendered marketing routes. If only one basename appears, the WebGPU chunk did not split; that is acceptable (the check still passes) but note it. Commit:
  ```
  feat(circle-td): WebGpuRenderer (instanced SDF sprites + MRT bloom) + createRenderer factory

  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
  ```

---

### Task 5: Wire GameClient to `createRenderer` (single seam edit)

**Files:**
- Modify: `src/app/games/circle-td/GameClient.tsx`
- (Test, unchanged): `src/app/games/circle-td/GameClient.test.tsx` — must stay green.

**Interfaces:**
- **Consumes:** `createRenderer` + `CreateRendererOptions` from `@/game/runtime/render/createRenderer`; the `Renderer` type (already imported).
- **Produces:** no new exports. Behavioural contract preserved: on renderer init failure the effect logs `"GameClient: renderer failed to initialize"` and bails without starting a loop/observer (the jsdom path); a live backend sets `rendererRef.current` and `canvas.dataset.renderer`.

**AGENTS.md gate:** before editing, read `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md` (this is a `'use client'` component; the edit only changes an effect body, not routing/rendering strategy — it stays dynamic-imported `ssr:false` via `PlayGate.tsx`, so no routing/rendering config changes, but confirm nothing in the pinned Next diverges for client effects).

Steps:

- [ ] **Step 1: Confirm the baseline test is green.** Run `npx vitest run src/app/games/circle-td/GameClient.test.tsx`. **Expected PASS** (2 GameClient lifecycle tests + 3 `mapTowerHitsToRenderHits` tests). This is the guardrail the edit must not break.

- [ ] **Step 2: Swap the import.** In `src/app/games/circle-td/GameClient.tsx`, replace line 40:
  ```ts
  import { Canvas2DRenderer } from "@/game/runtime/render/canvas2d/Canvas2DRenderer";
  ```
  with:
  ```ts
  import { createRenderer } from "@/game/runtime/render/createRenderer";
  ```
  (Keep line 41's `import type { Renderer, HitEvent } from "@/game/runtime/render/Renderer";` — both types are still used.)

- [ ] **Step 3: Remove the synchronous construction.** Delete lines 303-309 (the comment block ending in `for free.` plus `const renderer: Renderer = new Canvas2DRenderer();`). The `pendingHits` declaration and everything below it stay. (The loop `tick`/`render` closures declared later inside `setup()` will now close over a `setup()`-local `renderer` introduced in Step 4.)

- [ ] **Step 4: Rewrite the head of `setup()` to await the factory + add the second `!alive` guard.** Replace the current `setup()` prologue (lines 320-345, from `async function setup(): Promise<void> {` through `rendererRef.current = renderer;`) with:
  ```ts
      async function setup(): Promise<void> {
        // Escape hatch: ?renderer=canvas2d forces the Canvas2D fallback even
        // where WebGPU is available (debugging / cross-checking against the
        // fallback path). Read from the live URL, client-only (this effect).
        const preferWebgpu =
          new URLSearchParams(window.location.search).get("renderer") !== "canvas2d";

        let renderer: Renderer;
        try {
          // createRenderer probes WebGPU and returns an INITIALIZED backend,
          // or an initialized Canvas2D fallback. It rejects only when even
          // Canvas2D init fails (jsdom's stub canvas in tests) — the same
          // failure the old `await renderer.init(canvas!)` produced, so the
          // catch below (and GameClient.test.tsx's assertion on it) is intact.
          renderer = await createRenderer(canvas!, { preferWebgpu });
        } catch (err) {
          console.error("GameClient: renderer failed to initialize", err);
          return;
        }

        // StrictMode async-teardown guard (research 2.5): the effect that
        // started this setup() may already be torn down by the time the await
        // above resolves. With the factory there is no effect-scope `renderer`
        // for cleanup to destroy, so destroy the just-created backend HERE, or
        // a discarded first pass leaks a GPU device/context/canvas config.
        if (!alive) {
          renderer.destroy();
          return;
        }
        rendererRef.current = renderer;
        // Observability hook (also used by the Playwright smokes): which
        // backend actually engaged. Cheap, harmless, useful in prod debugging.
        canvas!.dataset.renderer = renderer.caps.kind;
  ```
  Everything after `rendererRef.current = renderer;` (the `makeLoop(...)` block through `syncUiState();`) is unchanged and now closes over this `setup()`-local `renderer`.

- [ ] **Step 5: Fix cleanup to destroy via the ref.** In the effect's cleanup return (near line 583), replace:
  ```ts
        renderer.destroy();
        rendererRef.current = null;
  ```
  with:
  ```ts
        // `renderer` is now a setup()-local, invisible here — destroy via the
        // ref (set only after the alive-guard passed). Null-safe: if setup()
        // bailed (init failure or !alive), the ref was never set.
        rendererRef.current?.destroy();
        rendererRef.current = null;
  ```

- [ ] **Step 6: Verify + commit.** Run `npx tsc --noEmit` (**clean**). Run `npx vitest run src/app/games/circle-td/GameClient.test.tsx` — **expected PASS**: in jsdom `navigator.gpu` is undefined → `createRenderer` skips WebGPU → `new Canvas2DRenderer(); await init(canvas)` throws `"2D canvas context unavailable"` → `createRenderer` rejects → the `catch` logs `"GameClient: renderer failed to initialize"` (the exact assertion), the canvas is present, StrictMode double-invoke + unmount stay clean (no loop/observer created). Run the full `npm test` (**expected PASS**). Commit:
  ```
  feat(circle-td): GameClient uses async createRenderer (WebGPU + Canvas2D fallback, StrictMode-safe)

  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
  ```

---

### Task 6: Playwright harness — render smoke + fallback smoke + CI job

**Files:**
- Modify: `package.json` (add `@playwright/test` devDep + `test:e2e` script)
- Create: `playwright.config.ts`
- Create: `e2e/circle-td-render.smoke.spec.ts`
- Create: `e2e/circle-td-fallback.smoke.spec.ts`
- Modify: `.github/workflows/ci.yml` (add `browser-smokes` job)
- Modify: `.gitignore`

**Interfaces:**
- **Consumes:** the running app at `http://localhost:3000` (started by the config's `webServer` via `npm run build && npm run start`); the `/games/circle-td` route with its "Free play" button and the `canvas[data-renderer]` attribute set in Task 5.
- **Produces:** a reusable `playwright.config.ts` (3B adds a determinism spec + all-three-engine project); two smoke specs; a per-commit `browser-smokes` CI job. Note: vitest globs `*.test.ts(x)`; Playwright uses `*.spec.ts` under `e2e/` — no collision.

Steps:

- [ ] **Step 1: Add Playwright dep + script.** Edit `package.json`: add to `devDependencies` (alphabetical): `"@playwright/test": "^1.50.0",` and add to `scripts`: `"test:e2e": "playwright test"`. Run `npm install`, then `npx playwright install chromium firefox webkit` (local browsers; CI uses `--with-deps` in the job below).

- [ ] **Step 2: Create the reusable Playwright config.** Create `playwright.config.ts` at the repo root:
  ```ts
  // playwright.config.ts
  //
  // Reusable Playwright harness for Circle TD. 3A uses it for the WebGPU
  // render smoke (chromium) + Canvas2D fallback smoke (webkit/firefox); Plan
  // 3B REUSES this same config for the cross-engine determinism gate (add a
  // spec + an all-three-engine project). The webServer runs `next build &&
  // next start` — NEVER `next dev` (space-in-path Turbopack dev bug per
  // MEMORY) — and we test the local server, never curl a Vercel URL (429).
  import { defineConfig, devices } from "@playwright/test";

  export default defineConfig({
    testDir: "e2e",
    fullyParallel: false,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 1 : 0,
    workers: 1,
    reporter: process.env.CI ? "github" : "list",
    timeout: 60_000,
    use: {
      baseURL: "http://localhost:3000",
      trace: "on-first-retry",
    },
    projects: [
      {
        name: "render-smoke",
        testMatch: /render\.smoke\.spec\.ts$/,
        use: {
          ...devices["Desktop Chrome"],
          launchOptions: {
            // Best-effort WebGPU in headless CI; the smoke still passes if no
            // adapter is available (it asserts fallback engaged instead).
            args: ["--enable-unsafe-webgpu", "--enable-features=Vulkan"],
          },
        },
      },
      { name: "fallback-webkit", testMatch: /fallback\.smoke\.spec\.ts$/, use: { ...devices["Desktop Safari"] } },
      { name: "fallback-firefox", testMatch: /fallback\.smoke\.spec\.ts$/, use: { ...devices["Desktop Firefox"] } },
    ],
    webServer: {
      command: "npm run build && npm run start",
      url: "http://localhost:3000",
      reuseExistingServer: !process.env.CI,
      timeout: 240_000,
    },
  });
  ```

- [ ] **Step 3: Create the render smoke (chromium).** Create `e2e/circle-td-render.smoke.spec.ts`:
  ```ts
  // e2e/circle-td-render.smoke.spec.ts
  import { test, expect } from "@playwright/test";

  // Render smoke (chromium): WebGPU inits OR the fallback engages, a frame
  // draws (canvas has a real backing store and is not a single flat color),
  // and nothing logs a console error. CI runners often have no GPU adapter, so
  // this tolerates either backend rather than requiring WebGPU.
  test("a backend engages, a frame draws, no console errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    page.on("pageerror", (e) => errors.push(e.message));

    await page.goto("/games/circle-td");
    await page.getByRole("button", { name: /free play/i }).click();

    const canvas = page.locator("canvas");
    await expect(canvas).toBeVisible();
    await expect(canvas).toHaveAttribute("data-renderer", /^(webgpu|canvas2d)$/);

    // Let the fixed-timestep loop render several frames.
    await page.waitForTimeout(600);

    const size = await canvas.evaluate((c: HTMLCanvasElement) => ({ w: c.width, h: c.height }));
    expect(size.w).toBeGreaterThan(0);
    expect(size.h).toBeGreaterThan(0);

    // "Not blank": draw the game canvas into a 2D canvas and count distinct
    // sampled pixels. drawImage reads the composited surface for both a WebGPU
    // and a Canvas2D source in Chromium.
    const distinct = await canvas.evaluate((c: HTMLCanvasElement) => {
      const off = document.createElement("canvas");
      off.width = c.width; off.height = c.height;
      const ctx = off.getContext("2d");
      if (!ctx) return 0;
      ctx.drawImage(c, 0, 0);
      const { data } = ctx.getImageData(0, 0, c.width, c.height);
      const seen = new Set<number>();
      for (let i = 0; i < data.length; i += 4 * 1009) {
        seen.add((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
        if (seen.size > 3) break;
      }
      return seen.size;
    });
    expect(distinct).toBeGreaterThan(1);
    expect(errors).toEqual([]);
  });
  ```

- [ ] **Step 4: Create the fallback smoke (webkit/firefox).** Create `e2e/circle-td-fallback.smoke.spec.ts`:
  ```ts
  // e2e/circle-td-fallback.smoke.spec.ts
  import { test, expect } from "@playwright/test";

  // Fallback smoke (webkit + firefox projects): forcing ?renderer=canvas2d
  // exercises the Canvas2D path deterministically (the escape hatch survives
  // the SPA "Free play" click since it never navigates), and the game is
  // playable without any GPU adapter.
  test("Canvas2D fallback engages and draws", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    page.on("pageerror", (e) => errors.push(e.message));

    await page.goto("/games/circle-td?renderer=canvas2d");
    await page.getByRole("button", { name: /free play/i }).click();

    const canvas = page.locator("canvas");
    await expect(canvas).toBeVisible();
    await expect(canvas).toHaveAttribute("data-renderer", "canvas2d");

    await page.waitForTimeout(600);

    const distinct = await canvas.evaluate((c: HTMLCanvasElement) => {
      const off = document.createElement("canvas");
      off.width = c.width; off.height = c.height;
      const ctx = off.getContext("2d");
      if (!ctx) return 0;
      ctx.drawImage(c, 0, 0);
      const { data } = ctx.getImageData(0, 0, c.width, c.height);
      const seen = new Set<number>();
      for (let i = 0; i < data.length; i += 4 * 1009) {
        seen.add((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
        if (seen.size > 3) break;
      }
      return seen.size;
    });
    expect(distinct).toBeGreaterThan(1);
    expect(errors).toEqual([]);
  });
  ```

- [ ] **Step 5: Ignore Playwright artifacts.** Append to `.gitignore`:
  ```
  # Playwright
  /test-results/
  /playwright-report/
  /.playwright/
  ```

- [ ] **Step 6: Add the CI job.** In `.github/workflows/ci.yml`, add a second job (sibling of `build-and-test`, after it) — per-commit so backend regressions are caught immediately:
  ```yaml
    browser-smokes:
      name: WebGPU render + Canvas2D fallback smokes (Playwright)
      runs-on: ubuntu-latest
      needs: build-and-test
      steps:
        - name: Checkout
          uses: actions/checkout@v4

        - name: Set up Node.js
          uses: actions/setup-node@v4
          with:
            node-version: 22
            cache: npm

        - name: Install dependencies
          run: npm ci

        # Browsers + OS deps for chromium (WebGPU render smoke), webkit and
        # firefox (Canvas2D fallback smoke).
        - name: Install Playwright browsers
          run: npx playwright install --with-deps chromium firefox webkit

        # playwright.config.ts's webServer runs `npm run build && npm run start`
        # (never `next dev`); the smokes tolerate a GPU-less runner by asserting
        # the Canvas2D fallback engaged. This job intentionally rebuilds; Plan
        # 3B may optimize by sharing the build-and-test artifact.
        - name: Run render + fallback smokes
          run: npx playwright test
  ```

- [ ] **Step 7: Run the smokes locally + verify + commit.** Run `npx playwright test` (this builds + starts the app, then runs all three projects). **Expected PASS:** render-smoke (chromium) — `data-renderer` is `webgpu` on a WebGPU-capable machine or `canvas2d` on a GPU-less one, canvas non-blank, no console errors; fallback-webkit + fallback-firefox — `data-renderer` is `canvas2d`, non-blank, no errors. Also re-run `npx tsc --noEmit` (**clean** — `playwright.config.ts` + specs typecheck under the repo tsconfig). Commit:
  ```
  test(circle-td): Playwright render + fallback smokes + CI job (reusable config for 3B)

  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
  ```

- [ ] **Step 8: Human visual verification (manual, not automated).** Run `npm run build && npm run start`, open `http://localhost:3000/games/circle-td` in a **real WebGPU browser** (Chrome/Edge — NEVER `next dev` per the space-in-path Turbopack bug; NEVER curl per Vercel 429). Confirm: `data-renderer="webgpu"` (DevTools → inspect the canvas), instanced sprites render, bloom glows on towers/creeps/hits stay within the Carbon Forge palette (no blown-out white), the track band + build-tile grid read clearly (≥3:1 against the backdrop), placement ghost/range ring/selected-tower ring appear, and `prefers-reduced-motion` (emulate in DevTools) disables the ambient time-driven glow. Then load `?renderer=canvas2d` and confirm the fallback is visually equivalent in layout (pointer→tile hit-testing lands on the same tiles — proves the shared `transform.ts`). Re-confirm Plan 2's build-phase render + highlight fixes (code-verified but never pixel-verified — the browser pane was stuck all of Plan 2). This step gates nothing in CI but is required before the renderer is considered done.

---

## Open items / launch gate

**Owner decisions already baked into this plan (locked):**
- Async `createRenderer(canvas, opts?)` factory with full-chain runtime probe + one compatibility retry + Canvas2D fallback; NEVER throws synchronously when `navigator.gpu` is absent.
- v1 uses **instanced quads** for particle/burst effects (NOT compute); `caps.particles = true` reflects the GPU-instanced hit bursts actually implemented.
- Bloom is a **real** post-process: MRT emissive rgba16float → downsample → separable gaussian → composite, within palette.
- `device.lost` → v1 **no-op-until-reload** (handler logs, no auto-reinit).
- `?renderer=canvas2d` escape hatch (factory `preferWebgpu` opt, read from URL in GameClient).
- Shared pure `transform.ts` consumed by both renderers; WGSL inline (no `.wgsl` loader); `@webgpu/types` dev-only; WebGPU-unique bundle marker added, Canvas2D marker intact.
- Single GameClient edit; second `!alive` destroy after the await; cleanup via `rendererRef.current?.destroy()`; typed only as `Renderer`.
- Playwright stood up here; render smoke (chromium) + fallback smoke (webkit/firefox); config reusable by 3B.

**Not in scope (Plan 3B):** leaderboard, `/api/**`, Supabase, `TitleDef`/sim-layering refactor, `fireTowers` perf, balance sweep, cross-engine determinism gate. This plan changes NO sim code — the golden determinism hash is unaffected.

**Launch-gate note (shared with 3B):** the renderer itself has no public-launch gate (it is a self-contained client drop-in behind the existing lazy boundary). The **public leaderboard** — not the renderer — is gated on (a) balance freeze / `SIM_VERSION` locked after owner playtest, (b) the cross-engine determinism gate green, (c) the balance sweep passing. 3A can ship independently of that gate.

**Residual risks / to confirm during implementation (see selfReviewNotes):**
1. **`requestAdapter({ featureLevel })` typing** — the installed `@webgpu/types` may or may not type `featureLevel`; the factory uses a localized cast. If the installed version types it, drop the cast.
2. **Smoke "not blank" via `drawImage(webgpuCanvas)`** — reliable in Chromium for both backends, but if a headless runner presents-then-clears the WebGPU drawing buffer, the render smoke's distinct-pixel check could read blank. Mitigation if flaky: switch to a Playwright element screenshot with a byte-variation heuristic, or gate the pixel check to `data-renderer==='canvas2d'` runners. Documented, not pre-solved.
3. **WebGPU chunk split** — the dynamic `import("./webgpu/WebGpuRenderer")` should emit a separate chunk carrying the WebGPU marker; if Turbopack inlines it, the marker lands in the main game chunk (check still passes, just without a distinct basename).
4. **Double build in CI** — `build-and-test` and `browser-smokes` each build; acceptable for 3A, 3B may share the artifact.
5. **`prefers-reduced-motion`** is read once at init (mirrors Canvas2D); it gates only the ambient time-driven glow, not real-event hit bursts.
