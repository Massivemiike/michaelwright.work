# Circle TD — Sprite/Texture Art Design

**Status:** design (awaiting owner review) — 2026-09-21
**Goal:** Replace the game's procedural SDF shapes with real 2D sprite art (Kenney, tinted to the Carbon Forge palette), via a new texture-atlas rendering path added to BOTH the WebGPU and Canvas2D backends, delivered in two phases (units, then board).

## Locked decisions (from owner brainstorm)

- **Source:** Kenney assets (owner owns the full library). Vector/flat **top-down 2D** sprites, delivered as a **PNG spritesheet/atlas + a rects manifest** (Kenney ships PNG + XML/JSON). NOT pixel art, NOT PBR "textures", NOT isometric.
- **Palette:** **tint toward Carbon Forge** — towers in the red/accent family, creeps in the blue family — and keep the existing bloom. Prefer Kenney's light/neutral ("tintable") sprite variants where a pack offers them, so a multiply-tint reads cleanly.
- **Scope: phased.**
  - **Phase 1 — units:** tower + creep sprites (biggest visual win; proves the whole texture pipeline).
  - **Phase 2 — board:** buildable tiles + track/path, and an optional tiled ground texture for the backdrop.
- **Candidate packs:** *Tower Defense (Top-Down)* (primary: towers, enemies, path/tiles), optionally *Topdown Tanks (Redux)* / *Top-Down Shooter* for distinct Fast/Air/Hard creep looks.

## Non-negotiable constraints (carried from the codebase)

- **Determinism untouched:** all art is render-only, under `src/game/runtime/render/**` (outside the sim purity guard). No sim/state/balance change → golden hash `5167b43d` and `SIM_VERSION 2` are unaffected. No `UPDATE_GOLDEN`.
- **Lazy boundary + bundle-budget:** the atlas PNG is a **static asset in `public/`**, served on demand when the game's client chunk loads — it is NOT imported into any JS bundle, so the game-engine chunk stays referenced by no prerendered route (bundle-budget stays green). No new `@/game` import into any guarded `src/lib`/marketing surface.
- **Never a blank board:** if the atlas fails to load (404, decode error, or WebGPU texture upload fails), each backend **falls back to the existing SDF shapes** — sprites are an enhancement layer, never a hard dependency.
- **No `next dev`** (Turbopack space-in-path bug); verify via `next build && next start` in the in-app browser (real WebGPU adapter here). Commit trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`; branch `games/circle-td`; do not merge to master without owner consent.

## Architecture

### Texture-atlas rendering (approach chosen)

Extend the EXISTING instanced sprite pipeline rather than adding a parallel one:
- Grow the per-instance record from 12 → **16 floats** (add a `uv: vec4f` = `u0,v0,u1,v1`), and use the currently-free `params.w` as a **textured flag** (0 = SDF shape as today; 1 = sample the atlas at `uv`). `params.z` remains the beam rotation added in the tracer-FX change.
- Bind an **atlas texture + sampler** to the sprite pipeline (group 0). The sprite fragment shader branches: textured → `textureSample(atlas, samp, uv) * tint`; else → the existing SDF dispatch. Emissive still feeds the bloom target, so bright sprite parts glow.
- One texture, one storage buffer, one instanced draw — towers, creeps, tiles, SDF fallbacks, and beams all still render in a single pass, correctly layered (painter's order preserved).
- **Tint:** the instance `color` becomes the tint multiplier for textured sprites (× sampled texel). Carbon Forge tones per unit type (red-family towers, blue-family creeps).

Rejected alternatives: a second textured-only pipeline (extra pass + code, no benefit at this entity count); per-sprite non-instanced draws (perf).

### Asset loading (client-only, async, non-blocking)

- Assets live at `public/games/circle-td/sprites/atlas.png` + `atlas.json` (a `{ frame: {x,y,w,h} }` manifest derived from Kenney's sheet).
- At renderer init the backend kicks off an async load (fetch JSON + decode PNG to `ImageBitmap`). The game renders SDF shapes immediately; when the atlas resolves, the backend swaps to sprites (WebGPU: `createTexture` + `copyExternalImageToTexture`; Canvas2D: keep the `ImageBitmap` for `drawImage`). A failed load leaves the SDF path in place permanently — logged once, never fatal.

### Data flow

```
public/…/atlas.png + atlas.json         (static assets, owner-provided from Kenney)
        │  (async load at renderer init; SDF shapes render meanwhile)
        ▼
atlas.ts  frame name → UV rect (pure, unit-tested)
sprites.ts  tower type / creep flags → frame name + Carbon-Forge tint (pure, unit-tested)
        ▼
pack.ts  writeSprite(..., uv?, textured?)  → 16-float instance (or Canvas2D draw list)
        ▼
WebGpuRenderer / Canvas2DRenderer  → atlas-sampled, tinted sprite  (SDF fallback if unloaded/failed)
```

## Files

**Phase 1 (units):**
```
ADD    public/games/circle-td/sprites/atlas.png            Kenney sheet (owner-sourced)
ADD    public/games/circle-td/sprites/atlas.json           frame rects manifest
CREATE src/game/runtime/render/atlas.ts                    Atlas/Frame types + UV computation (pure)
CREATE src/game/runtime/render/atlas.test.ts               UV math unit tests
CREATE src/game/titles/circle-td/sprites.ts                towerType/creepFlags → frame + tint (pure)
CREATE src/game/titles/circle-td/sprites.test.ts           mapping unit tests
CREATE src/game/runtime/render/loadAtlas.ts                async image+json loader (client-only, try/catch)
MODIFY src/game/runtime/render/webgpu/pack.ts              SPRITE_FLOATS 12→16; writeSprite uv+textured; packTowers/packCreeps sprite-aware
MODIFY src/game/runtime/render/webgpu/shaders.ts           SPRITE_WGSL: atlas texture+sampler, textured branch, Instance.uv
MODIFY src/game/runtime/render/webgpu/WebGpuRenderer.ts    atlas load→texture+bind; textured towers/creeps; SDF fallback
MODIFY src/game/runtime/render/canvas2d/Canvas2DRenderer.ts atlas load→drawImage+tint; SDF fallback
MODIFY src/game/runtime/render/webgpu/pack.test.ts         updated layout assertions (16 floats)
```

**Phase 2 (board):** buildable-tile + path/track sprites (and optional tiled ground) — same pipeline, new frames + a track-tessellation-to-sprite or tiled-quad approach; specced when Phase 1 lands.

## Testing

- **Unit (node/vitest):** atlas UV computation; sprite mapping (type/flags → frame + tint); `writeSprite` 16-float layout; SDF-fallback selection when the atlas is absent.
- **Browser (in-app, both backends):** `next build && next start`; verify towers + creeps render as tinted sprites under WebGPU AND `?renderer=canvas2d`; verify the SDF fallback still draws when the atlas is forced-missing; screenshot proof.
- **Guards:** golden hash unchanged; `tsc`; lazy-boundary; bundle-budget (engine chunk in no prerendered route); Playwright smokes still pass.

## Open items / owner actions

1. **Locate + provide the Kenney packs.** Owner confirms the *Tower Defense (Top-Down)* pack (± tank/shooter packs) and drops the needed sprite PNGs where I can read them, OR authorizes pulling the CC0 Kenney TD pack via the kenney-pull tool. I then build `atlas.png` + `atlas.json` and the frame mapping. (Implementation is blocked on real assets; the pipeline + fallback can be built and tested against a placeholder atlas first.)
2. **Tint tuning** is visual — the exact per-type tint and multiply-vs-blend approach get dialed in during browser verification; prefer tintable/light Kenney variants.
3. **Crispness/DPR:** source frames ≥64px so sprites stay sharp at 2× DPR under bloom.
4. Phase 2 (board tiles/track) is deferred to its own plan once Phase 1 ships.
