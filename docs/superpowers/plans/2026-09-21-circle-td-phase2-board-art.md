# Circle TD — Phase 2 Board Art Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Restyle the Circle TD board — backdrop, two track loops, 186 build tiles — into a cohesive dark neon-geometric board (Approach A: refined procedural), render-only, both backends at visual parity.

**Architecture:** Enrich existing draw code + shaders using palette brightness + shape only. No new atlas frames (board always renders; fallback contract untouched). WebGPU track gains a per-vertex emissive channel so a thin edge band blooms through the existing MRT/composite; Canvas2D mirrors with strokes + `shadowBlur`.

**Tech Stack:** TypeScript, WGSL (inline template strings), Canvas2D + WebGPU renderers, Vitest.

**Spec:** [`docs/superpowers/specs/2026-09-21-circle-td-phase2-board-art-design.md`](../specs/2026-09-21-circle-td-phase2-board-art-design.md) (and its foundation doc). Read the spec — it carries the per-surface design.

## Global Constraints

- Render-only: edit only `src/game/runtime/render/**` (`canvas2d/**`, `webgpu/**`). NEVER `src/game/sim/**` or `src/game/titles/circle-td/**`.
- Determinism golden `5167b43d` + `SIM_VERSION 2` untouched; never run `UPDATE_GOLDEN`.
- Brand rule: board stays NEUTRAL (brightness steps of `bg-*`/`border-*`/`text-*`, mixed toward `text-primary`/black); reserve accent(red)/blue for units; accent only for the transient place ghost. No third hue.
- WGSL: keep `textureSample`/`fwidth` in uniform control flow (the track shader adds none).
- WebGPU `MAX_SPRITES=4096`, keep under the `cap()` guard.
- Never a blank board (keep fallback contract). Dev loop: `next build && next start`, never `next dev`.
- This is renderer/shader-only — no Next.js API touched, so `node_modules/next/dist/docs/` guides don't apply (heed AGENTS.md only if you touch a page/route).
- Git author: `Michael Wright <m.wright2@lafilm.edu>`.
- Visual correctness is verified in-browser by the controller (jsdom canvas is a stub; WGSL isn't vitest-testable). Implementers implement the mechanism + the spec's initial values and MUST leave values easy to tune (named constants).

---

### Task 1: Backdrop & ambiance (both backends)

**Files:**
- Modify: `src/game/runtime/render/canvas2d/Canvas2DRenderer.ts` (`drawBackdrop` ~:523, `makeBackdropGradient` ~:492, `makeVignetteGradient` ~:509)
- Modify: `src/game/runtime/render/webgpu/shaders.ts` (`BACKDROP_WGSL` ~:21)
- Modify: `src/game/runtime/render/webgpu/WebGpuRenderer.ts` (backdrop uniform upload ~:258-264)

**Interfaces:**
- Produces: a deepened radial floor + stronger vignette + a very faint 32px grid, matched across both backends. No signature changes; no exports consumed by later tasks.

- [ ] **Step 1 — Canvas2D:** In `drawBackdrop`, deepen the cached radial floor (more center-lift toward `bg-elevated`/`bg-surface`, darker `bg-base` at edges), strengthen the vignette, and add a cached faint 32px grid pass (very low alpha ~0.06–0.12, neutral `border-subtle`) drawn between floor and vignette. Cache the grid like the gradients (offscreen or a reusable Path2D) so it's not rebuilt per frame.
- [ ] **Step 2 — WebGPU:** In `BACKDROP_WGSL`, re-tune the center/mid/edge mix to match, and add a faint procedural 32px grid in the fragment shader (compute stage-space coords from `uv`, thin lines via `fwidth` — this is a uniform fullscreen pass so it's uniformity-safe). Keep `emit=0`. Update the 3 backdrop color uniforms in `WebGpuRenderer.ts` if their source values change.
- [ ] **Step 3 — Build + typecheck:** `npx tsc --noEmit` clean; `npm run build` succeeds (WGSL compiles).
- [ ] **Step 4 — Tests:** `npx vitest run` green (determinism `5167b43d` unchanged, purity, lazy-boundary).
- [ ] **Step 5 — Commit** (author `Michael Wright <m.wright2@lafilm.edu>`, trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`). Do NOT push (controller pushes after visual verification).

---

### Task 2: Track lanes — recessed dark channel + glowing neon edge (both backends)

**Files:**
- Create: `src/game/runtime/render/webgpu/trackBands.ts` (pure builder) + `trackBands.test.ts`
- Modify: `src/game/runtime/render/webgpu/shaders.ts` (`TRACK_WGSL` ~:38 — add emissive attr/varying)
- Modify: `src/game/runtime/render/webgpu/WebGpuRenderer.ts` (`trackBuf` build ~:236-254, `trackPipeline` vertex layout ~:436-445, `trackBundle` ~:311-316)
- Modify: `src/game/runtime/render/canvas2d/Canvas2DRenderer.ts` (`drawTrack` ~:554)
- Reuse: `src/game/runtime/render/webgpu/tessellateTrack.ts` (call at 3 widths; do not change it)

**Interfaces:**
- Consumes: `tessellateTrack(points, width) → Float32Array` (positions only, 6 verts/segment).
- Produces: `buildTrackBands(loops, opts) → Float32Array` interleaved `[x,y, r,g,b, e]` (stride 6 floats / 24 bytes) concatenating, per loop, a bright full-width rim band (e>0), an inset dark lane band (e=0), and a faint thin center strip; plus the vertex count. WebGPU consumes it as `trackBuf`.

- [ ] **Step 1 — Write the failing test** for the pure builder (`trackBands.test.ts`): given two small loops, `buildTrackBands` returns a `Float32Array` whose length is a multiple of 6, where the first band's vertices carry `e = EDGE_EMISSIVE`, the inset band's `e = 0`, and the inset band uses a smaller width than the rim (assert via a stub of `tessellateTrack` or by counting/inspecting vertex groups). Run: `npx vitest run src/game/runtime/render/webgpu/trackBands.test.ts` → FAIL (module missing).
- [ ] **Step 2 — Implement `buildTrackBands`** (pure, float-only, DOM/GPU-free): for each loop call `tessellateTrack(poly, TRACK_WIDTH)` (rim, `e=EDGE_EMISSIVE`, neon-edge color, brighter for OUTER), `tessellateTrack(poly, TRACK_WIDTH - 2*EDGE_PX)` (dark lane, `e=0`), `tessellateTrack(poly, CENTER_PX)` (center strip, low `e`), interleaving each position with its `(r,g,b,e)`; concatenate rim → lane → center so later bands draw over earlier. Colors are passed in (neutral brightness steps, from the renderer's palette). Return the interleaved `Float32Array`. Run the test → PASS.
- [ ] **Step 3 — `TRACK_WGSL`:** add `@location(2) e: f32` to the vertex input and `VsOut`, pass it through `vs`, and in `fs` set `o.emit = vec4f(in.color * in.e, 1.0)` (keep `o.scene = vec4f(in.color, 1.0)`; no derivatives → uniformity-safe).
- [ ] **Step 4 — `WebGpuRenderer.ts`:** build `trackBuf` from `buildTrackBands(...)` with palette-sourced colors; update `trackPipeline`'s vertex buffer layout to `arrayStride 24`, attributes `pos@0` (float32x2, offset 0), `col@1` (float32x3, offset 8), `e@2` (float32, offset 20); rebuild `trackBundle`; keep the whole pipeline build inside `init()`'s `pushErrorScope('validation')`/`popErrorScope()` and log+fall back on error (preserves the "never blank" contract). Verify the draw-vertex-count math matches the new stride.
- [ ] **Step 5 — Canvas2D `drawTrack`:** per loop, stroke the dark recessed lane at `TRACK_WIDTH` (toward `bg-base`), then a thin bright edge (~3px) with `ctx.shadowBlur`/`shadowColor` glow (brighter for OUTER), then a faint thin center strip; reset `shadowBlur`/`lineDash` after. Use the same neutral brightness colors as the WebGPU side so they match.
- [ ] **Step 6 — Build + typecheck + tests:** `npx tsc --noEmit`; `npm run build` (WGSL compiles, pipeline validates); `npx vitest run` green (new test + determinism `5167b43d` + purity + lazy-boundary + existing `tessellateTrack` test).
- [ ] **Step 7 — Commit** (same author/trailer as Task 1). Do NOT push.

---

### Task 3: Build tiles — inset rounded HUD-pads (both backends)

**Files:**
- Modify: `src/game/runtime/render/canvas2d/Canvas2DRenderer.ts` (`drawTiles` ~:607)
- Modify: `src/game/runtime/render/webgpu/shaders.ts` (`SPRITE_WGSL` shape dispatch ~:107-144 — add `sdRoundBox`)
- Modify: `src/game/runtime/render/webgpu/WebGpuRenderer.ts` (tile loop in `packFrame` ~:592-612)
- Possibly: `src/game/runtime/render/webgpu/pack.ts` (if a `SHAPE_ROUND_*` const is added there alongside the other `SHAPE_*`)

**Interfaces:**
- Consumes: existing tile geometry (`TILES`, `tileHalf = TILE_SIZE*0.44`) and palette; `writeSprite` (16 floats) with a shape id + emissive.
- Produces: tiles rendered as inset rounded pads (rounded fill + thin top highlight + rounded/again border), preserving the armed-dim (0.6) rule and the inter-tile gutter. No exports for later tasks.

- [ ] **Step 1 — WGSL:** add `fn sdRoundBox(p: vec2f, b: vec2f, r: f32) -> f32` to `SPRITE_WGSL` and two shape ids to the `fs` dispatch — e.g. `7` = rounded fill, `8` = rounded hollow (`abs(sdRoundBox(...)) - 0.08`). Pure SDF, no new derivatives. Mirror the ids as `SHAPE_ROUND_SQUARE`/`SHAPE_ROUND_SQUARE_LINE` consts next to the existing `SHAPE_*` in `pack.ts`.
- [ ] **Step 2 — WebGPU tile loop:** per tile emit rounded fill (id 7, `mix(bgElevated, textSecondary, ~0.9)` lifted slightly) + a thin top-highlight sprite (a short `SHAPE_SQUARE`, mixed toward `text-primary`, low alpha, low emissive) + a rounded border (id 8, `border-muted`/`text-secondary`), preserving the armed-unaffordable 0.6 dim. Keep it ≤3 sprites/tile (558 total) under `cap()`. (Parity-safe fallback if rounded SDF misbehaves: square `SHAPE_SQUARE`/`SHAPE_SQUARE_LINE` retuned + highlight — note it in the report.)
- [ ] **Step 3 — Canvas2D `drawTiles`:** `roundRect` fill + thin top highlight line + rounded border, same colors/alphas + armed-dim rule as WebGPU so they match. Keep the ~4px gutter.
- [ ] **Step 4 — Build + typecheck + tests:** `npx tsc --noEmit`; `npm run build` (WGSL compiles); `npx vitest run` green (determinism `5167b43d`, purity, lazy-boundary, pack tests).
- [ ] **Step 5 — Commit** (same author/trailer). Do NOT push.

---

## Controller-owned verification (after the implementer tasks)

1. In-app parity pass (`next build && next start`): WebGPU (`data-renderer=webgpu`) and Canvas2D (`?renderer=canvas2d`) — screenshot both, confirm backdrop/track/tiles read identically, the WebGPU track edge blooms without a shader-compile fallback, units still pop, no regression to towers/creeps/FX.
2. Tune brightness/glow/grid/edge values by eye (edit the named constants directly).
3. Final `npx tsc --noEmit` + `npx vitest run` + `npm run build && node scripts/check-bundle-budget.mjs` green.
4. Push to `origin/games/circle-td`.
