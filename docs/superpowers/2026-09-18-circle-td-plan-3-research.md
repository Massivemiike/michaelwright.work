# Circle TD — Plan 3 Research Map

**Scope:** WebGPU renderer + replay-verified Supabase global leaderboard, plus the four items explicitly deferred *into* Plan 3 (sim/↔titles/ layering refactor + `TitleDef`, `fireTowers` perf pass, cross-engine Playwright determinism gate, scheduled balance sweep).

**Branch:** `games/circle-td` (local only, not pushed/merged — Plan 3 continues on the same branch). HEAD `4ff3cd4`.

**Consolidated from a 6-dimension investigation. Every interface/constant/path below was re-verified against the working tree on 2026-09-19.**

---

## 0. How to read this map (source-of-truth hierarchy)

The spec (`docs/superpowers/specs/2026-09-18-circle-td-arcade-design.md`) is authoritative for **locked product decisions** (§2 D3–D7, non-goals §1) but has **drifted from the shipped code** on concrete surfaces. When they conflict, precedence is:

1. **Shipped code in `src/`** — the real interfaces Plan 3 must serialize to and build against.
2. **Progress ledger** `.superpowers/sdd/2026-09-18-circle-td-plan-2-mvp/progress.md` (lines 90–124) and `docs/superpowers/2026-09-18-circle-td-balance-tuning.md` — authoritative for economy/geometry.
3. **Spec** — authoritative for locked *decisions* and rationale; **stale** on wire-format and economy specifics.

### Known spec↔code drifts (an implementer must NOT code to the stale spec)

| Surface | Spec says | Shipped code says (authoritative) |
|---|---|---|
| Replay `seed` | `string` (§8.1) | `number` (int32) — `replay.ts:22` |
| Replay command payload | `payload: unknown` (§8.1) | flat `tower?: number; tile?: number` — `replay.ts:14-19` |
| Economy dials | α and γ only (§5.2) | α (`ALPHA_BP=200`), γ (`GAMMA=5`), **plus `BOUNTY_CAP=25`** (invented, spec-undocumented) — `balance.ts:5-7` |
| Board geometry | flanking-strip model | open-area 32px grid, `TILE_COUNT=186` — `content.ts:306` |
| DB `seed` column | `text` (§8.3) | code produces a `number`; route must serialize consistently |

**Balance was just re-tuned (2026-09-19).** `START_BANK` restored to the SOURCED `125`; `GAMMA=5` kept for early payout; the late-game glut is killed by the new `BOUNTY_CAP=25` (drops peak bank from ~3.15M to ~8k on the 186-tile board). All three of α/γ/cap are flagged `INVENTED` in `balance.ts`. This is the balance `SIM_VERSION=1` currently pins.

---

## 1. Cross-cutting ground truth (the frozen point Plan 3 inherits)

- `SIM_VERSION = 1`, `TICK_HZ = 30` — `src/game/sim/types.ts:4-5`. This single value scopes every leaderboard row; any behaviour/balance change invalidates every previously-recorded replay (spec §8.4). Must be frozen before the first public board.
- Golden determinism hash asserted **in Node only** today (`src/game/test/determinism.test.ts`, self-generating). The cross-engine (Chromium/Firefox/WebKit) assertion does **not** exist yet — it is Plan 3 work (ci.yml lines 44–46 say so explicitly).
- Economy constants (all in `src/game/titles/circle-td/`): `START_BANK=125` (SOURCED, content.ts:71), `ALPHA_BP=200`, `GAMMA=5`, `BOUNTY_CAP=25` (all INVENTED, balance.ts:5-7). `TILE_COUNT=186` (content.ts:306).
- The client already records the exact replay payload: `InputModel.inputLog: Command[]` (`src/game/runtime/input/pointer.ts`), captured through the **same `applyCommand` path** the verifier uses — "input log = replay", ready for submission. `GameClient.tsx` owns it via `inputModelRef.current.inputLog` but does **not** yet build/submit a `Replay` or capture initials.
- **Not yet present anywhere:** Supabase table, `/api/games/scores` route, `@supabase/supabase-js` (absent from package.json), any WebGPU code / `.wgsl`, Playwright, cross-engine test, rate-limit store.
- CI (`.github/workflows/ci.yml`) runs, in order: `npx tsc --noEmit` → `npm test` (vitest: lazy-boundary + sim purity + determinism golden) → `npm run build` → `npm run check:bundle-budget`. **No ESLint step** (no config in repo). `BALANCE_SWEEP=1 npm test` and cross-engine Playwright are explicitly *excluded* per-commit → they are Plan 3 jobs.

---

## 2. Subsystem A — WebGPU renderer

### 2.1 Scope & locked decisions
- **D7 (locked):** WebGPU primary, Canvas2D fallback. "~87% of global usage, explicitly not Baseline; nobody should hit a dead end on a portfolio site."
- **D4 (locked):** Carbon Forge palette; bloom/particles must stay within the site palette. Red `--color-accent #FF3B2F` = player side; blue `--color-blue #7FDBFF` = enemy side. Distinction by brightness/shape, not new hues; tiles must read ≥3:1 WCAG against the backdrop; `prefers-reduced-motion` disables ambient/trail motion.
- **§9.1 acceptance:** instanced sprite rendering, per-instance data in a storage buffer indexed by `instance_index`; one `queue.writeBuffer` per frame; a compute shader drives particles; a render bundle covers the static map layer; additive bloom on projectiles/impacts.
- **§9.2 acceptance:** three-stage adapter negotiation (below); power preference **NOT** `high-performance`; `device.lost` → re-init ("simulation state is CPU-side, a lost device costs a frame, not a run"). ~13% of usage plays via Canvas2D (Firefox Linux/Intel-Mac/Android, Safari < Tahoe 26, older Android GPUs, Windows ARM64).
- **Asset policy (§9.4):** no asset from the original game; procedural/original only; any third-party asset needs a manifest entry (source/licence/provenance) before commit — enforced by the `anthropic-skills:asset-license` skill.
- **Compute particles for v1:** the two renderer investigations disagree on emphasis (§9.1 names a compute shader; the feasibility pass recommends deferring compute and using instanced quads since entities are bounded ≤100 creeps). See open decision #A3.

### 2.2 Exact contract to build against (verified)
The seam is `src/game/runtime/render/Renderer.ts`. `RendererCaps.kind` **already includes `"webgpu"`** (line 22) — no interface edit needed to name the backend. The 8-member contract (verbatim, Renderer.ts:37-79):

```ts
export interface Renderer {
  init(canvas: HTMLCanvasElement): Promise<void>;
  resize(cssW: number, cssH: number, dpr: number): void;
  frame(prev: RenderSnapshot, curr: RenderSnapshot, alpha: number, hits: HitEvent[]): void;
  screenToWorld(clientX: number, clientY: number, canvas: HTMLCanvasElement): { x: number; y: number };
  destroy(): void;
  readonly caps: RendererCaps;              // { kind: "canvas2d" | "webgpu"; particles: boolean }
  setHighlightTower(index: number | null): void;
  setHighlight(tile: number, towerType: number, affordable: boolean): void;
}
export interface HitEvent { x: number; y: number; kind: number; }
export interface InterpCreep { id: number; x: number; y: number; hp01: number; flags: number; }
export function interpolateById(prev: RenderSnapshot, curr: RenderSnapshot, alpha: number): InterpCreep[];
```

`RenderSnapshot` (per-frame data, `src/game/sim/engine.ts`): `tick, bank, score, wave, gameOver, creepCount, creepAlive, creepXY:Float32Array[2n], creepId:Int32Array (STABLE id), creepHp01:Float32Array, creepFlags:Int32Array (CREEP_FAST|AIR|HARD), towerCount, towerXY:Float32Array[2m], towerType:Int32Array, towerLevel:Int32Array`. `*XY` are already float stage-px.

**The single construction seam (verified):**
- `GameClient.tsx:40` — `import { Canvas2DRenderer } from "@/game/runtime/render/canvas2d/Canvas2DRenderer";`
- `GameClient.tsx:309` — `const renderer: Renderer = new Canvas2DRenderer();`
- `init` at line 326, `destroy` at 342 (the `!alive` bail) and 583 (cleanup).

**Load-bearing constraints on the port:**
- Creep array index is **not** stable across ticks (`removeCreep` is swap-with-last); `id` is. Key all per-creep GPU state by `creepId` and **reuse `interpolateById`** (unit-tested) rather than reimplementing id-matching in WGSL. Tower index *is* stable — that is what `setHighlightTower(index)` refers to.
- Fit transform to reproduce exactly: `pxW=round(cssW*dpr)`, `pxH=round(cssH*dpr)`; `scale=min(pxW/STAGE_W, pxH/STAGE_H)`; `offsetX=(pxW-STAGE_W*scale)/2`, `offsetY=(pxH-STAGE_H*scale)/2` (letterbox+center). `STAGE_W=840`, `STAGE_H=680`. Renderer owns backing-store sizing.
- `screenToWorld` MUST stay byte-identical to Canvas2D's formula (Canvas2DRenderer.ts:396-405) — it feeds `tileAtWorld` for pointer→tile hit-testing; any drift breaks input. WebGPU's internal projection is Y-flipped NDC but `screenToWorld` still returns Y-down stage-px.
- Static geometry from `@/game/titles/circle-td/content`: `STAGE_W/STAGE_H, TILE_SIZE=32, TRACK_WIDTH=64, TILES (Int32Array Q16.16 centres), TRACK.outer/inner (Q16.16 polylines), TOWERS[5]`. Convert Q16.16→float once at init via `toFloat` from `@/game/sim/math/fixed`. Flags `CREEP_AIR/FAST/HARD` from `@/game/sim/state`.
- `hits: HitEvent[]` arrives **fresh each frame** (only newly-occurred hits). The backend keeps its own short-lived list aged by wall-clock (Canvas2D: `HIT_LIFETIME_MS=240`). Renderer-only state, never sim state.

### 2.3 Recommended architecture
- **New files, all under `src/game/runtime/render/**` (outside the purity guard, inside the lazy boundary):**
  - `createRenderer.ts` — `export async function createRenderer(canvas, opts?): Promise<Renderer>`. Feature-detect `navigator.gpu` → `await import('./webgpu/WebGpuRenderer')` (separate async chunk) → run the full negotiation → on ANY failure fall through to an initialized `Canvas2DRenderer`. Consumed only by GameClient.
  - `webgpu/WebGpuRenderer.ts` — `class WebGpuRenderer implements Renderer { readonly caps = { kind: "webgpu", particles: <bool> } }`. Top with `/// <reference types="@webgpu/types" />`.
  - `transform.ts` — pure, node-unit-tested: `computeFit`, `worldToClip` (Y-flipped ortho), `screenToWorld`. **Shared by both renderers** so hit-testing never drifts.
  - `webgpu/pack.ts` — pure packers (towers/creeps/hits/tiles) from typed arrays → instance buffers.
  - `webgpu/tessellateTrack.ts` — pure: expand Q16.16 polyline into a triangle band once at init.
  - `webgpu/shaders.ts` — **inline WGSL template-literal strings** (no `.wgsl` file imports → no Turbopack loader config → `npm run build` stays green with zero config change).
- **Single GameClient edit:** replace the sync `new Canvas2DRenderer()` with `renderer = await createRenderer(canvas!)` inside `setup()`; keep it typed only as `Renderer`; keep `rendererRef.current = renderer`; change cleanup + the `!alive` guard to `renderer?.destroy()`. Pointer handlers already read `rendererRef.current` → no change.
- **Three-stage negotiation (§9.2), made runtime not presence-based:** `navigator.gpu` present → `requestAdapter()` non-null → `requestDevice()` resolves → `getContext('webgpu')` non-null → initial pipeline build succeeds (wrap in `pushErrorScope('validation')`). Retry once with `requestAdapter({ featureLevel: 'compatibility' })`, then Canvas2D. Register `device.lost.then(...)`; v1 = no-op-until-reload on loss (re-fallback is a follow-up decision).
- **Draw order (mirror Canvas2D.frame):** clear→backdrop→track(static bundle)→tiles(instanced, per-frame `dim`)→towers(instanced +glow)→ghost/highlight→creeps(instanced)→hp bars→hits. **Bloom as real post-process:** render into HDR color `rgba16float` + emissive `rgba16float` MRT (only glowy elements write emissive), downsample + separable Gaussian, composite scene+blur → swapchain (`getPreferredCanvasFormat()`, `alphaMode:'opaque'`). No depth (painter's order).

### 2.4 CI / lazy-boundary / bundle constraints
- **Lazy-boundary (`src/game/test/lazy-boundary.test.ts`):** `GUARDED_ROOTS` = marketing/layout pages + `src/components/**` (except `src/components/game`), `src/lib`, `src/data`, `src/types`. `src/app/games/**`, `src/game/**`, `src/components/game/**` are exempt. Placing the backend + factory under `src/game/runtime/render/**` is **invisible** to this guard. The only failure mode: adding a `@/game` import to a guarded file — never do that.
- **Bundle-budget (`scripts/check-bundle-budget.mjs`):** greps built chunks for the marker string `"Canvas2DRenderer: 2D canvas context unavailable"` (`GAME_MARKERS`) and fails if a prerendered marketing `.html` references such a chunk OR if **no** chunk contains any marker (stale check). **Do not remove/alter that throw string.** Optionally add a WebGPU-unique second marker to extend the guard to the WebGPU chunk. The WebGPU chunk stays behind the same click-gated `dynamic(ssr:false)` boundary as Canvas2D → budget unaffected.
- **`tsc --noEmit` (first CI step):** `navigator.gpu/GPUDevice/GPUCanvasContext` are not reliably in `lib.dom` at the pinned TS version → add `@webgpu/types` as a devDependency (only package.json change; zero runtime deps).
- Renderer lives under `src/game/runtime/**` = **outside** the sim purity guard (`purity.test.ts` walks only `sim/` + `titles/circle-td/`) → GPU/DOM/float/`Math.*` all allowed there.

### 2.5 Risks + mitigations
- **StrictMode/async teardown leak:** with `await createRenderer()` there is no sync local to destroy. Cleanup must `rendererRef.current?.destroy()` **and** `setup()` must add a second `if(!alive){ renderer.destroy(); return; }` right after the await, or a discarded first pass leaks a GPU device/context.
- **Runtime fallback, not presence:** `navigator.gpu` can exist yet `requestAdapter()` return null / `configure()` throw. Probe the full chain; otherwise players get a blank canvas (today's `setup()` only bails on init failure — extend it to actually retry Canvas2D).
- **Determinism is safe by construction** (renderer is read-only over `RenderSnapshot`; golden hash is off `SimState`), but pixel/behavioural parity (letterbox, hit-flash timing, highlight/ghost) has no test → needs the new Playwright job.
- **jsdom lifecycle test must keep passing:** `createRenderer` must return Canvas2D (never throw synchronously) when `navigator.gpu` is absent; jsdom Canvas2D `init` throws → GameClient's alive-guarded catch already handles it. Keep the fallback throwing the same-shaped error under jsdom or `GameClient.test.tsx` + the bundle marker break together.
- **Space-in-path Turbopack DEV bug + Vercel curl 429:** verify visuals via `next build && next start` in a real WebGPU browser, never `next dev`, never curl (per MEMORY).

### 2.6 Testing strategy
- Node unit tests for every pure piece: `transform`/`screenToWorld` (must equal Canvas2D output), instance packers, track tessellator, world→clip matrix. This is the *only* automated coverage the GPU path can have.
- Playwright **render smoke** (`channel:'chromium'`): WebGPU inits, a frame draws, canvas not blank, no console errors. Where a CI runner has no GPU adapter, assert the fallback path engages instead of failing.
- Playwright **fallback smoke** (WebKit/Firefox): Canvas2D engages, playable without an adapter. Also force `preferWebgpu:false` to exercise fallback deterministically.
- Human visual pass in a real browser (Carbon Forge palette compliance, reduced-motion, bloom not blowing past palette). Also re-confirm Plan 2's build-phase render + highlight fixes, which were code-verified but never pixel-verified (browser pane was stuck all of Plan 2).

---

## 3. Subsystem B — Replay-verified Supabase leaderboard

### 3.1 Scope & locked decisions
- **D3 (locked):** global leaderboard, replay-verified — "the only leaderboard design that resists trivial cheating."
- **D5 (locked):** Supabase for persistence (already connected to the Vercel project). RLS gives a "verification is the only write path" model. No provider selection needed.
- **D6 (locked):** daily seed drives the ranked board; free play uses a random seed. Daily seed = `hash(UTC date string)`, computed identically client+server → no coordination/storage, no clock skew.
- **§8.2 acceptance:** `POST /api/games/scores` receives a replay, re-executes it headlessly against the same sim module, compares score+wave to the submitted values, **writes only on an exact match**. Limits enforced **before** simulation: max ticks 5,000,000; max commands 20,000; max payload 1 MB; wall-clock 10s. "A submission exceeding any limit is rejected without being simulated." (Limits are "indicative initial values, to be confirmed against measured verification throughput.")
- **§8.3 acceptance:** `game_scores` table, initials `^[A-Z]{3}$`, RLS enabled, anon SELECT scoped to leaderboard columns, **no INSERT/UPDATE/DELETE policy for any client role** → service-role key (used only by the route) is structurally the only write path. Identity = three arcade initials (no accounts/auth/PII/GDPR surface). Per-IP rate limiting is the practical mitigation for the one attack determinism can't stop.
- **§8.4 acceptance:** boards scoped per `sim_version`; on a balance change the previous board is archived and shown historical, never recomputed. "The reason to complete the §5.4 tuning sweep before the first public board."
- **Free play (§5.6):** unranked — never posted to a global board.

### 3.2 Why reuse of the sim server-side is proven safe (verified)
The full `runReplay`/`hashState` import graph (`replay.ts → titles/circle-td/index.ts (+content, state) → balance, rules, engine, math/rng, math/fixed, types`) lives **entirely** under the two purity roots, imports **only** internal `@/game/*` + type-only specifiers, and touches no DOM/timer/canvas/external package. `determinism.test.ts` already runs `runReplay` + `hashState` in Node CI. `Math.sqrt` is IEEE correctly-rounded (deterministic cross-engine); the banned transcendentals are what would drift. → the route can call `runReplay` unchanged at `runtime = 'nodejs'`.

### 3.3 Exact interfaces to build against (verified signatures/paths)
```ts
// src/game/sim/replay.ts (REUSE unchanged)
export const runReplay = (replay: Replay): ReplayResult;   // internal CEILING = 5_000_000 ticks
export function hashState(s: SimState): string;            // 8-char FNV-1a hex
export interface Replay  { seed: number; simVersion: number; mode: "daily"|"free"; commands: Command[] }
export interface Command { tick: number; type: "start"|"place"|"upgrade"|"sell"; tower?: number; tile?: number }
export interface ReplayResult { score: number; wave: number; hash: string; maxTowerLevel: number }
// runReplay IGNORES replay.simVersion — the route must check it against SIM_VERSION itself.
// applyCommand no-ops every malformed/illegal command → a hostile log can't crash the sim.

// src/game/sim/types.ts (REUSE)
export const SIM_VERSION = 1; export const TICK_HZ = 30;

// src/lib/dailySeed.ts (REUSE — deliberately OUTSIDE @/game/**, so the route imports it without the sim bundle)
export function dailySeed(now?: Date): number;      // hashToSeed(utcDateString(now))
export function utcDateString(now?: Date): string;  // 'YYYY-MM-DD' UTC
export function hashToSeed(input: string): number;
```

**Existing route convention to mirror:** `src/app/api/contact/route.ts` (the only current route) — `NextRequest`/`NextResponse` from `next/server`, zod `safeParse` of a schema in `src/lib/validations/*.schema.ts`, honeypot, try/catch, secret read server-side. Next 16.2.4, React 19.2.4, reactCompiler on. **AGENTS.md: read `node_modules/next/dist/docs/` (route handlers + runtime/segment config) before writing the route** — this repo pins a breaking-changes Next.

**Files to CREATE:**
- `src/app/api/games/scores/route.ts` — `export const runtime = 'nodejs'; export async function POST(req: NextRequest): Promise<NextResponse>`. Flow: zod-parse → enforce limits (size/commands/ticks) **before** sim → require `simVersion === SIM_VERSION` and (for daily) `seed === dailySeed(new Date())` (± rollover grace) → profanity-check initials → rate-limit(ip) → `runReplay(...)` → dedupe by replay hash → **insert the server-recomputed `result.score`/`result.wave`** via the service-role client → return `{ ok, rank, outOf, board }`. (Spec §6 shows this exact path; the leaderboard investigation used `src/app/api/leaderboard/**` as an alternative name — reconcile to `/api/games/scores` per §6/§8.2 and the site-integration note.)
- `src/lib/validations/score.schema.ts` — zod, mirroring contact.schema.ts: `{ gameSlug: literal('circle-td'), simVersion, seed, mode: enum(['daily','free']), initials: /^[A-Za-z]{3}$/, commands: array(...).max(20000) }`.
- `src/lib/supabase/server.ts` — `import 'server-only';` service-role client: `createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })` (throw if either env var missing).
- **Optional pure core** `src/game/sim/verify.ts` — a `verifyScore(submission, opts)` that stays free of Next/zod so `purity.test.ts` still covers it (a file under `src/game/sim/**` that imports `next`/`zod` tokens would trip the purity regex). Keeps limit-checking + recompute+compare in one testable unit; the route stays the HTTP/limits/auth shell.
- **Optional non-breaking refactor** to `replay.ts`: `runReplay(replay, maxTicks = CEILING)` (change the `while` bound) so the route can pass a `MAX_TICKS << CEILING` for DoS safety, and/or `export const REPLAY_LIMITS`.

**Env-var names — UNVERIFIED (Vercel MCP returned 403 on env listing).** The Vercel Supabase integration *usually* provisions `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`, `POSTGRES_*` (sometimes `NEXT_PUBLIC_` variants) — **do not assume.** Confirm the exact names via Vercel dashboard (Settings → Environment Variables) or `vercel env ls` before writing the client. Local `.env.local` currently has only `NEXT_PUBLIC_SITE_URL`, `RESEND_API_KEY`, `VERCEL_OIDC_TOKEN` — **no Supabase keys locally.** Vercel CLI **is** installed (v54.21.1) and the project **is** linked → `vercel env pull .env.local` works once names are confirmed. Service-role key must **never** be `NEXT_PUBLIC_`.

**Table DDL (owner runs manually in the Supabase dashboard SQL editor — no Supabase MCP/CLI available this session; keep the SQL checked into the repo, e.g. `supabase/migrations/0001_leaderboard.sql`):**
```sql
create table public.game_scores (
  id           bigint generated always as identity primary key,
  created_at   timestamptz not null default now(),
  game_slug    text not null,
  sim_version  integer not null,
  mode         text not null check (mode in ('daily','free')),
  seed         text not null,                                  -- store canonically (int-as-text, or UTC date for daily)
  daily_date   date,
  initials     text not null check (initials ~ '^[A-Z]{3}$'),
  score        integer not null check (score >= 0),
  wave         integer not null check (wave >= 0),
  hash         text not null,
  replay       jsonb,                                          -- full command log (single-digit KB)
  replay_hash  text not null,
  constraint daily_needs_date check (mode <> 'daily' or daily_date is not null),
  unique (game_slug, sim_version, seed, replay_hash)           -- dedupe: one good run can't carpet the board under many initials
);
create index game_scores_daily_rank on public.game_scores (daily_date, score desc, created_at asc) where mode='daily';
alter table public.game_scores enable row level security;
create policy "public read" on public.game_scores for select to anon, authenticated using (true);
-- deliberately NO insert/update/delete policy: service_role bypasses RLS and is the ONLY writer.
-- To keep replay/hash private, expose a column-limited VIEW for public reads and revoke base-table select (open decision #B4).
```

**Client wiring (CREATE/MODIFY):** `src/components/game/GameOver.tsx` currently renders "Leaderboard coming soon" — replace with an initials field + submit (daily) and a local personal-best readout (free); new props `{ mode, seed, simVersion, commands }`. `src/components/game/Leaderboard.tsx` — renders top-N + pinned own-rank row (Carbon Forge tokens, JetBrains Mono numerals).

### 3.4 Recommended architecture
- **Trust model:** the server IGNORES any client-claimed score and writes the values `runReplay()` computes. Recompute is strictly stronger than compare — there is no forged-result surface left. Use a client-sent `{score,wave,hash}` (if present) only as an early-out + drift signal.
- **Seed authority:** for daily, derive `dailySeed()` server-side and reject a mismatched submitted seed. Free mode is unranked → the route should reject `mode !== 'daily'` outright (keep free-play best in `localStorage`).
- **Input bounding before sim:** reject `payload > 1 MB`, `commands.length > 20,000`, `tick < 0 || > CEILING`, non-integer fields; wrap the run in a wall-clock budget; pass `MAX_TICKS << CEILING`. DoS is driven by run **length**, not command count (the sim advances every tick regardless of commands; `fireTowers` is O(towers×creeps)/tick). If worst-case exceeds ~1s, move verification off the request path (queue/worker).
- **Rate limiting:** stateless functions can't limit in-memory → needs an external atomic store (Supabase table/RPC — no new dep — vs Vercel KV/Upstash). Per-IP cap (e.g. 10/10min + ~30/day) + global ceiling. Salt-hash + TTL the IP; never persist it beside the score (keeps zero-PII posture).
- **Reads server-side** (Server Component or GET handler) so no Supabase keys ship to the browser; if live client reads are ever wanted, expose only a public-safe view.
- **Store the full command log** in `replay jsonb` (not hash-only): single-digit KB, enables re-audit and the deferred "watch a top run" feature (§12.2) as a pure read with no format change. Keep `replay`/`hash` out of the public SELECT.

### 3.5 CI / lazy-boundary / bundle constraints
- `src/app/api/**` is **not** in `GUARDED_ROOTS` and route handlers are server-only bundles that never enter a client chunk → importing `@/game/sim/replay` there both passes the guard and matches its intent. No refactor to `replay.ts` needed for the guard (all exports already exist; no barrel drags it into browser code). **Never** add a `@/game` import to a guarded file.
- Keep `verify.ts` (if created) pure — under `src/game/sim/**` it *is* scanned by `purity.test.ts`'s token regex, so no `next`/`zod`/browser tokens there.

### 3.6 Risks + mitigations
- **Cross-engine non-determinism = false rejection of honest players** (single largest correctness risk): a ULP divergence between a Safari/Firefox player and the V8 verifier rejects an honest run. → gate the public board on the §10.1 cross-engine golden hash being green.
- **Offline optimizer/bot:** the sim + replay format are client-shipped/open-source; a solver can produce a genuinely-verifiable superhuman score. Verification proves the log→result, not that a human played. Inherent; disclose plainly, mitigate only out of band (daily-seed windowing so runs can't be precomputed, rate limits, dedupe).
- **Log copy/resubmission:** logs aren't secret → `unique(game_slug, sim_version, seed, replay_hash)` + rate limiting.
- **sim_version drift:** any balance/geometry change invalidates all stored replays → filter every query by current `SIM_VERSION`; archive per version.
- **Service-role key leak** (bypasses RLS entirely — highest-severity infra risk): `import 'server-only'`, never `NEXT_PUBLIC_`, never import from a `'use client'` file, never log `process.env`, `runtime='nodejs'`.
- **Env-var names unverified** → confirm before coding or the client throws at runtime.
- **UTC-rollover edge:** a run started 23:58 UTC finishing 00:01 was on yesterday's seed → define a grace window or honest late-night runs are rejected.
- **SSO protection** on `*.vercel.app` (all_except_custom_domains) + curl 429 → test the API on `michaelwright.work` in a real browser.

### 3.7 Testing strategy
- Node unit tests for `verifyScore`: recompute matches, claim-mismatch rejected, over-limit rejected without simulating, daily seed enforcement, `simVersion` mismatch rejected.
- Route tests: zod rejection, rate-limit path, dedupe idempotency (duplicate returns existing rank), profanity rejection.
- Keep the determinism golden gate green; it is the correctness anchor the whole board rests on.
- Manual verify against production custom domain in a real browser (not curl).

---

## 4. Subsystem C — Cross-engine determinism gate + balance sweep + CI (the shared foundation)

This is the single test the leaderboard rests on and is deferred *into* Plan 3 for both other subsystems.

- **§10.1 cross-engine gate:** a golden fixture (seed + scripted command log → state hash after N ticks) computed in Node and committed (already exists from Plan 1). Playwright executes the identical sim in **Chromium, Firefox, WebKit** and asserts every engine produces the same hash. Catches "a Safari player's honest run rejected by a V8 server."
- **§10.2/10.3 smokes:** render smoke (`channel:'chromium'`, WebGPU inits/draws/no-console-errors; no-GPU runner asserts fallback), fallback smoke (WebKit/Firefox Canvas2D engages), balance sweep (scheduled).
- **§5.4 balance sweep:** "no parameter set ships where difficulty inverts before wave 400"; degenerate banking strategy must not outperform balanced play beyond a margin. Runs on a schedule, not per-commit. Plan 1 deferred the full α/γ grid to Plan 3 CI (Plan 1 line 1376). The grid must now also sweep `BOUNTY_CAP` (spec §5.2 doesn't know it exists).
- **Playwright is not installed** — this whole harness is greenfield. CI must add: cross-engine job (decide per-commit vs scheduled) + render/fallback smokes; keep the balance sweep scheduled (`BALANCE_SWEEP=1 npm test`, ~4 min).

**Gate the first PUBLIC board on all three: (a) §5.4 sweep passes, (b) cross-engine hash matches across all three engines, (c) `SIM_VERSION` frozen — and reconcile spec §5.2 to include `BOUNTY_CAP` at the same time** so spec and code agree on the versioned surface.

---

## 5. Subsystem D — sim/↔titles/ layering refactor + `TitleDef` + `fireTowers` perf (the prerequisite)

- **Do this FIRST.** The verification route must build the correct title's sim from `game_slug`, but `replay.ts:10` hard-imports circle-td's `makeSim` directly. No `TitleDef` type exists in `src/` today. Introduce a `TitleDef` abstraction so the route is title-agnostic and the sim purity guard stays meaningful.
- **`fireTowers` perf pass** (Plan 2 handoff item #3) slots alongside the sim refactor. It also directly bounds server verification cost (O(towers×creeps)/tick dominates per-run CPU) — a real reason to do it before the board.
- **Deferred minors triage** (progress ledger line 124, low-priority Plan-3 cleanup): gamma=5 feel-tune; T5 alpha/speed-burst/`act()` hygiene; T6 no-nothing-armed/ghost affordability; T7 missing Hud/GameOver tests + reload-based play-again; T8 suspend/resume + `dailySeed` untested.

---

## 6. Site-integration remainder (Plan 3)
Routes/nav/sitemap/metadata/lazy-boundary already landed in Plan 2. Remaining: the click-to-play gate's LCP element must include the **current daily leaderboard** (§11.5), and §12.1 implies an arcade index-page query too. The leaderboard UI (gate + index query) is the Plan-3 piece still missing. Keep the `NodeNetworkCanvas` suspended on the game route (two live canvases contend for GPU/pointer). Keep the `Replay` format un-narrowed so deferred replay-playback (§12.2) stays possible.

---

## 7. Consolidated owner decisions (deduped, most-consequential first)

1. **Freeze `SIM_VERSION` / lock balance before the first public board.** α/γ/`BOUNTY_CAP` are all `INVENTED` and freshly re-tuned (2026-09-19); GAMMA=5 is documented "knife-edge." Any later tweak archives the board (every replay invalidated). Decide: run/accept the §5.4 sweep and freeze — and reconcile spec §5.2 to include `BOUNTY_CAP` — as the gating condition for launch. **(Highest leverage: gates everything on the leaderboard side.)**
2. **Block the public board on the cross-engine determinism gate being green.** Explicitly accept that an honest cross-engine run must reproduce on the V8 verifier or it is rejected as a "cheat." Recommended: BLOCKING.
3. **Confirm the Supabase env-var names** (Vercel MCP 403'd on env listing). Wrong names → the server client throws at runtime. Check dashboard / `vercel env ls` before writing `src/lib/supabase/server.ts`.
4. **Boards in v1: daily-only ranked (recommended) vs daily + all-time.** A raw all-time board silently mixes different-difficulty seeds. Free play stays local-only either way.
5. **Verification execution + limits.** Inline in the POST handler vs queue/worker, and the concrete `MAX_TICKS`/maxCommands/body-size/wall-clock values (§8.2 calls them "indicative, to be confirmed against measured throughput") — needs a profile of the strongest realistic run on Vercel. Includes whether to add the non-breaking `runReplay(replay, maxTicks)` param.
6. **Rate-limit backing store:** Supabase table/RPC (no new dep) vs Vercel KV/Upstash (simpler, adds env+service). Stateless functions can't limit in-memory.
7. **WebGPU async factory + StrictMode teardown refactor (recommended)** vs synchronous static import. Async ships WebGPU/WGSL as a separate chunk (Canvas2D-only visitors download zero WebGPU bytes) but requires the second `!alive`-guard destroy. Includes where runtime fallback lives (factory pre-probe vs `init()`-throws-and-GameClient-retries).
8. **Replay/hash column exposure:** public SELECT on the base table would expose the full stored replay + hash. Choose: select only public columns / a column-limited view with base-table select revoked / don't store replay except for daily-audit.
9. **Identity & dedupe with no auth:** ratify 3 arcade initials (`^[A-Z]{3}$`, recommended — bounded moderation surface via a server-side blocklist) vs a free display name; and one-best-per-identity-at-display vs show-every-verified-run (initials are decorative, not accounts).
10. **UTC daily-seed rollover policy:** strict `seed===today` vs a post-midnight grace window vs accept-whichever-day-the-seed-matches. Determines whether honest late-night runs are rejected.
11. **Leaderboard depth/shape (§12.1):** Top 100 vs Top 25 + pinned own-rank (recommended) vs Top 10 + personal-best row. Affects only the index/gate query + overlay layout.
12. **WebGPU secondary calls:** compute particles for v1 (defer to instanced quads recommended — entities bounded) ; device-loss behaviour (v1 no-op-until-reload recommended vs live re-fallback) ; a `?renderer=canvas2d` escape hatch ; whether to add a WebGPU-unique bundle marker ; whether `@webgpu/types` + the new pure-module unit tests are in scope (recommended yes).
13. **Wire-format reconciliation:** update spec §8.1 to match shipped code (`seed: number`, flat `tower?/tile?`) vs adapt at the API boundary. Also pick the canonical `seed` serialization for the `text` DB column.

---

## 8. Recommended plan-doc split & order

**Two plans, in this order. Rationale: the leaderboard's correctness rests on shared foundations (TitleDef refactor + frozen balance + cross-engine gate) that also make the renderer safer to land, and the renderer is a self-contained, lower-risk, no-external-dependency drop-in that can be built and reviewed while the balance/env decisions for the board are still being settled.**

- **Plan 3A — WebGPU renderer (first).** Pure client-side, one construction seam, zero runtime deps, no owner decisions blocking the *start* (only decision #7 and #12, both recommendable up front). Ships behind the existing lazy boundary with no CI-gate risk. Building it first also delivers the render/fallback smokes and the pure-module test discipline that the cross-engine harness reuses. Includes: `createRenderer` factory + `WebGpuRenderer` + shared `transform.ts`/packers/tessellator, the single GameClient edit, `@webgpu/types`, render+fallback smokes.
  - *Prerequisite folded in or done just before 3A:* the render smoke needs Playwright, which is also the cross-engine harness — stand Playwright up here.

- **Plan 3B — Replay-verified leaderboard (second).** Depends on decisions #1–#6, #8–#11, #13 and on the **Subsystem D `TitleDef` refactor** (do that as 3B's first task — the route needs a title-agnostic `makeSim`, and the `fireTowers` perf pass bounds verification cost). Then: verify core (`verify.ts`) → Supabase client + table DDL (owner-run) → `/api/games/scores` route with limits/seed-authority/rate-limit/dedupe → `GameOver`/`Leaderboard` UI + gate LCP. **Cannot open publicly until the shared gate (Subsystem C) is green and `SIM_VERSION` is frozen** — so 3B carries the cross-engine determinism gate + scheduled balance sweep as its launch gate, and the spec §5.2/§8.1 reconciliation lands with it.

**Alternative worth noting:** if the owner wants the *leaderboard* shipped first (it is "the most interesting property of the project," D3), 3A and 3B are independent enough to swap — but 3B has a longer critical path (owner decisions + manual DDL + balance freeze + cross-engine gate), so starting 3A keeps momentum while those settle.
