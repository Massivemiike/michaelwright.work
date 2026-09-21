# Circle TD — Phase 2 Board / Track / Tile Art (Approach A: refined procedural neon-geometric)

**Status:** Approved design (2026-09-21). **Branch:** `games/circle-td`.
**Foundation (current-state survey + exact hooks):** [`.superpowers/sdd/2026-09-21-circle-td-phase2-board-art/foundation.md`](../../../.superpowers/sdd/2026-09-21-circle-td-phase2-board-art/foundation.md) — read it for the exhaustive current-state map; this spec adds the Phase-2 design decisions on top.

## Goal

Give the Circle TD board its own art pass so it stops reading as "primitives under textured units." Restyle the **backdrop, the two track loops, and the 186 build tiles** into a cohesive dark neon-geometric board that matches the site's Carbon Forge design system and the Phase-1 unit sprites. **Render-only, both backends (WebGPU + Canvas2D), at visual parity.**

## Approach

**A — refined procedural.** Enrich the existing draw code and shaders using palette **brightness steps + shape** only. **No new atlas frames** for the board, so it always renders (no atlas gate) and the SDF/flat fallback contract is untouched. A crisp neon-geometric look is best done procedurally (vector-crisp edges that bloom naturally, resolution-independent, trivial backend parity).

## Global constraints (from foundation §6 — every task inherits these)

- **Render-only.** Work only under `src/game/runtime/render/**` (`canvas2d/**`, `webgpu/**`). Do NOT touch `src/game/sim/**` or `src/game/titles/circle-td/**` (geometry/`TRACK`/`TILES`/`rules` are frozen inputs).
- **Determinism golden `5167b43d` and `SIM_VERSION = 2` stay untouched.** A render pass can't affect them; never run `UPDATE_GOLDEN`.
- **Brand rule (load-bearing):** exactly ONE accent (red `#FF3B2F`) for player-owned, ONE blue (`#7FDBFF`) for enemy-owned, NEVER a third status hue. **All board variety comes from brightness (mix toward white/black) + shape/pattern.** The board itself stays **neutral** (built from `bg-base #08080C` / `bg-surface #0F0F15` / `bg-elevated #16161F` / `border-subtle #1F1F2E` / `border-muted #27273A` / `text-secondary #787F96`, mixed toward `text-primary #F0F2F8`/black) so red towers and blue creeps pop. Accent is allowed only for the transient place/hover ghost (an ownership/action cue).
- **WGSL uniformity:** derivative builtins (`textureSample`, `fwidth`) must stay in uniform control flow (the `f6f3787` bug). The track shader has no derivatives, so this only matters if a task adds sampling.
- **Budget:** `MAX_SPRITES = 4096`, ~2200+ headroom; keep new packers under the `cap()` guard. Canvas2D is immediate-mode (no budget).
- **Never a blank board:** preserve the fallback contract.
- **Dev loop:** `next build && next start` only — never `next dev`.
- **Git identity:** commit as `Michael Wright <m.wright2@lafilm.edu>` (the email maps to the Massivemiike account; matches this branch's history).

## Design — per surface, per backend

Draw order is unchanged: `backdrop → track → tiles → towers → ghost → creeps → hits → particles`.

### S1 · Backdrop & ambiance (the floor)

Deepen the lit-stage floor and pull focus to center; add a **very faint** structural grid as arena texture, kept well below the tile grid so it never competes (the old brighter grid was deliberately removed — this one is a whisper, ~0.06–0.12 alpha, and is a tunable knob).

- **Canvas2D** (`drawBackdrop` @ `Canvas2DRenderer.ts:523`, gradients `makeBackdropGradient:492` / `makeVignetteGradient:509`): keep the cached radial floor gradient but deepen the center-lift → edge falloff; strengthen the vignette; draw a cached faint 32px grid (single very-low-alpha pass) between the floor and the vignette.
- **WebGPU** (`BACKDROP_WGSL` @ `shaders.ts:21`, uniforms uploaded `WebGpuRenderer.ts:258-264`): re-tune the 3 color uniforms (center/mid/edge) to match Canvas2D; add the faint grid procedurally in the fullscreen fragment shader (uniform control flow — `fwidth` for crisp thin lines is fine in this uniform fullscreen pass). Keep `emit = 0` (backdrop must not bloom).

### S2 · Track lanes (the signature element) — the one non-trivial piece

Each loop reads as a **recessed dark channel** (darker than the floor) with a **thin bright neutral neon edge that blooms**, brighter on OUTER, dimmer on INNER (depth hierarchy from brightness only), plus a **faint thin center light-strip**. Edge color is a neutral bright light-blue-grey (a brightness step of the `border-*` family, e.g. `mix(border-muted, text-primary, ~0.7)`), NOT the enemy blue.

- **Canvas2D** (`drawTrack` @ `Canvas2DRenderer.ts:554`): per loop — stroke the dark recessed lane at `TRACK_WIDTH` (darker than today, e.g. toward `bg-base`); stroke a thin bright edge (~3px, `shadowBlur` glow ~8, brighter for OUTER); stroke a faint thin center strip. Keep everything from the `border-*`/`text-*` neutrals + brightness. (Dashed directional dashes dropped in favor of a solid faint center strip for backend parity; direction cue is intentionally subtle, matching the 2007 original.)
- **WebGPU** — the track is a flat triangle mesh (`tessellateTrack` → `TRACK_WGSL`, `trackBuf` init `WebGpuRenderer.ts:236-254`, `trackBundle` `:311-316`, executed `:547`) that currently writes `emit=0`. To make the edge bloom:
  1. **Add a per-vertex emissive scalar** to the track vertex format: `(x,y, r,g,b, e)` → arrayStride `20 → 24`, new attribute `@location(2) e: f32` at offset 20. Update `trackPipeline`'s vertex layout (`:436-445`) and rebuild `trackBundle`. **Revalidate the pipeline under `init()`'s `pushErrorScope`/`popErrorScope`.**
  2. **`TRACK_WGSL`** (`shaders.ts:38`): add `@location(2) e: f32` to `VsOut`, pass through in `vs`, and in `fs` set `o.emit = vec4f(in.color * in.e, 1.0)` (still no derivatives → uniform-safe). `o.scene` stays `vec4f(in.color, 1.0)`.
  3. **`trackBuf` build:** per loop, concatenate (draw order = vertex order for the triangle list):
     - a **full-width bright rim band** `tessellateTrack(poly, TRACK_WIDTH)` with `e = EDGE_EMISSIVE` and the neon-edge color (brighter for OUTER), then
     - an **inset dark lane band** `tessellateTrack(poly, TRACK_WIDTH - 2*EDGE_PX)` with `e = 0` and the dark recessed color, drawn ON TOP so the bright band shows only as an `EDGE_PX` rim (which blooms), then
     - a **thin center strip** `tessellateTrack(poly, CENTER_PX)` with a low `e` and a faint bright color.
  Result: recessed dark lanes with glowing rims + faint center strip, all through the existing (extended) track pipeline — no sprite-chain, seamless mitered corners preserved. Bloom rides the existing MRT/composite (`*0.55`); keep `EDGE_EMISSIVE` modest so it stays in-palette.
- `tessellateTrack.ts` is already the pure band tessellator and has unit tests — reuse it verbatim (call it at three widths). If a helper is added, unit-test it.

### S3 · Build tiles (inset HUD-pads)

The 186 tiles become **inset rounded HUD-pads**: fill a step above the floor, a thin top-edge highlight (raised feel), a thin border; the dark inter-tile gutter (current `TILE_SIZE*0.44` half ≈ 4px gap) stays so they read as a grid. The armed-but-unaffordable dim rule (0.6) is preserved; the place/hover ghost stays accent-tinted.

- **Canvas2D** (`drawTiles` @ `Canvas2DRenderer.ts:607`): `roundRect` fill (`bg-elevated` lifted slightly toward `text-secondary`) + a thin top highlight line (fill mixed further toward `text-primary`, low alpha) + a thin rounded border (`border-muted`/`text-secondary`).
- **WebGPU** (`packFrame` tile loop `WebGpuRenderer.ts:592-612`): keep the per-tile sprite approach. Preferred: add an `sdRoundBox` SDF (new shape id, e.g. `7` fill + `8` hollow) to `SPRITE_WGSL`'s shape dispatch (pure SDF, no derivatives added) so tiles match Canvas2D's rounded pads; emit **fill (rounded) + a thin top-highlight sprite + rounded border** per tile (3 sprites × 186 = 558 ≪ budget). If rounded SDF proves fiddly, square `SHAPE_SQUARE`/`SHAPE_SQUARE_LINE` with retuned colors + a top-highlight sprite is an acceptable parity-safe fallback (note it). Follow the `TEX_*_SCALE` convention if any scale constant is needed; no atlas frames involved.

## Non-goals

- No textured ground / atlas frames for the board (that was Approach B, declined).
- No geometry, track topology, tile lattice, or sim/balance changes.
- No new hue; no HP/status colors on the board.

## Verification (owned by the controller, in-browser)

1. `npx tsc --noEmit`; `npx vitest run` all green — **including** `determinism.test.ts` (hash `5167b43d` unchanged), purity, lazy-boundary, and `tessellateTrack` tests; add unit tests for any new pure helper.
2. `npm run build && node scripts/check-bundle-budget.mjs` green.
3. In-app parity pass via `next build && next start`: **WebGPU** (`data-renderer=webgpu`) and **Canvas2D** (`?renderer=canvas2d`) — screenshot both; confirm the backdrop/track/tiles read identically, the track edge blooms on WebGPU without a shader-compile fallback, units still pop, and there's no regression to towers/creeps/FX. Tune brightness/glow/grid values by eye.
4. Commit per task; final push to `origin/games/circle-td`.
