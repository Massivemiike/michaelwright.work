# Circle TD — Plan 3B: Replay-Verified Supabase Leaderboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Ship a replay-verified global leaderboard for Circle TD — daily + all-time boards ranked from server-re-simulated runs, with a `POST /api/games/scores` verification route as the structurally-only write path, 3-initial identity, hash+score-only storage, and a gated public launch.

**Architecture:** A title-agnostic `TitleDef`/slug-registry lets a pure `verifyScore` core (under the sim purity guard) rebuild the correct sim from `game_slug`, re-run the submitted command log with `runReplay`, and return the server-authoritative `{score,wave,hash}`. A Node-runtime route handler enforces limits→simVersion→daily-seed authority→initials blocklist→per-IP rate-limit→recompute→dedupe→insert against a service-role Supabase client (RLS: verification is the only writer; public reads go through a column-limited view). The client submits the full command log; the DB persists only hashes + score/wave/initials. A cross-engine Playwright determinism gate + scheduled balance sweep gate the public board switch.

**Tech Stack:** Next.js 16.2.4 (App Router, route handlers, `reactCompiler`), React 19.2.4, TypeScript strict, zod v4, `@supabase/supabase-js` (service-role, server-only), Postgres RLS + PL/pgSQL RPC, Vitest, Playwright (reused from Plan 3A) + esbuild (in-test bundling), the Plan-1/2 deterministic sim under `src/game/`.

**Spec:** `docs/superpowers/specs/2026-09-18-circle-td-arcade-design.md` (NOTE: the spec has DRIFTED from code — see the research map source-of-truth hierarchy; code + balance-tuning doc + progress ledger WIN over the spec on wire-format/economy/geometry).

## Global Constraints (one line each, exact values)

- Next `16.2.4` + React `19.2.4` (`reactCompiler: true` in `next.config.ts`); TS `strict`; module resolution `bundler`; vitest (`vitest.config.mts`, default env `node`, jsdom via per-file pragma).
- CI order (`.github/workflows/ci.yml`) = `npx tsc --noEmit` → `npm test` (lazy-boundary + sim purity + determinism golden) → `npm run build` → `npm run check:bundle-budget`. No ESLint step (no config in repo — do NOT invent one).
- Determinism golden hash is `1f8de6fe` (score `3628`, wave `64`, seed `20260918`, `simVersion 1`) — every behaviour-preserving task MUST leave it unchanged; only an intentional sim-behaviour change regenerates it via `UPDATE_GOLDEN=1`.
- `SIM_VERSION = 1`, `TICK_HZ = 30` (`src/game/sim/types.ts`). Every leaderboard row is scoped by `sim_version`; freezing it is a launch gate.
- Do NOT break the lazy-boundary guard: never add an `@/game` import (alias or relative-into-`src/game`) to a GUARDED file (`src/app/layout.tsx`, `src/app/{error,not-found,loading,page}.tsx`, `src/app/{blog,contact,gallery,projects,resume}`, `src/components/**` except `src/components/game`, `src/lib`, `src/data`, `src/types`). `src/app/api/**`, `src/app/games/**`, `src/game/**`, `src/components/game/**` are exempt.
- Do NOT break the sim purity guard (`src/game/sim/purity.test.ts`, roots `src/game/sim` + `src/game/titles/circle-td`): integer/deterministic only — no `window|document|navigator|performance`, no `new Date|Date.now`, no `Math.random|sin|cos|tan|atan|atan2|pow|exp|log*|hypot|cbrt|asin|acos|sinh|cosh|tanh`, no `**` operator. Any new file under those roots must pass this source-text scan.
- Do NOT break the bundle-budget marker string `"Canvas2DRenderer: 2D canvas context unavailable"` (`scripts/check-bundle-budget.mjs` `GAME_MARKERS`); the game engine chunk must never be referenced by a prerendered route's initial HTML.
- `src/app/api/**` is exempt from the lazy boundary and is server-only — importing `@/game/sim/replay` / `@/game/sim/verify` / `@/game/sim/registry` there is correct. Keep `verify.ts`/`title.ts`/`registry.ts` pure (they live under the purity roots).
- The service-role Supabase key is NEVER `NEXT_PUBLIC_`, never imported from a `'use client'` file, never logged; the client only ever reaches Supabase via `POST /api/games/scores` (writes, server-recomputed) and server-rendered reads (Server Components).
- AGENTS.md: this repo's Next diverges from training data — READ the relevant guide in `node_modules/next/dist/docs/` before writing any Next.js routing/rendering code (route handlers: `01-app/01-getting-started/15-route-handlers.md`; runtime segment config: `01-app/03-api-reference/03-file-conventions/02-route-segment-config/runtime.md`; caching/ISR: `01-app/02-guides/caching-without-cache-components.md`).
- Commit messages end with the trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Branch is `games/circle-td`; do NOT push.
- Owner decisions (locked, override research "recommended" defaults): Boards = DAILY + ALL-TIME (all-time = aggregate ranked view across all verified daily rows for the current `sim_version`); free play = LOCAL/unranked (`localStorage` best), never submitted. Identity = 3 arcade initials `^[A-Z]{3}$` + server-side blocklist (no accounts/auth/PII). Storage = HASH + SCORE ONLY (client submits full command log; DB persists only state hash + commands/replay hash + score/wave/initials — NO full replay column; no watch-replay, no post-hoc re-audit). Sequencing = build everything, GATE the public board on (a) balance frozen after owner playtest, (b) cross-engine determinism gate green, (c) balance sweep passing.

---

## File Structure

```
CREATE  src/game/sim/title.ts                         Generic TitleDef/TitleSim contracts (pure; type-only deps)
CREATE  src/game/sim/registry.ts                      slug→TitleDef registry + getTitle() (pure)
CREATE  src/game/titles/circle-td/title.ts            circleTdTitle: TitleDef binding makeSim + applyCommand + SIM_VERSION
MODIFY  src/game/sim/replay.ts                         Drop hard makeSim import; runReplay(replay,title,maxTicks); add hashCommands
MODIFY  src/game/titles/circle-td/rules.ts            fireTowers perf pass (per-tick position cache, swap-mirrored) — behaviour-identical
MODIFY  src/game/sim/replay.test.ts                    runReplay calls pass circleTdTitle
MODIFY  src/game/test/determinism.test.ts             runReplay call passes circleTdTitle (hash stays 1f8de6fe)
CREATE  src/game/sim/verify.ts                         verifyScore pure core: limits→simVersion→seed policy→recompute (no next/zod/browser)
CREATE  src/game/sim/verify.test.ts                    verifyScore unit tests
CREATE  src/lib/validations/score.schema.ts           zod submission schema (mirrors contact.schema.ts)
CREATE  src/lib/validations/score.schema.test.ts      schema accept/reject tests
MODIFY  src/lib/dailySeed.ts                           add acceptableDailySeeds(now, graceMinutes)
CREATE  src/lib/dailySeed.test.ts                      dailySeed + acceptableDailySeeds tests (closes deferred "dailySeed untested")
CREATE  src/lib/supabase/server.ts                     service-role client (import 'server-only'; throws if env missing)
CREATE  src/lib/leaderboard/types.ts                   LeaderboardRow, BoardResponse (plain types, client-safe)
CREATE  src/lib/leaderboard/config.ts                  LEADERBOARD_PUBLIC launch flag + LEADERBOARD_SIM_VERSION mirror
CREATE  src/game/test/leaderboard-sim-version.test.ts  asserts LEADERBOARD_SIM_VERSION === SIM_VERSION
CREATE  src/lib/leaderboard/blocklist.ts              initials blocklist + isBlockedInitials()
CREATE  src/lib/leaderboard/blocklist.test.ts
CREATE  src/lib/leaderboard/queries.ts                server-side board reads (getDailyBoard/getAllTimeBoard; try/catch→[])
CREATE  supabase/migrations/0001_leaderboard.sql      game_scores + public view + RLS + rate_limits + hit_rate_limit RPC (owner runs manually)
CREATE  src/app/api/games/scores/route.ts             POST handler (runtime=nodejs): full verification+write flow
CREATE  src/app/api/games/scores/route.test.ts        route branch tests (Supabase mocked)
CREATE  src/components/game/Leaderboard.tsx           'use client' Top-25 + DAILY/ALL-TIME tabs + pinned own-rank
MODIFY  src/components/game/GameOver.tsx               initials submit (daily) / localStorage best (free); new props
MODIFY  src/app/games/circle-td/GameClient.tsx        pass {mode,seed,simVersion,commands} to GameOver
MODIFY  src/app/games/circle-td/page.tsx              daily board in LCP poster (ISR) behind LEADERBOARD_PUBLIC
MODIFY  src/app/games/page.tsx                         arcade index daily top-3 preview (ISR) behind LEADERBOARD_PUBLIC
CREATE  src/game/test/cross-engine/harness.entry.ts   esbuild entry: window.runGolden(replay)=runReplay(replay,circleTdTitle).hash
CREATE  e2e/cross-engine-determinism.spec.ts          Playwright: Chromium/Firefox/WebKit reproduce the Node golden hash
CREATE  src/game/test/balance.grid.test.ts            gated (BALANCE_SWEEP=1) α/γ/alphaBp/BOUNTY_CAP grid sweep
CREATE  .github/workflows/balance-sweep.yml           scheduled + workflow_dispatch: BALANCE_SWEEP=1 npm test
MODIFY  .github/workflows/ci.yml                       add cross-engine-determinism job (per-commit)
MODIFY  vitest.config.mts                              widen include: src/lib/**, src/app/api/**
MODIFY  package.json                                   deps @supabase/supabase-js, server-only; devDep esbuild; (playwright from 3A)
MODIFY  docs/superpowers/specs/2026-09-18-circle-td-arcade-design.md   reconcile §5.2 (BOUNTY_CAP), §8.1 (seed:number, flat tower?/tile?), §8.3 (hash-only note)
(owner) .env.local                                     vercel env pull (Supabase names confirmed via vercel env ls) — NOT committed
```

---

## Task 1: Subsystem D — `TitleDef` layering refactor + `fireTowers` perf pass

**Goal:** Make the sim title-agnostic so the verify route builds the right sim from `game_slug`, and remove `replay.ts`'s hard `makeSim` import — WITHOUT changing behaviour (golden hash stays `1f8de6fe`). Fold in the `fireTowers` perf pass (behaviour-identical).

**Files:**
- Create `src/game/sim/title.ts`, `src/game/sim/registry.ts`, `src/game/titles/circle-td/title.ts`
- Modify `src/game/sim/replay.ts`, `src/game/titles/circle-td/rules.ts`, `src/game/sim/replay.test.ts`, `src/game/test/determinism.test.ts`

**Interfaces:**
- **Consumes:** `makeSim(config: SimConfig): CircleTdSim` (`@/game/titles/circle-td`), `applyCommand(state: SimState, cmd: Command): void` + `Command`/`Replay`/`ReplayResult` + `hashState`/`fold` (`@/game/sim/replay`), `SIM_VERSION` (`@/game/sim/types`), `SimState`/`MAX_CREEPS` (`@/game/sim/state`), `creepPos`/`posAt`/`TRACK`/`mul`/`bounty` (already local to `rules.ts`).
- **Produces:**
  ```ts
  // @/game/sim/title
  export interface TitleSim { state: SimState; tick(): unknown; }
  export interface TitleDef {
    readonly slug: string;
    readonly simVersion: number;
    makeSim(config: { seed: number; mode: "daily" | "free" }): TitleSim;
    applyCommand(state: SimState, cmd: Command): void;
  }
  // @/game/sim/registry
  export function getTitle(slug: string): TitleDef | undefined;
  // @/game/titles/circle-td/title
  export const circleTdTitle: TitleDef;
  // @/game/sim/replay (changed)
  export const runReplay: (replay: Replay, title: TitleDef, maxTicks?: number) => ReplayResult; // default maxTicks = CEILING (5_000_000)
  export function hashCommands(commands: readonly Command[]): string; // 8-char FNV-1a hex over the command log (dedupe key)
  ```

**Steps:**

- [ ] **Step 1: Add the pure generic title contracts.** Create `src/game/sim/title.ts`:
  ```ts
  // src/game/sim/title.ts
  //
  // Title-agnostic engine contracts. A TitleDef lets replay.ts / verify.ts /
  // the verification route rebuild a title's sim from a game_slug WITHOUT
  // replay.ts hard-importing a specific title's makeSim. Type-only imports
  // (erased at runtime) so this stays a leaf under the sim purity roots with
  // no runtime dependency cycle.
  import type { SimState } from "./state";
  import type { Command } from "./replay";

  // The minimal sim surface runReplay drives: a mutable SimState and a tick().
  // tick()'s return is title-specific (circle-td returns TowerHit[]); the
  // replay engine ignores it, so it is typed `unknown` here.
  export interface TitleSim {
    state: SimState;
    tick(): unknown;
  }

  export interface TitleDef {
    readonly slug: string;
    readonly simVersion: number;
    makeSim(config: { seed: number; mode: "daily" | "free" }): TitleSim;
    applyCommand(state: SimState, cmd: Command): void;
  }
  ```

- [ ] **Step 2: Run the purity guard against the new file (expected PASS — proves no banned tokens).** Run `npx vitest run src/game/sim/purity.test.ts`. Expected: `✓ simulation purity` (all pass). If it fails naming `title.ts`, remove the offending token — `title.ts` must contain none of the banned globals/math.

- [ ] **Step 3: Rewrite `runReplay` to take a `TitleDef` and add `hashCommands`.** In `src/game/sim/replay.ts`: (a) delete the line `import { makeSim } from "@/game/titles/circle-td";`; (b) add `import type { TitleDef } from "./title";` near the other imports; (c) replace the `runReplay` export with:
  ```ts
  export const runReplay = (
    replay: Replay,
    title: TitleDef,
    maxTicks: number = CEILING
  ): ReplayResult => {
    const sim = title.makeSim({ seed: replay.seed, mode: replay.mode });
    const byTick = groupByTick(replay.commands);

    while (!sim.state.gameOver && sim.state.tick < maxTicks) {
      const cmds = byTick.get(sim.state.tick) || [];
      for (const c of cmds) title.applyCommand(sim.state, c);
      sim.tick();
    }

    const t = sim.state.towers;
    let maxTowerLevel = 0;
    for (let i = 0; i < t.count; i++) if (t.level[i] > maxTowerLevel) maxTowerLevel = t.level[i];

    return { score: sim.state.score, wave: sim.state.wave, hash: hashState(sim.state), maxTowerLevel };
  };
  ```
  Then, immediately below the existing `hashState` function, add `hashCommands` (reuses the already-hoisted `fold`):
  ```ts
  // Deterministic 8-char FNV-1a digest over the command LOG (not the sim
  // state) — the dedupe key for unique(game_slug,sim_version,seed,replay_hash).
  // Pure integer ops only, so it matches across JS engines the same way
  // hashState does.
  const CMD_TYPE_CODE: Record<Command["type"], number> = { start: 0, place: 1, upgrade: 2, sell: 3 };

  export function hashCommands(commands: readonly Command[]): string {
    let h = 0x811c9dc5;
    h = fold(h, commands.length);
    for (const c of commands) {
      h = fold(h, c.tick);
      h = fold(h, CMD_TYPE_CODE[c.type]);
      h = fold(h, c.tower ?? -1);
      h = fold(h, c.tile ?? -1);
    }
    return (h >>> 0).toString(16).padStart(8, "0");
  }
  ```
  (`applyCommand` and its circle-td helpers stay in `replay.ts` unchanged — they remain the circle-td command interpreter and are re-exposed via `circleTdTitle.applyCommand`. Only the `makeSim` hard-import is removed; `runReplay` is now title-agnostic in its call path.)

- [ ] **Step 4: Bind the circle-td `TitleDef`.** Create `src/game/titles/circle-td/title.ts`:
  ```ts
  // src/game/titles/circle-td/title.ts
  //
  // The circle-td binding of the generic TitleDef (src/game/sim/title.ts):
  // maps the slug + SIM_VERSION to this title's makeSim and applyCommand so
  // the registry / verification route can rebuild this sim from "circle-td"
  // with no hard import of makeSim inside replay.ts.
  import { SIM_VERSION } from "@/game/sim/types";
  import type { TitleDef } from "@/game/sim/title";
  import { applyCommand } from "@/game/sim/replay";
  import { makeSim } from "./index";

  export const CIRCLE_TD_SLUG = "circle-td";

  export const circleTdTitle: TitleDef = {
    slug: CIRCLE_TD_SLUG,
    simVersion: SIM_VERSION,
    makeSim: (config) => makeSim(config),
    applyCommand,
  };
  ```

- [ ] **Step 5: Add the slug registry.** Create `src/game/sim/registry.ts`:
  ```ts
  // src/game/sim/registry.ts
  //
  // Maps a game_slug to its TitleDef so the verification route (which only
  // has the wire-format slug) can rebuild the correct sim. Adding a second
  // title later is one entry here. Pure: the only runtime import is the
  // title's own TitleDef binding.
  import type { TitleDef } from "./title";
  import { circleTdTitle } from "@/game/titles/circle-td/title";

  const REGISTRY: Record<string, TitleDef> = {
    [circleTdTitle.slug]: circleTdTitle,
  };

  export function getTitle(slug: string): TitleDef | undefined {
    return REGISTRY[slug];
  }
  ```

- [ ] **Step 6: Update the two `runReplay` callers to pass the title.** In `src/game/sim/replay.test.ts`, add `import { circleTdTitle } from "@/game/titles/circle-td/title";` and change both `runReplay(replay)` calls to `runReplay(replay, circleTdTitle)`. In `src/game/test/determinism.test.ts`, add the same import and change `const result = runReplay(replay);` to `const result = runReplay(replay, circleTdTitle);`.

- [ ] **Step 7: Prove the refactor is behaviour-preserving (golden unchanged).** Run `npx vitest run src/game/sim/replay.test.ts src/game/test/determinism.test.ts src/game/sim/purity.test.ts`. Expected: all pass; the determinism gate still asserts `result.hash === "1f8de6fe"`, `score === 3628`, `wave === 64`. If the hash changed, the refactor altered behaviour — revert and re-diff (the sim call path must be byte-identical). Do NOT run `UPDATE_GOLDEN=1`.

- [ ] **Step 8: Typecheck the refactor.** Run `npx tsc --noEmit`. Expected: exit 0. If `makeSim` assignability to `TitleDef.makeSim` errors, confirm `circleTdTitle.makeSim` is the wrapping arrow `(config) => makeSim(config)` (already written), not a bare `makeSim` reference.

- [ ] **Step 9: Commit the layering refactor.** `git add -A && git commit` with message `refactor(circle-td): title-agnostic TitleDef + slug registry; runReplay(replay,title); hashCommands` and the required trailer. (Do NOT push.)

- [ ] **Step 10: `fireTowers` perf pass — add the per-tick position scratch.** In `src/game/titles/circle-td/rules.ts`: change the state import to include `MAX_CREEPS`: `import { addCreep, CREEP_AIR, CREEP_FAST, removeCreep, MAX_CREEPS } from "@/game/sim/state";`. Directly above `export const fireTowers`, add module-level scratch:
  ```ts
  // Per-tick creep world-position scratch (Fx / Q16.16). Rebuilt for [0,count)
  // at the top of every fireTowers() call before any read, and kept in sync
  // with the swap-with-last removals in the kill pass below, so a later
  // tower's targeting never reads a stale position. Replaces the old
  // O(towers×creeps) posAt() calls with O(creeps) per tick. fireTowers runs
  // fully synchronously within a single tick (no await), so this shared
  // buffer is never re-entered mid-run — safe for the one-run-at-a-time
  // server verification path too.
  const CREEP_PX = new Int32Array(MAX_CREEPS);
  const CREEP_PY = new Int32Array(MAX_CREEPS);
  ```

- [ ] **Step 11: `fireTowers` perf pass — use the cache (behaviour-identical).** Replace the body of `export const fireTowers` with the version below. Every numeric result (target selection by leading `dist`, splash set, kills, bounty, order of `events`) is identical to the original — only the position source changes from repeated `creepPos()` to the swap-mirrored cache:
  ```ts
  export const fireTowers = (s: SimState): TowerHit[] => {
    const events: TowerHit[] = [];
    const c = s.creeps, t = s.towers;

    // Precompute every live creep's world position once this tick.
    for (let i = 0; i < c.count; i++) {
      const p = creepPos(c, i);
      CREEP_PX[i] = p.x; CREEP_PY[i] = p.y;
    }

    for (let ti = 0; ti < t.count; ti++) {
      if (t.cooldown[ti] > 0) { t.cooldown[ti] -= 1; continue; }

      const type = t.type[ti], level = t.level[ti];
      const def = TOWERS[type];
      const tx = TILES[t.tile[ti] * 2], ty = TILES[t.tile[ti] * 2 + 1];
      const rSq = towerRangeSq(type, level);

      // Leading (greatest wrapped dist, R10) valid in-range creep.
      let best = -1, bestDist = -1;
      for (let ci = 0; ci < c.count; ci++) {
        if (!inTargetSet(c.flags[ci], def.targets)) continue;
        const dx = CREEP_PX[ci] - tx, dy = CREEP_PY[ci] - ty;
        const dSq = mul(dx, dx) + mul(dy, dy);
        if (dSq <= rSq && c.dist[ci] > bestDist) { best = ci; bestDist = c.dist[ci]; }
      }
      if (best < 0) continue; // no target: does NOT go on cooldown

      t.cooldown[ti] = def.cooldownTicks;
      const primaryId = c.id[best];
      const ppx = CREEP_PX[best], ppy = CREEP_PY[best]; // BEFORE any removal

      const dmg = towerDamage(type, level);
      c.hp[best] -= dmg;

      if (def.splashRadius0 > 0) {
        const sr = def.splashRadius0 + level * def.splashStep;
        const srSq = mul(sr, sr);
        for (let k = 0; k < c.count; k++) {
          if (k === best) continue;
          if (!inTargetSet(c.flags[k], def.targets)) continue;
          const dx = CREEP_PX[k] - ppx, dy = CREEP_PY[k] - ppy;
          const dSq = mul(dx, dx) + mul(dy, dy);
          if (dSq <= srSq) c.hp[k] -= dmg; // full damage, no falloff — INVENTED
        }
      }

      if (def.slowPct.length > 0) {
        c.slowPct[best] = def.slowPct[level];
        c.slowTicks[best] = SLOW_DURATION_TICKS;
      }

      // Remove the dead and award bounty/score. The position cache is
      // swap-mirrored so it stays valid for the NEXT tower's targeting.
      let killed = false;
      for (let k = 0; k < c.count;) {
        if (c.hp[k] <= 0) {
          s.bank += bounty(c.maxHp[k], s.gamma, s.bountyCap);
          s.score += 2; // SOURCED: 2 points per kill
          if (c.id[k] === primaryId) killed = true;
          const last = c.count - 1;
          CREEP_PX[k] = CREEP_PX[last]; CREEP_PY[k] = CREEP_PY[last]; // mirror removeCreep's swap
          removeCreep(c, k);
        } else {
          k++;
        }
      }

      events.push({ towerType: type, tile: t.tile[ti], creepId: primaryId, killed });
    }

    return events;
  };
  ```

- [ ] **Step 12: Prove the perf pass is behaviour-identical.** Run `npx vitest run src/game/titles/circle-td/rules.test.ts src/game/test/determinism.test.ts src/game/sim/purity.test.ts`. Expected: all pass; determinism hash still `1f8de6fe`. If the hash moved, the cache diverged from `creepPos` semantics — re-check that the precompute covers `[0,count)` (including staged `dist<0` creeps, exactly as the old code did) and that the kill-pass swap copies `last→k` before `removeCreep`.

- [ ] **Step 13: Run the full fast suite + typecheck.** Run `npx tsc --noEmit && npm test`. Expected: `tsc` exit 0; vitest all green (136+ passing, gated balance sweep skipped). Commit: `perf(circle-td): fireTowers per-tick position cache (behaviour-identical; golden 1f8de6fe unchanged)` + trailer.

---

## Task 2: `verifyScore` pure core (`verify.ts`)

**Goal:** A pure, purity-guarded function that does limits-before-sim, `simVersion` check, daily-seed authority (via injected acceptable seeds — no clock in the pure core), and `runReplay` recompute, returning the server-authoritative result or a typed rejection.

**Files:** Create `src/game/sim/verify.ts`, `src/game/sim/verify.test.ts`.

**Interfaces:**
- **Consumes:** `runReplay(replay, title, maxTicks?)`, `Command`, `Replay`, `ReplayResult` (`@/game/sim/replay`); `TitleDef` (`@/game/sim/title`).
- **Produces:**
  ```ts
  export interface VerifyInput {
    gameSlug: string;
    simVersion: number;
    seed: number;
    mode: "daily" | "free";
    commands: Command[];
  }
  export interface VerifyOptions {
    title: TitleDef;                              // from getTitle(gameSlug)
    expectedSimVersion: number;                   // SIM_VERSION
    acceptableSeeds: readonly number[] | null;    // daily: today's seed (+ grace); null skips the seed check (caller already gated free)
    maxCommands?: number;                         // default 20000
    maxTicks?: number;                            // default MAX_VERIFY_TICKS
  }
  export type VerifyRejection =
    | "sim_version_mismatch" | "wrong_mode" | "too_many_commands"
    | "invalid_command_shape" | "bad_seed";
  export type VerifyResult =
    | { ok: true; score: number; wave: number; hash: string; maxTowerLevel: number }
    | { ok: false; reason: VerifyRejection };
  export const MAX_VERIFY_TICKS = 5_000_000;      // == replay CEILING; DoS bound lives in run length
  export const MAX_VERIFY_COMMANDS = 20_000;
  export function verifyScore(input: VerifyInput, opts: VerifyOptions): VerifyResult;
  ```

**Steps:**

- [ ] **Step 1: Write the failing test.** Create `src/game/sim/verify.test.ts`:
  ```ts
  import { describe, it, expect } from "vitest";
  import { verifyScore, MAX_VERIFY_COMMANDS, type VerifyInput } from "./verify";
  import { circleTdTitle } from "@/game/titles/circle-td/title";
  import { SIM_VERSION } from "@/game/sim/types";
  import { runReplay, type Command } from "./replay";

  const SEED = 20260918;
  const baseOpts = { title: circleTdTitle, expectedSimVersion: SIM_VERSION, acceptableSeeds: [SEED] as number[] };
  const input = (over: Partial<VerifyInput> = {}): VerifyInput => ({
    gameSlug: "circle-td", simVersion: SIM_VERSION, seed: SEED, mode: "daily",
    commands: [{ tick: 0, type: "place", tower: 0, tile: 10 }], ...over,
  });

  describe("verifyScore", () => {
    it("recomputes the authoritative result for a valid daily submission", () => {
      const r = verifyScore(input(), baseOpts);
      expect(r.ok).toBe(true);
      if (r.ok) {
        const direct = runReplay({ seed: SEED, simVersion: SIM_VERSION, mode: "daily", commands: input().commands }, circleTdTitle);
        expect(r.score).toBe(direct.score);
        expect(r.wave).toBe(direct.wave);
        expect(r.hash).toBe(direct.hash);
      }
    });
    it("rejects a simVersion mismatch without simulating", () => {
      expect(verifyScore(input({ simVersion: 999 }), baseOpts)).toEqual({ ok: false, reason: "sim_version_mismatch" });
    });
    it("rejects free mode as unranked", () => {
      expect(verifyScore(input({ mode: "free" }), baseOpts)).toEqual({ ok: false, reason: "wrong_mode" });
    });
    it("rejects a seed not in the acceptable set", () => {
      expect(verifyScore(input({ seed: 42 }), baseOpts)).toEqual({ ok: false, reason: "bad_seed" });
    });
    it("accepts a grace-window seed when present in acceptableSeeds", () => {
      const r = verifyScore(input({ seed: 42 }), { ...baseOpts, acceptableSeeds: [SEED, 42] });
      expect(r.ok).toBe(true);
    });
    it("rejects over-limit command counts before simulating", () => {
      const many: Command[] = Array.from({ length: MAX_VERIFY_COMMANDS + 1 }, () => ({ tick: 0, type: "start" }));
      expect(verifyScore(input({ commands: many }), baseOpts)).toEqual({ ok: false, reason: "too_many_commands" });
    });
    it("rejects a malformed command tick (non-integer / negative)", () => {
      expect(verifyScore(input({ commands: [{ tick: -1, type: "start" }] }), baseOpts)).toEqual({ ok: false, reason: "invalid_command_shape" });
      expect(verifyScore(input({ commands: [{ tick: 1.5, type: "start" }] }), baseOpts)).toEqual({ ok: false, reason: "invalid_command_shape" });
    });
  });
  ```
  Run `npx vitest run src/game/sim/verify.test.ts`. Expected FAIL: `Failed to resolve import "./verify"` (the module does not exist yet).

- [ ] **Step 2: Implement `verify.ts`.** Create `src/game/sim/verify.ts`:
  ```ts
  // src/game/sim/verify.ts
  //
  // The pure verification core for the replay-verified leaderboard. Kept free
  // of next/zod/browser/clock tokens so it stays under the sim purity guard
  // (src/game/sim/purity.test.ts) and is unit-testable in isolation. The HTTP
  // shell (src/app/api/games/scores/route.ts) owns everything impure: body
  // parsing, payload size, IP rate limiting, the current clock, and the DB.
  // Clock-derived daily-seed authority is injected as `acceptableSeeds` so
  // this core never constructs a Date.
  //
  // Trust model: the server IGNORES any client-claimed score. verifyScore
  // RECOMPUTES the run with runReplay and returns those authoritative values;
  // the route inserts result.score / result.wave, never a client figure.
  import { runReplay, type Command, type Replay } from "./replay";
  import type { TitleDef } from "./title";

  export const MAX_VERIFY_TICKS = 5_000_000; // matches replay.ts CEILING; the DoS bound is run LENGTH, not command count
  export const MAX_VERIFY_COMMANDS = 20_000;

  export interface VerifyInput {
    gameSlug: string;
    simVersion: number;
    seed: number;
    mode: "daily" | "free";
    commands: Command[];
  }

  export interface VerifyOptions {
    title: TitleDef;
    expectedSimVersion: number;
    acceptableSeeds: readonly number[] | null;
    maxCommands?: number;
    maxTicks?: number;
  }

  export type VerifyRejection =
    | "sim_version_mismatch"
    | "wrong_mode"
    | "too_many_commands"
    | "invalid_command_shape"
    | "bad_seed";

  export type VerifyResult =
    | { ok: true; score: number; wave: number; hash: string; maxTowerLevel: number }
    | { ok: false; reason: VerifyRejection };

  export function verifyScore(input: VerifyInput, opts: VerifyOptions): VerifyResult {
    const maxCommands = opts.maxCommands ?? MAX_VERIFY_COMMANDS;
    const maxTicks = opts.maxTicks ?? MAX_VERIFY_TICKS;

    // --- All limits enforced BEFORE building or ticking a sim ---
    if (input.simVersion !== opts.expectedSimVersion) return { ok: false, reason: "sim_version_mismatch" };
    if (input.mode !== "daily") return { ok: false, reason: "wrong_mode" }; // free play is local-only/unranked
    if (input.commands.length > maxCommands) return { ok: false, reason: "too_many_commands" };
    for (const cmd of input.commands) {
      if (!Number.isInteger(cmd.tick) || cmd.tick < 0 || cmd.tick >= maxTicks) {
        return { ok: false, reason: "invalid_command_shape" };
      }
    }
    if (opts.acceptableSeeds && !opts.acceptableSeeds.includes(input.seed)) {
      return { ok: false, reason: "bad_seed" };
    }

    // --- Recompute (server-authoritative). runReplay is bounded by maxTicks;
    // applyCommand no-ops any illegal command, so a hostile log can't crash. ---
    const replay: Replay = {
      seed: input.seed,
      simVersion: input.simVersion,
      mode: input.mode,
      commands: input.commands,
    };
    const result = runReplay(replay, opts.title, maxTicks);
    return { ok: true, score: result.score, wave: result.wave, hash: result.hash, maxTowerLevel: result.maxTowerLevel };
  }
  ```

- [ ] **Step 3: Run the test (expected PASS).** Run `npx vitest run src/game/sim/verify.test.ts`. Expected: all 7 cases pass.

- [ ] **Step 4: Confirm purity + typecheck.** Run `npx vitest run src/game/sim/purity.test.ts && npx tsc --noEmit`. Expected: purity green (verify.ts has no banned tokens), `tsc` exit 0.

- [ ] **Step 5: Commit.** `feat(circle-td): pure verifyScore core (limits-before-sim, seed authority, server-authoritative recompute)` + trailer.

---

## Task 3: `score.schema.ts` (zod) + `acceptableDailySeeds` + vitest include widen

**Goal:** The wire-format validator (mirrors `contact.schema.ts`) and the clock→seed helper the route injects into `verifyScore`. Widen vitest's `include` so `src/lib/**` and `src/app/api/**` tests run.

**Files:** Create `src/lib/validations/score.schema.ts`, `src/lib/validations/score.schema.test.ts`, `src/lib/dailySeed.test.ts`; Modify `src/lib/dailySeed.ts`, `vitest.config.mts`.

**Interfaces:**
- **Consumes:** `z` (`zod` v4); `dailySeed`, `utcDateString` (`@/lib/dailySeed`).
- **Produces:**
  ```ts
  // @/lib/validations/score.schema
  export const scoreSubmissionSchema: z.ZodType<{ gameSlug: "circle-td"; simVersion: number; seed: number; mode: "daily"|"free"; initials: string; commands: {tick:number;type:"start"|"place"|"upgrade"|"sell";tower?:number;tile?:number}[]; }>;
  export type ScoreSubmission = z.infer<typeof scoreSubmissionSchema>;
  // @/lib/dailySeed (added)
  export function acceptableDailySeeds(now?: Date, graceMinutes?: number): number[];
  ```

**Steps:**

- [ ] **Step 1: Widen the vitest include.** In `vitest.config.mts`, replace the `include` array with:
  ```ts
      include: [
        "src/game/**/*.test.ts",
        "src/app/games/**/*.test.tsx",
        "src/app/api/**/*.test.ts",
        "src/components/game/**/*.test.tsx",
        "src/lib/**/*.test.ts",
      ],
  ```
  (Playwright specs live under `e2e/**` — never matched by these globs, so no collision.)

- [ ] **Step 2: Write the failing schema test.** Create `src/lib/validations/score.schema.test.ts`:
  ```ts
  import { describe, it, expect } from "vitest";
  import { scoreSubmissionSchema } from "./score.schema";

  const ok = {
    gameSlug: "circle-td", simVersion: 1, seed: 20260918, mode: "daily",
    initials: "ABC", commands: [{ tick: 0, type: "place", tower: 0, tile: 10 }],
  };

  describe("scoreSubmissionSchema", () => {
    it("accepts a well-formed submission", () => {
      expect(scoreSubmissionSchema.safeParse(ok).success).toBe(true);
    });
    it("rejects a wrong gameSlug", () => {
      expect(scoreSubmissionSchema.safeParse({ ...ok, gameSlug: "snake" }).success).toBe(false);
    });
    it("rejects initials that are not exactly 3 letters", () => {
      for (const initials of ["AB", "ABCD", "A1C", "A C", ""]) {
        expect(scoreSubmissionSchema.safeParse({ ...ok, initials }).success).toBe(false);
      }
    });
    it("accepts lowercase initials (route uppercases before blocklist + insert)", () => {
      expect(scoreSubmissionSchema.safeParse({ ...ok, initials: "abc" }).success).toBe(true);
    });
    it("rejects more than 20000 commands", () => {
      const commands = Array.from({ length: 20001 }, () => ({ tick: 0, type: "start" }));
      expect(scoreSubmissionSchema.safeParse({ ...ok, commands }).success).toBe(false);
    });
    it("rejects a non-integer seed and a bad command type", () => {
      expect(scoreSubmissionSchema.safeParse({ ...ok, seed: 1.5 }).success).toBe(false);
      expect(scoreSubmissionSchema.safeParse({ ...ok, commands: [{ tick: 0, type: "nuke" }] }).success).toBe(false);
    });
  });
  ```
  Run `npx vitest run src/lib/validations/score.schema.test.ts`. Expected FAIL: `Failed to resolve import "./score.schema"`.

- [ ] **Step 3: Implement the schema.** Create `src/lib/validations/score.schema.ts`:
  ```ts
  import { z } from "zod";

  // Mirrors src/lib/validations/contact.schema.ts's shape/role. The wire
  // format matches the SHIPPED sim, not the stale spec §8.1: seed is a number
  // (int32 daily seed) and commands carry flat optional tower?/tile? (not a
  // `payload: unknown`). Commands are capped at the §8.2 limit; tower/tile
  // ranges are validated in the sim (applyCommand no-ops anything illegal).
  export const commandSchema = z.object({
    tick: z.number().int().min(0),
    type: z.enum(["start", "place", "upgrade", "sell"]),
    tower: z.number().int().min(0).optional(),
    tile: z.number().int().min(0).optional(),
  });

  export const scoreSubmissionSchema = z.object({
    gameSlug: z.literal("circle-td"),
    simVersion: z.number().int(),
    seed: z.number().int(),
    mode: z.enum(["daily", "free"]),
    initials: z.string().regex(/^[A-Za-z]{3}$/, "Initials must be exactly 3 letters"),
    commands: z.array(commandSchema).max(20000),
  });

  export type ScoreSubmission = z.infer<typeof scoreSubmissionSchema>;
  ```

- [ ] **Step 4: Run the schema test (expected PASS).** Run `npx vitest run src/lib/validations/score.schema.test.ts`. Expected: all 6 pass.

- [ ] **Step 5: Write the failing dailySeed/grace test.** Create `src/lib/dailySeed.test.ts`:
  ```ts
  import { describe, it, expect } from "vitest";
  import { dailySeed, utcDateString, acceptableDailySeeds } from "./dailySeed";

  describe("dailySeed", () => {
    it("is stable for a fixed UTC day and differs across days", () => {
      const a = new Date("2026-09-18T10:00:00Z");
      const b = new Date("2026-09-18T23:59:00Z");
      const c = new Date("2026-09-19T00:00:00Z");
      expect(dailySeed(a)).toBe(dailySeed(b));
      expect(dailySeed(a)).not.toBe(dailySeed(c));
      expect(utcDateString(a)).toBe("2026-09-18");
    });
  });

  describe("acceptableDailySeeds", () => {
    it("returns only today's seed outside the grace window", () => {
      const noon = new Date("2026-09-19T12:00:00Z");
      expect(acceptableDailySeeds(noon, 10)).toEqual([dailySeed(noon)]);
    });
    it("also accepts yesterday's seed within the post-midnight grace window", () => {
      const justAfterMidnight = new Date("2026-09-19T00:05:00Z");
      const yesterday = new Date("2026-09-18T00:05:00Z");
      const seeds = acceptableDailySeeds(justAfterMidnight, 10);
      expect(seeds).toContain(dailySeed(justAfterMidnight));
      expect(seeds).toContain(dailySeed(yesterday));
      expect(seeds).toHaveLength(2);
    });
  });
  ```
  Run `npx vitest run src/lib/dailySeed.test.ts`. Expected FAIL: `acceptableDailySeeds is not a function` (export missing).

- [ ] **Step 6: Implement `acceptableDailySeeds`.** In `src/lib/dailySeed.ts`, append:
  ```ts
  /**
   * The daily seeds a ranked submission may legitimately carry right now.
   * Always today's UTC seed; also yesterday's if the current UTC time is
   * within `graceMinutes` of midnight — a run started at 23:58 UTC and
   * submitted at 00:01 was played on yesterday's seed and must not be
   * rejected as a cheat (research §3.6 UTC-rollover edge). Lives here (not in
   * the purity-guarded sim) precisely because it reads the clock via `Date`.
   */
  export function acceptableDailySeeds(now: Date = new Date(), graceMinutes: number = 10): number[] {
    const seeds = [dailySeed(now)];
    const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
    if (utcMinutes < graceMinutes) {
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      seeds.push(dailySeed(yesterday));
    }
    return seeds;
  }
  ```

- [ ] **Step 7: Run both lib tests + typecheck.** Run `npx vitest run src/lib/dailySeed.test.ts src/lib/validations/score.schema.test.ts && npx tsc --noEmit`. Expected: all pass; `tsc` exit 0.

- [ ] **Step 8: Commit.** `feat(leaderboard): score submission zod schema + acceptableDailySeeds grace window; widen vitest include` + trailer.

---

## Task 4: Supabase service-role client + confirmed env names + deps

**Goal:** A server-only service-role client that is the sole write credential, with the exact Vercel env-var names CONFIRMED (they are unverified in the research map), never `NEXT_PUBLIC_`.

**Files:** Create `src/lib/supabase/server.ts`; Modify `package.json`; (owner) `.env.local`.

**Interfaces:**
- **Produces:** `export function getServiceClient(): SupabaseClient;` (throws if `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` — or the confirmed names — are missing).

**Steps:**

- [ ] **Step 1: Add dependencies.** Run `npm i @supabase/supabase-js server-only` (runtime deps; both were absent). Verify `package.json` now lists both under `dependencies`. `server-only` makes an accidental client import a build error; `@supabase/supabase-js` provides `createClient` + types for `tsc`.

- [ ] **Step 2: Confirm the exact Supabase env-var NAMES via the Vercel CLI.** ALREADY CONFIRMED 2026-09-19 via `vercel env ls` (CLI v54.21.1, project linked): the project has **`SUPABASE_URL`** and **`SUPABASE_SERVICE_ROLE_KEY`** (both server-side, un-prefixed — use these for the service client) plus `SUPABASE_ANON_KEY`, `SUPABASE_SECRET_KEY`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_JWT_SECRET`, the `NEXT_PUBLIC_SUPABASE_*` public trio, and `POSTGRES_*`. So Step 3's code (`process.env.SUPABASE_URL` / `process.env.SUPABASE_SERVICE_ROLE_KEY`) is correct as written. Run `vercel env pull .env.local` to fetch the VALUES locally for testing (names are already known). NEVER reference a `NEXT_PUBLIC_`-prefixed key for the service role. (Re-run `vercel env ls` only if a runtime "env missing" error appears — the names were verified present at plan time.)

- [ ] **Step 3: Implement the client.** Create `src/lib/supabase/server.ts` (substitute the CONFIRMED env names from Step 2 if different):
  ```ts
  // src/lib/supabase/server.ts
  //
  // Service-role Supabase client — the ONLY write credential for game_scores,
  // and structurally the only write path (RLS has no client insert/update/
  // delete policy; the service role bypasses RLS). `import "server-only"`
  // makes it a build error to import this from any client bundle; the key is
  // never NEXT_PUBLIC_, never logged, and only reached from the nodejs route
  // handler and Server Component reads.
  import "server-only";
  import { createClient, type SupabaseClient } from "@supabase/supabase-js";

  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  export function getServiceClient(): SupabaseClient {
    if (!url || !serviceRoleKey) {
      throw new Error(
        "Supabase env missing: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (never NEXT_PUBLIC_)."
      );
    }
    return createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  ```

- [ ] **Step 4: Guard: lazy boundary + typecheck.** Run `npx vitest run src/game/test/lazy-boundary.test.ts && npx tsc --noEmit`. Expected: lazy-boundary green (`server.ts` imports no `@/game`); `tsc` exit 0 (types resolve from the new dep). If `server-only` fails to resolve under `moduleResolution: bundler`, confirm Step 1 installed it.

- [ ] **Step 5: Commit.** `feat(leaderboard): server-only service-role Supabase client (env names confirmed via vercel env ls)` + trailer. (Do NOT commit `.env.local` — confirm it is gitignored; `git status` must not list it.)

---

## Task 5: Migration SQL — `game_scores` (hash+score only) + public view + RLS + rate limiter

**Goal:** The committed schema the owner runs manually in the Supabase SQL editor (no MCP/CLI this session). HASH+SCORE-ONLY (no `replay` column), dedupe, both-board indexes, RLS with public reads only through a column-limited view, and an atomic per-IP rate-limit RPC (no new dependency).

**Files:** Create `supabase/migrations/0001_leaderboard.sql`.

**Interfaces:**
- **Produces (DB surface the route/reads depend on):** table `public.game_scores(id, created_at, game_slug, sim_version, mode, seed text, daily_date, initials, score, wave, hash, replay_hash)` with `unique(game_slug, sim_version, seed, replay_hash)`; view `public.game_scores_public` (no `seed`/`hash`/`replay_hash`); function `public.hit_rate_limit(p_bucket text, p_limit int, p_window_seconds int) returns boolean`.

**Steps:**

- [ ] **Step 1: Write the migration file.** Create `supabase/migrations/0001_leaderboard.sql`:
  ```sql
  -- supabase/migrations/0001_leaderboard.sql
  -- Circle TD replay-verified leaderboard schema (Plan 3B).
  -- Run MANUALLY in the Supabase SQL editor (Dashboard → SQL) — no CLI/MCP
  -- this session. HASH + SCORE ONLY: no full replay/commands column is
  -- stored (owner decision). The client submits the command log; the route
  -- re-simulates and persists only the resulting hashes + score/wave/initials.

  create table if not exists public.game_scores (
    id           bigint generated always as identity primary key,
    created_at   timestamptz not null default now(),
    game_slug    text        not null,
    sim_version  integer     not null,
    mode         text        not null check (mode in ('daily','free')),
    seed         text        not null,                    -- canonical: int daily seed as text
    daily_date   date,                                    -- the UTC day this run's seed belongs to
    initials     text        not null check (initials ~ '^[A-Z]{3}$'),
    score        integer     not null check (score >= 0),
    wave         integer     not null check (wave >= 0),
    hash         text        not null,                    -- FNV-1a state hash from runReplay
    replay_hash  text        not null,                    -- FNV-1a hash of the command log (dedupe)
    constraint daily_needs_date check (mode <> 'daily' or daily_date is not null),
    -- Dedupe: one verified run (same log, same seed/version) can't carpet the
    -- board under many initials — initials is deliberately NOT in the key.
    unique (game_slug, sim_version, seed, replay_hash)
  );

  -- Daily board: rank within one day's seed.
  create index if not exists game_scores_daily_rank
    on public.game_scores (daily_date, score desc, created_at asc)
    where mode = 'daily';

  -- All-time board: rank across all daily rows for a sim_version.
  create index if not exists game_scores_alltime_rank
    on public.game_scores (game_slug, sim_version, score desc, created_at asc)
    where mode = 'daily';

  -- Column-limited public read surface: excludes seed + both hashes.
  -- security_invoker=false (definer) so anon reads this view even though the
  -- base table's SELECT is revoked below — the view is the ONLY public read
  -- path, and RLS on the base table is evaluated as the (superuser) owner here.
  create or replace view public.game_scores_public
    with (security_invoker = false) as
    select id, created_at, game_slug, sim_version, mode, daily_date, initials, score, wave
    from public.game_scores;

  alter table public.game_scores enable row level security;
  -- No anon/authenticated policy exists → RLS denies all client access to the
  -- base table. service_role bypasses RLS and is the ONLY writer/full reader.
  revoke all on public.game_scores from anon, authenticated;
  grant  select on public.game_scores_public to anon, authenticated;

  -- --- Per-IP rate limiting (no new dependency; atomic in one upsert) ---
  create table if not exists public.rate_limits (
    bucket       text primary key,          -- salted hash of ip + window label (zero-PII)
    count        integer     not null default 0,
    window_start timestamptz not null default now()
  );
  alter table public.rate_limits enable row level security;   -- no policy → no client access

  create or replace function public.hit_rate_limit(
    p_bucket text, p_limit integer, p_window_seconds integer
  ) returns boolean
  language plpgsql
  security definer
  set search_path = public
  as $$
  declare
    v_count integer;
  begin
    insert into public.rate_limits as rl (bucket, count, window_start)
      values (p_bucket, 1, now())
    on conflict (bucket) do update
      set count = case
            when rl.window_start < now() - make_interval(secs => p_window_seconds) then 1
            else rl.count + 1 end,
          window_start = case
            when rl.window_start < now() - make_interval(secs => p_window_seconds) then now()
            else rl.window_start end
    returning rl.count into v_count;
    return v_count <= p_limit;   -- true = allowed
  end;
  $$;

  revoke all on function public.hit_rate_limit(text,integer,integer) from public, anon, authenticated;
  grant  execute on function public.hit_rate_limit(text,integer,integer) to service_role;
  ```

- [ ] **Step 2: Sanity-lint the SQL locally (no DB needed).** The migration cannot run in CI (owner runs it), so verify it is at least parse-clean. If `psql`/`pg_format` are unavailable, do a manual review checklist and assert the file is committed and non-empty: run `bash -c "test -s supabase/migrations/0001_leaderboard.sql && grep -c 'game_scores' supabase/migrations/0001_leaderboard.sql"` — expect a count ≥ 6. Review checklist to confirm by eye: (a) no `replay`/`commands` column exists; (b) `unique (game_slug, sim_version, seed, replay_hash)` present; (c) both rank indexes present; (d) base-table `SELECT` revoked from anon/authenticated and only the view granted; (e) no client insert/update/delete policy anywhere; (f) the RPC is `security definer` with a fixed `search_path`.

- [ ] **Step 3: Add the run instructions to the file's header (already inline) and to the launch checklist.** Confirm the file's top comment states "Run MANUALLY in the Supabase SQL editor." (No code change if Step 1's header is intact.)

- [ ] **Step 4: Commit.** `feat(leaderboard): 0001 migration — game_scores hash-only + column-limited view + RLS + rate-limit RPC (owner-run)` + trailer.

---

## Task 6: `POST /api/games/scores` route handler

**Goal:** The verification route — the structurally-only write path. Enforces limits BEFORE sim, `simVersion`, daily-seed authority (rejects `mode !== 'daily'`), initials blocklist, per-IP rate limit, `runReplay` recompute via `TitleDef`, dedupe by `replay_hash`, insert the SERVER-recomputed `score`/`wave`, and returns both boards + own ranks.

**Files:** Create `src/app/api/games/scores/route.ts`, `src/app/api/games/scores/route.test.ts`, `src/lib/leaderboard/types.ts`, `src/lib/leaderboard/blocklist.ts`, `src/lib/leaderboard/blocklist.test.ts`.

**Interfaces:**
- **Consumes:** `scoreSubmissionSchema`/`ScoreSubmission` (`@/lib/validations/score.schema`), `verifyScore` (`@/game/sim/verify`), `getTitle` (`@/game/sim/registry`), `hashCommands` (`@/game/sim/replay`), `SIM_VERSION` (`@/game/sim/types`), `dailySeed`/`acceptableDailySeeds`/`utcDateString` (`@/lib/dailySeed`), `getServiceClient` (`@/lib/supabase/server`), `isBlockedInitials` (`@/lib/leaderboard/blocklist`), `LeaderboardRow`/`BoardResponse` (`@/lib/leaderboard/types`), `createHash` (`node:crypto`), `NextRequest`/`NextResponse` (`next/server`).
- **Produces:** `export const runtime = "nodejs"; export async function POST(req: NextRequest): Promise<NextResponse>` returning `BoardResponse` (200) or `{ error }` (400/403/409/429/500).
  ```ts
  // @/lib/leaderboard/types
  export interface LeaderboardRow { rank: number; initials: string; score: number; wave: number; dailyDate: string | null; }
  export interface BoardResponse {
    ok: boolean; duplicate?: boolean;
    dailyRank: number | null; allTimeRank: number | null;
    daily: LeaderboardRow[]; allTime: LeaderboardRow[]; error?: string;
  }
  ```

**Steps:**

- [ ] **Step 1: Read the Next docs (AGENTS.md requirement).** Read `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md` and `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/02-route-segment-config/runtime.md`. Confirm for this Next 16.2.4: route handlers export named HTTP methods; `POST` is never cached; `export const runtime = 'nodejs'` selects the Node runtime (needed for `node:crypto` + `@supabase/supabase-js`). Mirror `src/app/api/contact/route.ts` conventions (try/catch, `safeParse`, `NextResponse.json`).

- [ ] **Step 2: Add the shared board types.** Create `src/lib/leaderboard/types.ts`:
  ```ts
  // src/lib/leaderboard/types.ts
  //
  // Plain, client-safe types shared by the route response, the Leaderboard
  // component, and server-side reads. No server-only import here, so it is
  // safe to import from a 'use client' component too.
  export interface LeaderboardRow {
    rank: number;
    initials: string;
    score: number;
    wave: number;
    dailyDate: string | null;
  }

  export interface BoardResponse {
    ok: boolean;
    duplicate?: boolean;
    dailyRank: number | null;
    allTimeRank: number | null;
    daily: LeaderboardRow[];
    allTime: LeaderboardRow[];
    error?: string;
  }
  ```

- [ ] **Step 3: Write the failing blocklist test.** Create `src/lib/leaderboard/blocklist.test.ts`:
  ```ts
  import { describe, it, expect } from "vitest";
  import { isBlockedInitials } from "./blocklist";

  describe("isBlockedInitials", () => {
    it("blocks a known offensive trigram case-insensitively", () => {
      expect(isBlockedInitials("ass")).toBe(true);
      expect(isBlockedInitials("ASS")).toBe(true);
    });
    it("allows ordinary initials", () => {
      expect(isBlockedInitials("ABC")).toBe(false);
      expect(isBlockedInitials("MRW")).toBe(false);
    });
  });
  ```
  Run `npx vitest run src/lib/leaderboard/blocklist.test.ts`. Expected FAIL: `Failed to resolve import "./blocklist"`.

- [ ] **Step 4: Implement the blocklist.** Create `src/lib/leaderboard/blocklist.ts`:
  ```ts
  // src/lib/leaderboard/blocklist.ts
  //
  // Server-side initials moderation. Identity is 3 arcade initials (no
  // accounts/PII); this bounds the moderation surface to a small set of
  // 3-letter combos. Extend as needed — data only, no secrets. Only imported
  // by the verification route.
  const BLOCKED = new Set<string>([
    "ASS", "FAG", "FUK", "FUC", "CUM", "COK", "COC", "DIC", "DIK",
    "NIG", "NGR", "SEX", "TIT", "JEW", "KKK", "GAY", "FUX", "PIS", "VAG",
  ]);

  export function isBlockedInitials(initials: string): boolean {
    return BLOCKED.has(initials.toUpperCase());
  }
  ```

- [ ] **Step 5: Run the blocklist test (expected PASS).** Run `npx vitest run src/lib/leaderboard/blocklist.test.ts`. Expected: both pass.

- [ ] **Step 6: Write the failing route test (Supabase mocked).** Create `src/app/api/games/scores/route.test.ts`:
  ```ts
  import { describe, it, expect, vi, beforeEach } from "vitest";

  // Mock the Supabase server client so the route's DB calls are observable
  // and no real network/env is needed. vi.mock also prevents server-only
  // from loading.
  const rpc = vi.fn();
  const insert = vi.fn();
  const from = vi.fn();
  vi.mock("@/lib/supabase/server", () => ({
    getServiceClient: () => ({ rpc, from }),
  }));
  // Fix "now" so daily-seed authority is deterministic in the test.
  vi.mock("@/lib/dailySeed", async (orig) => {
    const real = await orig<typeof import("@/lib/dailySeed")>();
    return { ...real };
  });

  import { POST } from "./route";
  import { dailySeed } from "@/lib/dailySeed";
  import { SIM_VERSION } from "@/game/sim/types";

  const SEED = dailySeed(new Date());
  const body = (over: Record<string, unknown> = {}) => ({
    gameSlug: "circle-td", simVersion: SIM_VERSION, seed: SEED, mode: "daily",
    initials: "ABC", commands: [{ tick: 0, type: "place", tower: 0, tile: 10 }], ...over,
  });
  const req = (b: unknown) =>
    new Request("http://localhost/api/games/scores", {
      method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "1.2.3.4" },
      body: JSON.stringify(b),
    });

  beforeEach(() => {
    rpc.mockReset(); insert.mockReset(); from.mockReset();
    rpc.mockResolvedValue({ data: true, error: null }); // rate limit: allowed
    // Default: insert succeeds; rank/board reads return empty.
    from.mockImplementation((table: string) => {
      if (table === "game_scores") {
        return {
          insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: { id: 1, created_at: "2026-09-19T00:00:00Z" }, error: null }) }) }),
          select: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ or: () => Promise.resolve({ count: 0, error: null }) }) }) }) }),
        } as unknown;
      }
      return { select: () => ({ eq: () => ({ eq: () => ({ order: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }) }) }) }) } as unknown;
    });
  });

  describe("POST /api/games/scores", () => {
    it("rejects an invalid body with 400", async () => {
      const res = await POST(req(body({ initials: "AB" })) as never);
      expect(res.status).toBe(400);
    });
    it("rejects free mode with 400 (local-only/unranked)", async () => {
      const res = await POST(req(body({ mode: "free" })) as never);
      expect(res.status).toBe(400);
    });
    it("rejects blocked initials with 403", async () => {
      const res = await POST(req(body({ initials: "ASS" })) as never);
      expect(res.status).toBe(403);
    });
    it("rejects when the rate limiter says over-limit with 429", async () => {
      rpc.mockResolvedValue({ data: false, error: null });
      const res = await POST(req(body()) as never);
      expect(res.status).toBe(429);
    });
    it("rejects a wrong daily seed with 400", async () => {
      const res = await POST(req(body({ seed: 999999 })) as never);
      expect(res.status).toBe(400);
    });
    it("accepts a valid submission and inserts the server-recomputed score", async () => {
      const res = await POST(req(body()) as never);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ok).toBe(true);
    });
  });
  ```
  Run `npx vitest run src/app/api/games/scores/route.test.ts`. Expected FAIL: `Failed to resolve import "./route"`.

- [ ] **Step 7: Implement the route.** Create `src/app/api/games/scores/route.ts`:
  ```ts
  // src/app/api/games/scores/route.ts
  //
  // Replay verification + the only write path for the leaderboard. Node
  // runtime (node:crypto + @supabase/supabase-js). Mirrors
  // src/app/api/contact/route.ts conventions (safeParse, try/catch,
  // NextResponse.json). Trust model: the client's claimed score is IGNORED —
  // verifyScore re-simulates and we insert its authoritative score/wave.
  // AGENTS.md: route-handler + runtime conventions confirmed against
  // node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md.
  import { NextRequest, NextResponse } from "next/server";
  import { createHash } from "node:crypto";
  import { scoreSubmissionSchema } from "@/lib/validations/score.schema";
  import { verifyScore } from "@/game/sim/verify";
  import { getTitle } from "@/game/sim/registry";
  import { hashCommands } from "@/game/sim/replay";
  import { SIM_VERSION } from "@/game/sim/types";
  import { dailySeed, acceptableDailySeeds, utcDateString } from "@/lib/dailySeed";
  import { getServiceClient } from "@/lib/supabase/server";
  import { isBlockedInitials } from "@/lib/leaderboard/blocklist";
  import type { BoardResponse, LeaderboardRow } from "@/lib/leaderboard/types";

  export const runtime = "nodejs";

  const MAX_BODY_BYTES = 1_000_000; // §8.2 payload ceiling, enforced before parse
  const MAX_TICKS = 5_000_000;      // DoS bound on run length
  const BOARD_LIMIT = 25;
  const RATE_10M = { seconds: 600, limit: 10 };
  const RATE_1D = { seconds: 86_400, limit: 30 };

  function clientIp(req: NextRequest): string {
    return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      || req.headers.get("x-real-ip")?.trim()
      || "0.0.0.0";
  }
  function bucket(ip: string, label: string): string {
    const salt = process.env.RATE_LIMIT_SALT ?? "circle-td-dev-salt";
    return "circle-td:" + createHash("sha256").update(salt + ip).digest("hex") + ":" + label;
  }

  export async function POST(req: NextRequest): Promise<NextResponse> {
    try {
      // 1. Payload size BEFORE parse.
      const raw = await req.text();
      if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) {
        return NextResponse.json({ error: "Payload too large" }, { status: 413 });
      }
      let parsedBody: unknown;
      try { parsedBody = JSON.parse(raw); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

      // 2. Schema (types, initials shape, commands<=20000).
      const result = scoreSubmissionSchema.safeParse(parsedBody);
      if (!result.success) {
        return NextResponse.json({ error: "Invalid submission", issues: result.error.flatten() }, { status: 400 });
      }
      const sub = result.data;

      // 3. Ranked submit is daily-only; free play is local/unranked.
      if (sub.mode !== "daily") {
        return NextResponse.json({ error: "Free play is not ranked; keep your best locally." }, { status: 400 });
      }

      // 4. Title from slug (title-agnostic verification).
      const title = getTitle(sub.gameSlug);
      if (!title) return NextResponse.json({ error: "Unknown game" }, { status: 400 });

      // 5. Initials blocklist (uppercased).
      const initials = sub.initials.toUpperCase();
      if (isBlockedInitials(initials)) {
        return NextResponse.json({ error: "Those initials aren't allowed." }, { status: 403 });
      }

      // 6. Daily-seed authority + which UTC day this run belongs to.
      const now = new Date();
      const acceptable = acceptableDailySeeds(now); // [today] (+ yesterday within grace)
      if (!acceptable.includes(sub.seed)) {
        return NextResponse.json({ error: "Stale or invalid daily seed." }, { status: 400 });
      }
      const dailyDate = sub.seed === dailySeed(now)
        ? utcDateString(now)
        : utcDateString(new Date(now.getTime() - 24 * 60 * 60 * 1000));

      // 7. Per-IP rate limit (salted hash, TTL windows, zero-PII).
      const supabase = getServiceClient();
      const ip = clientIp(req);
      for (const w of [RATE_10M, RATE_1D]) {
        const { data: allowed, error } = await supabase.rpc("hit_rate_limit", {
          p_bucket: bucket(ip, String(w.seconds)), p_limit: w.limit, p_window_seconds: w.seconds,
        });
        if (error) return NextResponse.json({ error: "Rate limiter unavailable" }, { status: 500 });
        if (allowed === false) return NextResponse.json({ error: "Too many submissions — try again later." }, { status: 429 });
      }

      // 8. Recompute (server-authoritative). Never trust a client score.
      const verified = verifyScore(
        { gameSlug: sub.gameSlug, simVersion: sub.simVersion, seed: sub.seed, mode: sub.mode, commands: sub.commands },
        { title, expectedSimVersion: SIM_VERSION, acceptableSeeds: acceptable, maxTicks: MAX_TICKS }
      );
      if (!verified.ok) {
        return NextResponse.json({ error: "Verification failed", reason: verified.reason }, { status: 400 });
      }

      // 9. Dedupe key + insert the RECOMPUTED score/wave (not the client's).
      const replayHash = hashCommands(sub.commands);
      const row = {
        game_slug: sub.gameSlug, sim_version: SIM_VERSION, mode: "daily",
        seed: String(sub.seed), daily_date: dailyDate, initials,
        score: verified.score, wave: verified.wave, hash: verified.hash, replay_hash: replayHash,
      };
      const ins = await supabase.from("game_scores").insert(row).select("id, created_at").single();

      let duplicate = false;
      let insertedCreatedAt: string | null = ins.data?.created_at ?? null;
      if (ins.error) {
        // 23505 = unique_violation → this exact log was already submitted.
        if ((ins.error as { code?: string }).code === "23505") {
          duplicate = true;
          const existing = await supabase.from("game_scores")
            .select("created_at")
            .eq("game_slug", sub.gameSlug).eq("sim_version", SIM_VERSION)
            .eq("seed", String(sub.seed)).eq("replay_hash", replayHash).single();
          insertedCreatedAt = existing.data?.created_at ?? null;
        } else {
          return NextResponse.json({ error: "Could not save score" }, { status: 500 });
        }
      }

      // 10. Ranks (count-of-better + 1) and top-N boards for the response.
      const dailyRank = await rankDaily(supabase, sub.gameSlug, dailyDate, verified.score, insertedCreatedAt);
      const allTimeRank = await rankAllTime(supabase, sub.gameSlug, verified.score, insertedCreatedAt);
      const daily = await topDaily(supabase, sub.gameSlug, dailyDate);
      const allTime = await topAllTime(supabase, sub.gameSlug);

      const resp: BoardResponse = { ok: true, duplicate, dailyRank, allTimeRank, daily, allTime };
      return NextResponse.json(resp);
    } catch (err) {
      console.error("scores route error:", err);
      return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }
  }

  // --- helpers (service-role reads; boards read the column-limited view) ---

  async function rankDaily(sb: ReturnType<typeof getServiceClient>, slug: string, dailyDate: string, score: number, createdAt: string | null): Promise<number> {
    const q = sb.from("game_scores").select("*", { count: "exact", head: true })
      .eq("game_slug", slug).eq("sim_version", SIM_VERSION).eq("mode", "daily").eq("daily_date", dailyDate) as unknown;
    const tie = createdAt ? `and(score.eq.${score},created_at.lt.${createdAt})` : `and(score.eq.${score},created_at.lt.now())`;
    const { count } = await (q as { or: (f: string) => Promise<{ count: number | null }> }).or(`score.gt.${score},${tie}`);
    return (count ?? 0) + 1;
  }

  async function rankAllTime(sb: ReturnType<typeof getServiceClient>, slug: string, score: number, createdAt: string | null): Promise<number> {
    const q = sb.from("game_scores").select("*", { count: "exact", head: true })
      .eq("game_slug", slug).eq("sim_version", SIM_VERSION).eq("mode", "daily") as unknown;
    const tie = createdAt ? `and(score.eq.${score},created_at.lt.${createdAt})` : `and(score.eq.${score},created_at.lt.now())`;
    const { count } = await (q as { or: (f: string) => Promise<{ count: number | null }> }).or(`score.gt.${score},${tie}`);
    return (count ?? 0) + 1;
  }

  function toRows(data: Array<{ initials: string; score: number; wave: number; daily_date: string | null }> | null): LeaderboardRow[] {
    return (data ?? []).map((r, i) => ({ rank: i + 1, initials: r.initials, score: r.score, wave: r.wave, dailyDate: r.daily_date }));
  }

  async function topDaily(sb: ReturnType<typeof getServiceClient>, slug: string, dailyDate: string): Promise<LeaderboardRow[]> {
    const { data } = await sb.from("game_scores_public")
      .select("initials, score, wave, daily_date")
      .eq("game_slug", slug).eq("sim_version", SIM_VERSION).eq("mode", "daily").eq("daily_date", dailyDate)
      .order("score", { ascending: false }).order("created_at", { ascending: true })
      .limit(BOARD_LIMIT);
    return toRows(data as never);
  }

  async function topAllTime(sb: ReturnType<typeof getServiceClient>, slug: string): Promise<LeaderboardRow[]> {
    const { data } = await sb.from("game_scores_public")
      .select("initials, score, wave, daily_date")
      .eq("game_slug", slug).eq("sim_version", SIM_VERSION).eq("mode", "daily")
      .order("score", { ascending: false }).order("created_at", { ascending: true })
      .limit(BOARD_LIMIT);
    return toRows(data as never);
  }
  ```
  (Note: if the PostgREST `.or()` tie-break string proves awkward under the installed `@supabase/supabase-js`, simplify each rank to strictly-greater score `+ 1` and drop the `created_at` tie term — the board index already orders ties by `created_at asc`, so the visual order stays correct; document the simplification in the commit.)

- [ ] **Step 8: Run the route test (expected PASS).** Run `npx vitest run src/app/api/games/scores/route.test.ts`. Expected: all 6 cases pass. If the `from(...)` mock chain doesn't match the exact call shape you wrote in Step 7, align the mock's chained methods (`insert().select().single()`, `.eq().eq()...or()`, `.order().order().limit()`) to your final query calls — the mock must mirror the route's real chain.

- [ ] **Step 9: Add the rate-limit salt env locally + note for Vercel.** Add `RATE_LIMIT_SALT` to `.env.local` (any random string) so local runs salt IP hashes; note in the launch checklist that a production `RATE_LIMIT_SALT` must be set in Vercel env. (No commit of `.env.local`.)

- [ ] **Step 10: Guards + typecheck + commit.** Run `npx tsc --noEmit && npx vitest run src/game/test/lazy-boundary.test.ts src/game/sim/purity.test.ts`. Expected: `tsc` exit 0; lazy-boundary green (route is exempt; `src/lib/leaderboard/*` and `src/lib/validations/*` import no `@/game` — the route DOES import `@/game`, which is correct because `src/app/api/**` is exempt); purity green. Commit: `feat(leaderboard): POST /api/games/scores — limits, seed authority, rate-limit, recompute, dedupe, insert` + trailer.

---

## Task 7: `GameOver` submit + `Leaderboard` UI + `GameClient` wiring

**Goal:** Replace "Leaderboard coming soon" with an initials-submit flow (daily → POST → show both boards with pinned own-rank) and a `localStorage` personal-best readout (free). Build the tabbed `Leaderboard` component. Wire `GameClient` to pass the run's `{mode, seed, simVersion, commands}`.

**Files:** Create `src/components/game/Leaderboard.tsx`; Modify `src/components/game/GameOver.tsx`, `src/app/games/circle-td/GameClient.tsx`.

**Interfaces:**
- **Consumes:** `BoardResponse`/`LeaderboardRow` (`@/lib/leaderboard/types`), `Command` (`@/game/sim/replay`), `SIM_VERSION` (`@/game/sim/types`), `formatScore`/`formatWave` (`@/game/runtime/hud/format`).
- **Produces:**
  ```ts
  // GameOver
  export interface GameOverProps {
    score: number; wave: number; onPlayAgain: () => void;
    mode: "daily" | "free"; seed: number; simVersion: number; commands: Command[];
  }
  // Leaderboard ('use client')
  export interface LeaderboardProps {
    daily: LeaderboardRow[]; allTime: LeaderboardRow[];
    ownRank?: { daily: number | null; allTime: number | null };
    ownInitials?: string;
  }
  ```

**Steps:**

- [ ] **Step 1: Build the `Leaderboard` component.** Create `src/components/game/Leaderboard.tsx`:
  ```tsx
  "use client";
  // src/components/game/Leaderboard.tsx
  //
  // Top-25 board with DAILY / ALL-TIME tabs and a pinned own-rank row when
  // the player is outside the visible top. Carbon Forge tokens + JetBrains
  // Mono numerals. Presentational only — no Supabase import — so it renders
  // both server-side (the play-gate LCP poster) and client-side (GameOver
  // after a submit).
  import { useState, type CSSProperties } from "react";
  import type { LeaderboardRow } from "@/lib/leaderboard/types";

  export interface LeaderboardProps {
    daily: LeaderboardRow[];
    allTime: LeaderboardRow[];
    ownRank?: { daily: number | null; allTime: number | null };
    ownInitials?: string;
  }

  const mono = "var(--font-mono-var,'JetBrains Mono'),monospace";

  function tabStyle(active: boolean): CSSProperties {
    return {
      flex: 1, padding: "0.4rem 0.5rem", fontFamily: mono, fontSize: "0.6875rem",
      letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer",
      background: active ? "rgba(255,59,47,0.12)" : "transparent",
      color: active ? "#FF3B2F" : "#787F96",
      border: "1px solid " + (active ? "rgba(255,59,47,0.4)" : "#1F1F2E"),
      borderRadius: 6,
    };
  }

  function Row({ r, own }: { r: LeaderboardRow; own: boolean }) {
    return (
      <div style={{
        display: "grid", gridTemplateColumns: "2.5rem 1fr auto auto", gap: "0.75rem",
        alignItems: "baseline", padding: "0.3rem 0.5rem", borderRadius: 4,
        background: own ? "rgba(127,219,255,0.08)" : "transparent",
      }}>
        <span style={{ fontFamily: mono, fontSize: "0.75rem", color: "#3C3F52" }}>#{r.rank}</span>
        <span style={{ fontFamily: mono, fontWeight: 700, color: own ? "#7FDBFF" : "#F0F2F8", letterSpacing: "0.08em" }}>{r.initials}</span>
        <span style={{ fontFamily: mono, fontSize: "0.8125rem", color: "#F0F2F8" }}>{r.score.toLocaleString()}</span>
        <span style={{ fontFamily: mono, fontSize: "0.6875rem", color: "#787F96" }}>w{r.wave}</span>
      </div>
    );
  }

  export default function Leaderboard({ daily, allTime, ownRank, ownInitials }: LeaderboardProps) {
    const [tab, setTab] = useState<"daily" | "allTime">("daily");
    const rows = tab === "daily" ? daily : allTime;
    const rank = tab === "daily" ? ownRank?.daily ?? null : ownRank?.allTime ?? null;
    const ownInView = ownInitials != null && rank != null && rows.some((r) => r.rank === rank && r.initials === ownInitials);

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", width: "100%" }}>
        <div style={{ display: "flex", gap: "0.4rem" }}>
          <button type="button" style={tabStyle(tab === "daily")} onClick={() => setTab("daily")}>Daily</button>
          <button type="button" style={tabStyle(tab === "allTime")} onClick={() => setTab("allTime")}>All-time</button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.1rem", maxHeight: 300, overflowY: "auto" }}>
          {rows.length === 0 && (
            <span style={{ fontFamily: mono, fontSize: "0.75rem", color: "#3C3F52", padding: "0.5rem" }}>No scores yet — be the first.</span>
          )}
          {rows.map((r) => <Row key={`${r.rank}-${r.initials}-${r.dailyDate ?? ""}`} r={r} own={ownInitials === r.initials && r.rank === rank} />)}
          {rank != null && !ownInView && ownInitials != null && (
            <>
              <span style={{ textAlign: "center", color: "#3C3F52", fontFamily: mono, fontSize: "0.75rem" }}>···</span>
              <Row r={{ rank, initials: ownInitials, score: 0, wave: 0, dailyDate: null }} own />
            </>
          )}
        </div>
      </div>
    );
  }
  ```
  (The pinned own-row shows rank + initials; if you want it to show the player's own score/wave too, pass them via `ownRank` as an object with score/wave — optional refinement, not required for acceptance.)

- [ ] **Step 2: Typecheck the component.** Run `npx tsc --noEmit`. Expected: exit 0.

- [ ] **Step 3: Rewrite `GameOver` with submit + local-best.** Replace `src/components/game/GameOver.tsx` entirely:
  ```tsx
  "use client";
  // src/components/game/GameOver.tsx
  //
  // End-of-run overlay. Daily runs submit the recorded command log
  // (InputModel.inputLog, passed as `commands`) to /api/games/scores, which
  // re-simulates it server-side and returns both boards; the client never
  // sends a score it computed itself and never holds a Supabase key. Free
  // runs are local-only: a personal best kept in localStorage, never posted.
  import { useState, type CSSProperties } from "react";
  import { formatScore, formatWave } from "@/game/runtime/hud/format";
  import type { Command } from "@/game/sim/replay";
  import type { BoardResponse } from "@/lib/leaderboard/types";
  import Leaderboard from "./Leaderboard";

  export interface GameOverProps {
    score: number;
    wave: number;
    onPlayAgain: () => void;
    mode: "daily" | "free";
    seed: number;
    simVersion: number;
    commands: Command[];
  }

  const mono = "var(--font-mono-var,'JetBrains Mono'),monospace";
  const FREE_BEST_KEY = "circle-td:free-best";

  function readFreeBest(): number {
    try { return Number(localStorage.getItem(FREE_BEST_KEY) ?? "0") || 0; } catch { return 0; }
  }
  function writeFreeBest(score: number): void {
    try { localStorage.setItem(FREE_BEST_KEY, String(score)); } catch { /* private mode / blocked */ }
  }

  export default function GameOver({ score, wave, onPlayAgain, mode, seed, simVersion, commands }: GameOverProps) {
    const [initials, setInitials] = useState("");
    const [status, setStatus] = useState<"idle" | "submitting" | "done" | "error">("idle");
    const [board, setBoard] = useState<BoardResponse | null>(null);
    const [errorMsg, setErrorMsg] = useState<string>("");

    // Free play: compute the personal best once at render (no network).
    const [freeBest] = useState(() => (mode === "free" ? readFreeBest() : 0));
    const freeIsNewBest = mode === "free" && score > freeBest;
    if (mode === "free" && freeIsNewBest) writeFreeBest(score);

    async function submit() {
      if (!/^[A-Za-z]{3}$/.test(initials)) { setErrorMsg("Enter exactly 3 letters."); return; }
      setStatus("submitting"); setErrorMsg("");
      try {
        const res = await fetch("/api/games/scores", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ gameSlug: "circle-td", simVersion, seed, mode, initials: initials.toUpperCase(), commands }),
        });
        const json = (await res.json()) as BoardResponse;
        if (!res.ok || !json.ok) { setStatus("error"); setErrorMsg(json.error ?? "Submission failed."); return; }
        setBoard(json); setStatus("done");
      } catch {
        setStatus("error"); setErrorMsg("Network error — try again.");
      }
    }

    return (
      <div role="dialog" aria-modal="true" aria-label="Game over" style={overlay}>
        <div style={panel}>
          <span style={{ fontFamily: mono, fontSize: "0.6875rem", letterSpacing: "0.12em", textTransform: "uppercase", color: "#787F96" }}>Game over</span>
          <span style={{ fontFamily: "var(--font-display-var,'Syne'),sans-serif", fontWeight: 800, fontSize: "2rem", color: "#F0F2F8" }}>{formatScore(score)}</span>
          <span style={{ fontFamily: mono, fontSize: "0.8125rem", color: "#787F96" }}>Reached wave {formatWave(wave)}</span>

          {mode === "free" && (
            <span style={{ fontFamily: mono, fontSize: "0.75rem", color: freeIsNewBest ? "#7FDBFF" : "#787F96" }}>
              {freeIsNewBest ? "New personal best!" : `Personal best: ${formatScore(Math.max(freeBest, score))}`}
              <br />Free play is local — daily runs are ranked.
            </span>
          )}

          {mode === "daily" && status !== "done" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", alignItems: "center", width: "100%" }}>
              <input
                aria-label="Your initials"
                value={initials}
                maxLength={3}
                onChange={(e) => setInitials(e.target.value.replace(/[^A-Za-z]/g, "").toUpperCase())}
                placeholder="AAA"
                style={{ width: 120, textAlign: "center", letterSpacing: "0.3em", fontFamily: mono, fontSize: "1.25rem", padding: "0.4rem", background: "#08080C", color: "#F0F2F8", border: "1px solid #27273A", borderRadius: 6 }}
              />
              <button type="button" onClick={submit} disabled={status === "submitting"} style={primaryBtn}>
                {status === "submitting" ? "Verifying…" : "Submit to daily board"}
              </button>
              {errorMsg && <span style={{ fontFamily: mono, fontSize: "0.6875rem", color: "#FF3B2F" }}>{errorMsg}</span>}
            </div>
          )}

          {mode === "daily" && status === "done" && board && (
            <Leaderboard
              daily={board.daily}
              allTime={board.allTime}
              ownRank={{ daily: board.dailyRank, allTime: board.allTimeRank }}
              ownInitials={initials.toUpperCase()}
            />
          )}

          <button type="button" onClick={onPlayAgain} style={{ ...primaryBtn, marginTop: "0.25rem" }}>Play again</button>
        </div>
      </div>
    );
  }

  const overlay: CSSProperties = { position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(8,8,12,0.72)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)", pointerEvents: "auto", padding: "1rem" };
  const panel: CSSProperties = { display: "flex", flexDirection: "column", gap: "0.75rem", alignItems: "center", padding: "1.75rem 2rem", background: "#0F0F15", border: "1px solid #1F1F2E", borderRadius: 16, minWidth: 280, maxWidth: "min(420px, 92vw)", textAlign: "center" };
  const primaryBtn: CSSProperties = { minWidth: 140, minHeight: 44, borderRadius: 8, border: "1px solid #FF3B2F", background: "#FF3B2F", color: "#08080C", fontWeight: 700, fontSize: "0.875rem", cursor: "pointer" };
  ```

- [ ] **Step 4: Wire `GameClient` to pass the run to `GameOver`.** In `src/app/games/circle-td/GameClient.tsx`: add `import { SIM_VERSION } from "@/game/sim/types";` (near the other `@/game` imports). Replace the `GameOver` render (currently `<GameOver score={snapshot.score} wave={snapshot.wave} onPlayAgain={() => window.location.reload()} />`) with:
  ```tsx
          {snapshot.gameOver && (
            <GameOver
              score={snapshot.score}
              wave={snapshot.wave}
              onPlayAgain={() => window.location.reload()}
              mode={mode}
              seed={seed}
              simVersion={SIM_VERSION}
              commands={inputModelRef.current?.inputLog ?? []}
            />
          )}
  ```
  (`inputModelRef.current.inputLog` is the exact command log recorded through `applyCommand`; the model no-ops after `gameOver`, so the log is final when this renders. `seed`/`mode` are the component's own props from `PlayGate`.)

- [ ] **Step 5: Typecheck + existing GameClient test.** Run `npx tsc --noEmit && npx vitest run src/app/games/circle-td/GameClient.test.tsx`. Expected: `tsc` exit 0; the existing GameClient jsdom test still passes (GameOver's new required props are supplied; the test drives to game-over only if it already did — if the test constructs `<GameOver>` directly it must now pass the new props, so update that test's props if it fails). If `GameClient.test.tsx` fails only on the new required props, add `mode="free" seed={1} simVersion={1} commands={[]}` to its GameOver usage.

- [ ] **Step 6: Lazy-boundary + bundle-budget-relevant guard.** Run `npx vitest run src/game/test/lazy-boundary.test.ts`. Expected: green. `Leaderboard.tsx` and `GameOver.tsx` are under `src/components/game/**` (exempt) and import only `@/lib/leaderboard/types` (types) + `@/game/sim/replay` (type-only `Command`) + `@/game/runtime/hud/format` — all fine. Neither imports `@/lib/supabase/server`, so no service-role key can reach the client.

- [ ] **Step 7: Commit.** `feat(leaderboard): GameOver submit + tabbed Leaderboard + GameClient wiring (client submits log, no keys in browser)` + trailer.

---

## Task 8: Subsystem C part 1 — cross-engine determinism Playwright gate

**Goal:** Assert the committed golden replay reproduces the Node golden hash (`1f8de6fe`) in Chromium, Firefox, AND WebKit — the correctness anchor the whole board rests on (an honest cross-engine run must reproduce on the V8 verifier). Reuses Plan 3A's Playwright install; bundles the pure sim with esbuild and runs it in each engine.

**Files:** Create `src/game/test/cross-engine/harness.entry.ts`, `e2e/cross-engine-determinism.spec.ts`; Modify `package.json` (devDep `esbuild`), `.github/workflows/ci.yml`.

**Interfaces:**
- **Consumes:** `runReplay`/`Replay` (`@/game/sim/replay`), `circleTdTitle` (`@/game/titles/circle-td/title`), the committed `src/game/test/determinism.golden.json`, Playwright `chromium`/`firefox`/`webkit` + `test`/`expect` (`@playwright/test`), `esbuild`.
- **Produces:** a browser global `window.runGolden(replay) => string`; a Playwright spec asserting each engine equals `golden.hash`.

**Steps:**

- [ ] **Step 1: Add esbuild.** Run `npm i -D esbuild`. (Playwright `@playwright/test` + the three browser binaries are assumed installed by Plan 3A; if `npx playwright --version` fails, run `npm i -D @playwright/test && npx playwright install --with-deps` and note it in the commit.)

- [ ] **Step 2: Add the browser harness entry.** Create `src/game/test/cross-engine/harness.entry.ts`:
  ```ts
  // src/game/test/cross-engine/harness.entry.ts
  //
  // esbuild bundles this into an IIFE injected into each Playwright browser.
  // It exposes the SAME pure runReplay path the Node verifier uses, so the
  // cross-engine spec can assert every engine reproduces the Node golden
  // hash. Lives under src/game/test/** (outside the purity roots), so the
  // `window` reference here is allowed.
  import { runReplay, type Replay } from "@/game/sim/replay";
  import { circleTdTitle } from "@/game/titles/circle-td/title";

  declare global {
    interface Window { runGolden: (replay: Replay) => string; }
  }

  window.runGolden = (replay: Replay): string => runReplay(replay, circleTdTitle).hash;
  ```

- [ ] **Step 3: Write the cross-engine spec.** Create `e2e/cross-engine-determinism.spec.ts`:
  ```ts
  // e2e/cross-engine-determinism.spec.ts
  //
  // §10.1 cross-engine determinism gate. Bundles the pure sim once with
  // esbuild, then runs the committed golden replay in Chromium, Firefox and
  // WebKit and asserts each reproduces the Node golden hash. Catches the
  // single largest board-correctness risk: an honest Safari/Firefox run
  // rejected by the V8 verifier over a ULP divergence.
  import { test, expect, chromium, firefox, webkit, type BrowserType } from "@playwright/test";
  import { build } from "esbuild";
  import { readFileSync } from "node:fs";
  import { resolve } from "node:path";

  const golden = JSON.parse(readFileSync("src/game/test/determinism.golden.json", "utf8")) as {
    replay: unknown; hash: string;
  };

  async function bundle(): Promise<string> {
    const out = await build({
      entryPoints: [resolve("src/game/test/cross-engine/harness.entry.ts")],
      bundle: true, format: "iife", write: false, platform: "browser",
      tsconfig: "tsconfig.json", // picks up the @/* path mapping
    });
    return out.outputFiles[0].text;
  }

  const engines: Array<[string, BrowserType]> = [["chromium", chromium], ["firefox", firefox], ["webkit", webkit]];

  for (const [name, engine] of engines) {
    test(`${name} reproduces the Node golden hash ${golden.hash}`, async () => {
      const js = await bundle();
      const browser = await engine.launch();
      try {
        const page = await browser.newPage();
        await page.addScriptTag({ content: js });
        const hash = await page.evaluate((replay) => window.runGolden(replay as never), golden.replay);
        expect(hash, `${name} must reproduce the Node golden hash`).toBe(golden.hash);
      } finally {
        await browser.close();
      }
    });
  }
  ```

- [ ] **Step 4: Run the gate locally (expected PASS).** Run `npx playwright test e2e/cross-engine-determinism.spec.ts`. Expected: 3 passed (`chromium`, `firefox`, `webkit` each reproduce `1f8de6fe`). If a browser binary is missing, run `npx playwright install <browser>`. If esbuild can't resolve `@/…`, confirm `tsconfig: "tsconfig.json"` is passed (its `paths` maps `@/*`).

- [ ] **Step 5: Confirm vitest does NOT pick up the spec.** Run `npm test` and confirm `e2e/cross-engine-determinism.spec.ts` is not in the vitest run (the include globs cover only `src/**`). Also confirm `npx tsc --noEmit` stays green (the spec + harness typecheck; `@playwright/test` + `esbuild` types resolve).

- [ ] **Step 6: Add the CI job.** In `.github/workflows/ci.yml`, add a second job (parallel to `build-and-test`). If Plan 3A already added a Playwright/e2e job, ADD this spec's invocation there instead of duplicating browser installs:
  ```yaml
    cross-engine-determinism:
      name: Cross-engine determinism (golden hash)
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v4
        - uses: actions/setup-node@v4
          with:
            node-version: 22
            cache: npm
        - run: npm ci
        - run: npx playwright install --with-deps chromium firefox webkit
        - run: npx playwright test e2e/cross-engine-determinism.spec.ts
  ```

- [ ] **Step 7: Commit.** `test(circle-td): cross-engine determinism Playwright gate (Chromium/Firefox/WebKit vs Node golden 1f8de6fe)` + trailer.

---

## Task 9: Subsystem C part 2 — scheduled balance sweep grid (incl. BOUNTY_CAP)

**Goal:** A gated (`BALANCE_SWEEP=1`) parameter-grid sweep over `startBank × gamma × alphaBp × BOUNTY_CAP` (the spec §5.2 doesn't know `BOUNTY_CAP` exists) that reports the landscape and asserts the §5.4 invariants the shipping constants satisfy, plus a scheduled CI job to run it.

**Files:** Create `src/game/test/balance.grid.test.ts`, `.github/workflows/balance-sweep.yml`.

**Interfaces:**
- **Consumes:** `makeSim` (`@/game/titles/circle-td`) with `SimConfig.balance = { startBank?, gamma?, alphaBp?, bountyCap? }` (already supported, `index.ts:19`); `applyCommand` (`@/game/sim/replay`); `TILES`/`TILE_COUNT`/`TRACK`/`trackLength`/`posAt`/`TOWERS` + `towerRangeSq` + `mul`/`fromInt` (as `balance.sweep.test.ts` already uses).
- **Produces:** gated grid-sweep tests; a scheduled workflow running `BALANCE_SWEEP=1 npm test`.

**Steps:**

- [ ] **Step 1: Write the gated grid sweep.** Create `src/game/test/balance.grid.test.ts` (reuses the in-range-tile + best-affordable-buy strategy shape from `balance.sweep.test.ts`, but varies the four balance dials via `SimConfig.balance`):
  ```ts
  // src/game/test/balance.grid.test.ts
  //
  // Gated (BALANCE_SWEEP=1) §5.4 parameter-grid sweep. Extends the shipping
  // sweep to vary startBank × gamma × alphaBp × BOUNTY_CAP (the last is
  // INVENTED and spec-undocumented — see balance.ts). Reports the landscape
  // and asserts the invariants the FROZEN shipping constants satisfy:
  // winnable-and-climbing, active play beats pure banking, no trivial
  // infinite survival. NOT run per-commit; the scheduled CI job runs it.
  import { describe, it, expect } from "vitest";
  import { makeSim } from "@/game/titles/circle-td";
  import { applyCommand } from "@/game/sim/replay";
  import { TILES, TILE_COUNT, TRACK, trackLength, posAt, TOWERS } from "@/game/titles/circle-td/content";
  import { towerRangeSq } from "@/game/titles/circle-td/rules";
  import { mul, fromInt } from "@/game/sim/math/fixed";

  const FULL = process.env.BALANCE_SWEEP === "1";
  const slowIt = FULL ? it : it.skip;

  const TICK_CEILING = 2_000_000;
  const DAMAGE_TOWER = 4;
  const AFFORD: ReadonlyArray<{ type: number; cost: number }> = [
    { type: 4, cost: TOWERS[4].cost }, { type: 3, cost: TOWERS[3].cost },
    { type: 0, cost: TOWERS[0].cost }, { type: 1, cost: TOWERS[1].cost }, { type: 2, cost: TOWERS[2].cost },
  ];

  function inRangeTiles(): number[] {
    const rSq = towerRangeSq(DAMAGE_TOWER, 0);
    const step = fromInt(8);
    const out: number[] = [];
    for (let ti = 0; ti < TILE_COUNT; ti++) {
      const tx = TILES[ti * 2], ty = TILES[ti * 2 + 1];
      let near = false;
      for (const poly of [TRACK.outer, TRACK.inner]) {
        const total = trackLength(poly);
        for (let d = 0; d <= total && !near; d += step) {
          const p = posAt(poly, d);
          const dx = p.x - tx, dy = p.y - ty;
          if (mul(dx, dx) + mul(dy, dy) <= rSq) near = true;
        }
      }
      if (near) out.push(ti);
    }
    return out;
  }
  const TILES_CACHE = inRangeTiles();

  interface Balance { startBank: number; gamma: number; alphaBp: number; bountyCap: number }

  function playActive(seed: number, b: Balance): { wave: number; score: number; hitCeiling: boolean } {
    const sim = makeSim({ seed, mode: "daily", balance: b });
    const tiles = TILES_CACHE;
    let next = 0;
    while (!sim.state.gameOver && sim.state.tick < TICK_CEILING) {
      if (next < tiles.length) {
        const pick = AFFORD.find((t) => sim.state.bank >= t.cost);
        if (pick) {
          const before = sim.state.towers.count;
          applyCommand(sim.state, { tick: sim.state.tick, type: "place", tower: pick.type, tile: tiles[next] });
          if (sim.state.towers.count > before) next++;
        }
      }
      sim.tick();
    }
    return { wave: sim.state.wave, score: sim.state.score, hitCeiling: sim.state.tick >= TICK_CEILING };
  }

  function playBanking(seed: number, b: Balance): number {
    const sim = makeSim({ seed, mode: "daily", balance: b });
    while (!sim.state.gameOver && sim.state.tick < TICK_CEILING) sim.tick();
    return sim.state.wave;
  }

  // Shipping (frozen) constants — see balance.ts / content.ts.
  const SHIPPING: Balance = { startBank: 125, gamma: 5, alphaBp: 200, bountyCap: 25 };
  const SEEDS = [20260918, 1, 2, 3, 4];

  describe("balance grid sweep (spec §5.4, incl. BOUNTY_CAP)", () => {
    slowIt("reports the startBank×gamma×alphaBp×bountyCap landscape", () => {
      const startBanks = [125, 250];
      const gammas = [5, 10, 20];
      const alphas = [200];
      const caps = [25, 50, 1_000_000]; // include a near-uncapped cell to show the glut it prevents
      for (const startBank of startBanks) for (const gamma of gammas) for (const alphaBp of alphas) for (const bountyCap of caps) {
        const b = { startBank, gamma, alphaBp, bountyCap };
        const r = playActive(20260918, b);
        // eslint-disable-next-line no-console
        console.log(`[grid] ${JSON.stringify(b)} → wave=${r.wave} score=${r.score} hitCeiling=${r.hitCeiling}`);
      }
      expect(true).toBe(true); // reporting cell; assertions live in the invariant tests below
    }, 300_000);

    slowIt("FROZEN constants: active defense is winnable-and-climbing across seeds (floor 45)", () => {
      const min = Math.min(...SEEDS.map((s) => playActive(s, SHIPPING).wave));
      // eslint-disable-next-line no-console
      console.log(`[grid] shipping min wave across seeds = ${min}`);
      expect(min).toBeGreaterThanOrEqual(45);
    }, 300_000);

    slowIt("FROZEN constants: no trivial infinite survival (terminates by gameOver)", () => {
      for (const s of SEEDS) expect(playActive(s, SHIPPING).hitCeiling).toBe(false);
    }, 300_000);

    slowIt("FROZEN constants: active defense outlasts pure banking (degenerate strategy loses)", () => {
      for (const s of SEEDS) expect(playActive(s, SHIPPING).wave).toBeGreaterThan(playBanking(s, SHIPPING));
    }, 300_000);

    slowIt("BOUNTY_CAP binds the late economy: an (near-)uncapped cell survives strictly longer than the capped shipping cell", () => {
      // Sanity that the dial does what balance.ts claims — the uncapped glut
      // never dies (or dies much later) vs the capped shipping economy.
      const capped = playActive(20260918, SHIPPING);
      const uncapped = playActive(20260918, { ...SHIPPING, bountyCap: 1_000_000 });
      // eslint-disable-next-line no-console
      console.log(`[grid] capped wave=${capped.wave} vs uncapped wave=${uncapped.wave} (hitCeiling ${uncapped.hitCeiling})`);
      expect(uncapped.wave).toBeGreaterThan(capped.wave);
    }, 300_000);
  });
  ```
  (The wave-45 floor mirrors `balance.sweep.test.ts`'s measured place-only floor; the spec §5.4 "inverts before wave 400" target is an OWNER freeze decision — see Open items — not a hard gate the current INVENTED constants meet.)

- [ ] **Step 2: Confirm it is skipped per-commit and runs when gated.** Run `npm test` — expect the grid tests SKIPPED (no `BALANCE_SWEEP`). Then run `BALANCE_SWEEP=1 npx vitest run src/game/test/balance.grid.test.ts` (PowerShell: `$env:BALANCE_SWEEP=1; npx vitest run src/game/test/balance.grid.test.ts`). Expected: the reporting cell logs the grid; the FROZEN-constant invariants pass; the BOUNTY_CAP-binds test passes (uncapped wave > capped wave). Runtime is minutes — that is why it is gated.

- [ ] **Step 3: Add the scheduled workflow.** Create `.github/workflows/balance-sweep.yml`:
  ```yaml
  name: Balance sweep (scheduled)

  on:
    schedule:
      - cron: "0 6 * * 1"   # Mondays 06:00 UTC
    workflow_dispatch: {}

  jobs:
    balance-sweep:
      name: BALANCE_SWEEP=1 npm test
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v4
        - uses: actions/setup-node@v4
          with:
            node-version: 22
            cache: npm
        - run: npm ci
        - name: Full balance sweep + grid
          run: BALANCE_SWEEP=1 npm test
  ```
  (`BALANCE_SWEEP=1 npm test` runs the whole suite with the gated `balance.sweep.test.ts` FULL block and the new `balance.grid.test.ts` grid active.)

- [ ] **Step 4: Typecheck + commit.** Run `npx tsc --noEmit`. Expected exit 0. Commit: `test(circle-td): scheduled balance grid sweep incl. BOUNTY_CAP + weekly CI job` + trailer.

---

## Task 10: Spec reconciliation (§5.2, §8.1, §8.3)

**Goal:** Bring the spec's versioned surfaces into agreement with shipped code so a future implementer can't code to the stale spec. Documents `BOUNTY_CAP`, the numeric `seed` + flat command fields, and the hash-only storage decision.

**Files:** Modify `docs/superpowers/specs/2026-09-18-circle-td-arcade-design.md`.

**Steps:**

- [ ] **Step 1: §5.2 — document `BOUNTY_CAP`.** In the §5.2 "Second lever — scale kill bounty" block, update the formula and add the cap. Replace the `bounty(n) = max(1, floor( HP(n) / γ ))` block and its "Initial value: γ = 400" line with the shipped reality:
  ```
  bounty(maxHp) = max(1, min(BOUNTY_CAP, floor( maxHp / γ )))
  ```
  and add: "Shipped values (all INVENTED, re-tuned 2026-09-19; see `docs/superpowers/2026-09-18-circle-td-balance-tuning.md`): γ = 5, and a hard per-kill ceiling **BOUNTY_CAP = 25** (spec-new — it did not exist at spec time). The cap leaves early payouts untouched (floor(maxHp/5) stays under 25 until ~wave 6) while flattening the late game so a single kill can never fund the ~3.15M-bank glut. Bounty is paid by the KILLED creep's own maxHp, not the current wave." Note that `α = ALPHA_BP/10000 = 0.02` unchanged.

- [ ] **Step 2: §8.1 — fix the run format to match code.** Replace the §8.1 `type Replay` block with the shipped shape (`src/game/sim/replay.ts`):
  ```ts
  type Replay = {
    seed: number;          // int32 daily seed (numeric, not string) — see dailySeed.ts
    simVersion: number;    // see §8.4
    mode: "daily" | "free";
    commands: Array<{
      tick: number;
      type: "start" | "place" | "upgrade" | "sell";
      tower?: number;      // flat optional fields (NOT a `payload: unknown`)
      tile?: number;
    }>;
  };
  ```
  and add a one-line note: "Wire format matches shipped code; the earlier `seed: string` / `payload: unknown` sketch is superseded."

- [ ] **Step 3: §8.3 — note hash-only storage (Plan 3B decision).** Under the §8.3 storage block, add a note: "Plan 3B ships a HASH+SCORE-ONLY schema (owner decision): the DB stores a state `hash` + a `replay_hash` (command-log digest for dedupe) + score/wave/initials — there is NO `replay jsonb` column, so there is no watch-replay or post-hoc re-audit; verification happens only at submit time. Public reads go through a column-limited view (`game_scores_public`, excludes seed + both hashes) with base-table SELECT revoked. See `supabase/migrations/0001_leaderboard.sql`." (Leave the original illustrative DDL in place as historical, prefixed by this note.)

- [ ] **Step 4: Commit.** `docs(spec): reconcile §5.2 (BOUNTY_CAP), §8.1 (numeric seed + flat tower?/tile?), §8.3 (hash-only storage)` + trailer.

---

## Task 11: Site integration — daily board in the play-gate LCP + arcade index (behind the launch flag)

**Goal:** Put the current daily leaderboard into the click-to-play gate's LCP poster (§11.5) and a small top-3 preview on the arcade index card (§12.1), read server-side (no keys to the browser), all behind the `LEADERBOARD_PUBLIC` launch flag so engineering lands before the public switch.

**Files:** Create `src/lib/leaderboard/config.ts`, `src/lib/leaderboard/queries.ts`; Modify `src/app/games/circle-td/page.tsx`, `src/app/games/page.tsx`.

**Interfaces:**
- **Consumes:** `getServiceClient` (`@/lib/supabase/server`), `utcDateString` (`@/lib/dailySeed`), `LEADERBOARD_SIM_VERSION` (`@/lib/leaderboard/config` — a `src/lib`-local mirror of `SIM_VERSION`, since `src/lib` may NOT import `@/game`), `LeaderboardRow` (`@/lib/leaderboard/types`), `Leaderboard` (`@/components/game/Leaderboard`).
- **Produces:**
  ```ts
  // @/lib/leaderboard/config
  export const LEADERBOARD_PUBLIC: boolean;      // false until the launch gate is met
  export const LEADERBOARD_SIM_VERSION: number;  // mirror of @/game/sim/types SIM_VERSION for guarded src/lib code
  // @/lib/leaderboard/queries  (server-only, transitively via server.ts)
  export function getDailyBoard(slug: string, limit?: number): Promise<LeaderboardRow[]>;
  export function getAllTimeBoard(slug: string, limit?: number): Promise<LeaderboardRow[]>;
  ```

**Steps:**

- [ ] **Step 1: Read the Next caching/ISR doc (AGENTS.md).** Read `node_modules/next/dist/docs/01-app/02-guides/caching-without-cache-components.md` (Cache Components is NOT enabled in `next.config.ts`). Confirm `export const revalidate = <seconds>` at the page segment gives ISR: the page is prerendered (keeps a `.html` for the bundle-budget scan) and periodically regenerated server-side with fresh board data.

- [ ] **Step 2: Add the launch flag + the sim-version mirror.** Create `src/lib/leaderboard/config.ts`. It holds TWO constants: the launch flag, and a `src/lib`-local mirror of `SIM_VERSION` — because `src/lib` is a GUARDED lazy-boundary root and may NOT import `@/game` (importing `SIM_VERSION` from `@/game/sim/types` in `queries.ts` would fail `src/game/test/lazy-boundary.test.ts`). The mirror is kept honest by a test in Step 4.
  ```ts
  // src/lib/leaderboard/config.ts
  //
  // Public-board launch flag. Submission (POST /api/games/scores) always
  // works so the owner can playtest; the PUBLIC board display (gate LCP +
  // arcade index) is hidden until this flips true. Flip ONLY after all three
  // launch-gate conditions are met (see the plan's "Open items / launch
  // gate"): (a) balance frozen after owner playtest, (b) cross-engine
  // determinism gate green, (c) balance sweep passing.
  export const LEADERBOARD_PUBLIC = false;

  // Mirror of @/game/sim/types SIM_VERSION for use in GUARDED src/lib code
  // (the lazy-boundary guard forbids importing @/game from src/lib). Kept in
  // sync by src/game/test/leaderboard-sim-version.test.ts.
  export const LEADERBOARD_SIM_VERSION = 1;
  ```

- [ ] **Step 3: Add the server-side read helper.** Create `src/lib/leaderboard/queries.ts`. It imports NO `@/game` module (uses the `LEADERBOARD_SIM_VERSION` mirror from `./config`) so it passes the lazy-boundary guard, and is transitively server-only via `getServiceClient`'s `import "server-only"`:
  ```ts
  // src/lib/leaderboard/queries.ts
  //
  // Server-only board reads for Server Components (the play-gate poster and
  // the arcade index). Transitively server-only via getServiceClient's
  // `import "server-only"`, so it can never be imported into a client bundle.
  // Reads go through the column-limited public view. Every error is swallowed
  // to [] so a DB/env hiccup (including a keyless CI build) renders an empty
  // board rather than breaking the page. Imports NO @/game module — src/lib is
  // a guarded lazy-boundary root — so the sim version comes from the ./config
  // mirror (asserted equal to SIM_VERSION by a test).
  import { getServiceClient } from "@/lib/supabase/server";
  import { utcDateString } from "@/lib/dailySeed";
  import { LEADERBOARD_SIM_VERSION } from "./config";
  import type { LeaderboardRow } from "./types";

  function toRows(data: Array<{ initials: string; score: number; wave: number; daily_date: string | null }> | null): LeaderboardRow[] {
    return (data ?? []).map((r, i) => ({ rank: i + 1, initials: r.initials, score: r.score, wave: r.wave, dailyDate: r.daily_date }));
  }

  export async function getDailyBoard(slug: string, limit = 25): Promise<LeaderboardRow[]> {
    try {
      const sb = getServiceClient();
      const { data } = await sb.from("game_scores_public")
        .select("initials, score, wave, daily_date")
        .eq("game_slug", slug).eq("sim_version", LEADERBOARD_SIM_VERSION).eq("mode", "daily").eq("daily_date", utcDateString())
        .order("score", { ascending: false }).order("created_at", { ascending: true })
        .limit(limit);
      return toRows(data as never);
    } catch { return []; }
  }

  export async function getAllTimeBoard(slug: string, limit = 25): Promise<LeaderboardRow[]> {
    try {
      const sb = getServiceClient();
      const { data } = await sb.from("game_scores_public")
        .select("initials, score, wave, daily_date")
        .eq("game_slug", slug).eq("sim_version", LEADERBOARD_SIM_VERSION).eq("mode", "daily")
        .order("score", { ascending: false }).order("created_at", { ascending: true })
        .limit(limit);
      return toRows(data as never);
    } catch { return []; }
  }
  ```
  (The route in Task 6 lives under `src/app/api/**`, which is exempt from the guard, so it uses the real `SIM_VERSION` from `@/game/sim/types` directly — only `src/lib` code needs the mirror.)

- [ ] **Step 4: Guard the sim-version mirror.** Create `src/game/test/leaderboard-sim-version.test.ts` (under `src/game/test/**`, NOT a guarded root, so it may import both):
  ```ts
  import { describe, it, expect } from "vitest";
  import { SIM_VERSION } from "@/game/sim/types";
  import { LEADERBOARD_SIM_VERSION } from "@/lib/leaderboard/config";

  describe("leaderboard sim version mirror", () => {
    it("LEADERBOARD_SIM_VERSION equals the sim's SIM_VERSION", () => {
      expect(LEADERBOARD_SIM_VERSION).toBe(SIM_VERSION);
    });
  });
  ```

- [ ] **Step 5: Run the lazy-boundary + mirror guard.** Run `npx vitest run src/game/test/lazy-boundary.test.ts src/game/test/leaderboard-sim-version.test.ts`. Expected: both green (`queries.ts`/`config.ts`/`types.ts`/`blocklist.ts`/`server.ts` under `src/lib` import NO `@/game`; the mirror equals `SIM_VERSION`). If lazy-boundary flags `queries.ts`, confirm the `@/game/sim/types` import was fully removed.

- [ ] **Step 6: Add the daily board to the gate LCP.** In `src/app/games/circle-td/page.tsx`: add at the top `export const revalidate = 60;`; add imports `import { getDailyBoard } from "@/lib/leaderboard/queries"; import { LEADERBOARD_PUBLIC } from "@/lib/leaderboard/config"; import Leaderboard from "@/components/game/Leaderboard";`. Make the default export `async` and fetch the board when public:
  ```tsx
  export default async function CircleTdPage() {
    const daily = LEADERBOARD_PUBLIC ? await getDailyBoard("circle-td") : [];
    const allTime = LEADERBOARD_PUBLIC ? await getAllTimeBoard("circle-td") : [];
    // ... existing JSX ...
  ```
  (Import `getAllTimeBoard` too.) Inside the right-hand "controls + rules" column, ABOVE or BELOW the existing sections, add a new block rendered only when public, so the leaderboard is part of the server-rendered LCP poster:
  ```tsx
              {LEADERBOARD_PUBLIC && (
                <div>
                  {sectionLabel(<Gamepad2 size={13} />, "Today's board")}
                  <Leaderboard daily={daily} allTime={allTime} />
                </div>
              )}
  ```
  (`Leaderboard` is a `'use client'` component; a Server Component may render it and it SSRs into the initial HTML with the server-fetched rows, then hydrates for the tab toggle — satisfying §11.5's "server-rendered LCP element.")

- [ ] **Step 7: Add the top-3 preview to the arcade index.** In `src/app/games/page.tsx`: add `export const revalidate = 60;` at the top; add `import { getDailyBoard } from "@/lib/leaderboard/queries"; import { LEADERBOARD_PUBLIC } from "@/lib/leaderboard/config"; import type { LeaderboardRow } from "@/lib/leaderboard/types";`. Give `GameCard` an optional `preview` prop and render it inside the card (above the "Play now" row), and make `GamesPage` async so it can fetch the preview once. Concrete edits:
  ```tsx
  // 1. GameCard signature + preview block (add `preview` to the destructure and
  //    render it just before the `{playable && (<div ...>Play now...</div>)}` block):
  function GameCard({ game, index, preview }: { game: Game; index: number; preview?: LeaderboardRow[] }) {
    // ...unchanged card body up to the tags block...
    // Add this right before the `{playable && ( ... Play now ... )}` element:
    //
    //   {preview && preview.length > 0 && (
    //     <div style={{ display: "flex", flexDirection: "column", gap: "0.2rem", marginBottom: "0.9rem" }}>
    //       <span style={{ fontFamily: "var(--font-mono-var,'JetBrains Mono'),monospace", fontSize: "0.625rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "#3C3F52" }}>Today&rsquo;s top</span>
    //       {preview.map((r) => (
    //         <div key={`${r.rank}-${r.initials}`} style={{ display: "flex", justifyContent: "space-between", fontFamily: "var(--font-mono-var,'JetBrains Mono'),monospace", fontSize: "0.75rem", color: "#787F96" }}>
    //           <span style={{ color: "#F0F2F8", letterSpacing: "0.08em" }}>#{r.rank} {r.initials}</span>
    //           <span>{r.score.toLocaleString()}</span>
    //         </div>
    //       ))}
    //     </div>
    //   )}
  }

  // 2. Page becomes async and fetches the preview once:
  export default async function GamesPage() {
    const circleDaily = LEADERBOARD_PUBLIC ? await getDailyBoard("circle-td", 3) : [];
    // ...unchanged JSX until the card map, which passes the preview only to circle-td:
    //   {games.map((game, i) => (
    //     <GameCard key={game.slug} game={game} index={i}
    //       preview={game.slug === "circle-td" ? circleDaily : undefined} />
    //   ))}
  }
  ```
  Apply the two commented insertions into the real JSX (they are shown as comments only to mark placement). The preview renders only when `LEADERBOARD_PUBLIC` is true AND rows exist, so with the flag off the index is byte-identical to today.

- [ ] **Step 8: Build + bundle-budget (the load-bearing guard for this task).** Run `npm run build && npm run check:bundle-budget`. Expected: build succeeds even with no Supabase env (reads try/catch to `[]`); bundle-budget prints `✓ bundle-budget: N prerendered route(s) scanned, game engine chunk(s) [...] referenced by none of them.` Confirm the game engine chunk is still referenced by NO prerendered route — the gate page now ships a small `Leaderboard` client chunk (no engine marker), and the engine remains behind PlayGate's click-gated dynamic import. If the build turns `/games/circle-td` fully dynamic (no `.html`), that is acceptable (like `/blog`), but ISR via `revalidate` should keep the `.html`; verify the bundle-budget still finds prerendered routes to scan.

- [ ] **Step 9: Typecheck + full fast suite.** Run `npx tsc --noEmit && npm test`. Expected: `tsc` exit 0; all vitest green (gated sweeps skipped).

- [ ] **Step 10: Commit.** `feat(leaderboard): daily board in play-gate LCP + arcade index preview, behind LEADERBOARD_PUBLIC (ISR reads, server-only)` + trailer.

---

## Task 12: Whole-branch verification pass

**Goal:** Prove the full CI order is green and the launch-gate machinery is in place before handing off.

**Steps:**

- [ ] **Step 1: Run the exact CI order.** Run `npx tsc --noEmit && npm test && npm run build && npm run check:bundle-budget`. Expected: `tsc` exit 0; vitest all green (determinism golden still `1f8de6fe`; lazy-boundary + purity + sim-version mirror green); build succeeds; bundle-budget passes with the engine chunk referenced by no prerendered route.

- [ ] **Step 2: Run the cross-engine gate.** Run `npx playwright test e2e/cross-engine-determinism.spec.ts`. Expected: 3 passed. (This is a launch-gate condition; it must be green before the public switch, but it can be green now — the sim is frozen.)

- [ ] **Step 3: Run the gated grid once for evidence.** Run `BALANCE_SWEEP=1 npx vitest run src/game/test/balance.grid.test.ts src/game/test/balance.sweep.test.ts` and capture the `[grid]`/`[balance.sweep]` logs for the owner's freeze decision. Expected: FROZEN-constant invariants pass; landscape logged.

- [ ] **Step 4: Confirm the launch flag is still `false`.** Grep `src/lib/leaderboard/config.ts` for `LEADERBOARD_PUBLIC = false`. The public board must NOT be switched on in this plan — flipping it is the owner's gated launch action.

- [ ] **Step 5: Confirm no push + clean tree.** Run `git status` (clean, on `games/circle-td`) and `git log --oneline -14`. Do NOT push. Surface the branch state + the launch-gate checklist to the owner.

---

## Open items / launch gate

**Engineering can all land on `games/circle-td` now. The PUBLIC board switch (`LEADERBOARD_PUBLIC = true` in `src/lib/leaderboard/config.ts`) waits on ALL THREE conditions below.**

1. **Balance frozen (`SIM_VERSION` locked) after owner playtest.** α (`ALPHA_BP=200`), γ (`GAMMA=5`), and `BOUNTY_CAP=25` are all INVENTED and freshly re-tuned (2026-09-19); GAMMA=5 is documented "knife-edge." Any later tweak bumps `SIM_VERSION` and invalidates every stored row (spec §8.4). The owner must playtest, accept the feel, and confirm the freeze. NOTE: the spec §5.4 "difficulty must not invert before wave 400" target is NOT met by the current INVENTED constants (place+upgrade play dies ~wave 155 per the balance-tuning doc); the grid sweep asserts the invariants the shipping set DOES satisfy (winnable, active ≫ banking, no infinite survival) and logs the landscape. The owner decides whether wave-155 is acceptable-to-ship or the constants need another sweep before freezing.
2. **Cross-engine determinism gate green (BLOCKING).** `e2e/cross-engine-determinism.spec.ts` must pass in Chromium, Firefox AND WebKit (all reproduce `1f8de6fe`). An honest cross-engine run that doesn't reproduce on the V8 verifier is rejected as a "cheat" — this gate is the guarantee it won't happen. Wire it into the required CI checks before launch.
3. **Balance sweep passing.** The scheduled `.github/workflows/balance-sweep.yml` (`BALANCE_SWEEP=1 npm test`) must be green on the frozen constants (both the FULL `balance.sweep.test.ts` block and the new `balance.grid.test.ts` grid, incl. `BOUNTY_CAP`).

**Owner / ops actions required (outside the code):**
- Run `supabase/migrations/0001_leaderboard.sql` manually in the Supabase SQL editor (no MCP/CLI this session) BEFORE the route can write. Verify the `game_scores_public` view returns rows to `anon` and the base table does not.
- Confirm the exact Supabase env-var NAMES via `vercel env ls` (Task 4 Step 2) and ensure `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (or the confirmed names) + a production `RATE_LIMIT_SALT` are set in Vercel. Service role must NEVER be `NEXT_PUBLIC_`.
- Test the live API on the custom domain `michaelwright.work` in a real browser (per MEMORY: Vercel bot protection 429s curl indefinitely; `*.vercel.app` also has SSO) — never curl, never poll.

**Unresolved / smaller decisions (non-blocking, noted so nothing is lost):**
- **Rank tie-break query shape.** The route's rank counts use a PostgREST `.or(...)` string for the "equal score, earlier submission" tie. If the installed `@supabase/supabase-js` makes that awkward, fall back to strictly-greater-score `+ 1` (the board index already orders ties by `created_at asc`, so display order is unaffected) — documented at Task 6 Step 7.
- **All-time board over many days.** All-time ranks every daily row for the current `sim_version`; with a `dedupe`-per-(seed,replay_hash) key a player can appear once per day. If the owner later wants one-best-per-initials on all-time, add a `distinct on (initials)` variant of `getAllTimeBoard` — additive, no schema change.
- **Free-play best is per-browser** (`localStorage`), by design (unranked). No cross-device sync — intended.
- **Watch-a-run / re-audit is impossible by design** (hash-only storage). If the owner ever wants the deferred §12.2 "watch a top run," it requires adding a `replay jsonb` column and re-submitting logs — a `SIM_VERSION`-scoped, additive future change, explicitly out of scope here.
- **Route unit test mock fidelity.** `route.test.ts` mocks the Supabase client's fluent chain; if the final query chain in the route differs from the mock, align the mock (Task 6 Step 8) — the mock must mirror the real call shape.
