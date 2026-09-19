# Circle TD — Plan 2: Canvas2D Playable MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the finished deterministic sim into a game you can actually play in the browser — a `/games` arcade index plus a `/games/circle-td` route with a Canvas2D renderer, click-to-place towers, speed controls, and a live HUD — on real (not placeholder) geometry with balance tuned by play.

**Architecture:** The sim (Plan 1) is consumed unchanged in spirit; this plan enriches the render-snapshot, replaces the placeholder geometry with a real spiral, fixes the bounty formula and re-tunes on the real board, then builds a swappable `Renderer` interface (Canvas2D implementation now, WebGPU later behind the same interface), a fixed-timestep game loop with interpolation, pointer input, and a React-DOM HUD. Everything game-related is hard-isolated behind a lazy `import()` so no marketing page ships a byte of it.

**Tech Stack:** Next.js 16 (App Router, `reactCompiler`), React 19, TypeScript strict, Canvas2D, the existing Plan-1 sim under `src/game/`. Vitest for logic; a Playwright smoke for the route (Playwright introduced here or deferred — see Task 9).

**Spec:** `docs/superpowers/specs/2026-09-18-circle-td-arcade-design.md`
**Builds on:** `docs/superpowers/plans/2026-09-18-circle-td-plan-1-simulation.md` (executed; branch `games/circle-td`)

This is **plan 2 of 3**. Plan 1 built the deterministic sim. Plan 3 adds the replay-verified Supabase leaderboard + the WebGPU renderer + cross-engine Playwright determinism. This plan produces a **playable, tunable game** on the site.

## Global Constraints

- **Sim determinism is sacred.** Changes to `src/game/sim/**` and `src/game/titles/circle-td/**` keep the source-scan purity guard green and the golden gate meaningful. Any change to sim *behaviour* (geometry, bounty, balance) regenerates `determinism.golden.json` via `UPDATE_GOLDEN=1` and keeps its inertness self-checks (score>0, wave≥20, a tower at level>0). The golden hashes SimState, not the RenderSnapshot, so snapshot enrichment alone must NOT change the hash.
- **Lazy boundary (hard CI gate).** Nothing in `src/app/layout.tsx`, `src/components/layout/**`, or any component imported by a marketing/blog/project page may import `src/game/**`. The game loads only via a client-side `dynamic(() => import(...), { ssr: false })` behind a click-to-play gate on `/games/circle-td`.
- **Renderer is an interface.** All drawing goes through a `Renderer` interface; the Canvas2D backend is one implementation. The WebGPU backend (Plan 3) must drop in behind the same interface with no sim/loop/HUD changes.
- **Determinism vs. rendering split.** The sim owns truth (30 Hz fixed ticks). The renderer only draws snapshots and interpolates between them; speed controls change ticks-per-second, never tick contents. No gameplay logic in the renderer or React.
- **Brand:** Carbon Forge — `--color-bg-base #08080C`, accent `--color-accent #FF3B2F` (player side: towers, ranges, projectiles), secondary `--color-blue #7FDBFF` (enemy side: creeps, HP). Syne display, JetBrains Mono for HUD numerals/labels. Dark only.
- **Next 16 rules:** `'use client'` for anything touching canvas/pointer; `dynamic(..., { ssr:false })` must live inside a Client Component (not a Server Component); per `AGENTS.md`, read the relevant guide in `node_modules/next/dist/docs/` before writing routing/rendering code — this Next version diverges from training data.
- **`reactCompiler: true`** — the game loop lives in refs outside React render; the HUD reads a per-frame snapshot. Do not put the loop in React state.
- **Responsive / a11y:** no horizontal overflow at 360/375/414px; `touch-action: none` on the canvas; tap targets ≥44px; respect `prefers-reduced-motion` for UI chrome (the game itself is content, exempt).
- **Sim is consumed, not forked.** Import from `@/game/titles/circle-td` (`makeSim`, `SimConfig`, `CircleTdSim`) and `@/game/sim/replay` (`applyCommand`, `Command`). Record player actions as `Command`s (seed + input log) so Plan 3's leaderboard can verify them — even though the leaderboard itself is Plan 3.

## Deferred-from-Plan-1 findings folded into this plan
(From the Plan 1 final whole-branch review. Tracked so none is lost.)
- **#4 RenderSnapshot enrichment** → Task 1 (renderer needs stable creep IDs + hp/flags/type/level).
- **#5 negative-dist staged creeps** → Task 1 (snapshot skips/flags `dist<0` "queued" creeps).
- **Real geometry (R5/R12)** → Task 2.
- **#6 bounty-by-maxHp + real balance re-tune, #8 START_BANK fidelity** → Task 3.
Explicitly **left for Plan 3** (not this plan): #2 `sim/`↔`titles/` layering refactor + `TitleDef` for the verification route; #3 `fireTowers` perf pass; the WebGPU renderer; cross-engine Playwright determinism; Supabase + verification route + leaderboard UI.

---

## File Structure

```
src/game/sim/engine.ts               MODIFY — enrich RenderSnapshot + allocator (Task 1)
src/game/titles/circle-td/index.ts   MODIFY — packSnapshot fills new fields; skip dist<0 (Task 1)
src/game/titles/circle-td/content.ts MODIFY — real spiral track + adjacent build tiles (Task 2)
src/game/titles/circle-td/rules.ts   MODIFY — bounty by maxHp (Task 3)
src/game/titles/circle-td/balance.ts MODIFY — re-tuned constants (Task 3)
src/game/test/*                       MODIFY — regenerate golden; update geometry/balance tests
src/game/runtime/
  render/Renderer.ts        CREATE — the Renderer interface + RendererCaps (Task 4)
  render/canvas2d/Canvas2DRenderer.ts  CREATE — Canvas2D implementation (Task 4)
  loop.ts                   CREATE — fixed-timestep accumulator + rAF + interpolation (Task 5)
  input/pointer.ts          CREATE — pointer→Command mapping + input recording (Task 6)
  hud/format.ts             CREATE — number/label formatting helpers (Task 7)
src/app/games/
  page.tsx                  CREATE — arcade index (Server Component) (Task 8)
  circle-td/page.tsx        CREATE — route shell + metadata (Server Component) (Task 8)
  circle-td/PlayGate.tsx    CREATE — 'use client' click-to-play + dynamic import (Task 8)
  circle-td/GameClient.tsx  CREATE — 'use client' mounts canvas + loop + HUD (Tasks 5-7)
components/game/
  Hud.tsx, TowerPalette.tsx, SelectedTowerPanel.tsx, SpeedControls.tsx, GameOver.tsx  CREATE (Task 7)
src/components/context/NodeNetworkContext.tsx  MODIFY — transient `suspended` flag (Task 8)
src/components/background/NodeNetworkCanvas.tsx MODIFY — honor `suspended` (Task 8)
src/data/games.data.ts     CREATE — arcade catalog, feeds index + sitemap (Task 8)
src/app/sitemap.ts         MODIFY — add /games routes from games.data.ts (Task 8)
src/components/layout/Nav.tsx  MODIFY — add Games entry (Task 8)
.github/workflows/ci.yml   CREATE — typecheck/lint/test/build + bundle-budget gate (Task 9)
apps: none (single Next app)
```

---

## Task 1: Enrich the render snapshot (renderer foundation)

**Files:** Modify `src/game/sim/engine.ts`, `src/game/titles/circle-td/index.ts`; Test `src/game/titles/circle-td/index.test.ts`.

**Interfaces — Produces:** `RenderSnapshot` gains, alongside the existing counts/XY:
- `creepId: Int32Array` (length `creepCount`) — stable identity so the renderer interpolates a creep across frames instead of teleporting on a neighbor's death (swap-remove reuses slots).
- `creepHp01: Float32Array` (length `creepCount`) — `hp/maxHp` clamped 0..1, for HP bars.
- `creepFlags: Int32Array` (length `creepCount`) — `CREEP_FAST|AIR|HARD` bitmask, for sprite/tint.
- `towerType: Int32Array`, `towerLevel: Int32Array` (length `towerCount`).
`makeRenderSnapshot` pre-allocates all arrays. `packSnapshot` fills them; and **skips `dist<0` staged creeps** (finding #5): a creep with `dist<0` is queued off-track — it is NOT included in the snapshot's creep list (so it isn't drawn mid-track), though it still counts toward the population cap in the sim (unchanged). Update `creepCount` to the count of on-track creeps actually packed.

- [ ] **Step 1: Failing test** — snapshot exposes stable IDs + hp01 + flags + tower type/level, and excludes a `dist<0` creep.
```ts
// index.test.ts (add)
it("snapshot carries id/hp01/flags and tower type/level, and skips staged (dist<0) creeps", () => {
  const sim = makeSim({ seed: 7, mode: "free" });
  for (let i = 0; i < 30; i++) sim.tick(); // some creeps on-track, some may still be staged
  const s = sim.snapshot();
  expect(s.creepId.length).toBe(s.creepCount);
  expect(s.creepHp01.length).toBe(s.creepCount);
  for (let i = 0; i < s.creepCount; i++) {
    expect(s.creepHp01[i]).toBeGreaterThan(0);
    expect(s.creepHp01[i]).toBeLessThanOrEqual(1);
  }
  // every packed creep must be on-track (no NaN coords from a wrapped negative dist)
  for (let i = 0; i < s.creepCount * 2; i++) expect(Number.isFinite(s.creepXY[i])).toBe(true);
});
```
- [ ] **Step 2: Run — expect FAIL** (`npm test -- index`): new fields undefined.
- [ ] **Step 3: Implement** — extend `RenderSnapshot` + `makeRenderSnapshot` in engine.ts; in `packSnapshot`, first count on-track creeps (`dist>=0`), allocate to that count, then fill id/xy/hp01/flags for those only, and tower type/level. Keep XY world-space (fix the stale "screen-space" comment → "world-space"). Cap DPR/coords are a renderer concern, not here.
- [ ] **Step 4: Run — expect PASS**; full `npm test`.
- [ ] **Step 5: Confirm golden unchanged** — `npm test -- determinism` still reproduces the pinned hash (snapshot isn't hashed). If it changed, you altered SimState by mistake — revert that.
- [ ] **Step 6: Commit** — `feat(game): enrich RenderSnapshot (id/hp/flags/type/level), skip staged creeps`.

---

## Task 2: Real spiral geometry

**Files:** Modify `src/game/titles/circle-td/content.ts`; Test `content.test.ts`; regenerate golden.

**Context:** Plan 1's `TRACK`/`TILES` are an INVENTED placeholder (Manhattan-length rectangles; all 450 tiles happen to be in Damage range). Replace with a real, deterministic square-spiral: a closed path of axis-aligned segments winding inward, and buildable tiles generated as the cells **immediately flanking each path segment on both sides** (the original's "raised ground around the paths"), so tower coverage of the path is correct-by-construction but bounded (not "every tile hits everywhere"). Keep it fully deterministic (integer/fixed-point; no `Math.random`). This is still not final-art geometry, but it must be a genuine playable board.

**Interfaces — Produces:** `TRACK` (two closed polylines, outer + inner entrances), `TILES`/`TILE_COUNT` (flanking build cells), `trackLength`, `posAt` unchanged in signature. Add `TILE_SIZE` (px) and, if helpful, a `tileFootprintCells(tile, footprint)` helper for multi-cell towers (Splash 2×2, Damage 3×3) — or defer footprint occupancy to a later task and keep 1-tile occupancy (document which).

- [ ] **Step 1: Failing tests** — track is closed (posAt wraps), tiles flank the track (every tile within ~`TILE_SIZE*1.5` of some path point), tile count is in a sane range (e.g. 120–400, not 450-all-in-range), and no tile sits ON the path.
- [ ] **Step 2: Run — expect FAIL.**
- [ ] **Step 3: Implement** the spiral + flanking-tile generator deterministically. Document the coordinate space (stage px) so the renderer and input share it.
- [ ] **Step 4: Run geometry tests — PASS.**
- [ ] **Step 5: Regenerate the golden** — geometry changes sim output. `UPDATE_GOLDEN=1 npm test -- determinism` to rewrite; inspect (score>0, wave≥20, a tower level>0 — the fixture's in-range tiles must still resolve on the new geometry; if the fixture's tile indices no longer land in range, update the replay's tiles via the in-range computation, keeping it a *playing* replay). Run again to pin. Commit the new fixture.
- [ ] **Step 6: Update dependent tests** — any content/balance test asserting old geometry numbers; keep them honest to the new board.
- [ ] **Step 7: Commit** — `feat(circle-td): real spiral track + flanking build tiles (replaces placeholder)`.

---

## Task 3: Bounty fix + balance re-tune on real geometry

**Files:** Modify `src/game/titles/circle-td/rules.ts` (bounty call), `balance.ts` (constants), `src/game/test/balance.sweep.test.ts`; regenerate golden; append to `docs/superpowers/2026-09-18-circle-td-balance-tuning.md`.

**Context:** Final-review finding #6 — `bounty(s.wave)` lets a wave-1 creep killed at wave 50 pay a huge current-wave bonus (a gold exploit) and underpays Hard (×2 HP) creeps; it is also the seed-variance root. Fix to pay by the creep's own strength: `bounty = max(1, floor(c.maxHp[k] / gamma))`. Then re-run the headless sweep (behind `BALANCE_SWEEP=1`) on the REAL geometry to pick constants that are winnable AND perpetually climbing, and settle the **START_BANK fidelity decision** (restore the SOURCED 125 if a smart opening survives on real geometry, or keep a tuned value with a recorded owner decision).

- [ ] **Step 1: Failing test** — bounty is a function of the killed creep's `maxHp`, not the current wave: two kills of the same-maxHp creep pay the same regardless of `s.wave`; a Hard creep (2× maxHp) pays ~2× a Normal one.
- [ ] **Step 2: Run — FAIL.**
- [ ] **Step 3: Implement** `bounty(maxHp, gamma) = max(1, floor(maxHp/gamma))` (or keep `bounty(wave,gamma)` signature but call with `c.maxHp[k]`); update the `fireTowers` call site. Keep it integer/deterministic.
- [ ] **Step 4: Re-tune** — run the gated sweep on the real geometry; pick winnable-and-climbing constants (simple bot survives to a meaningful-but-finite wave across seeds, incl. the previously-bad seed 4, with acceptable variance). Set defaults; **make the START_BANK decision explicit and record it** in the tuning doc (flag it for owner sign-off in the review).
- [ ] **Step 5: Regenerate golden** (`UPDATE_GOLDEN=1`), update `balance.sweep.test.ts` fast-guard + gated thresholds to new observed numbers (honest, not fudged), verify `npm test` fast + `BALANCE_SWEEP=1 npm test` green.
- [ ] **Step 6: Commit** — `feat(circle-td): bounty by creep strength + balance re-tune on real geometry`.

---

## Task 4: Renderer interface + Canvas2D renderer

**Files:** Create `src/game/runtime/render/Renderer.ts`, `src/game/runtime/render/canvas2d/Canvas2DRenderer.ts`; Test `Canvas2DRenderer.test.ts` (jsdom canvas is limited — test the pure bits; visual correctness is verified via the browser in Task 9).

**Interfaces — Produces:**
```ts
export interface RendererCaps { kind: "canvas2d" | "webgpu"; particles: boolean }
export interface Renderer {
  init(canvas: HTMLCanvasElement): Promise<void>;
  resize(cssW: number, cssH: number, dpr: number): void;   // device-pixel aware
  frame(prev: RenderSnapshot, curr: RenderSnapshot, alpha: number, hits: HitEvent[]): void;
  destroy(): void;
  readonly caps: RendererCaps;
}
```
- `Canvas2DRenderer` draws: the spiral path (filled), buildable tiles (subtle), creeps (position interpolated between `prev`/`curr` by matching `creepId`; color/shape by `creepFlags` — air vs land, fast, hard; blue `--color-blue`), HP bars (`creepHp01`), towers (by `towerType`/`towerLevel`; red `--color-accent`), range ring on the selected/hovered tower, and brief hit flashes from `hits`. Interpolation matches creeps by `creepId` across the two snapshots (unmatched = spawned/just-died → no interp).
- DPR handling: `resize` sets `canvas.width/height = cssW*dpr` (cap dpr at 2 on mobile), scales the context; a `ResizeObserver` (device-pixel-content-box where supported, else contentRect×dpr) drives it — but the observer lives in the mount component (Task 5), the renderer just exposes `resize`.

- [ ] **Step 1: Failing test** — a pure helper: `interpolateById(prev, curr, alpha)` returns, for each id present in `curr`, the lerped x/y (and `curr` value if absent from `prev`). Unit-test that with two hand-built snapshots.
- [ ] **Step 2: Run — FAIL.**
- [ ] **Step 3: Implement** `Renderer.ts` (types) + `Canvas2DRenderer.ts`. Keep all drawing in the renderer; read colors from CSS variables via `getComputedStyle` once at init (so it tracks the palette). The `interpolateById` helper is pure and exported for the test.
- [ ] **Step 4: Run — PASS** (the pure helper; canvas drawing is smoke-tested in the browser Task 9).
- [ ] **Step 5: Commit** — `feat(game): Renderer interface + Canvas2D renderer`.

---

## Task 5: Fixed-timestep game loop + canvas mount

**Files:** Create `src/game/runtime/loop.ts`; Create `src/app/games/circle-td/GameClient.tsx` (the client component that owns the canvas, loop, renderer, and later the HUD). Test `loop.test.ts`.

**Interfaces — Produces:**
- `loop.ts`: a pure-ish `GameLoop` driving `sim.tick()` on a fixed 30 Hz accumulator with `speed` (1/2/4) multiplying ticks-per-second, a `paused` flag, a max-frametime clamp (avoid spiral of death), and a render callback with interpolation `alpha`. It takes injected `now()`/`raf()` so it's testable without a real clock (tests pass a fake clock; production passes `performance.now`/`requestAnimationFrame` — these live in the loop/mount, NOT in the sim).
- `GameClient.tsx` (`'use client'`): creates `makeSim({ seed, mode })`, a `Canvas2DRenderer`, and the loop; owns the `<canvas>` ref + `ResizeObserver`; StrictMode-safe (an `alive` guard; cleanup cancels rAF, disconnects the observer, calls `renderer.destroy()`); pauses on `visibilitychange`. It captures the two most recent snapshots for interpolation and calls `renderer.frame(prev, curr, alpha, hits)`.

- [ ] **Step 1: Failing test** — with a fake clock, advancing the loop by exactly N×(1/30 s) at speed 1 calls `tick` N times; at speed 2, 2N times; `paused` calls 0; a huge frame delta is clamped (no runaway tick count).
- [ ] **Step 2: Run — FAIL.**
- [ ] **Step 3: Implement** `loop.ts` (injected clock/raf). Then `GameClient.tsx` wiring it to the sim + renderer + canvas (StrictMode-safe, visibility-pause). The HUD is added in Task 7; for now GameClient renders the canvas and runs a self-starting sim so the browser check (Task 9) shows creeps moving.
- [ ] **Step 4: Run loop tests — PASS.**
- [ ] **Step 5: Commit** — `feat(game): fixed-timestep loop + StrictMode-safe canvas mount`.

---

## Task 6: Pointer input + command recording

**Files:** Create `src/game/runtime/input/pointer.ts`; wire into `GameClient.tsx`. Test `pointer.test.ts`.

**Interfaces — Produces:**
- `pointer.ts`: pure mapping helpers — `tileAtPoint(x, y): number | -1` (stage-space point → tile index, using content geometry), and an input model that turns pointer events into `Command`s (`place` with the palette's selected tower type + tile, `upgrade`/`sell` on a selected tower's tile). It appends each issued command to an in-memory **input log** (`{tick, type, tower?, tile?}[]`) keyed to the sim's current tick — this is the replay Plan 3 will submit; build it now even though the leaderboard is later.
- Applying a command goes through `applyCommand(sim.state, cmd)` (same path Plan 3 verifies), NOT a bespoke mutation — so what the player does and what gets verified are identical.
- Interaction: select a tower from the palette → ghost + range preview follows the cursor → click a valid tile to place (deduct shown); click a placed tower → select (show range + upgrade/sell); `Esc` cancels; hotkeys `1`–`5` select tower, `U` upgrade, `S` sell, `Space` pause.

- [ ] **Step 1: Failing test** — `tileAtPoint` returns the correct tile for a point inside a known build cell and `-1` for a point on the path/off-board; issuing a `place` appends a `{tick, type:"place", tower, tile}` to the log and calls `applyCommand`.
- [ ] **Step 2: Run — FAIL.**
- [ ] **Step 3: Implement** `pointer.ts` (pure helpers + log) and wire pointer/keyboard handlers in `GameClient` (`touch-action:none`; pointer events, not mouse-only). Placement/selection state lives in refs (reactCompiler-safe); the HUD reads it.
- [ ] **Step 4: Run — PASS.**
- [ ] **Step 5: Commit** — `feat(game): pointer input, placement/selection, command recording`.

---

## Task 7: HUD (React DOM over canvas)

**Files:** Create `src/game/runtime/hud/format.ts`; `components/game/{Hud,TowerPalette,SelectedTowerPanel,SpeedControls,GameOver}.tsx`; wire into `GameClient.tsx`. Test `format.test.ts` + a React test for the palette/selected-panel.

**Interfaces — Produces:** DOM HUD (accessible, themeable, not drawn in canvas) reading a per-frame snapshot pushed from the loop via a ref + a lightweight subscription (e.g. `useSyncExternalStore` over the latest snapshot, or a throttled state set — must not re-render at 60fps; update HUD numbers ~10Hz). Components:
- `Hud`: bank / score / wave / creeps `x/cap` (JetBrains Mono), a `dot` when a wave is imminent.
- `TowerPalette`: the five towers with cost + affordability (dim when unaffordable), keyboard `1`–`5`, shows target restriction (land/air).
- `SelectedTowerPanel`: selected tower's level/damage/range, Upgrade (cost) / Sell (refund) buttons + `U`/`S`.
- `SpeedControls`: 1×/2×/4× + Pause (`Space`), and a Start/GO button pre-first-wave.
- `GameOver`: final score + wave, a "play again" that re-seeds (free) or shows today's daily result; entry point for Plan 3's score submission (stubbed: "leaderboard coming soon").
- `format.ts`: pure `formatGold`, `formatScore`, etc.

- [ ] **Step 1: Failing tests** — `format.ts` helpers; a React test that `TowerPalette` dims an unaffordable tower and calls the select callback on click/`1`; `SelectedTowerPanel` shows the right upgrade cost and disables Upgrade at level 9.
- [ ] **Step 2: Run — FAIL.**
- [ ] **Step 3: Implement** the HUD components + `format.ts`; wire into `GameClient` (snapshot subscription throttled; controls dispatch into the input model from Task 6). Use Carbon Forge tokens; red = player, blue = enemy.
- [ ] **Step 4: Run — PASS.**
- [ ] **Step 5: Commit** — `feat(game): HUD — bank/score/wave, palette, selected panel, speed, game over`.

---

## Task 8: Routes, arcade index, lazy boundary, site integration

**Files:** Create `src/app/games/page.tsx`, `src/app/games/circle-td/page.tsx`, `src/app/games/circle-td/PlayGate.tsx`; Create `src/data/games.data.ts`; Modify `src/app/sitemap.ts`, `src/components/layout/Nav.tsx`, `src/components/context/NodeNetworkContext.tsx`, `src/components/background/NodeNetworkCanvas.tsx`.

**Interfaces — Produces:**
- `games.data.ts`: `Game { slug, name, blurb, status: "playable"|"soon", tags }[]` — feeds the index and the sitemap.
- `/games` (Server Component): arcade index card list from `games.data.ts`; `buildMetadata({title:"Games", path:"/games", ...})`.
- `/games/circle-td/page.tsx` (Server Component): metadata + hero/poster (the page's **LCP element** — a `<canvas>` is never an LCP candidate, so the gate must paint real text/art first) + renders `<PlayGate/>`.
- `PlayGate.tsx` (`'use client'`): shows the poster + "Play" + today's daily-seed note; on click, `const GameClient = dynamic(() => import("./GameClient"), { ssr:false, loading:… })` and mounts it. The game bundle loads ONLY here, only on click.
- **Suspend the background canvas without persisting:** add a transient `suspended: boolean` + `setSuspended` to `NodeNetworkContext` (separate from persisted `settings.enabled`); `NodeNetworkCanvas` renders nothing (or pauses its rAF) when `suspended`; `GameClient` sets `suspended` true on mount, false on unmount (does NOT touch `settings.enabled`/localStorage).
- **PageWrapper fade:** acceptable to keep on the game route (a one-time entry fade); if trivially cleanly skippable via `usePathname()` for `/games/circle-td`, do so — otherwise leave it (note the decision).
- `sitemap.ts`: derive `/games` + each playable game route from `games.data.ts` (mirrors how `personalProjects` feeds project routes).
- `Nav.tsx`: add a `Games` entry (plain link with one title; a `children` dropdown becomes worthwhile at game #2).

- [ ] **Step 1: Read the Next docs** — `node_modules/next/dist/docs/` on dynamic import / `ssr:false` / metadata (AGENTS.md rule) before writing routes.
- [ ] **Step 2: Failing test** — a bundle-boundary test (Node): statically assert no file under `src/components/layout/**` or `src/app/layout.tsx` imports `@/game/**` (grep-scan, like the purity guard). Plus: `sitemap.ts` includes `/games` and `/games/circle-td`.
- [ ] **Step 3: Run — FAIL** (routes/data not present).
- [ ] **Step 4: Implement** the routes, `PlayGate` (dynamic import), `games.data.ts`, the NodeNetworkContext transient suspend + canvas honoring it, sitemap + nav wiring, metadata via `buildMetadata`.
- [ ] **Step 5: Run tests — PASS**; `npm run build` succeeds.
- [ ] **Step 6: Commit** — `feat(games): /games arcade + /games/circle-td route, lazy boundary, nav/sitemap`.

---

## Task 9: Verify playable + CI + bundle budget

**Files:** Create `.github/workflows/ci.yml`; optionally a Playwright mount smoke.

- [ ] **Step 1: Run the dev server and PLAY it** — `preview_start` the app, open `/games/circle-td`, click Play, confirm: creeps spawn and move along the spiral, towers place on click and fire, bank/score/wave update, speed controls work, game-over triggers at the cap. Fix any runtime/console errors (read source, edit, re-check). Capture a screenshot as proof.
- [ ] **Step 2: Bundle budget** — verify (via `next build` output / a route-size assertion) that `/`, `/blog`, `/projects`, `/resume`, `/gallery`, `/contact` ship **zero** bytes from `src/game/**`; only `/games/circle-td` (after click) loads it. This is the portfolio-protection gate.
- [ ] **Step 3: CI workflow** — typecheck (`tsc --noEmit`), lint (if configured), `npm test` (fast suite), `npm run build`, and the bundle-budget assertion. (`BALANCE_SWEEP=1` and cross-engine Playwright determinism are scheduled/Plan-3 jobs, not this per-commit workflow.)
- [ ] **Step 4: Commit** — `ci(games): playable-verified + bundle-budget gate`.

---

## Self-Review

**Spec coverage:** playable route + Canvas2D renderer + HUD + speed controls + save/resume-capable input log (spec §9, §4.1) → Tasks 4–8; real geometry (§3.3) → Task 2; brand (§9.3) → Tasks 4/7; lazy boundary + LCP + sitemap/nav/metadata (§11) → Task 8; determinism preserved (§7) → Tasks 1–3 keep the golden gate. WebGPU (§9.1) + leaderboard (§8) + cross-engine (§10.1) are Plan 3 — explicitly out of this plan.

**Placeholder scan:** each task has real interfaces + concrete test code for the pure/logic pieces; canvas *visual* correctness is verified in the browser (Task 9) rather than asserted in jsdom, and that's stated, not hand-waved.

**Type consistency:** `RenderSnapshot` (extended once in Task 1) is consumed with the same field names in Tasks 4/7; `Renderer`/`RendererCaps` defined in Task 4 used in Task 5; `Command`/`applyCommand` reused from Plan 1 unchanged; `makeSim`/`SimConfig`/`CircleTdSim` imported from `@/game/titles/circle-td`.

**Ordering:** sim-facing changes (1–3) land before the renderer (4) so the renderer builds against the final snapshot + real geometry + tuned balance; loop (5) before input (6) before HUD (7); routing/integration (8) last; verify (9) closes.

**Open risks:** balance re-tune (Task 3) may reveal the real geometry needs iteration — that's expected and is why it precedes the renderer; the START_BANK fidelity decision is surfaced for owner sign-off, not silently chosen.

---

## Execution Handoff

Plan 2 of 3. After execution + final review, Plan 3 adds the WebGPU renderer (behind the Task-4 interface), the Supabase replay-verified leaderboard (using the Task-6 input log + Plan-1 replay/hash), the `sim/`↔`titles/` layering refactor + `fireTowers` perf pass, and the cross-engine Playwright determinism gate.
