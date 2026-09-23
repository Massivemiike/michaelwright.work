# Arcfire Plan 1 — Engine Generalization + Sim Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generalize the game engine so a second title can plug in without changing Circle TD's behavior. Then build Arcfire's deterministic, replayable sim core: terrain, ballistics, the first 8 weapons, the draft, the match state machine, scoring, hashing, and a golden hash that Chromium, Firefox and WebKit all reproduce.

**Architecture:** Part A (Tasks 1–3) is a behavior-preserving refactor.
- `src/game/sim/` becomes title-agnostic. It keeps the math, the FNV-1a primitives, the `TitleDef` contract, a generic verifier, and the registry.
- Circle TD's own state, replay and snapshot code moves into `src/game/titles/circle-td/`.
- The renderers' fit math takes the stage size from the title.

Part B (Tasks 4–11) adds `src/game/titles/arcfire/`, a pure integer/Q16.16 sim under the purity guard.
- The single entry point per turn is `resolveTurn`.
- A validated command state machine (`createMatch` / `applyPick` / `applyTurn`) drives it, and a replayer re-runs a command log.

This plan adds no UI, AI, renderer or leaderboard wiring; those are Plans 2–4.

**Tech Stack:** TypeScript (strict), Vitest 4, Playwright (cross-engine config) with esbuild, and Next.js 16 (used only for a build regression check). The sim uses Q16.16 fixed point (`src/game/sim/math/fixed.ts`), the mulberry32 RNG (`src/game/sim/math/rng.ts`) and FNV-1a hashing.

**Spec:** `docs/superpowers/specs/2026-09-22-arcfire-design.md`:
- §1.2 engine generalization
- §1.3 turn contract
- §2 rules
- §3 sim model
- §4.1 primitives
- §8 testing
- §9 Plan 1 scope

## Global Constraints

- **Sim purity.** Everything under `src/game/sim`, `src/game/titles/circle-td` and `src/game/titles/arcfire` is pure: integer / Q16.16 math and the seeded RNG only.
  - `src/game/sim/purity.test.ts` scans every non-test `.ts` file in those roots, **including comments**.
  - Banned globals: `window`, `document`, `navigator`, `performance`, `new Date`, `Date.now`.
  - Banned math: `Math.random`, `Math.sin`, `cos`, `tan`, `atan`/`atan2`, `pow`, `exp`, `expm1`, `log`, `log2`, `log10`, `log1p`, `hypot`, `cbrt`, `asin`, `acos`, `sinh`, `cosh`, `tanh`, and the `**` operator.
  - Test files (`*.test.ts`) are exempt.
- **Circle TD's golden must not move.** The Circle TD determinism golden (`src/game/test/determinism.golden.json`, hash `5167b43d`) must be byte-for-byte unchanged after every task. Never regenerate it.
- **Arcfire's golden is fixed.** It is created once in Task 11 and must equal `63222780`, with scores `[32, 84]` and winner `1`.
- **Roster order is a wire format.** Turn commands name weapons by roster index, so `ROSTER` is append-only. Never reorder or delete an entry.
- **No shared trig in Arcfire.** Arcfire never uses the shared trig table (`src/game/sim/math/trig.ts` builds it from floating-point sine at load, which is a cross-engine risk). Aim directions come only from the baked integer table `aimTable.ts`.
- **`src/game/sim/` is title-agnostic after Task 2.** Only `registry.ts` may import from `src/game/titles/**`; `src/game/sim/boundary.test.ts` enforces this.
- **Never run `next dev`.** Turbopack panics on the space in this repo's path. Exercise the app with `npm run build`, then `npm run start`.
- **Git rules:**
  - Commit with the configured identity (Michael Wright <m.wright2@lafilm.edu>).
  - End every commit message with the trailer line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. The commit commands below pass it as a second `-m`.
  - Never push. Never use `git stash`.
  - Keep git invocations simple: one command per line.
- **Worktree guard.** When piping a file list into `xargs sed`, end the sed arguments with `--`. The guard refuses computed arguments that could be read as options.
- **Out of scope for Plan 1:** leaderboard config (`LEADERBOARD_PUBLIC`, `LEADERBOARD_SIM_VERSION`), the score schema, daily seeds, and the scores route beyond the two lines Task 1 changes. All of that is Plan 4.

## How this plan was validated

The Part B code and tests below are the exact files of a throwaway prototype. It ran with all tests green, `tsc` clean and purity clean, and it reproduced golden `63222780` in Chromium and WebKit. Firefox could not launch locally (`spawn UNKNOWN`, a pre-existing Windows environment issue that affects the existing Circle TD cross-engine test identically); CI covers Firefox.

Part A was dry-run end to end: the full suite was green (321 tests) and the Circle TD golden was unchanged.

**Transcribe the code verbatim.** The Arcfire golden hash is the transcription check: a single changed constant or operator moves it.

## File Structure

```
src/game/sim/                          title-agnostic engine (after Part A)
  title.ts                MODIFY  TitleDef<Cmd> + ReplayInput/Outcome/Rejection/Limits      (T1)
  verify.ts, verify.test.ts MODIFY generic verifyScore → title.replay                      (T1)
  hash.ts, hash.test.ts   CREATE  FNV_OFFSET, fnvFold, fnvHex                               (T2)
  boundary.test.ts        CREATE  only registry.ts may import a title                       (T2)
  types.ts                MODIFY  Fx only (SIM_VERSION moves to circle-td/version.ts)       (T2)
  purity.test.ts          MODIFY  ROOTS += src/game/titles/arcfire                          (T4)
  state.ts, state.test.ts, replay.ts, replay.test.ts, engine.ts   MOVE → titles/circle-td/  (T2)
src/game/titles/circle-td/
  state.ts, state.test.ts, replay.ts, replay.test.ts   MOVED (replay.ts uses sim/hash.ts)   (T2)
  snapshot.ts             MOVED from sim/engine.ts (RenderSnapshot)                         (T2)
  version.ts              CREATE  SIM_VERSION = 2                                           (T2)
  title.ts                MODIFY  replay() binding                                          (T1)
src/game/runtime/render/
  transform.ts, transform.test.ts   MODIFY computeFit(pxW, pxH, stageW, stageH)             (T3)
  canvas2d/Canvas2DRenderer.ts, webgpu/WebGpuRenderer.ts   MODIFY call sites               (T3)
src/app/api/games/scores/route.ts      MODIFY drop expectedSimVersion; wave ← verified.stat (T1)
src/game/titles/arcfire/               CREATE — all pure, purity-guarded
  constants.ts            every tuning number                                               (T4)
  imath.ts                isqrt / clampInt / idiv                                           (T4)
  aimTable.ts             baked Q16.16 cos/sin for integer 0..180°                          (T4)
  terrain.ts              heightfield + in-shot spans; carve; collapse settle               (T5)
  ballistics.ts           launch, muzzle, swept stepShell                                   (T6)
  weapons/types.ts        WeaponDef data model (Plan-1 subset)                              (T7)
  weapons/roster.ts       8 weapons, append-only wire order                                 (T7)
  damage.ts               blastDamage                                                       (T7)
  state.ts                MatchState, MatchSettings, cloneMatch                             (T8)
  draft.ts                drawPool, pickerAt                                                (T8)
  tanks.ts                hitCircles, moveTarget                                            (T8)
  match.ts                createMatch, applyPick (T8) → + applyTurn, sudden death (T10)
  timeline.ts             Timeline — presentation-only                                      (T9)
  resolve.ts              resolveTurn                                                       (T9)
  hash.ts                 hashMatch                                                         (T10)
  replay.ts               ArcfireCommand, ArcfireReplay, replayMatch                        (T10)
  determinism.test.ts, determinism.golden.json                                              (T11)
src/game/test/cross-engine/harness.entry.ts   MODIFY window.runArcfireGolden               (T11)
e2e/cross-engine-determinism.spec.ts          MODIFY per-engine Arcfire golden test        (T11)
```

## Commands

- **One test file or directory:** `npx vitest run <paths>`
- **Full suite:** `npm test`
- **Types:** `npx tsc --noEmit` (success = exit 0, no output)
- **Cross-engine gate:** `npm run test:e2e:cross-engine`
- **Shell:** commands are written for Bash (Git Bash). In PowerShell, set an environment variable with `$env:NAME = "1"; <command>` instead of `NAME=1 <command>`.

---

# Part A — Engine generalization (behavior-preserving)

Part A lands first, alone, and is verified before any Arcfire code (spec §1.2 item 5).

### Task 1: Generic title contract + title-agnostic `verifyScore`

**Files:**
- Modify: `src/game/sim/title.ts` (full replacement)
- Modify: `src/game/sim/verify.ts` (full replacement)
- Modify: `src/game/sim/verify.test.ts` (full replacement)
- Modify: `src/game/sim/replay.ts` (two edits)
- Modify: `src/game/titles/circle-td/title.ts` (full replacement)
- Modify: `src/app/api/games/scores/route.ts` (two one-line edits)

**Interfaces:**
- Consumes: the existing Circle TD `runReplay`, `applyCommand`, `Command`, `Replay`, `SimState` (still in `src/game/sim/replay.ts` / `state.ts` until Task 2), and `makeSim` from `src/game/titles/circle-td/index.ts`.
- Produces:
  - From `src/game/sim/title.ts`:
    - `ReplayInput<Cmd> { seed; mode: "daily" | "free"; commands: readonly Cmd[] }`
    - `ReplayOutcome { score: number; stat: number; hash: string }`
    - `ReplayRejection = "invalid_command_shape" | "invalid_command" | "not_a_win" | "too_long"`
    - `ReplayLimits { maxTicks: number }`
    - `TitleDef<Cmd = unknown> { slug; simVersion; replay(input, limits) }`
  - From `src/game/sim/verify.ts`:
    - `verifyScore(input: VerifyInput, opts: VerifyOptions): VerifyResult`, where `VerifyOptions = { title: TitleDef; acceptableSeeds; maxCommands?; maxTicks? }`. There is no `expectedSimVersion`; the title's own `simVersion` is used.
    - On success, `VerifyResult` is `{ ok: true; score; stat; hash }`.
  - From the Circle TD replay module: `CircleTdSimDef { makeSim(config); applyCommand(state, cmd) }`.
  - `circleTdTitle: TitleDef<Command> & CircleTdSimDef`.

**Behavior note.** The tick-shape check moves from `verifyScore` into Circle TD's `replay()`, so it now runs *after* the seed check. The scores route already rejects a stale seed before it calls `verifyScore`, so no HTTP response changes.

- [ ] **Step 1: Write the failing test** — replace `src/game/sim/verify.test.ts` with:

```ts
import { describe, it, expect } from "vitest";
import { verifyScore, MAX_VERIFY_COMMANDS, type VerifyInput } from "./verify";
import type { ReplayOutcome, ReplayRejection, TitleDef } from "./title";
import { circleTdTitle } from "@/game/titles/circle-td/title";
import { SIM_VERSION } from "@/game/sim/types";
import { runReplay, type Command } from "./replay";

const SEED = 20260918;
const baseOpts = { title: circleTdTitle, acceptableSeeds: [SEED] as number[] };
const input = (over: Partial<VerifyInput> = {}): VerifyInput => ({
  gameSlug: "circle-td", simVersion: SIM_VERSION, seed: SEED, mode: "daily",
  commands: [{ tick: 0, type: "place", tower: 0, tile: 10 }], ...over,
});

/** A stand-in title: returns a canned result and records the tick limit of every replay() call. */
function fakeTitle(simVersion: number, result: ReplayOutcome | { rejected: ReplayRejection }) {
  const calls: number[] = [];
  const title: TitleDef = {
    slug: "fake",
    simVersion,
    replay(_input, limits) {
      calls.push(limits.maxTicks);
      return result;
    },
  };
  return { title, calls };
}

describe("verifyScore", () => {
  it("recomputes the authoritative result for a valid daily submission", () => {
    const r = verifyScore(input(), baseOpts);
    expect(r.ok).toBe(true);
    if (r.ok) {
      const commands = input().commands as Command[];
      const direct = runReplay({ seed: SEED, simVersion: SIM_VERSION, mode: "daily", commands }, circleTdTitle);
      expect(r.score).toBe(direct.score);
      expect(r.stat).toBe(direct.wave);
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
  it("rejects a malformed command tick (non-integer / negative / at or past the tick limit)", () => {
    expect(verifyScore(input({ commands: [{ tick: -1, type: "start" }] }), baseOpts)).toEqual({ ok: false, reason: "invalid_command_shape" });
    expect(verifyScore(input({ commands: [{ tick: 1.5, type: "start" }] }), baseOpts)).toEqual({ ok: false, reason: "invalid_command_shape" });
    expect(verifyScore(input({ commands: [{ tick: 50, type: "start" }] }), { ...baseOpts, maxTicks: 50 })).toEqual({ ok: false, reason: "invalid_command_shape" });
  });
  it("checks simVersion against the title's own version and skips replay on a mismatch", () => {
    const { title, calls } = fakeTitle(7, { score: 1, stat: 2, hash: "0000abcd" });
    expect(verifyScore(input({ simVersion: SIM_VERSION }), { title, acceptableSeeds: null })).toEqual({ ok: false, reason: "sim_version_mismatch" });
    expect(calls).toEqual([]);
    expect(verifyScore(input({ simVersion: 7 }), { title, acceptableSeeds: null })).toEqual({ ok: true, score: 1, stat: 2, hash: "0000abcd" });
  });
  it("hands the title the tick limit and passes its rejection straight through", () => {
    const { title, calls } = fakeTitle(7, { rejected: "not_a_win" });
    expect(verifyScore(input({ simVersion: 7 }), { title, acceptableSeeds: null, maxTicks: 1234 })).toEqual({ ok: false, reason: "not_a_win" });
    expect(calls).toEqual([1234]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/game/sim/verify.test.ts`
Expected: FAIL. Most cases fail because `verify.ts` still compares against `opts.expectedSimVersion`, which is now `undefined`, so it returns `sim_version_mismatch`. `r.stat` is also `undefined`.

- [ ] **Step 3: Replace `src/game/sim/title.ts`** with:

```ts
// src/game/sim/title.ts
//
// The title-agnostic engine contract. The verification core (verify.ts), the
// registry and the scores route only ever see a TitleDef: a slug, a sim
// version, and a pure replay() that re-runs a submitted command log and
// returns the authoritative result. Each title owns its command format, its
// state and its replay loop behind that one function. Type-only file.

export interface ReplayInput<Cmd> {
  seed: number;
  mode: "daily" | "free";
  commands: readonly Cmd[];
}

/**
 * The authoritative result of a replay. `stat` is the title's secondary
 * leaderboard stat, stored in the `wave` column: Circle TD's wave, Arcfire's
 * points.
 */
export interface ReplayOutcome {
  score: number;
  stat: number;
  hash: string;
}

export type ReplayRejection = "invalid_command_shape" | "invalid_command" | "not_a_win" | "too_long";

/** Bounds the verifier imposes on a replay. maxTicks caps a tick-driven title's run length. */
export interface ReplayLimits {
  maxTicks: number;
}

export interface TitleDef<Cmd = unknown> {
  readonly slug: string;
  readonly simVersion: number;
  // Method syntax on purpose: its parameters are checked bivariantly, which
  // is what lets a TitleDef<Command> sit in the registry's Record<string, TitleDef>.
  replay(input: ReplayInput<Cmd>, limits: ReplayLimits): ReplayOutcome | { rejected: ReplayRejection };
}
```

- [ ] **Step 4: Replace `src/game/sim/verify.ts`** with:

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
// Title-agnostic: the run itself is delegated to the title's replay(). Trust
// model: the server IGNORES any client-claimed score. verifyScore RECOMPUTES
// the run and returns the authoritative values; the route inserts
// result.score / result.stat, never a client figure.
import type { ReplayRejection, TitleDef } from "./title";

export const MAX_VERIFY_TICKS = 5_000_000; // the DoS bound is run LENGTH, not command count
export const MAX_VERIFY_COMMANDS = 20_000;

export interface VerifyInput {
  gameSlug: string;
  simVersion: number;
  seed: number;
  mode: "daily" | "free";
  commands: readonly unknown[];
}

export interface VerifyOptions {
  title: TitleDef;
  acceptableSeeds: readonly number[] | null;
  maxCommands?: number;
  maxTicks?: number;
}

export type VerifyRejection =
  | "sim_version_mismatch"
  | "wrong_mode"
  | "too_many_commands"
  | "bad_seed"
  | ReplayRejection;

export type VerifyResult =
  | { ok: true; score: number; stat: number; hash: string }
  | { ok: false; reason: VerifyRejection };

export function verifyScore(input: VerifyInput, opts: VerifyOptions): VerifyResult {
  const maxCommands = opts.maxCommands ?? MAX_VERIFY_COMMANDS;
  const maxTicks = opts.maxTicks ?? MAX_VERIFY_TICKS;

  // --- Cheap limits first, BEFORE the title builds or runs a sim ---
  if (input.simVersion !== opts.title.simVersion) return { ok: false, reason: "sim_version_mismatch" };
  if (input.mode !== "daily") return { ok: false, reason: "wrong_mode" }; // free play is local-only/unranked
  if (input.commands.length > maxCommands) return { ok: false, reason: "too_many_commands" };
  if (opts.acceptableSeeds && !opts.acceptableSeeds.includes(input.seed)) {
    return { ok: false, reason: "bad_seed" };
  }

  // --- Recompute (server-authoritative). The title validates its own
  // command shapes, then runs bounded by maxTicks. ---
  const out = opts.title.replay({ seed: input.seed, mode: input.mode, commands: input.commands }, { maxTicks });
  if ("rejected" in out) return { ok: false, reason: out.rejected };
  return { ok: true, score: out.score, stat: out.stat, hash: out.hash };
}
```

- [ ] **Step 5: Retype `runReplay` in `src/game/sim/replay.ts`** so it no longer depends on `TitleDef`. Make two edits.

Remove the `TitleDef` import. Replace:

```ts
import { addTower, removeTower, type SimState, type Towers } from "./state";
import type { TitleDef } from "./title";
```

with:

```ts
import { addTower, removeTower, type SimState, type Towers } from "./state";
```

Then replace:

```ts
export const runReplay = (
  replay: Replay,
  title: TitleDef,
  maxTicks: number = CEILING
): ReplayResult => {
```

with:

```ts
/**
 * The Circle TD sim surface runReplay drives; circleTdTitle provides it.
 * tick()'s return is title-specific (TowerHit[]) and ignored here.
 */
export interface CircleTdSimDef {
  makeSim(config: { seed: number; mode: "daily" | "free" }): { state: SimState; tick(): unknown };
  applyCommand(state: SimState, cmd: Command): void;
}

export const runReplay = (
  replay: Replay,
  title: CircleTdSimDef,
  maxTicks: number = CEILING
): ReplayResult => {
```

- [ ] **Step 6: Replace `src/game/titles/circle-td/title.ts`** with:

```ts
// src/game/titles/circle-td/title.ts
//
// The circle-td binding of the generic TitleDef (src/game/sim/title.ts). The
// verifier only calls replay(): it rejects any command whose tick is not an
// integer in [0, maxTicks), then drives this title's own replay loop and
// reports wave as the generic stat. makeSim/applyCommand stay exposed because
// runReplay's direct callers (tests, the cross-engine harness) drive the loop
// through them.
import { SIM_VERSION } from "@/game/sim/types";
import type { TitleDef } from "@/game/sim/title";
import { applyCommand, runReplay, type CircleTdSimDef, type Command } from "@/game/sim/replay";
import { makeSim } from "./index";

export const CIRCLE_TD_SLUG = "circle-td";

export const circleTdTitle: TitleDef<Command> & CircleTdSimDef = {
  slug: CIRCLE_TD_SLUG,
  simVersion: SIM_VERSION,
  makeSim: (config) => makeSim(config),
  applyCommand,
  replay(input, limits) {
    for (const cmd of input.commands) {
      if (!Number.isInteger(cmd.tick) || cmd.tick < 0 || cmd.tick >= limits.maxTicks) {
        return { rejected: "invalid_command_shape" };
      }
    }
    const r = runReplay(
      { seed: input.seed, simVersion: SIM_VERSION, mode: input.mode, commands: [...input.commands] },
      circleTdTitle,
      limits.maxTicks
    );
    return { score: r.score, stat: r.wave, hash: r.hash };
  },
};
```

`src/game/sim/registry.ts` needs no change. Its `Record<string, TitleDef>` accepts `circleTdTitle` because `replay` is declared with method syntax.

- [ ] **Step 7: Update the scores route** (`src/app/api/games/scores/route.ts`). Make two one-line edits.

Replace:

```ts
      { title, expectedSimVersion: SIM_VERSION, acceptableSeeds: acceptable, maxTicks: MAX_TICKS }
```

with:

```ts
      { title, acceptableSeeds: acceptable, maxTicks: MAX_TICKS }
```

and replace:

```ts
      score: verified.score, wave: verified.wave, hash: verified.hash, replay_hash: replayHash,
```

with:

```ts
      score: verified.score, wave: verified.stat, hash: verified.hash, replay_hash: replayHash,
```

Leave every other `SIM_VERSION` use in the route alone (the row's `sim_version` and the rank/board queries). Plan 4 makes those per-slug.

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npx vitest run src/game/sim/verify.test.ts`
Expected: PASS (9 tests).

Run: `npx tsc --noEmit`
Expected: exit 0, no output.

Run: `npx vitest run src/game/sim src/app/api/games/scores src/game/test/determinism.test.ts src/game/test/live-replay-roundtrip.test.ts`
Expected: all pass. The Circle TD golden test still reproduces `5167b43d`.

- [ ] **Step 9: Commit**

```bash
git add src/game/sim/title.ts src/game/sim/verify.ts src/game/sim/verify.test.ts src/game/sim/replay.ts src/game/titles/circle-td/title.ts src/app/api/games/scores/route.ts
git commit -m "refactor(sim): generic TitleDef.replay contract + title-agnostic verifyScore" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 2: Move Circle TD's sim out of `src/game/sim/` + shared FNV-1a primitives

**Files:**
- Create: `src/game/sim/boundary.test.ts`, `src/game/sim/hash.ts`, `src/game/sim/hash.test.ts`, `src/game/titles/circle-td/version.ts`
- Move (git mv):
  - `src/game/sim/state.ts` → `src/game/titles/circle-td/state.ts`
  - `src/game/sim/state.test.ts` → `src/game/titles/circle-td/state.test.ts`
  - `src/game/sim/replay.ts` → `src/game/titles/circle-td/replay.ts`
  - `src/game/sim/replay.test.ts` → `src/game/titles/circle-td/replay.test.ts`
  - `src/game/sim/engine.ts` → `src/game/titles/circle-td/snapshot.ts`
- Modify:
  - `src/game/sim/types.ts`
  - `src/game/sim/verify.test.ts`
  - the moved `state.ts`, `replay.ts` and `snapshot.ts`
  - every importer of the moved modules (rewritten by `sed`, about 30 files under `src/`)

**Interfaces:**
- Consumes: Task 1's `CircleTdSimDef`, `circleTdTitle` and `runReplay` (their module path changes here).
- Produces:
  - `src/game/sim/hash.ts`: `FNV_OFFSET = 0x811c9dc5`, `fnvFold(h: number, x: number): number`, `fnvHex(h: number): string`. Arcfire's `hashMatch` (Task 10) uses these.
  - `SIM_VERSION` now comes from `@/game/titles/circle-td/version`.
  - `@/game/sim/types` exports only `Fx`.
  - Circle TD's state / replay / snapshot live at `@/game/titles/circle-td/{state,replay,snapshot}`.
  - `TICK_HZ` is deleted (it has no importers).

- [ ] **Step 1: Write the failing boundary test** `src/game/sim/boundary.test.ts`:

```ts
// src/game/sim/boundary.test.ts
//
// src/game/sim/ is the title-agnostic engine: math, the FNV-1a primitives, the
// TitleDef contract and the generic verifier. Only registry.ts — the slug →
// TitleDef binding — may import a title. Everything else here must work for
// any title, so a title import anywhere else fails this test.
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (p.endsWith(".ts") && !p.endsWith(".test.ts")) out.push(p);
  }
  return out;
}

describe("engine boundary", () => {
  it("no src/game/sim module except registry.ts imports a title", () => {
    const offenders = walk("src/game/sim")
      .map((f) => f.replace(/\\/g, "/"))
      .filter((f) => f !== "src/game/sim/registry.ts")
      .filter((f) => /@\/game\/titles\//.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/game/sim/boundary.test.ts`
Expected: FAIL with `expected [ 'src/game/sim/replay.ts' ] to deeply equal []`, because `replay.ts` imports `@/game/titles/circle-td/content`.

- [ ] **Step 3: Write the failing FNV test** `src/game/sim/hash.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { FNV_OFFSET, fnvFold, fnvHex } from "./hash";

describe("FNV-1a primitives", () => {
  it("formats the offset basis as 8-char hex", () => {
    expect(fnvHex(FNV_OFFSET)).toBe("811c9dc5");
  });
  it("folds only the low 32 bits of each value", () => {
    expect(fnvFold(FNV_OFFSET, 4294967296 + 5)).toBe(fnvFold(FNV_OFFSET, 5));
    expect(fnvFold(FNV_OFFSET, -1)).toBe(fnvFold(FNV_OFFSET, 0xffffffff));
  });
  it("is order-sensitive and always returns an unsigned 32-bit value", () => {
    const ab = fnvFold(fnvFold(FNV_OFFSET, 1), 2);
    const ba = fnvFold(fnvFold(FNV_OFFSET, 2), 1);
    expect(ab).not.toBe(ba);
    expect(ab).toBeGreaterThanOrEqual(0);
    expect(ab).toBeLessThan(4294967296);
  });
  it("matches pinned vectors", () => {
    expect(fnvHex(fnvFold(FNV_OFFSET, 0))).toBe("4b95f515");
    expect(fnvHex(fnvFold(fnvFold(FNV_OFFSET, 1), -1))).toBe("ec9ef2e0");
  });
});
```

- [ ] **Step 4: Run it to verify it fails**

Run: `npx vitest run src/game/sim/hash.test.ts`
Expected: FAIL. Vitest cannot resolve `./hash`.

- [ ] **Step 5: Implement** `src/game/sim/hash.ts`:

```ts
// src/game/sim/hash.ts
//
// FNV-1a (32-bit) primitives shared by every title's state and command-log
// hashes. Pure integer ops only (|0, >>>, Math.imul), so a digest is
// bit-identical in every JS engine — the property the determinism goldens,
// the cross-engine gate, and leaderboard verification all depend on.

export const FNV_OFFSET = 0x811c9dc5;

/** Fold one 32-bit integer into the running hash, little-endian bytes. */
export function fnvFold(h: number, x: number): number {
  x = x | 0;
  for (let b = 0; b < 4; b++) {
    h ^= (x >>> (b * 8)) & 0xff;
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** The 8-char lowercase hex digest of a finished hash. */
export const fnvHex = (h: number): string => (h >>> 0).toString(16).padStart(8, "0");
```

- [ ] **Step 6: Run it to verify it passes**

Run: `npx vitest run src/game/sim/hash.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 7: Move the Circle TD modules** (one command per line):

```bash
git mv src/game/sim/state.ts src/game/titles/circle-td/state.ts
git mv src/game/sim/state.test.ts src/game/titles/circle-td/state.test.ts
git mv src/game/sim/replay.ts src/game/titles/circle-td/replay.ts
git mv src/game/sim/replay.test.ts src/game/titles/circle-td/replay.test.ts
git mv src/game/sim/engine.ts src/game/titles/circle-td/snapshot.ts
```

- [ ] **Step 8: Give `SIM_VERSION` a Circle TD home and trim `types.ts`.**

First confirm `TICK_HZ` has no importers:

Run: `grep -rn "TICK_HZ" src e2e`
Expected: exactly one line, `src/game/sim/types.ts:5:export const TICK_HZ = 30;`

Create `src/game/titles/circle-td/version.ts`:

```ts
// src/game/titles/circle-td/version.ts
//
// Circle TD's sim version. Bump it on any change that alters replay results;
// leaderboard rows and the verifier are keyed by it.
export const SIM_VERSION = 2;
```

Replace `src/game/sim/types.ts` with:

```ts
// src/game/sim/types.ts
export type Fx = number; // Q16.16 fixed-point, integer-valued
```

- [ ] **Step 9: Rewrite every importer.** Both commands end their sed arguments with `--`, as the worktree guard requires.

```bash
grep -rlE '@/game/sim/(state|replay|engine)"' src e2e | xargs sed -i -E 's#@/game/sim/state"#@/game/titles/circle-td/state"#; s#@/game/sim/replay"#@/game/titles/circle-td/replay"#; s#@/game/sim/engine"#@/game/titles/circle-td/snapshot"#' --
```

```bash
grep -rl 'import { SIM_VERSION } from "@/game/sim/types";' src e2e | xargs sed -i 's#import { SIM_VERSION } from "@/game/sim/types";#import { SIM_VERSION } from "@/game/titles/circle-td/version";#' --
```

- [ ] **Step 10: Fix the relative imports the move broke.**

In `src/game/titles/circle-td/state.ts`, replace:

```ts
import type { Fx } from "./types";
import type { Rng } from "./math/rng";
```

with:

```ts
import type { Fx } from "@/game/sim/types";
import type { Rng } from "@/game/sim/math/rng";
```

In `src/game/sim/verify.test.ts`, replace:

```ts
import { runReplay, type Command } from "./replay";
```

with:

```ts
import { runReplay, type Command } from "@/game/titles/circle-td/replay";
```

The moved `replay.ts` still imports `./state`, and both moved test files import `./replay` / `./state`. Those remain correct because the files moved together.

- [ ] **Step 11: Update the moved files' header comments.**

In `src/game/titles/circle-td/replay.ts`, replace the first line:

```ts
// src/game/sim/replay.ts
```

with:

```ts
// src/game/titles/circle-td/replay.ts
```

In `src/game/titles/circle-td/snapshot.ts`, replace:

```ts
// src/game/sim/engine.ts
//
// Generic, title-agnostic sim-engine plumbing. This file must never import
// from src/game/titles/** — it only defines the shape a title's renderer
// feed takes and a small allocator for it.
```

with:

```ts
// src/game/titles/circle-td/snapshot.ts
//
// Circle TD's renderer feed: the RenderSnapshot shape its renderers draw from
// and a small allocator for it. (Moved from src/game/sim/engine.ts when the
// engine was generalized for a second title.)
```

- [ ] **Step 12: Switch Circle TD's hashes to the shared primitives** (`src/game/titles/circle-td/replay.ts`). The digests stay bit-identical.

Replace:

```ts
import { TOWERS, SELL_REFUND_PCT, TILE_COUNT } from "@/game/titles/circle-td/content";
```

with:

```ts
import { FNV_OFFSET, fnvFold, fnvHex } from "@/game/sim/hash";
import { TOWERS, SELL_REFUND_PCT, TILE_COUNT } from "@/game/titles/circle-td/content";
```

Replace the private fold:

```ts
// FNV-1a (32-bit), folded 8 bits at a time over each field's little-endian
// bytes. Pure integer ops only (|0, >>>, Math.imul) so it hashes identically
// across JS engines.
function fold(h: number, x: number): number {
  x = x | 0;
  for (let b = 0; b < 4; b++) {
    h ^= (x >>> (b * 8)) & 0xff;
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
```

with:

```ts
// FNV-1a (32-bit) over each field's little-endian bytes, via the shared
// engine-exact primitives in src/game/sim/hash.ts.
const fold = fnvFold;
```

Then make two replace-all edits. Each pattern appears twice, once in `hashState` and once in `hashCommands`:
- every `  let h = 0x811c9dc5;` → `  let h = FNV_OFFSET;`
- every `  return (h >>> 0).toString(16).padStart(8, "0");` → `  return fnvHex(h);`

- [ ] **Step 13: Verify no stale paths remain and types check.**

Run: `grep -rnE "sim/(state|replay|engine)['\"]" src e2e`
Expected: no output (exit 1).

Run: `grep -rn 'SIM_VERSION } from "@/game/sim/types"' src e2e`
Expected: no output (exit 1).

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 14: Run the full suite and confirm the Circle TD golden is untouched.**

Run: `npm test`
Expected: all pass. This includes `boundary.test.ts` (now green), `hash.test.ts`, and `src/game/test/determinism.test.ts`, which still reproduces `5167b43d`.

Run: `git status --short src/game/test/determinism.golden.json`
Expected: no output.

- [ ] **Step 15: Commit**

```bash
git add -A src
git status --short
```

Expected: renames (R) for the five moved files; new `boundary.test.ts`, `hash.ts`, `hash.test.ts`, `version.ts`; modified importers. Nothing outside `src/`.

```bash
git commit -m "refactor(sim): move Circle TD state/replay/snapshot into titles/circle-td; shared FNV-1a primitives" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 3: `computeFit` takes the stage size + Part A regression gate

**Files:**
- Modify: `src/game/runtime/render/transform.ts`, `src/game/runtime/render/transform.test.ts`
- Modify: `src/game/runtime/render/canvas2d/Canvas2DRenderer.ts` (1 line)
- Modify: `src/game/runtime/render/webgpu/WebGpuRenderer.ts` (2 lines)

**Interfaces:**
- Produces: `computeFit(pxW: number, pxH: number, stageW: number, stageH: number): Fit`. Plan 3's Arcfire renderers call it with `WORLD_W` / `WORLD_H` (1200 × 500).

- [ ] **Step 1: Pass Circle TD's stage explicitly in the existing tests.** This is a plain one-file sed:

```bash
sed -i -E 's/computeFit\(([^()]*)\)/computeFit(\1, STAGE_W, STAGE_H)/g' src/game/runtime/render/transform.test.ts
```

Run: `grep -n "computeFit(" src/game/runtime/render/transform.test.ts`
Expected: six calls, each ending in `, STAGE_W, STAGE_H)`. For example: `computeFit(STAGE_W * 2, STAGE_H * 2, STAGE_W, STAGE_H)`, `computeFit(0, 0, STAGE_W, STAGE_H)`, `computeFit(1680, 1360, STAGE_W, STAGE_H)`.

- [ ] **Step 2: Add the failing test.** In the `describe("computeFit", …)` block of `transform.test.ts`, add this directly after the `"returns scale 1 for a zero-size box"` case:

```ts
  it("fits any title's stage, not just Circle TD's (Arcfire's 1200×500)", () => {
    const f = computeFit(2400, 1200, 1200, 500);
    expect(f.scale).toBeCloseTo(2); // min(2400/1200, 1200/500) = min(2, 2.4)
    expect(f.offsetX).toBeCloseTo(0);
    expect(f.offsetY).toBeCloseTo(100); // (1200 − 500×2) / 2
  });
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run src/game/runtime/render/transform.test.ts`
Expected: 1 FAIL, `expected 1.7647058823529411 to be close to 2`. The old `computeFit` ignores the new arguments and fits Circle TD's 840×680 stage.

- [ ] **Step 4: Implement.** In `src/game/runtime/render/transform.ts`, replace:

```ts
// The ONE place the Circle TD world<->screen transform lives, shared by
// Canvas2DRenderer and WebGpuRenderer so pointer hit-testing (screenToWorld
// -> tileAtWorld) can never drift between backends. Lives under
// src/game/runtime/** (outside the sim purity guard AND exempt from the
// lazy-boundary guard) so DOM types and Math.* are fair game here.
import { STAGE_W, STAGE_H } from "@/game/titles/circle-td/content";

// Letterbox+center fit of the fixed STAGE_W x STAGE_H stage into a device-
// pixel backing store. Field-identical to Canvas2DRenderer's old private
// Transform, so both renderers can hold one of these.
```

with:

```ts
// The ONE place the world<->screen transform lives, shared by every title's
// Canvas2D and WebGPU renderers so pointer hit-testing (screenToWorld ->
// tileAtWorld) can never drift between backends. Title-agnostic: each caller
// passes its own stage size. Lives under src/game/runtime/** (outside the sim
// purity guard AND exempt from the lazy-boundary guard) so DOM types and
// Math.* are fair game here.

// Letterbox+center fit of a fixed stageW x stageH stage into a device-pixel
// backing store. Field-identical to Canvas2DRenderer's old private
// Transform, so both renderers can hold one of these.
```

and replace:

```ts
export function computeFit(pxW: number, pxH: number): Fit {
  const scale = pxW > 0 && pxH > 0 ? Math.min(pxW / STAGE_W, pxH / STAGE_H) : 1;
  const offsetX = (pxW - STAGE_W * scale) / 2;
  const offsetY = (pxH - STAGE_H * scale) / 2;
```

with:

```ts
export function computeFit(pxW: number, pxH: number, stageW: number, stageH: number): Fit {
  const scale = pxW > 0 && pxH > 0 ? Math.min(pxW / stageW, pxH / stageH) : 1;
  const offsetX = (pxW - stageW * scale) / 2;
  const offsetY = (pxH - stageH * scale) / 2;
```

- [ ] **Step 5: Update both renderers.**

In `src/game/runtime/render/canvas2d/Canvas2DRenderer.ts`, `STAGE_W` and `STAGE_H` are already imported. Replace:

```ts
    this.transform = computeFit(pxW, pxH);
```

with:

```ts
    this.transform = computeFit(pxW, pxH, STAGE_W, STAGE_H);
```

In `src/game/runtime/render/webgpu/WebGpuRenderer.ts`, replace:

```ts
import { TILE_SIZE, TRACK_WIDTH, TILES, TRACK, TOWERS } from "@/game/titles/circle-td/content";
```

with:

```ts
import { STAGE_W, STAGE_H, TILE_SIZE, TRACK_WIDTH, TILES, TRACK, TOWERS } from "@/game/titles/circle-td/content";
```

and replace:

```ts
    this.fit = computeFit(pxW, pxH);
```

with:

```ts
    this.fit = computeFit(pxW, pxH, STAGE_W, STAGE_H);
```

- [ ] **Step 6: Run the tests and types**

Run: `npx vitest run src/game/runtime`
Expected: all pass (the transform file now has 8 tests).

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 7: Part A regression gate — suite, build, bundle budget**

Run: `npm test`
Expected: all pass. The Circle TD golden is still `5167b43d`.

Run: `npm run build`
Expected: the build succeeds. If it fails only on missing environment variables (Supabase URL/keys), copy the main checkout's gitignored env file into the worktree root and rerun:

```bash
cp ../../../.env.local .env.local
```

Run: `npm run check:bundle-budget`
Expected: passes.

- [ ] **Step 8: Part A in-browser smoke on both backends.** The controller runs this step with the browser-preview tools. Never use `next dev`.

Create the gitignored `.claude/launch.json` in the worktree if it is missing:

```json
{
  "version": "0.0.1",
  "configurations": [
    { "name": "arcfire-worktree-prod", "runtimeExecutable": "npm", "runtimeArgs": ["run", "start", "--", "-p", "3100"], "port": 3100 }
  ]
}
```

Start it with `preview_start {name: "arcfire-worktree-prod"}` (it serves the Step 7 build). Then check:

1. Open `http://localhost:3100/games/circle-td`.
   - `document.querySelector("canvas").dataset.renderer` is `"webgpu"`, or `"canvas2d"` if the pane has no WebGPU adapter.
   - The board is centered and letterboxed exactly as before.
   - Start a daily run and place a tower on a build tile. Clicks resolve through `screenToWorld` + `computeFit`, so a correct placement proves the fit.
   - Take a screenshot.
2. Open `http://localhost:3100/games/circle-td?renderer=canvas2d`.
   - `dataset.renderer` is `"canvas2d"`.
   - Repeat the placement check and take a screenshot.
3. Stop the server with `preview_stop`.

- [ ] **Step 9: Commit**

```bash
git add src/game/runtime/render/transform.ts src/game/runtime/render/transform.test.ts src/game/runtime/render/canvas2d/Canvas2DRenderer.ts src/game/runtime/render/webgpu/WebGpuRenderer.ts
git commit -m "refactor(render): computeFit takes the stage size from its title" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

# Part B — Arcfire sim core

Every file in this part lives under `src/game/titles/arcfire/` and is covered by the purity guard from Task 4 onward. Units: stage px, y-down, origin top-left, floor at `WORLD_H = 500`. Fixed-point values are Q16.16 (`Fx`).

### Task 4: Arcfire scaffold — purity root, constants, integer math, baked aim table

**Files:**
- Modify: `src/game/sim/purity.test.ts` (1 line)
- Create: `src/game/titles/arcfire/constants.ts`
- Create: `src/game/titles/arcfire/imath.ts`, `src/game/titles/arcfire/imath.test.ts`
- Create: `src/game/titles/arcfire/aimTable.ts`, `src/game/titles/arcfire/aimTable.test.ts`

**Interfaces:**
- Consumes: `Fx` from `@/game/sim/types`; `fromInt` from `@/game/sim/math/fixed`.
- Produces:
  - Every constant in `constants.ts`, imported by name by all later tasks.
  - `isqrt(n)`, `clampInt(v, lo, hi)`, `idiv(a, b)` (truncating integer division).
  - `aimCos(deg): Fx` and `aimSin(deg): Fx` for integer degrees, clamped to 0..180. 0° points right, 90° up, 180° left.

- [ ] **Step 1: Put Arcfire under the purity guard.** In `src/game/sim/purity.test.ts`, replace:

```ts
const ROOTS = ["src/game/sim", "src/game/titles/circle-td"];
```

with:

```ts
const ROOTS = ["src/game/sim", "src/game/titles/circle-td", "src/game/titles/arcfire"];
```

(The guard skips a root that doesn't exist yet, so this is green immediately and guards every file created from here on.)

- [ ] **Step 2: Create `src/game/titles/arcfire/constants.ts`**. It is pure data; every later test exercises it.

```ts
// src/game/titles/arcfire/constants.ts
//
// Every Arcfire tuning number in one place (spec §2–§3). Stage px, y-down,
// origin top-left; the floor is at WORLD_H. Physics runs at 60 fixed steps per
// simulated second. Fixed-point values are Q16.16 (Fx). Pure data — this file
// sits under the sim purity guard.
import type { Fx } from "@/game/sim/types";
import { fromInt } from "@/game/sim/math/fixed";

export const ARCFIRE_SLUG = "arcfire";
export const ARCFIRE_SIM_VERSION = 1;

// --- world
export const WORLD_W = 1200;
export const WORLD_H = 500;

// --- physics (spec §3.2)
export const STEPS_PER_SEC = 60;
export const GRAVITY_STEP: Fx = fromInt(5); // 300 px/s² ÷ 60 steps = +5 px/s of fall speed per step
export const V_UNIT: Fx = 448266; // 6.84 px/s per power point, Q16.16 (6.84 × 65536, truncated)
export const MAX_FLIGHT_STEPS = 1200; // 20 simulated seconds
export const BARREL_LEN = 22; // px from the hitbox centre to the muzzle
export const WIND_MAX = 40; // |wind| in px/s² when the free-play wind toggle is on

// --- tanks (spec §2, §3.2)
export const TANK_HIT_R = 14; // hitbox circle radius, px
export const TANK_HIT_DY = 12; // the hitbox centre sits this far above the surface point
export const MOVE_STEP = 36; // px per move
export const MOVES_PER_MATCH = 4;
export const MIN_TANK_SEP = 64; // closest the two tank centres may get, px
export const TANK_EDGE_MARGIN = 24; // tank centres stay this far inside the world edges
export const SPAWN_X: readonly [number, number] = [180, 1020]; // 15% / 85% of WORLD_W
export const SPAWN_FLAT = 24; // terrain is flattened ±this around each spawn column

// --- terrain (spec §3.1)
export const TERRAIN_MIN_Y = 120;
export const TERRAIN_MAX_Y = 420;
export const MAX_SPANS = 8; // solid runs a column may hold during a shot
export const TERRAIN_CTRL_STEP = 150; // generation control-point pitch, px
export const TERRAIN_BLUR_R = 24; // generation box-blur radius, px
export const TERRAIN_BLUR_PASSES = 3;

// --- match (spec §2)
export const SUDDEN_DEATH_WEAPON = 0; // roster index of Pulse
```

- [ ] **Step 3: Write the failing test** `src/game/titles/arcfire/imath.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { isqrt, clampInt, idiv } from "./imath";

describe("imath", () => {
  it("isqrt is the exact integer floor", () => {
    for (let n = 0; n <= 20000; n++) {
      const r = isqrt(n);
      expect(r * r <= n && (r + 1) * (r + 1) > n).toBe(true);
    }
    expect(isqrt(-4)).toBe(0);
  });
  it("clampInt clamps to the inclusive range", () => {
    expect(clampInt(5, 0, 3)).toBe(3);
    expect(clampInt(-1, 0, 3)).toBe(0);
    expect(clampInt(2, 0, 3)).toBe(2);
  });
  it("idiv truncates toward zero", () => {
    expect(idiv(7, 2)).toBe(3);
    expect(idiv(-7, 2)).toBe(-3);
  });
});
```

- [ ] **Step 4: Run it to verify it fails**

Run: `npx vitest run src/game/titles/arcfire/imath.test.ts`
Expected: FAIL. Vitest cannot resolve `./imath`.

- [ ] **Step 5: Implement** `src/game/titles/arcfire/imath.ts`:

```ts
// src/game/titles/arcfire/imath.ts
//
// Small integer helpers for the Arcfire sim. Engine-exact: Math.sqrt is
// IEEE-754 correctly rounded (identical in every engine) and isqrt's loops
// correct its seed to the exact floor; Math.trunc of an integer quotient below
// 2^53 is exact.

/** floor(sqrt(n)) for an integer n >= 0 (0 for n <= 0). */
export function isqrt(n: number): number {
  if (n <= 0) return 0;
  let x = Math.trunc(Math.sqrt(n));
  while (x * x > n) x--;
  while ((x + 1) * (x + 1) <= n) x++;
  return x;
}

export const clampInt = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

/** Integer division rounding toward zero. */
export const idiv = (a: number, b: number): number => Math.trunc(a / b);
```

- [ ] **Step 6: Run it to verify it passes**

Run: `npx vitest run src/game/titles/arcfire/imath.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 7: Write the failing test** `src/game/titles/arcfire/aimTable.test.ts`. The test is exempt from the purity guard, so it may compare against `Math.cos` / `Math.sin`.

```ts
import { describe, it, expect } from "vitest";
import { aimCos, aimSin } from "./aimTable";

describe("aimTable", () => {
  it("hits the exact special angles", () => {
    expect([aimCos(0), aimSin(0)]).toEqual([65536, 0]);
    expect([aimCos(90), aimSin(90)]).toEqual([0, 65536]);
    expect([aimCos(180), aimSin(180)]).toEqual([-65536, 0]);
    expect([aimCos(30), aimSin(30)]).toEqual([56756, 32768]);
    expect([aimCos(45), aimSin(45)]).toEqual([46341, 46341]);
    expect([aimCos(60), aimSin(60)]).toEqual([32768, 56756]);
  });
  it("is exactly mirror-symmetric about 90°", () => {
    for (let d = 0; d <= 180; d++) {
      expect(aimCos(180 - d)).toBe(-aimCos(d) || 0);
      expect(aimSin(180 - d)).toBe(aimSin(d));
    }
  });
  it("matches Math.cos/sin within 1 LSB at every integer degree", () => {
    for (let d = 0; d <= 180; d++) {
      const r = (d * Math.PI) / 180;
      expect(Math.abs(aimCos(d) - Math.round(Math.cos(r) * 65536))).toBeLessThanOrEqual(1);
      expect(Math.abs(aimSin(d) - Math.round(Math.sin(r) * 65536))).toBeLessThanOrEqual(1);
    }
  });
  it("clamps out-of-range angles", () => {
    expect(aimCos(-5)).toBe(aimCos(0));
    expect(aimSin(200)).toBe(aimSin(180));
  });
});
```

- [ ] **Step 8: Run it to verify it fails**

Run: `npx vitest run src/game/titles/arcfire/aimTable.test.ts`
Expected: FAIL. Vitest cannot resolve `./aimTable`.

- [ ] **Step 9: Implement** `src/game/titles/arcfire/aimTable.ts`. Copy the 91 literals exactly.

The header comment deliberately avoids naming the banned Math functions; the purity guard scans comments too.

```ts
// src/game/titles/arcfire/aimTable.ts
//
// Baked launch directions for integer aim angles 0..180° (0 = right, 90 =
// straight up, 180 = left) as Q16.16 cos/sin. The shared sim trig table is
// built from the host's floating-point sine at module load, and JS engines are
// not required to round that identically — one off-by-one entry would make a
// browser and the verification server fly different trajectories. So Arcfire
// uses these LITERAL integers instead. Only cos 0..90 is baked; sin and the 91..180 half
// are derived by exact integer symmetry, so the table is symmetric by
// construction.
import type { Fx } from "@/game/sim/types";

// round(cos(d°) × 65536) for d = 0..90
const COS_0_90: readonly number[] = [
  65536, 65526, 65496, 65446, 65376, 65287, 65177, 65048, 64898, 64729,
  64540, 64332, 64104, 63856, 63589, 63303, 62997, 62672, 62328, 61966,
  61584, 61183, 60764, 60326, 59870, 59396, 58903, 58393, 57865, 57319,
  56756, 56175, 55578, 54963, 54332, 53684, 53020, 52339, 51643, 50931,
  50203, 49461, 48703, 47930, 47143, 46341, 45525, 44695, 43852, 42995,
  42126, 41243, 40348, 39441, 38521, 37590, 36647, 35693, 34729, 33754,
  32768, 31772, 30767, 29753, 28729, 27697, 26656, 25607, 24550, 23486,
  22415, 21336, 20252, 19161, 18064, 16962, 15855, 14742, 13626, 12505,
  11380, 10252, 9121, 7987, 6850, 5712, 4572, 3430, 2287, 1144,
  0,
];

const COS = new Int32Array(181);
const SIN = new Int32Array(181);
for (let d = 0; d <= 90; d++) {
  COS[d] = COS_0_90[d];
  SIN[d] = COS_0_90[90 - d];
}
for (let d = 91; d <= 180; d++) {
  COS[d] = -COS[180 - d];
  SIN[d] = SIN[180 - d];
}

const index = (deg: number): number => (deg < 0 ? 0 : deg > 180 ? 180 : deg | 0);

/** Q16.16 cos of an integer aim angle (clamped to 0..180). */
export const aimCos = (deg: number): Fx => COS[index(deg)];

/** Q16.16 sin of an integer aim angle (clamped to 0..180). */
export const aimSin = (deg: number): Fx => SIN[index(deg)];
```

- [ ] **Step 10: Run the task's tests, the purity guard and types**

Run: `npx vitest run src/game/titles/arcfire src/game/sim/purity.test.ts`
Expected: PASS (imath 3, aimTable 4, purity 4).

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 11: Commit**

```bash
git add src/game/sim/purity.test.ts src/game/titles/arcfire
git commit -m "feat(arcfire): sim scaffold — constants, integer math, baked aim table" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 5: Column terrain — generation, carve, collapse settle

**Files:**
- Create: `src/game/titles/arcfire/terrain.ts`, `src/game/titles/arcfire/terrain.test.ts`

**Interfaces:**
- Consumes:
  - From `@/game/sim/math/rng`: `makeRng(seed)`, `nextRange(rng, n)` (an integer in `[0, n)`), and the `Rng` type (`{ state }`).
  - Task 4's constants, `isqrt`, `clampInt` and `idiv`.
- Produces:
  - Types:
    - `Terrain { height: Int32Array; spanCount: Int32Array; spans: Int32Array }`
    - `SettleFall { x; top; bottom; fall }`
    - `SettleResult { heights: Int32Array; falls: SettleFall[] }`
  - Functions:
    - `makeTerrain()`
    - `cloneTerrain(t)`
    - `spansFromHeight(t)`: rebuilds one span per column from `height`
    - `generateTerrain(t, rng)`: consumes the RNG
    - `isSolid(t, x, y)`
    - `carveCircle(t, cx, cy, r)`: edits the in-shot spans only
    - `settle(t)`: writes `height` and returns the falls

**Model (spec §3.1):**
- Between turns the terrain is a heightfield: `height[x]` is the surface y of column x, and the column is solid from there down to the floor.
- During a shot, each column holds up to `MAX_SPANS` solid `[top, bottom)` spans, so tunnels and overhangs can exist.
- `settle` drops every floating span onto the stack below it, which collapses each column back to one span.

- [ ] **Step 1: Write the failing test** `src/game/titles/arcfire/terrain.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { makeRng } from "@/game/sim/math/rng";
import { makeTerrain, generateTerrain, isSolid, carveCircle, settle, spansFromHeight, cloneTerrain } from "./terrain";
import { WORLD_W, WORLD_H, TERRAIN_MIN_Y, TERRAIN_MAX_Y, SPAWN_X, SPAWN_FLAT, MAX_SPANS } from "./constants";

function flat(y: number) {
  const t = makeTerrain();
  t.height.fill(y);
  spansFromHeight(t);
  return t;
}

describe("generateTerrain", () => {
  it("is deterministic per seed and differs across seeds", () => {
    const a = makeTerrain(), b = makeTerrain(), c = makeTerrain();
    generateTerrain(a, makeRng(7));
    generateTerrain(b, makeRng(7));
    generateTerrain(c, makeRng(8));
    expect(Array.from(a.height)).toEqual(Array.from(b.height));
    expect(Array.from(a.height)).not.toEqual(Array.from(c.height));
  });
  it("stays within bounds and flattens both spawn pads", () => {
    const t = makeTerrain();
    generateTerrain(t, makeRng(123));
    for (let x = 0; x < WORLD_W; x++) {
      expect(t.height[x]).toBeGreaterThanOrEqual(TERRAIN_MIN_Y);
      expect(t.height[x]).toBeLessThanOrEqual(TERRAIN_MAX_Y);
    }
    for (const sx of SPAWN_X) {
      for (let x = sx - SPAWN_FLAT; x <= sx + SPAWN_FLAT; x++) expect(t.height[x]).toBe(t.height[sx]);
    }
  });
});

describe("isSolid", () => {
  it("treats the floor as solid and off-world columns as empty", () => {
    const t = flat(300);
    expect(isSolid(t, 10, 299)).toBe(false);
    expect(isSolid(t, 10, 300)).toBe(true);
    expect(isSolid(t, 10, WORLD_H + 5)).toBe(true);
    expect(isSolid(t, -1, 400)).toBe(false);
    expect(isSolid(t, WORLD_W, 400)).toBe(false);
  });
});

describe("carve + settle", () => {
  it("a surface crater lowers the ground and nothing falls", () => {
    const t = flat(300);
    carveCircle(t, 600, 300, 20);
    expect(isSolid(t, 600, 300)).toBe(false);
    const r = settle(t);
    expect(r.heights[600]).toBe(321); // the disc reached y=320, so solid resumes at 321
    expect(r.heights[500]).toBe(300);
    expect(r.falls).toEqual([]);
  });
  it("an undercut collapses: the roof pours into the hole", () => {
    const t = flat(300);
    carveCircle(t, 600, 360, 10); // hole 350..370 under a 50px roof
    expect(isSolid(t, 600, 320)).toBe(true); // the roof still stands mid-shot
    expect(isSolid(t, 600, 360)).toBe(false);
    const r = settle(t);
    expect(r.heights[600]).toBe(321); // the column lost 21px of dirt
    expect(r.falls).toContainEqual({ x: 600, top: 300, bottom: 350, fall: 21 });
  });
  it("keeps at most MAX_SPANS spans per column, deterministically", () => {
    const carveMany = () => {
      const t = flat(100);
      for (let k = 0; k < MAX_SPANS + 3; k++) carveCircle(t, 50, 120 + k * 30, 5);
      return t;
    };
    const t = carveMany();
    expect(t.spanCount[50]).toBeLessThanOrEqual(MAX_SPANS);
    expect(Array.from(settle(t).heights)).toEqual(Array.from(settle(carveMany()).heights));
  });
  it("cloneTerrain is independent of the original", () => {
    const t = flat(300);
    const c = cloneTerrain(t);
    carveCircle(c, 600, 300, 20);
    settle(c);
    expect(t.height[600]).toBe(300);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/game/titles/arcfire/terrain.test.ts`
Expected: FAIL. Vitest cannot resolve `./terrain`.

- [ ] **Step 3: Implement** `src/game/titles/arcfire/terrain.ts`:

```ts
// src/game/titles/arcfire/terrain.ts
//
// Column terrain with collapsing dirt (spec §3.1). Between turns the terrain
// IS a heightfield: height[x] is the surface y of column x (y-down; solid from
// height[x] down to the floor at WORLD_H). During a shot each column may hold
// several solid spans — tunnels, overhangs, floating dirt — so projectiles
// collide with the real shape. settle() then drops every floating span onto
// the stack below it, which always collapses a column back to a single span,
// i.e. back to a heightfield. Integer px throughout.
import { nextRange, type Rng } from "@/game/sim/math/rng";
import {
  WORLD_W, WORLD_H, MAX_SPANS, TERRAIN_MIN_Y, TERRAIN_MAX_Y,
  TERRAIN_CTRL_STEP, TERRAIN_BLUR_R, TERRAIN_BLUR_PASSES, SPAWN_X, SPAWN_FLAT,
} from "./constants";
import { isqrt, clampInt, idiv } from "./imath";

export interface Terrain {
  height: Int32Array; // [WORLD_W] settled surface y per column
  spanCount: Int32Array; // [WORLD_W] live spans per column during a shot
  spans: Int32Array; // [WORLD_W * MAX_SPANS * 2] (top, bottom) pairs; top < bottom; ordered top-down
}

export interface SettleFall {
  x: number;
  top: number; // the span's top before it fell
  bottom: number; // the span's bottom before it fell
  fall: number; // px it dropped
}

export interface SettleResult {
  heights: Int32Array; // the new heightfield
  falls: SettleFall[]; // every span that moved, for the pour animation
}

const STRIDE = MAX_SPANS * 2;

export function makeTerrain(): Terrain {
  return {
    height: new Int32Array(WORLD_W),
    spanCount: new Int32Array(WORLD_W),
    spans: new Int32Array(WORLD_W * STRIDE),
  };
}

export function cloneTerrain(t: Terrain): Terrain {
  return { height: t.height.slice(), spanCount: t.spanCount.slice(), spans: t.spans.slice() };
}

/** Rebuild the in-shot spans from the settled heightfield: one span per column. */
export function spansFromHeight(t: Terrain): void {
  for (let x = 0; x < WORLD_W; x++) {
    if (t.height[x] >= WORLD_H) {
      t.spanCount[x] = 0;
      continue;
    }
    const o = x * STRIDE;
    t.spanCount[x] = 1;
    t.spans[o] = t.height[x];
    t.spans[o + 1] = WORLD_H;
  }
}

/** Seeded rolling hills: random control points, linear interpolation, box blur, clamp, then flatten both spawn pads. */
export function generateTerrain(t: Terrain, rng: Rng): void {
  const lo = TERRAIN_MIN_Y + 40;
  const hi = TERRAIN_MAX_Y - 40;
  const nCtrl = idiv(WORLD_W, TERRAIN_CTRL_STEP) + 1;
  const ctrl = new Int32Array(nCtrl);
  for (let i = 0; i < nCtrl; i++) ctrl[i] = lo + nextRange(rng, hi - lo + 1);
  const h = new Int32Array(WORLD_W);
  for (let x = 0; x < WORLD_W; x++) {
    const i = Math.min(nCtrl - 2, idiv(x, TERRAIN_CTRL_STEP));
    const u = x - i * TERRAIN_CTRL_STEP;
    h[x] = ctrl[i] + idiv((ctrl[i + 1] - ctrl[i]) * u, TERRAIN_CTRL_STEP);
  }
  for (let p = 0; p < TERRAIN_BLUR_PASSES; p++) boxBlur(h, TERRAIN_BLUR_R);
  for (let x = 0; x < WORLD_W; x++) h[x] = clampInt(h[x], TERRAIN_MIN_Y, TERRAIN_MAX_Y);
  for (const sx of SPAWN_X) {
    const level = h[sx];
    for (let x = sx - SPAWN_FLAT; x <= sx + SPAWN_FLAT; x++) h[x] = level;
  }
  t.height.set(h);
  spansFromHeight(t);
}

function boxBlur(h: Int32Array, r: number): void {
  const src = h.slice();
  for (let x = 0; x < WORLD_W; x++) {
    let sum = 0;
    for (let k = x - r; k <= x + r; k++) sum += src[k < 0 ? 0 : k >= WORLD_W ? WORLD_W - 1 : k];
    h[x] = idiv(sum, 2 * r + 1);
  }
}

/** Is (x, y) solid? Columns outside the world are empty; everything at or below the floor is solid. */
export function isSolid(t: Terrain, x: number, y: number): boolean {
  if (x < 0 || x >= WORLD_W) return false;
  if (y >= WORLD_H) return true;
  const o = x * STRIDE;
  const n = t.spanCount[x];
  for (let i = 0; i < n; i++) {
    if (y >= t.spans[o + i * 2] && y < t.spans[o + i * 2 + 1]) return true;
  }
  return false;
}

/** Remove a solid disc of radius r centred on (cx, cy) from the in-shot spans. */
export function carveCircle(t: Terrain, cx: number, cy: number, r: number): void {
  const r2 = r * r;
  const x0 = Math.max(0, cx - r);
  const x1 = Math.min(WORLD_W - 1, cx + r);
  for (let x = x0; x <= x1; x++) {
    const dx = x - cx;
    const dy = isqrt(r2 - dx * dx);
    removeInterval(t, x, cy - dy, cy + dy + 1);
  }
}

/** Remove the half-open interval [a, b) from column x's spans. */
function removeInterval(t: Terrain, x: number, a: number, b: number): void {
  if (b <= a) return;
  const o = x * STRIDE;
  const n = t.spanCount[x];
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const top = t.spans[o + i * 2];
    const bot = t.spans[o + i * 2 + 1];
    if (bot <= a || top >= b) {
      out.push(top, bot);
      continue;
    }
    if (top < a) out.push(top, a);
    if (bot > b) out.push(b, bot);
  }
  // More pieces than the fixed budget: keep the LOWEST MAX_SPANS (nearest the
  // floor) and drop the rest. That dirt is lost rather than poured — a
  // vanishingly rare case (8+ separate holes in one column in one shot) that
  // stays fully deterministic.
  const pieces = out.length / 2;
  const keep = Math.min(pieces, MAX_SPANS);
  const first = pieces - keep;
  for (let i = 0; i < keep; i++) {
    t.spans[o + i * 2] = out[(first + i) * 2];
    t.spans[o + i * 2 + 1] = out[(first + i) * 2 + 1];
  }
  t.spanCount[x] = keep;
}

/**
 * Drop every floating span straight down onto the stack below it. All solid
 * material in a column ends up as ONE span resting on the floor, so the new
 * surface is WORLD_H minus the column's total solid length.
 */
export function settle(t: Terrain): SettleResult {
  const falls: SettleFall[] = [];
  for (let x = 0; x < WORLD_W; x++) {
    const o = x * STRIDE;
    let stackTop = WORLD_H;
    for (let i = t.spanCount[x] - 1; i >= 0; i--) {
      const top = t.spans[o + i * 2];
      const bot = t.spans[o + i * 2 + 1];
      if (stackTop > bot) falls.push({ x, top, bottom: bot, fall: stackTop - bot });
      stackTop -= bot - top;
    }
    t.height[x] = stackTop;
  }
  spansFromHeight(t);
  return { heights: t.height.slice(), falls };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/game/titles/arcfire/terrain.test.ts src/game/sim/purity.test.ts`
Expected: PASS (terrain 7, purity 4).

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/game/titles/arcfire/terrain.ts src/game/titles/arcfire/terrain.test.ts
git commit -m "feat(arcfire): column terrain with carve + collapse settle" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 6: Shell ballistics — launch, muzzle, swept fixed-point flight

**Files:**
- Create: `src/game/titles/arcfire/ballistics.ts`, `src/game/titles/arcfire/ballistics.test.ts`

**Interfaces:**
- Consumes:
  - `fromInt(n): Fx`, `toInt(fx): number` (truncating) and `mul(a: Fx, b: Fx): Fx` from `@/game/sim/math/fixed`.
  - Task 4's `aimCos` / `aimSin`, `idiv` and constants.
  - Task 5's `isSolid` and `Terrain`.
- Produces:
  - `Shell { x; y; vx; vy; gravityStep; steps; alive }`. All values are `Fx` except `steps` and `alive`. vy > 0 means falling.
  - `HitCircle { x; y }`: a tank hitbox centre in px, with radius `TANK_HIT_R`.
  - `Impact`, one of:
    - `{ kind: "terrain"; x; y }`
    - `{ kind: "tank"; x; y; tank }`
    - `{ kind: "out"; x; y }`
  - `muzzle(cx, cy, angleDeg): { x; y }`
  - `launchShell(x, y, angleDeg, power, speedPct = 100, gravityPct = 100): Shell`
  - `stepShell(s, t, tanks, windStep: Fx): Impact | null`

**Model (spec §3.2):**
- Integration is fixed 1/60 s semi-implicit Euler: velocity first, then position.
- The movement in each step is swept in ≤ 1 px increments. Each increment checks, in order:
  1. out of world sideways
  2. every tank hitbox (squared distance ≤ 14²)
  3. terrain
- After 1,200 steps the shell is `out`.

- [ ] **Step 1: Write the failing test** `src/game/titles/arcfire/ballistics.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { fromInt } from "@/game/sim/math/fixed";
import { makeTerrain, spansFromHeight, type Terrain } from "./terrain";
import { launchShell, stepShell, muzzle, type HitCircle, type Impact, type Shell } from "./ballistics";
import { WORLD_H, V_UNIT, MAX_FLIGHT_STEPS, BARREL_LEN, MAX_SPANS, GRAVITY_STEP } from "./constants";

function flat(y: number): Terrain {
  const t = makeTerrain();
  t.height.fill(y);
  spansFromHeight(t);
  return t;
}

function fly(s: Shell, t: Terrain = flat(WORLD_H), tanks: HitCircle[] = [], wind = 0): Impact {
  for (;;) {
    const hit = stepShell(s, t, tanks, wind);
    if (hit) return hit;
  }
}

describe("launchShell", () => {
  it("splits the launch speed along the aim", () => {
    const right = launchShell(100, 100, 0, 100);
    expect(right.vx).toBe(100 * V_UNIT);
    expect(right.vy).toBe(0);
    const up = launchShell(100, 100, 90, 50);
    expect(up.vx).toBe(0);
    expect(up.vy).toBe(-50 * V_UNIT);
    expect(launchShell(100, 100, 180, 10).vx).toBe(-10 * V_UNIT);
  });
  it("scales speed and gravity by the weapon percentages", () => {
    const s = launchShell(0, 0, 0, 100, 180, 40);
    expect(s.vx).toBe(Math.trunc((100 * V_UNIT * 180) / 100));
    expect(s.gravityStep).toBe(Math.trunc((GRAVITY_STEP * 40) / 100));
  });
});

describe("muzzle", () => {
  it("sits BARREL_LEN from the hitbox centre along the aim", () => {
    expect(muzzle(500, 300, 0)).toEqual({ x: 500 + BARREL_LEN, y: 300 });
    expect(muzzle(500, 300, 90)).toEqual({ x: 500, y: 300 - BARREL_LEN });
    expect(muzzle(500, 300, 180)).toEqual({ x: 500 - BARREL_LEN, y: 300 });
  });
});

describe("stepShell", () => {
  it("lands a 45° half-power shot about where the range formula says", () => {
    // v = 342 px/s, g = 300 px/s²: ~409 px downrange for a 20 px drop to the ground
    const hit = fly(launchShell(100, 380, 45, 50), flat(400));
    expect(hit.kind).toBe("terrain");
    expect(hit.x).toBeGreaterThan(470);
    expect(hit.x).toBeLessThan(530);
    expect(hit.y).toBe(400);
  });
  it("sweeps: a fast shot cannot tunnel through a 2px wall", () => {
    const t = flat(WORLD_H); // an empty world
    for (const x of [600, 601]) {
      t.spanCount[x] = 1;
      t.spans[x * MAX_SPANS * 2] = 0;
      t.spans[x * MAX_SPANS * 2 + 1] = WORLD_H;
    }
    const hit = fly(launchShell(300, 250, 0, 100), t);
    expect(hit.kind).toBe("terrain");
    expect(hit.x).toBe(600);
  });
  it("hits a tank hitbox in its path", () => {
    const hit = fly(launchShell(300, 250, 0, 100), flat(WORLD_H), [{ x: 500, y: 262 }]);
    expect(hit.kind).toBe("tank");
    if (hit.kind === "tank") expect(hit.tank).toBe(0);
  });
  it("reports 'out' when leaving the world sideways", () => {
    const hit = fly(launchShell(40, 250, 180, 100));
    expect(hit.kind).toBe("out");
    expect(hit.x).toBeLessThan(0);
  });
  it("gives up at the flight cap", () => {
    const s: Shell = { x: fromInt(600), y: fromInt(100), vx: 0, vy: 0, gravityStep: 0, steps: 0, alive: true };
    expect(fly(s).kind).toBe("out");
    expect(s.steps).toBe(MAX_FLIGHT_STEPS);
  });
  it("wind pushes a shot sideways", () => {
    const calm = fly(launchShell(600, 100, 90, 60), flat(400));
    const windy = fly(launchShell(600, 100, 90, 60), flat(400), [], Math.trunc(fromInt(40) / 60));
    expect(windy.x).toBeGreaterThan(calm.x + 10);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/game/titles/arcfire/ballistics.test.ts`
Expected: FAIL. Vitest cannot resolve `./ballistics`.

- [ ] **Step 3: Implement** `src/game/titles/arcfire/ballistics.ts`:

```ts
// src/game/titles/arcfire/ballistics.ts
//
// Shell flight (spec §3.2): launch from the muzzle along an integer aim angle,
// then fixed 1/60 s steps of semi-implicit Euler in Q16.16. Each step's
// movement is swept in <= 1 px increments against the tank hitboxes and the
// terrain spans, so nothing tunnels through a thin wall or clips past a tank.
import type { Fx } from "@/game/sim/types";
import { fromInt, toInt, mul } from "@/game/sim/math/fixed";
import { aimCos, aimSin } from "./aimTable";
import { isSolid, type Terrain } from "./terrain";
import {
  WORLD_W, STEPS_PER_SEC, GRAVITY_STEP, V_UNIT, MAX_FLIGHT_STEPS, BARREL_LEN, TANK_HIT_R,
} from "./constants";
import { idiv } from "./imath";

export interface Shell {
  x: Fx;
  y: Fx;
  vx: Fx; // px/s
  vy: Fx; // px/s, positive = falling
  gravityStep: Fx; // fall-speed gain per step (weapon-scaled gravity)
  steps: number; // steps flown so far
  alive: boolean;
}

/** A tank hitbox centre in px; the radius is TANK_HIT_R. */
export interface HitCircle {
  x: number;
  y: number;
}

export type Impact =
  | { kind: "terrain"; x: number; y: number }
  | { kind: "tank"; x: number; y: number; tank: number }
  | { kind: "out"; x: number; y: number }; // left the world sideways, or hit the flight cap

/** The muzzle point for a hitbox centre and aim angle, px. */
export function muzzle(cx: number, cy: number, angleDeg: number): { x: number; y: number } {
  return {
    x: cx + toInt(mul(fromInt(BARREL_LEN), aimCos(angleDeg))),
    y: cy - toInt(mul(fromInt(BARREL_LEN), aimSin(angleDeg))),
  };
}

export function launchShell(
  x: number, y: number, angleDeg: number, power: number, speedPct = 100, gravityPct = 100
): Shell {
  const speed = idiv(power * V_UNIT * speedPct, 100);
  return {
    x: fromInt(x),
    y: fromInt(y),
    vx: mul(speed, aimCos(angleDeg)),
    vy: 0 - mul(speed, aimSin(angleDeg)),
    gravityStep: idiv(GRAVITY_STEP * gravityPct, 100),
    steps: 0,
    alive: true,
  };
}

/**
 * Advance one physics step. Returns the first impact along the swept path, or
 * null while the shell is still flying. windStep is the horizontal velocity
 * change per step (Fx).
 */
export function stepShell(s: Shell, t: Terrain, tanks: readonly HitCircle[], windStep: Fx): Impact | null {
  s.vx += windStep;
  s.vy += s.gravityStep;
  const nx = s.x + idiv(s.vx, STEPS_PER_SEC);
  const ny = s.y + idiv(s.vy, STEPS_PER_SEC);
  const n = Math.max(Math.abs(toInt(nx) - toInt(s.x)), Math.abs(toInt(ny) - toInt(s.y)), 1);
  const r2 = TANK_HIT_R * TANK_HIT_R;
  for (let i = 1; i <= n; i++) {
    const cx = toInt(s.x + idiv((nx - s.x) * i, n));
    const cy = toInt(s.y + idiv((ny - s.y) * i, n));
    if (cx < 0 || cx >= WORLD_W) {
      s.alive = false;
      return { kind: "out", x: cx, y: cy };
    }
    for (let k = 0; k < tanks.length; k++) {
      const dx = cx - tanks[k].x;
      const dy = cy - tanks[k].y;
      if (dx * dx + dy * dy <= r2) {
        s.alive = false;
        return { kind: "tank", x: cx, y: cy, tank: k };
      }
    }
    if (isSolid(t, cx, cy)) {
      s.alive = false;
      return { kind: "terrain", x: cx, y: cy };
    }
  }
  s.x = nx;
  s.y = ny;
  s.steps++;
  if (s.steps >= MAX_FLIGHT_STEPS) {
    s.alive = false;
    return { kind: "out", x: toInt(nx), y: toInt(ny) };
  }
  return null;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/game/titles/arcfire/ballistics.test.ts src/game/sim/purity.test.ts`
Expected: PASS (ballistics 9, purity 4).

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/game/titles/arcfire/ballistics.ts src/game/titles/arcfire/ballistics.test.ts
git commit -m "feat(arcfire): swept fixed-point shell ballistics" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 7: Weapon data model, the Plan-1 roster, blast damage

**Files:**
- Create: `src/game/titles/arcfire/weapons/types.ts`
- Create: `src/game/titles/arcfire/weapons/roster.ts`, `src/game/titles/arcfire/weapons/roster.test.ts`
- Create: `src/game/titles/arcfire/damage.ts`, `src/game/titles/arcfire/damage.test.ts`

**Interfaces:**
- Consumes: Task 4's `isqrt`, `TANK_HIT_R` and `SUDDEN_DEATH_WEAPON`.
- Produces:
  - Types:
    - `Tag` (12 values)
    - `Blast { radius; damage; falloff? }`
    - `ShellLaunch` / `Launch`
    - `Effect`
    - `Stage`
    - `WeaponDef { id; name; tag; tier; power; launch; stage }`
  - Values:
    - `ROSTER: readonly WeaponDef[]` (8 entries, append-only wire order)
    - `ROSTER_INDEX: Record<id, index>`
    - `blastDamage(blast, bx, by, tx, ty): number`

**Model:**
- Spec §4.1: weapons are data. Plan 1 implements the `shell` launch (volleys included) and the `impact` blast. Plan 2 widens `Launch`, `Effect` and `Stage` and appends the other 24 weapons.
- Spec §3.3: damage distance is measured from the blast centre to the *edge* of the tank hitbox. Falloff is linear by default, or quadratic.

- [ ] **Step 1: Create the type-only module** `src/game/titles/arcfire/weapons/types.ts`:

```ts
// src/game/titles/arcfire/weapons/types.ts
//
// Data-driven weapon definitions (spec §4.1). Plan 1 implements the shell
// launch (including volleys) and the impact blast. Plan 2 widens Launch,
// Effect and Stage with the remaining primitives (split, bounce, roll, dig,
// burn, build, quake, beam, homing, delay).

export type Tag =
  | "BLAST" | "VOLLEY" | "SPLIT" | "BOUNCE" | "ROLL" | "DIG"
  | "FIRE" | "DIRT" | "BEAM" | "HOMING" | "QUAKE" | "SPECIAL";

export interface Blast {
  radius: number; // px
  damage: number; // points at the hitbox edge overlap
  falloff?: "linear" | "quadratic"; // default linear
}

export interface ShellLaunch {
  kind: "shell";
  count?: number; // shells in the volley (default 1)
  spreadDeg?: number; // TOTAL angular spread across the volley (default 0)
  speedPct?: number; // launch speed scale (default 100)
  gravityPct?: number; // gravity scale (default 100)
}

export type Launch = ShellLaunch;

export type Effect = { blast: Blast };

export interface Stage {
  on: "impact";
  effects: Effect[];
}

export interface WeaponDef {
  id: string;
  name: string;
  tag: Tag;
  tier: 1 | 2 | 3;
  power: number; // draft score 1..100 (Plan 2's balance harness rewrites these)
  launch: Launch;
  stage: Stage;
}
```

- [ ] **Step 2: Write the failing roster test** `src/game/titles/arcfire/weapons/roster.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { ROSTER, ROSTER_INDEX } from "./roster";
import { SUDDEN_DEATH_WEAPON } from "../constants";

describe("ROSTER", () => {
  it("has unique ids that index back to themselves", () => {
    const ids = ROSTER.map((w) => w.id);
    expect(new Set(ids).size).toBe(ids.length);
    ROSTER.forEach((w, i) => expect(ROSTER_INDEX[w.id]).toBe(i));
  });
  it("keeps Pulse at the sudden-death index", () => {
    expect(ROSTER[SUDDEN_DEATH_WEAPON].id).toBe("pulse");
  });
  it("gives every weapon a shell launch, at least one blast, and a 1..100 draft power", () => {
    for (const w of ROSTER) {
      expect(w.launch.kind).toBe("shell");
      expect(w.stage.effects.length).toBeGreaterThan(0);
      for (const e of w.stage.effects) {
        expect(e.blast.radius).toBeGreaterThan(0);
        expect(e.blast.damage).toBeGreaterThan(0);
      }
      expect(w.power).toBeGreaterThanOrEqual(1);
      expect(w.power).toBeLessThanOrEqual(100);
    }
  });
  it("pins the Plan-1 wire order (the roster is append-only)", () => {
    expect(ROSTER.map((w) => w.id)).toEqual(["pulse", "pulse2", "nova", "needle", "crater", "triad", "fan", "railshot"]);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run src/game/titles/arcfire/weapons/roster.test.ts`
Expected: FAIL. Vitest cannot resolve `./roster`.

- [ ] **Step 4: Implement** `src/game/titles/arcfire/weapons/roster.ts`:

```ts
// src/game/titles/arcfire/weapons/roster.ts
//
// The weapon roster. ORDER IS A WIRE FORMAT: a turn command names its weapon
// by index into this array, so entries are append-only — never reorder or
// delete one. Plan 1 ships the eight weapons buildable from shell + blast;
// Plan 2 appends the rest of the 32. Numbers are the spec §4.2 starting values.
import type { WeaponDef } from "./types";

export const ROSTER: readonly WeaponDef[] = [
  {
    id: "pulse", name: "Pulse", tag: "BLAST", tier: 1, power: 30,
    launch: { kind: "shell" },
    stage: { on: "impact", effects: [{ blast: { radius: 28, damage: 40 } }] },
  },
  {
    id: "pulse2", name: "Pulse II", tag: "BLAST", tier: 2, power: 55,
    launch: { kind: "shell" },
    stage: { on: "impact", effects: [{ blast: { radius: 40, damage: 60 } }] },
  },
  {
    id: "nova", name: "Nova", tag: "BLAST", tier: 3, power: 80,
    launch: { kind: "shell" },
    stage: { on: "impact", effects: [{ blast: { radius: 72, damage: 100 } }] },
  },
  {
    id: "needle", name: "Needle", tag: "BLAST", tier: 2, power: 55,
    launch: { kind: "shell", speedPct: 115 },
    stage: { on: "impact", effects: [{ blast: { radius: 10, damage: 110, falloff: "quadratic" } }] },
  },
  {
    id: "crater", name: "Crater", tag: "BLAST", tier: 1, power: 20,
    launch: { kind: "shell" },
    stage: { on: "impact", effects: [{ blast: { radius: 90, damage: 25 } }] },
  },
  {
    id: "triad", name: "Triad", tag: "VOLLEY", tier: 1, power: 35,
    launch: { kind: "shell", count: 3, spreadDeg: 6 },
    stage: { on: "impact", effects: [{ blast: { radius: 24, damage: 24 } }] },
  },
  {
    id: "fan", name: "Fan", tag: "VOLLEY", tier: 2, power: 55,
    launch: { kind: "shell", count: 5, spreadDeg: 12 },
    stage: { on: "impact", effects: [{ blast: { radius: 20, damage: 18 } }] },
  },
  {
    id: "railshot", name: "Railshot", tag: "SPECIAL", tier: 2, power: 55,
    launch: { kind: "shell", speedPct: 180, gravityPct: 40 },
    stage: { on: "impact", effects: [{ blast: { radius: 18, damage: 75 } }] },
  },
];

/** Roster index by weapon id. */
export const ROSTER_INDEX: Readonly<Record<string, number>> = Object.fromEntries(
  ROSTER.map((w, i) => [w.id, i])
);
```

- [ ] **Step 5: Run it to verify it passes**

Run: `npx vitest run src/game/titles/arcfire/weapons/roster.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Write the failing damage test** `src/game/titles/arcfire/damage.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { blastDamage } from "./damage";
import { TANK_HIT_R } from "./constants";

describe("blastDamage", () => {
  const pulse = { radius: 28, damage: 40 };
  it("deals full damage when the blast overlaps the hitbox", () => {
    expect(blastDamage(pulse, 100, 100, 100, 100)).toBe(40);
    expect(blastDamage(pulse, 100, 100, 100 + TANK_HIT_R, 100)).toBe(40);
  });
  it("falls off linearly from the hitbox edge out to the blast radius", () => {
    expect(blastDamage(pulse, 100, 100, 100 + TANK_HIT_R + 14, 100)).toBe(20);
    expect(blastDamage(pulse, 100, 100, 100 + TANK_HIT_R + 28, 100)).toBe(0);
    expect(blastDamage(pulse, 100, 100, 100 + TANK_HIT_R + 100, 100)).toBe(0);
  });
  it("uses the quadratic curve when asked", () => {
    const needle = { radius: 10, damage: 110, falloff: "quadratic" as const };
    expect(blastDamage(needle, 0, 0, TANK_HIT_R + 5, 0)).toBe(82); // 110 × (100 − 25) / 100 = 82.5
  });
  it("measures true (euclidean) distance", () => {
    expect(blastDamage(pulse, 0, 0, 12, 16)).toBe(blastDamage(pulse, 0, 0, 20, 0));
    expect(blastDamage(pulse, 0, 0, 20, 0)).toBe(31); // d = 6 → 40 × 22 / 28 = 31.4
  });
});
```

- [ ] **Step 7: Run it to verify it fails**

Run: `npx vitest run src/game/titles/arcfire/damage.test.ts`
Expected: FAIL. Vitest cannot resolve `./damage`.

- [ ] **Step 8: Implement** `src/game/titles/arcfire/damage.ts`:

```ts
// src/game/titles/arcfire/damage.ts
//
// Blast damage to one tank (spec §3.3), integer-only. Distance runs from the
// blast centre to the EDGE of the tank's hitbox circle (0 if they overlap), so
// a blast that swallows the hitbox deals full damage.
import type { Blast } from "./weapons/types";
import { isqrt } from "./imath";
import { TANK_HIT_R } from "./constants";

export function blastDamage(blast: Blast, bx: number, by: number, tx: number, ty: number): number {
  const dx = bx - tx;
  const dy = by - ty;
  const centre = isqrt(dx * dx + dy * dy);
  const d = centre > TANK_HIT_R ? centre - TANK_HIT_R : 0;
  const r = blast.radius;
  if (d >= r) return 0;
  if (blast.falloff === "quadratic") return Math.trunc((blast.damage * (r * r - d * d)) / (r * r));
  return Math.trunc((blast.damage * (r - d)) / r);
}
```

- [ ] **Step 9: Run the task's tests, purity and types**

Run: `npx vitest run src/game/titles/arcfire/weapons src/game/titles/arcfire/damage.test.ts src/game/sim/purity.test.ts`
Expected: PASS (roster 4, damage 4, purity 4).

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 10: Commit**

```bash
git add src/game/titles/arcfire/weapons src/game/titles/arcfire/damage.ts src/game/titles/arcfire/damage.test.ts
git commit -m "feat(arcfire): data-driven weapon defs, Plan-1 roster, blast damage" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 8: Match state, seeded draft, tank placement and moves

**Files:**
- Create: `src/game/titles/arcfire/state.ts`
- Create: `src/game/titles/arcfire/draft.ts`, `src/game/titles/arcfire/draft.test.ts`
- Create: `src/game/titles/arcfire/match.ts` (draft half; Task 10 replaces it with the full state machine)
- Create: `src/game/titles/arcfire/match.test.ts` (draft half; Task 10 replaces it)
- Create: `src/game/titles/arcfire/tanks.ts`, `src/game/titles/arcfire/tanks.test.ts`

**Interfaces:**
- Consumes:
  - `makeRng` / `nextRange` / `Rng`.
  - Task 5's `makeTerrain`, `generateTerrain`, `cloneTerrain` and `Terrain`.
  - Task 6's `HitCircle` (type only).
  - Task 7's `ROSTER`, `WeaponDef` and `Tag`.
- Produces:
  - Types:
    - `Phase = "draft" | "battle" | "suddenDeath" | "over"`
    - `MatchSettings { weaponsEach; poolSize; wind; guaranteeTags }`
    - `MatchState` (fields below)
    - `PickResult = { ok: true } | { ok: false; reason: "invalid_command" }`
  - Functions:
    - `cloneMatch(m)`
    - `drawPool(rng, roster, size, guaranteeTags): number[]` (ascending)
    - `pickerAt(firstPicker, picksMade)`
    - `createMatch(seed, settings): MatchState`
    - `applyPick(m, poolIndex): PickResult`
    - `hitCircles(m): HitCircle[]`
    - `moveTarget(m, p, dir: -1 | 1): number` (−1 when the move is illegal)

**Rules (spec §2):**
- **Draft.** A seeded pool (poolSize ≥ 2 × weaponsEach) is drawn with one weapon per guaranteed tag. A seeded coin flip picks the first drafter, then picks alternate. When the draft completes, the **other** player shoots first.
- **Moves.** Each tank has 4 moves of 36 px. A move must keep the tank centre ≥ 24 px inside the edges and ≥ 64 px from the other tank.
- **RNG consumption order in `createMatch`:** terrain, then pool, then coin flip. The golden depends on this order.

- [ ] **Step 1: Create the state module** `src/game/titles/arcfire/state.ts`. It holds types plus `cloneMatch`, and the tests in Steps 6 and 9 exercise it.

```ts
// src/game/titles/arcfire/state.ts
//
// The complete Arcfire match state (spec §3.4). Everything the sim needs lives
// here and nowhere else: it is exactly what hashMatch() digests and what
// cloneMatch() copies for AI search and previews. Integer-only.
import type { Rng } from "@/game/sim/math/rng";
import type { Tag } from "./weapons/types";
import { cloneTerrain, type Terrain } from "./terrain";

export type Phase = "draft" | "battle" | "suddenDeath" | "over";

export interface MatchSettings {
  weaponsEach: number; // 10 normally, 5 for short free play
  poolSize: number; // 24 for 10 each, 12 for 5 each; must be >= 2 × weaponsEach
  wind: boolean; // seeded per-turn wind (free-play toggle)
  guaranteeTags: readonly Tag[]; // the pool always holds >= 1 weapon of each (spec: BLAST, SPLIT, DIRT)
}

export interface MatchState {
  settings: MatchSettings;
  rng: Rng;
  phase: Phase;
  terrain: Terrain;
  tankX: Int32Array; // [2] each tank's centre column
  movesLeft: Int32Array; // [2]
  pool: number[]; // roster indices, ascending — a pool index is a position in this array
  poolOwner: Int32Array; // [pool.length] -1 = available, else the player (0/1) who drafted it
  firstPicker: number; // 0/1 from the seeded coin flip; the OTHER player shoots first
  picksMade: number;
  hands: [number[], number[]]; // each player's unfired roster indices, ascending
  shooter: number; // whose turn it is in battle / sudden death
  shotsFired: number; // resolved turns so far (battle + sudden death)
  wind: number; // this turn's wind, px/s² (0 when wind is off)
  scores: Int32Array; // [2]
  winner: number; // -1 undecided, 0 or 1, or 2 for a draw
}

export function cloneMatch(m: MatchState): MatchState {
  return {
    ...m,
    rng: { state: m.rng.state },
    terrain: cloneTerrain(m.terrain),
    tankX: m.tankX.slice(),
    movesLeft: m.movesLeft.slice(),
    pool: m.pool.slice(),
    poolOwner: m.poolOwner.slice(),
    hands: [m.hands[0].slice(), m.hands[1].slice()],
    scores: m.scores.slice(),
  };
}
```

- [ ] **Step 2: Write the failing draft test** `src/game/titles/arcfire/draft.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { makeRng } from "@/game/sim/math/rng";
import { drawPool, pickerAt } from "./draft";
import { ROSTER } from "./weapons/roster";
import type { WeaponDef, Tag } from "./weapons/types";

const fakeRoster = (tags: Tag[]): WeaponDef[] =>
  tags.map((tag, i) => ({
    id: `w${i}`, name: `W${i}`, tag, tier: 1, power: 10,
    launch: { kind: "shell" },
    stage: { on: "impact", effects: [{ blast: { radius: 10, damage: 10 } }] },
  }));

describe("drawPool", () => {
  // index 3 is the only SPLIT, index 5 the only DIRT
  const roster = fakeRoster(["BLAST", "BLAST", "BLAST", "SPLIT", "BLAST", "DIRT", "BLAST", "BLAST", "BLAST", "BLAST"]);

  it("returns `size` distinct in-range roster indices, ascending", () => {
    const pool = drawPool(makeRng(1), roster, 6, []);
    expect(pool.length).toBe(6);
    expect(new Set(pool).size).toBe(6);
    expect([...pool].sort((a, b) => a - b)).toEqual(pool);
    for (const i of pool) {
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(roster.length);
    }
  });
  it("always includes one weapon of each guaranteed tag", () => {
    for (let seed = 0; seed < 50; seed++) {
      const pool = drawPool(makeRng(seed), roster, 4, ["SPLIT", "DIRT"]);
      expect(pool).toContain(3);
      expect(pool).toContain(5);
    }
  });
  it("is deterministic per seed", () => {
    expect(drawPool(makeRng(9), roster, 5, ["DIRT"])).toEqual(drawPool(makeRng(9), roster, 5, ["DIRT"]));
  });
  it("skips a guaranteed tag the roster doesn't have", () => {
    expect(drawPool(makeRng(2), roster, 3, ["BEAM"]).length).toBe(3);
  });
  it("refuses a pool bigger than the roster", () => {
    expect(() => drawPool(makeRng(1), ROSTER, ROSTER.length + 1, [])).toThrow(RangeError);
  });
});

describe("pickerAt", () => {
  it("alternates, starting with the first picker", () => {
    expect([0, 1, 2, 3].map((n) => pickerAt(1, n))).toEqual([1, 0, 1, 0]);
    expect([0, 1, 2, 3].map((n) => pickerAt(0, n))).toEqual([0, 1, 0, 1]);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run src/game/titles/arcfire/draft.test.ts`
Expected: FAIL. Vitest cannot resolve `./draft`.

- [ ] **Step 4: Implement** `src/game/titles/arcfire/draft.ts`:

```ts
// src/game/titles/arcfire/draft.ts
//
// The weapon draft (spec §2): a seeded pool drawn from the roster with tag
// guarantees, then alternating picks until each player holds weaponsEach.
import { nextRange, type Rng } from "@/game/sim/math/rng";
import type { WeaponDef, Tag } from "./weapons/types";

/**
 * Draw `size` distinct roster indices: one random weapon per guaranteed tag
 * first (skipping tags the roster lacks), then a seeded Fisher–Yates shuffle
 * of the rest fills the remaining slots. Returned ascending.
 */
export function drawPool(rng: Rng, roster: readonly WeaponDef[], size: number, guaranteeTags: readonly Tag[]): number[] {
  if (size > roster.length) throw new RangeError(`drawPool: pool size ${size} exceeds roster size ${roster.length}`);
  const chosen: number[] = [];
  const taken = new Uint8Array(roster.length);
  for (const tag of guaranteeTags) {
    if (chosen.length >= size) break;
    const candidates: number[] = [];
    for (let i = 0; i < roster.length; i++) if (!taken[i] && roster[i].tag === tag) candidates.push(i);
    if (candidates.length === 0) continue;
    const pick = candidates[nextRange(rng, candidates.length)];
    taken[pick] = 1;
    chosen.push(pick);
  }
  const rest: number[] = [];
  for (let i = 0; i < roster.length; i++) if (!taken[i]) rest.push(i);
  for (let i = rest.length - 1; i > 0; i--) {
    const j = nextRange(rng, i + 1);
    const tmp = rest[i];
    rest[i] = rest[j];
    rest[j] = tmp;
  }
  for (let i = 0; chosen.length < size; i++) chosen.push(rest[i]);
  return chosen.sort((a, b) => a - b);
}

/** Who makes pick number `picksMade`: picks alternate, starting with firstPicker. */
export const pickerAt = (firstPicker: number, picksMade: number): number =>
  picksMade % 2 === 0 ? firstPicker : 1 - firstPicker;
```

- [ ] **Step 5: Run it to verify it passes**

Run: `npx vitest run src/game/titles/arcfire/draft.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 6: Write the failing match test** `src/game/titles/arcfire/match.test.ts`. This is the draft half; Task 10 replaces the file with the full version.

```ts
import { describe, it, expect } from "vitest";
import { createMatch, applyPick } from "./match";
import { cloneMatch, type MatchSettings, type MatchState } from "./state";
import { SPAWN_X, MOVES_PER_MATCH } from "./constants";

const SMALL: MatchSettings = { weaponsEach: 3, poolSize: 8, wind: false, guaranteeTags: [] };

function draftAll(m: MatchState): void {
  while (m.phase === "draft") expect(applyPick(m, m.poolOwner.findIndex((o) => o === -1)).ok).toBe(true);
}

describe("createMatch", () => {
  it("starts in the draft with both tanks spawned and the pool drawn", () => {
    const m = createMatch(42, SMALL);
    expect(m.phase).toBe("draft");
    expect(Array.from(m.tankX)).toEqual([...SPAWN_X]);
    expect(Array.from(m.movesLeft)).toEqual([MOVES_PER_MATCH, MOVES_PER_MATCH]);
    expect(m.pool.length).toBe(8);
    expect(Array.from(m.poolOwner).every((o) => o === -1)).toBe(true);
    expect([0, 1]).toContain(m.firstPicker);
    expect(m.shooter).toBe(1 - m.firstPicker);
  });
  it("is deterministic per seed", () => {
    const a = createMatch(7, SMALL);
    const b = createMatch(7, SMALL);
    expect(Array.from(a.terrain.height)).toEqual(Array.from(b.terrain.height));
    expect(a.pool).toEqual(b.pool);
    expect(a.firstPicker).toBe(b.firstPicker);
  });
  it("rejects a pool too small to finish the draft", () => {
    expect(() => createMatch(1, { ...SMALL, poolSize: 5 })).toThrow(RangeError);
  });
});

describe("cloneMatch", () => {
  it("is a deep copy: mutating the clone leaves the original untouched", () => {
    const m = createMatch(3, SMALL);
    const c = cloneMatch(m);
    expect(c).toEqual(m);
    applyPick(c, 0);
    c.terrain.height[10]++;
    c.rng.state ^= 1;
    const fresh = createMatch(3, SMALL);
    expect(m).toEqual(fresh);
  });
});

describe("the draft", () => {
  it("alternates from the first picker, then opens the battle with the other player", () => {
    const m = createMatch(3, SMALL);
    const first = m.firstPicker;
    applyPick(m, 0);
    applyPick(m, 1);
    expect(m.poolOwner[0]).toBe(first);
    expect(m.poolOwner[1]).toBe(1 - first);
    draftAll(m);
    expect(m.phase).toBe("battle");
    expect(m.hands[0].length).toBe(3);
    expect(m.hands[1].length).toBe(3);
    expect(m.shooter).toBe(1 - first);
  });
  it("rejects taken, out-of-range and non-integer picks", () => {
    const m = createMatch(3, SMALL);
    applyPick(m, 2);
    expect(applyPick(m, 2).ok).toBe(false);
    expect(applyPick(m, 8).ok).toBe(false);
    expect(applyPick(m, -1).ok).toBe(false);
    expect(applyPick(m, 1.5).ok).toBe(false);
  });
});
```

- [ ] **Step 7: Run it to verify it fails**

Run: `npx vitest run src/game/titles/arcfire/match.test.ts`
Expected: FAIL. Vitest cannot resolve `./match`.

- [ ] **Step 8: Implement the draft half of** `src/game/titles/arcfire/match.ts`:

```ts
// src/game/titles/arcfire/match.ts
//
// The match state machine (spec §2): create → draft picks → alternating turns
// → sudden death on a tie → over. Every command is validated here; an illegal
// one changes nothing and is reported as "invalid_command" (a replay log
// containing one is rejected whole).
import { makeRng, nextRange } from "@/game/sim/math/rng";
import { makeTerrain, generateTerrain } from "./terrain";
import { drawPool, pickerAt } from "./draft";
import { ROSTER } from "./weapons/roster";
import { SPAWN_X, MOVES_PER_MATCH, WIND_MAX } from "./constants";
import type { MatchSettings, MatchState } from "./state";

export type PickResult = { ok: true } | { ok: false; reason: "invalid_command" };

/** A fresh match: seeded terrain, both tanks spawned, the pool drawn, the coin flipped. */
export function createMatch(seed: number, settings: MatchSettings): MatchState {
  if (settings.poolSize < settings.weaponsEach * 2) {
    throw new RangeError(`createMatch: poolSize ${settings.poolSize} < 2 × weaponsEach ${settings.weaponsEach}`);
  }
  const rng = makeRng(seed);
  const terrain = makeTerrain();
  generateTerrain(terrain, rng);
  const pool = drawPool(rng, ROSTER, settings.poolSize, settings.guaranteeTags);
  const firstPicker = nextRange(rng, 2);
  return {
    settings,
    rng,
    phase: "draft",
    terrain,
    tankX: Int32Array.from(SPAWN_X),
    movesLeft: Int32Array.from([MOVES_PER_MATCH, MOVES_PER_MATCH]),
    pool,
    poolOwner: new Int32Array(pool.length).fill(-1),
    firstPicker,
    picksMade: 0,
    hands: [[], []],
    shooter: 1 - firstPicker,
    shotsFired: 0,
    wind: 0,
    scores: new Int32Array(2),
    winner: -1,
  };
}

/** Draft pick (by pool index) for whoever's pick it is. */
export function applyPick(m: MatchState, poolIndex: number): PickResult {
  if (m.phase !== "draft") return { ok: false, reason: "invalid_command" };
  if (!Number.isInteger(poolIndex) || poolIndex < 0 || poolIndex >= m.pool.length) {
    return { ok: false, reason: "invalid_command" };
  }
  if (m.poolOwner[poolIndex] !== -1) return { ok: false, reason: "invalid_command" };
  const p = pickerAt(m.firstPicker, m.picksMade);
  m.poolOwner[poolIndex] = p;
  m.hands[p].push(m.pool[poolIndex]);
  m.hands[p].sort((a, b) => a - b);
  m.picksMade++;
  if (m.picksMade === m.settings.weaponsEach * 2) {
    m.phase = "battle";
    m.shooter = 1 - m.firstPicker;
    beginTurn(m);
  }
  return { ok: true };
}

/** Draw this turn's wind (only when wind is enabled, so a windless match never consumes that RNG). */
function beginTurn(m: MatchState): void {
  m.wind = m.settings.wind ? nextRange(m.rng, WIND_MAX * 2 + 1) - WIND_MAX : 0;
}
```

- [ ] **Step 9: Run it to verify it passes**

Run: `npx vitest run src/game/titles/arcfire/match.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 10: Write the failing tanks test** `src/game/titles/arcfire/tanks.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { createMatch } from "./match";
import { hitCircles, moveTarget } from "./tanks";
import { spansFromHeight } from "./terrain";
import type { MatchSettings } from "./state";
import { MOVE_STEP, MIN_TANK_SEP, TANK_EDGE_MARGIN, TANK_HIT_DY, WORLD_W } from "./constants";

const SMALL: MatchSettings = { weaponsEach: 3, poolSize: 8, wind: false, guaranteeTags: [] };

/** A match on flat ground (y = 400) with the tanks at x0 and x1. */
function onFlat(x0: number, x1: number) {
  const m = createMatch(1, SMALL);
  m.terrain.height.fill(400);
  spansFromHeight(m.terrain);
  m.tankX[0] = x0;
  m.tankX[1] = x1;
  return m;
}

describe("hitCircles", () => {
  it("centres each hitbox TANK_HIT_DY above the surface under its tank", () => {
    const m = onFlat(300, 700);
    m.terrain.height[700] = 350;
    expect(hitCircles(m)).toEqual([
      { x: 300, y: 400 - TANK_HIT_DY },
      { x: 700, y: 350 - TANK_HIT_DY },
    ]);
  });
});

describe("moveTarget", () => {
  it("steps MOVE_STEP px either way", () => {
    const m = onFlat(300, 700);
    expect(moveTarget(m, 0, 1)).toBe(300 + MOVE_STEP);
    expect(moveTarget(m, 0, -1)).toBe(300 - MOVE_STEP);
  });
  it("is illegal with no moves left", () => {
    const m = onFlat(300, 700);
    m.movesLeft[0] = 0;
    expect(moveTarget(m, 0, 1)).toBe(-1);
  });
  it("keeps tank centres inside the edge margin (landing exactly on it is legal)", () => {
    expect(moveTarget(onFlat(TANK_EDGE_MARGIN + MOVE_STEP - 1, 700), 0, -1)).toBe(-1);
    const edge = WORLD_W - 1 - TANK_EDGE_MARGIN;
    expect(moveTarget(onFlat(300, edge - MOVE_STEP), 1, 1)).toBe(edge);
  });
  it("won't bring the tank centres closer than MIN_TANK_SEP", () => {
    expect(moveTarget(onFlat(500, 500 + MOVE_STEP + MIN_TANK_SEP - 1), 0, 1)).toBe(-1);
    expect(moveTarget(onFlat(500, 500 + MOVE_STEP + MIN_TANK_SEP), 0, 1)).toBe(500 + MOVE_STEP);
  });
});
```

- [ ] **Step 11: Run it to verify it fails**

Run: `npx vitest run src/game/titles/arcfire/tanks.test.ts`
Expected: FAIL. Vitest cannot resolve `./tanks`.

- [ ] **Step 12: Implement** `src/game/titles/arcfire/tanks.ts`:

```ts
// src/game/titles/arcfire/tanks.ts
//
// Tank placement and movement (spec §2). A tank's centre column is its x; it
// always rests on the settled surface there, and its hitbox circle sits
// TANK_HIT_DY above that surface point.
import { WORLD_W, TANK_HIT_DY, MOVE_STEP, MIN_TANK_SEP, TANK_EDGE_MARGIN } from "./constants";
import type { HitCircle } from "./ballistics";
import type { MatchState } from "./state";

/** Both tanks' hitbox centres on the current settled terrain. */
export function hitCircles(m: MatchState): HitCircle[] {
  return [0, 1].map((p) => ({ x: m.tankX[p], y: m.terrain.height[m.tankX[p]] - TANK_HIT_DY }));
}

/** Where player p would end up moving one step in `dir`, or -1 if illegal (no moves left, past the edge margin, or too close to the other tank). */
export function moveTarget(m: MatchState, p: number, dir: -1 | 1): number {
  if (m.movesLeft[p] <= 0) return -1;
  const nx = m.tankX[p] + dir * MOVE_STEP;
  if (nx < TANK_EDGE_MARGIN || nx > WORLD_W - 1 - TANK_EDGE_MARGIN) return -1;
  if (Math.abs(nx - m.tankX[1 - p]) < MIN_TANK_SEP) return -1;
  return nx;
}
```

- [ ] **Step 13: Run the task's tests, purity and types**

Run: `npx vitest run src/game/titles/arcfire src/game/sim/purity.test.ts`
Expected: PASS. This task adds draft 6, match 6 and tanks 5, and every earlier Arcfire test still passes.

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 14: Commit**

```bash
git add src/game/titles/arcfire/state.ts src/game/titles/arcfire/draft.ts src/game/titles/arcfire/draft.test.ts src/game/titles/arcfire/match.ts src/game/titles/arcfire/match.test.ts src/game/titles/arcfire/tanks.ts src/game/titles/arcfire/tanks.test.ts
git commit -m "feat(arcfire): match state, seeded draft, tank placement and moves" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 9: `resolveTurn` — move, volley flight, blasts, settle, scoring

**Files:**
- Create: `src/game/titles/arcfire/timeline.ts`
- Create: `src/game/titles/arcfire/resolve.ts`, `src/game/titles/arcfire/resolve.test.ts`

**Interfaces:**
- Consumes:
  - From earlier Arcfire tasks: `launchShell`, `muzzle`, `stepShell`, `HitCircle`, `Shell`, `carveCircle`, `settle`, `spansFromHeight`, `blastDamage`, `hitCircles`, `moveTarget`, `ROSTER`, `Blast`, `idiv`, `clampInt`, `MatchState`, and `createMatch` (used by the tests).
  - `fromInt` and `toInt` from `@/game/sim/math/fixed`.
- Produces:
  - Types:
    - `TimelineEvent`, one of: `{ step; kind: "blast"; shell; x; y; radius }`, `{ step; kind: "damage"; target; amount }`, or `{ step; kind: "out"; shell; x; y }`
    - `ShellPath { angle; points: number[] }`
    - `Timeline { shooter; move; wind; weapon; shells; events; settle; points: [number, number] }`
    - `TurnInput { move: -1 | 0 | 1; weapon; angle; power }`
  - `resolveTurn(m: MatchState, input: TurnInput): Timeline`. It **mutates** `m`, and does not validate `input` (`applyTurn` validates in Task 10).

**Turn contract (spec §1.3):**
1. Apply the move on the settled terrain.
2. Launch the volley from the muzzle. Shell i's offset is `idiv((2i − (count − 1)) × spread, 2(count − 1))`, and each angle is clamped to 0..180.
3. Step every live shell together in shell order until none is alive, at most 1,200 steps. `windStep = idiv(fromInt(wind), 60)`. Each impact carves terrain and records a `blast` event plus a `damage` event per tank hit.
4. `settle` once, after the whole shot.
5. Scoring: damage to the opponent scores for the shooter; self-damage scores for the opponent.

- [ ] **Step 1: Create the presentation-only types** `src/game/titles/arcfire/timeline.ts`:

```ts
// src/game/titles/arcfire/timeline.ts
//
// What one resolved turn looked like, for the renderer to play back (spec
// §3.4). Presentation-only: never hashed and never fed back into the sim.
import type { SettleFall } from "./terrain";

export type TimelineEvent =
  | { step: number; kind: "blast"; shell: number; x: number; y: number; radius: number }
  | { step: number; kind: "damage"; target: number; amount: number }
  | { step: number; kind: "out"; shell: number; x: number; y: number };

export interface ShellPath {
  angle: number; // the launch angle of this shell (volleys fan out around the aim)
  points: number[]; // flat [x0, y0, x1, y1, ...] in px: the muzzle, then one point per step, ending at the impact
}

export interface Timeline {
  shooter: number;
  move: { fromX: number; toX: number } | null;
  wind: number; // px/s² during this turn
  weapon: number; // roster index fired
  shells: ShellPath[];
  events: TimelineEvent[]; // ordered by step
  settle: { heights: Int32Array; falls: SettleFall[] };
  points: [number, number]; // points awarded this turn to player 0 / player 1
}
```

- [ ] **Step 2: Write the failing test** `src/game/titles/arcfire/resolve.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { createMatch } from "./match";
import { resolveTurn } from "./resolve";
import { cloneMatch, type MatchSettings, type MatchState } from "./state";
import { spansFromHeight } from "./terrain";
import { ROSTER_INDEX } from "./weapons/roster";
import { MOVE_STEP, MOVES_PER_MATCH } from "./constants";

const SMALL: MatchSettings = { weaponsEach: 3, poolSize: 8, wind: false, guaranteeTags: [] };
const PULSE = ROSTER_INDEX.pulse;

/** A battle-phase match on flat ground (y = 400) with tanks at x = 300 and 700, player 0 to shoot. */
function flatBattle(): MatchState {
  const m = createMatch(1, SMALL);
  m.terrain.height.fill(400);
  spansFromHeight(m.terrain);
  m.tankX[0] = 300;
  m.tankX[1] = 700;
  m.phase = "battle";
  m.shooter = 0;
  return m;
}

describe("resolveTurn", () => {
  it("scores a self-hit for the OPPONENT", () => {
    const m = flatBattle();
    const tl = resolveTurn(m, { move: 0, weapon: PULSE, angle: 90, power: 0 }); // drops straight back down
    expect(tl.points).toEqual([0, 40]);
    expect(Array.from(m.scores)).toEqual([0, 40]);
    expect(tl.events).toContainEqual(expect.objectContaining({ kind: "damage", target: 0, amount: 40 }));
  });
  it("craters the ground and scores nothing on a far miss", () => {
    const m = flatBattle();
    const tl = resolveTurn(m, { move: 0, weapon: PULSE, angle: 60, power: 30 });
    const blast = tl.events.find((e) => e.kind === "blast");
    expect(blast).toBeDefined();
    expect(tl.points).toEqual([0, 0]);
    if (blast && blast.kind === "blast") expect(m.terrain.height[blast.x]).toBeGreaterThan(400);
  });
  it("some aim lands a Pulse on the opponent for points", () => {
    let best = 0;
    for (let power = 30; power <= 100 && best === 0; power += 2) {
      for (let angle = 20; angle <= 70 && best === 0; angle += 2) {
        best = resolveTurn(flatBattle(), { move: 0, weapon: PULSE, angle, power }).points[0];
      }
    }
    expect(best).toBeGreaterThan(0);
  });
  it("fans a volley symmetrically around the aim", () => {
    const tl = resolveTurn(flatBattle(), { move: 0, weapon: ROSTER_INDEX.fan, angle: 45, power: 50 });
    expect(tl.shells.map((s) => s.angle)).toEqual([39, 42, 45, 48, 51]);
  });
  it("moves before firing", () => {
    const m = flatBattle();
    const tl = resolveTurn(m, { move: 1, weapon: PULSE, angle: 45, power: 10 });
    expect(tl.move).toEqual({ fromX: 300, toX: 300 + MOVE_STEP });
    expect(m.tankX[0]).toBe(300 + MOVE_STEP);
    expect(m.movesLeft[0]).toBe(MOVES_PER_MATCH - 1);
    expect(tl.shells[0].points[0]).toBeGreaterThan(300 + MOVE_STEP); // the muzzle moved with the tank
  });
  it("is deterministic across clones", () => {
    const a = flatBattle();
    const b = cloneMatch(a);
    const ta = resolveTurn(a, { move: 0, weapon: ROSTER_INDEX.nova, angle: 50, power: 70 });
    const tb = resolveTurn(b, { move: 0, weapon: ROSTER_INDEX.nova, angle: 50, power: 70 });
    expect(tb).toEqual(ta);
    expect(Array.from(b.terrain.height)).toEqual(Array.from(a.terrain.height));
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run src/game/titles/arcfire/resolve.test.ts`
Expected: FAIL. Vitest cannot resolve `./resolve`.

- [ ] **Step 4: Implement** `src/game/titles/arcfire/resolve.ts`:

```ts
// src/game/titles/arcfire/resolve.ts
//
// resolveTurn (spec §1.3): one whole turn — the optional move, then the shot —
// resolved to completion. It MUTATES the MatchState it's given; callers that
// need the original (AI search, previews) resolve a cloneMatch() copy. The
// caller (match.ts applyTurn) validates the command first. Plan 1 resolves
// shell launches with impact blasts; Plan 2 adds the other primitives.
import { fromInt, toInt } from "@/game/sim/math/fixed";
import { ROSTER } from "./weapons/roster";
import type { Blast } from "./weapons/types";
import { launchShell, muzzle, stepShell, type HitCircle, type Shell } from "./ballistics";
import { carveCircle, settle, spansFromHeight } from "./terrain";
import { blastDamage } from "./damage";
import { hitCircles, moveTarget } from "./tanks";
import { idiv, clampInt } from "./imath";
import { STEPS_PER_SEC, MAX_FLIGHT_STEPS } from "./constants";
import type { MatchState } from "./state";
import type { Timeline, TimelineEvent } from "./timeline";

export interface TurnInput {
  move: -1 | 0 | 1;
  weapon: number; // roster index
  angle: number; // integer degrees 0..180
  power: number; // integer 0..100
}

export function resolveTurn(m: MatchState, input: TurnInput): Timeline {
  const shooter = m.shooter;
  const def = ROSTER[input.weapon];
  const tl: Timeline = {
    shooter,
    move: null,
    wind: m.wind,
    weapon: input.weapon,
    shells: [],
    events: [],
    settle: { heights: m.terrain.height.slice(), falls: [] },
    points: [0, 0],
  };

  // 1. The move happens first, on the settled terrain.
  if (input.move !== 0) {
    const nx = moveTarget(m, shooter, input.move);
    if (nx !== -1) {
      tl.move = { fromX: m.tankX[shooter], toX: nx };
      m.tankX[shooter] = nx;
      m.movesLeft[shooter]--;
    }
  }

  // 2. Launch the volley from the shooter's muzzle.
  spansFromHeight(m.terrain);
  const tanks = hitCircles(m);
  const count = def.launch.count ?? 1;
  const spread = def.launch.spreadDeg ?? 0;
  const shells: Shell[] = [];
  for (let i = 0; i < count; i++) {
    const offset = count > 1 ? idiv((2 * i - (count - 1)) * spread, 2 * (count - 1)) : 0;
    const angle = clampInt(input.angle + offset, 0, 180);
    const mz = muzzle(tanks[shooter].x, tanks[shooter].y, angle);
    shells.push(launchShell(mz.x, mz.y, angle, input.power, def.launch.speedPct ?? 100, def.launch.gravityPct ?? 100));
    tl.shells.push({ angle, points: [mz.x, mz.y] });
  }

  // 3. Fly every shell together, one step at a time, in shell order.
  const windStep = idiv(fromInt(m.wind), STEPS_PER_SEC);
  const received = [0, 0]; // damage each tank took this turn
  for (let step = 1; step <= MAX_FLIGHT_STEPS; step++) {
    let anyAlive = false;
    for (let i = 0; i < shells.length; i++) {
      const s = shells[i];
      if (!s.alive) continue;
      const hit = stepShell(s, m.terrain, tanks, windStep);
      if (hit === null) {
        tl.shells[i].points.push(toInt(s.x), toInt(s.y));
        anyAlive = true;
        continue;
      }
      tl.shells[i].points.push(hit.x, hit.y);
      if (hit.kind === "out") {
        tl.events.push({ step, kind: "out", shell: i, x: hit.x, y: hit.y });
        continue;
      }
      for (const eff of def.stage.effects) applyBlast(m, eff.blast, hit.x, hit.y, step, i, tanks, received, tl.events);
    }
    if (!anyAlive) break;
  }

  // 4. Dirt settles once, after the whole shot.
  tl.settle = settle(m.terrain);

  // 5. Damage to the opponent scores for the shooter; self-damage scores for the opponent.
  const opp = 1 - shooter;
  tl.points[shooter] += received[opp];
  tl.points[opp] += received[shooter];
  m.scores[0] += tl.points[0];
  m.scores[1] += tl.points[1];
  return tl;
}

function applyBlast(
  m: MatchState, b: Blast, x: number, y: number, step: number, shell: number,
  tanks: readonly HitCircle[], received: number[], events: TimelineEvent[]
): void {
  carveCircle(m.terrain, x, y, b.radius);
  events.push({ step, kind: "blast", shell, x, y, radius: b.radius });
  for (let p = 0; p < 2; p++) {
    const dmg = blastDamage(b, x, y, tanks[p].x, tanks[p].y);
    if (dmg > 0) {
      received[p] += dmg;
      events.push({ step, kind: "damage", target: p, amount: dmg });
    }
  }
}
```

- [ ] **Step 5: Run the tests, purity and types**

Run: `npx vitest run src/game/titles/arcfire src/game/sim/purity.test.ts`
Expected: PASS (this task adds resolve 6).

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/game/titles/arcfire/timeline.ts src/game/titles/arcfire/resolve.ts src/game/titles/arcfire/resolve.test.ts
git commit -m "feat(arcfire): resolveTurn — move, volley flight, blasts, settle, scoring" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 10: Turn state machine, sudden death, match hash, replay

**Files:**
- Modify: `src/game/titles/arcfire/match.ts` (full replacement: adds turns)
- Modify: `src/game/titles/arcfire/match.test.ts` (full replacement: adds the turn tests)
- Create: `src/game/titles/arcfire/hash.ts`, `src/game/titles/arcfire/hash.test.ts`
- Create: `src/game/titles/arcfire/replay.ts`, `src/game/titles/arcfire/replay.test.ts`

**Interfaces:**
- Consumes:
  - Task 8's `createMatch`, `applyPick`, `drawPool`, `pickerAt` and `MatchState`.
  - Task 9's `resolveTurn` and `Timeline`.
  - Task 8's `moveTarget`.
  - Task 2's `FNV_OFFSET`, `fnvFold` and `fnvHex`.
- Produces:
  - Types:
    - `TurnCommand { move: -1 | 0 | 1; w; angle; power }`
    - `TurnResult = { ok: true; timeline } | { ok: false; reason: "invalid_command" }`
    - `ArcfireCommand = { k: "pick"; w } | { k: "turn"; move; w; angle; power }`
    - `ArcfireReplay { seed; settings; commands }`
    - `ReplayMatchResult = { ok: true; state; hash } | { ok: false; reason: "invalid_command"; atIndex }`
  - Functions:
    - `applyTurn(m, cmd): TurnResult`
    - `hashMatch(m): string` (8 hex chars)
    - `replayMatch(r: ArcfireReplay): ReplayMatchResult`
  - Plan 2's AI and Plan 4's `TitleDef` binding build on these.

**Rules (spec §2, §3.4):**
- **What `applyTurn` validates** (any failure returns `invalid_command` and changes nothing):
  - the phase is battle or sudden death
  - the angle is an integer in 0..180
  - the power is an integer in 0..100
  - the move is −1, 0 or 1 and legal
  - in battle, the weapon is in the shooter's hand; in sudden death, it is Pulse (roster index 0)
- **After a valid turn:** a battle weapon leaves the hand, and the shooter alternates. Wind is redrawn each turn, only when wind is enabled, in `[−40, 40]`.
- **End of battle:** once all 2 × weaponsEach battle shots are fired, unequal scores finish the match. A tie starts sudden death: one Pulse each, same opener. A tie after that is a draw (winner 2).
- **`hashMatch`** folds, in one fixed order:
  - settings
  - phase, RNG state, draft/turn counters, wind, winner, scores, tanks, moves
  - the pool with its owners
  - both hands
  - all 1,200 heights

- [ ] **Step 1: Write the failing test.** Replace `src/game/titles/arcfire/match.test.ts` with the full version:

```ts
import { describe, it, expect } from "vitest";
import { createMatch, applyPick, applyTurn, type TurnCommand } from "./match";
import { cloneMatch, type MatchSettings, type MatchState } from "./state";
import { spansFromHeight } from "./terrain";
import { SPAWN_X, MOVES_PER_MATCH, SUDDEN_DEATH_WEAPON, WIND_MAX } from "./constants";

const SMALL: MatchSettings = { weaponsEach: 3, poolSize: 8, wind: false, guaranteeTags: [] };

function draftAll(m: MatchState): void {
  while (m.phase === "draft") expect(applyPick(m, m.poolOwner.findIndex((o) => o === -1)).ok).toBe(true);
}

/** A legal shot for whoever's turn it is: first weapon in hand (Pulse in sudden death), aimed at the other side. */
function aim(m: MatchState): TurnCommand {
  const p = m.shooter;
  const w = m.phase === "suddenDeath" ? SUDDEN_DEATH_WEAPON : m.hands[p][0];
  return { move: 0, w, angle: p === 0 ? 45 : 135, power: 60 };
}

describe("createMatch", () => {
  it("starts in the draft with both tanks spawned and the pool drawn", () => {
    const m = createMatch(42, SMALL);
    expect(m.phase).toBe("draft");
    expect(Array.from(m.tankX)).toEqual([...SPAWN_X]);
    expect(Array.from(m.movesLeft)).toEqual([MOVES_PER_MATCH, MOVES_PER_MATCH]);
    expect(m.pool.length).toBe(8);
    expect(Array.from(m.poolOwner).every((o) => o === -1)).toBe(true);
    expect([0, 1]).toContain(m.firstPicker);
    expect(m.shooter).toBe(1 - m.firstPicker);
  });
  it("is deterministic per seed", () => {
    const a = createMatch(7, SMALL);
    const b = createMatch(7, SMALL);
    expect(Array.from(a.terrain.height)).toEqual(Array.from(b.terrain.height));
    expect(a.pool).toEqual(b.pool);
    expect(a.firstPicker).toBe(b.firstPicker);
  });
  it("rejects a pool too small to finish the draft", () => {
    expect(() => createMatch(1, { ...SMALL, poolSize: 5 })).toThrow(RangeError);
  });
});

describe("cloneMatch", () => {
  it("is a deep copy: mutating the clone leaves the original untouched", () => {
    const m = createMatch(3, SMALL);
    const c = cloneMatch(m);
    expect(c).toEqual(m);
    applyPick(c, 0);
    c.terrain.height[10]++;
    c.rng.state ^= 1;
    const fresh = createMatch(3, SMALL);
    expect(m).toEqual(fresh);
  });
});

describe("the draft", () => {
  it("alternates from the first picker, then opens the battle with the other player", () => {
    const m = createMatch(3, SMALL);
    const first = m.firstPicker;
    applyPick(m, 0);
    applyPick(m, 1);
    expect(m.poolOwner[0]).toBe(first);
    expect(m.poolOwner[1]).toBe(1 - first);
    draftAll(m);
    expect(m.phase).toBe("battle");
    expect(m.hands[0].length).toBe(3);
    expect(m.hands[1].length).toBe(3);
    expect(m.shooter).toBe(1 - first);
  });
  it("rejects taken, out-of-range and non-integer picks", () => {
    const m = createMatch(3, SMALL);
    applyPick(m, 2);
    expect(applyPick(m, 2).ok).toBe(false);
    expect(applyPick(m, 8).ok).toBe(false);
    expect(applyPick(m, -1).ok).toBe(false);
    expect(applyPick(m, 1.5).ok).toBe(false);
  });
});

describe("turns", () => {
  it("plays a full match to a result", () => {
    const m = createMatch(5, SMALL);
    draftAll(m);
    let guard = 0;
    while (m.phase !== "over" && guard++ < 20) expect(applyTurn(m, aim(m)).ok).toBe(true);
    expect(m.phase).toBe("over");
    expect(m.hands[0].length + m.hands[1].length).toBe(0);
    expect([0, 1, 2]).toContain(m.winner);
    if (m.winner === 2) expect(m.scores[0]).toBe(m.scores[1]);
    else expect(m.scores[m.winner]).toBeGreaterThan(m.scores[1 - m.winner]);
  });
  it("alternates shooters", () => {
    const m = createMatch(5, SMALL);
    draftAll(m);
    const s0 = m.shooter;
    applyTurn(m, aim(m));
    expect(m.shooter).toBe(1 - s0);
  });
  it("rejects illegal turns without changing anything", () => {
    const m = createMatch(5, SMALL);
    expect(applyTurn(m, { move: 0, w: 0, angle: 45, power: 50 }).ok).toBe(false); // still drafting
    draftAll(m);
    const before = cloneMatch(m);
    const notMine = m.hands[1 - m.shooter][0];
    for (const bad of [
      { ...aim(m), w: notMine },
      { ...aim(m), angle: 181 },
      { ...aim(m), angle: 10.5 },
      { ...aim(m), power: 101 },
      { ...aim(m), power: -1 },
    ]) expect(applyTurn(m, bad).ok).toBe(false);
    expect(m).toEqual(before);
    expect(applyPick(m, 0).ok).toBe(false); // no picking during the battle
  });
  it("rejects a move with no moves left", () => {
    const m = createMatch(5, SMALL);
    draftAll(m);
    m.movesLeft[m.shooter] = 0;
    expect(applyTurn(m, { ...aim(m), move: 1 }).ok).toBe(false);
  });
  it("goes to sudden death on a tie, where only Pulse is allowed, then can end in a draw", () => {
    const m = createMatch(5, SMALL);
    draftAll(m);
    m.terrain.height.fill(450); // low flat ground so edge-bound shots fly clean off the world
    spansFromHeight(m.terrain);
    const away = (): TurnCommand => ({
      move: 0,
      w: m.phase === "suddenDeath" ? SUDDEN_DEATH_WEAPON : m.hands[m.shooter][0],
      angle: m.shooter === 0 ? 180 : 0,
      power: 100,
    });
    for (let i = 0; i < 6; i++) expect(applyTurn(m, away()).ok).toBe(true);
    expect(m.phase).toBe("suddenDeath");
    expect(applyTurn(m, { ...away(), w: 1 }).ok).toBe(false);
    expect(applyTurn(m, away()).ok).toBe(true);
    expect(applyTurn(m, away()).ok).toBe(true);
    expect(m.phase).toBe("over");
    expect(m.winner).toBe(2);
  });
  it("draws wind only when it's enabled", () => {
    const calm = createMatch(11, SMALL);
    draftAll(calm);
    expect(calm.wind).toBe(0);
    const windy = createMatch(11, { ...SMALL, wind: true });
    draftAll(windy);
    for (let i = 0; i < 6 && windy.phase !== "over"; i++) {
      expect(Math.abs(windy.wind)).toBeLessThanOrEqual(WIND_MAX);
      applyTurn(windy, aim(windy));
    }
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/game/titles/arcfire/match.test.ts`
Expected: FAIL. The `turns` tests error because `applyTurn` is not exported yet; the six earlier tests still pass.

- [ ] **Step 3: Replace `src/game/titles/arcfire/match.ts`** with the full state machine:

```ts
// src/game/titles/arcfire/match.ts
//
// The match state machine (spec §2): create → draft picks → alternating turns
// → sudden death on a tie → over. Every command is validated here; an illegal
// one changes nothing and is reported as "invalid_command" (a replay log
// containing one is rejected whole).
import { makeRng, nextRange } from "@/game/sim/math/rng";
import { makeTerrain, generateTerrain } from "./terrain";
import { drawPool, pickerAt } from "./draft";
import { ROSTER } from "./weapons/roster";
import { resolveTurn } from "./resolve";
import { moveTarget } from "./tanks";
import { SPAWN_X, MOVES_PER_MATCH, WIND_MAX, SUDDEN_DEATH_WEAPON } from "./constants";
import type { MatchSettings, MatchState } from "./state";
import type { Timeline } from "./timeline";

export interface TurnCommand {
  move: -1 | 0 | 1;
  w: number; // roster index of the weapon to fire
  angle: number; // integer degrees 0..180
  power: number; // integer 0..100
}

export type PickResult = { ok: true } | { ok: false; reason: "invalid_command" };
export type TurnResult = { ok: true; timeline: Timeline } | { ok: false; reason: "invalid_command" };

/** A fresh match: seeded terrain, both tanks spawned, the pool drawn, the coin flipped. */
export function createMatch(seed: number, settings: MatchSettings): MatchState {
  if (settings.poolSize < settings.weaponsEach * 2) {
    throw new RangeError(`createMatch: poolSize ${settings.poolSize} < 2 × weaponsEach ${settings.weaponsEach}`);
  }
  const rng = makeRng(seed);
  const terrain = makeTerrain();
  generateTerrain(terrain, rng);
  const pool = drawPool(rng, ROSTER, settings.poolSize, settings.guaranteeTags);
  const firstPicker = nextRange(rng, 2);
  return {
    settings,
    rng,
    phase: "draft",
    terrain,
    tankX: Int32Array.from(SPAWN_X),
    movesLeft: Int32Array.from([MOVES_PER_MATCH, MOVES_PER_MATCH]),
    pool,
    poolOwner: new Int32Array(pool.length).fill(-1),
    firstPicker,
    picksMade: 0,
    hands: [[], []],
    shooter: 1 - firstPicker,
    shotsFired: 0,
    wind: 0,
    scores: new Int32Array(2),
    winner: -1,
  };
}

/** Draft pick (by pool index) for whoever's pick it is. */
export function applyPick(m: MatchState, poolIndex: number): PickResult {
  if (m.phase !== "draft") return { ok: false, reason: "invalid_command" };
  if (!Number.isInteger(poolIndex) || poolIndex < 0 || poolIndex >= m.pool.length) {
    return { ok: false, reason: "invalid_command" };
  }
  if (m.poolOwner[poolIndex] !== -1) return { ok: false, reason: "invalid_command" };
  const p = pickerAt(m.firstPicker, m.picksMade);
  m.poolOwner[poolIndex] = p;
  m.hands[p].push(m.pool[poolIndex]);
  m.hands[p].sort((a, b) => a - b);
  m.picksMade++;
  if (m.picksMade === m.settings.weaponsEach * 2) {
    m.phase = "battle";
    m.shooter = 1 - m.firstPicker;
    beginTurn(m);
  }
  return { ok: true };
}

/** Fire (after an optional move) for whoever's turn it is. */
export function applyTurn(m: MatchState, cmd: TurnCommand): TurnResult {
  if (m.phase !== "battle" && m.phase !== "suddenDeath") return invalid();
  const p = m.shooter;
  if (!Number.isInteger(cmd.angle) || cmd.angle < 0 || cmd.angle > 180) return invalid();
  if (!Number.isInteger(cmd.power) || cmd.power < 0 || cmd.power > 100) return invalid();
  if (cmd.move !== -1 && cmd.move !== 0 && cmd.move !== 1) return invalid();
  if (cmd.move !== 0 && moveTarget(m, p, cmd.move) === -1) return invalid();
  if (m.phase === "battle" ? !m.hands[p].includes(cmd.w) : cmd.w !== SUDDEN_DEATH_WEAPON) return invalid();

  const timeline = resolveTurn(m, { move: cmd.move, weapon: cmd.w, angle: cmd.angle, power: cmd.power });
  if (m.phase === "battle") m.hands[p].splice(m.hands[p].indexOf(cmd.w), 1);
  m.shotsFired++;
  advance(m);
  return { ok: true, timeline };
}

const invalid = (): TurnResult => ({ ok: false, reason: "invalid_command" });

/** Draw this turn's wind (only when wind is enabled, so a windless match never consumes that RNG). */
function beginTurn(m: MatchState): void {
  m.wind = m.settings.wind ? nextRange(m.rng, WIND_MAX * 2 + 1) - WIND_MAX : 0;
}

function advance(m: MatchState): void {
  const battleShots = m.settings.weaponsEach * 2;
  if (m.phase === "battle" && m.shotsFired === battleShots) {
    if (m.scores[0] !== m.scores[1]) return finish(m);
    m.phase = "suddenDeath"; // one Pulse each, same opener as the battle
    m.shooter = 1 - m.firstPicker;
    beginTurn(m);
    return;
  }
  if (m.phase === "suddenDeath" && m.shotsFired === battleShots + 2) return finish(m);
  m.shooter = 1 - m.shooter;
  beginTurn(m);
}

function finish(m: MatchState): void {
  m.phase = "over";
  m.winner = m.scores[0] === m.scores[1] ? 2 : m.scores[0] > m.scores[1] ? 0 : 1;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/game/titles/arcfire/match.test.ts`
Expected: PASS (12 tests).

- [ ] **Step 5: Write the failing hash test** `src/game/titles/arcfire/hash.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { createMatch, applyPick } from "./match";
import { hashMatch } from "./hash";
import { cloneMatch, type MatchSettings, type MatchState } from "./state";

const SMALL: MatchSettings = { weaponsEach: 3, poolSize: 8, wind: false, guaranteeTags: [] };

describe("hashMatch", () => {
  it("is an 8-char hex digest that's stable for equal states", () => {
    const a = createMatch(1, SMALL);
    expect(hashMatch(a)).toMatch(/^[0-9a-f]{8}$/);
    expect(hashMatch(cloneMatch(a))).toBe(hashMatch(a));
    expect(hashMatch(createMatch(1, SMALL))).toBe(hashMatch(a));
  });
  it("changes when any part of the state changes", () => {
    const base = createMatch(1, SMALL);
    const h = hashMatch(base);
    const after = (f: (m: MatchState) => void): string => {
      const m = cloneMatch(base);
      f(m);
      return hashMatch(m);
    };
    expect(after((m) => { m.terrain.height[600]++; })).not.toBe(h);
    expect(after((m) => { m.tankX[1]--; })).not.toBe(h);
    expect(after((m) => { m.scores[0] = 1; })).not.toBe(h);
    expect(after((m) => { applyPick(m, 0); })).not.toBe(h);
    expect(after((m) => { m.rng.state ^= 1; })).not.toBe(h);
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npx vitest run src/game/titles/arcfire/hash.test.ts`
Expected: FAIL. Vitest cannot resolve `./hash`.

- [ ] **Step 7: Implement** `src/game/titles/arcfire/hash.ts`:

```ts
// src/game/titles/arcfire/hash.ts
//
// hashMatch: FNV-1a over every integer field of a MatchState in one fixed,
// canonical order (spec §3.4). Used per turn (future desync detection) and as
// the final verification hash. Engine-exact: integer folds only.
import { FNV_OFFSET, fnvFold, fnvHex } from "@/game/sim/hash";
import type { MatchState, Phase } from "./state";

const PHASE_CODE: Record<Phase, number> = { draft: 0, battle: 1, suddenDeath: 2, over: 3 };

export function hashMatch(m: MatchState): string {
  const s = m.settings;
  let h = FNV_OFFSET;
  for (const v of [
    s.weaponsEach, s.poolSize, s.wind ? 1 : 0, s.guaranteeTags.length,
    PHASE_CODE[m.phase], m.rng.state, m.firstPicker, m.picksMade, m.shooter, m.shotsFired,
    m.wind, m.winner, m.scores[0], m.scores[1],
    m.tankX[0], m.tankX[1], m.movesLeft[0], m.movesLeft[1], m.pool.length,
  ]) h = fnvFold(h, v);
  for (let i = 0; i < m.pool.length; i++) {
    h = fnvFold(h, m.pool[i]);
    h = fnvFold(h, m.poolOwner[i]);
  }
  for (const hand of m.hands) {
    h = fnvFold(h, hand.length);
    for (const w of hand) h = fnvFold(h, w);
  }
  for (let x = 0; x < m.terrain.height.length; x++) h = fnvFold(h, m.terrain.height[x]);
  return fnvHex(h);
}
```

- [ ] **Step 8: Run it to verify it passes**

Run: `npx vitest run src/game/titles/arcfire/hash.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 9: Write the failing replay test** `src/game/titles/arcfire/replay.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { createMatch, applyPick, applyTurn } from "./match";
import { replayMatch, type ArcfireCommand } from "./replay";
import { hashMatch } from "./hash";
import type { MatchSettings } from "./state";
import { SUDDEN_DEATH_WEAPON } from "./constants";

const SMALL: MatchSettings = { weaponsEach: 3, poolSize: 8, wind: true, guaranteeTags: [] };

/** Play a whole match with a fixed strategy, recording the command log. */
function play(seed: number) {
  const m = createMatch(seed, SMALL);
  const log: ArcfireCommand[] = [];
  while (m.phase === "draft") {
    const w = m.poolOwner.findIndex((o) => o === -1);
    applyPick(m, w);
    log.push({ k: "pick", w });
  }
  while (m.phase !== "over") {
    const p = m.shooter;
    const cmd = {
      move: 0 as const,
      w: m.phase === "suddenDeath" ? SUDDEN_DEATH_WEAPON : m.hands[p][0],
      angle: p === 0 ? 50 : 130,
      power: 65,
    };
    applyTurn(m, cmd);
    log.push({ k: "turn", ...cmd });
  }
  return { m, log };
}

describe("replayMatch", () => {
  it("reproduces a live match's final hash from its log", () => {
    const { m, log } = play(77);
    const r = replayMatch({ seed: 77, settings: SMALL, commands: log });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.hash).toBe(hashMatch(m));
  });
  it("rejects a log with an illegal command and reports where", () => {
    const { log } = play(77);
    const bad = [...log];
    bad[3] = { k: "pick", w: 99 };
    expect(replayMatch({ seed: 77, settings: SMALL, commands: bad })).toEqual({
      ok: false, reason: "invalid_command", atIndex: 3,
    });
  });
  it("rejects a turn issued during the draft", () => {
    expect(
      replayMatch({ seed: 1, settings: SMALL, commands: [{ k: "turn", move: 0, w: 0, angle: 45, power: 50 }] })
    ).toEqual({ ok: false, reason: "invalid_command", atIndex: 0 });
  });
});
```

- [ ] **Step 10: Run it to verify it fails**

Run: `npx vitest run src/game/titles/arcfire/replay.test.ts`
Expected: FAIL. Vitest cannot resolve `./replay`.

- [ ] **Step 11: Implement** `src/game/titles/arcfire/replay.ts`:

```ts
// src/game/titles/arcfire/replay.ts
//
// The Arcfire command log (spec §1.3, §7): one entry per draft pick or turn,
// in order. A 2-player log holds BOTH players' commands; a vs-AI log (Plan 2)
// holds only the human's, with the AI's regenerated during replay. Any illegal
// command rejects the whole log.
import { createMatch, applyPick, applyTurn } from "./match";
import { hashMatch } from "./hash";
import type { MatchSettings, MatchState } from "./state";

export type ArcfireCommand =
  | { k: "pick"; w: number } // w = pool index
  | { k: "turn"; move: -1 | 0 | 1; w: number; angle: number; power: number }; // w = roster index

export interface ArcfireReplay {
  seed: number;
  settings: MatchSettings;
  commands: readonly ArcfireCommand[];
}

export type ReplayMatchResult =
  | { ok: true; state: MatchState; hash: string }
  | { ok: false; reason: "invalid_command"; atIndex: number };

/** Replay a 2-player command log from a fresh match. */
export function replayMatch(r: ArcfireReplay): ReplayMatchResult {
  const m = createMatch(r.seed, r.settings);
  for (let i = 0; i < r.commands.length; i++) {
    const c = r.commands[i];
    const res = c.k === "pick"
      ? applyPick(m, c.w)
      : applyTurn(m, { move: c.move, w: c.w, angle: c.angle, power: c.power });
    if (!res.ok) return { ok: false, reason: "invalid_command", atIndex: i };
  }
  return { ok: true, state: m, hash: hashMatch(m) };
}
```

- [ ] **Step 12: Run the Arcfire tests, purity and types**

Run: `npx vitest run src/game/titles/arcfire src/game/sim/purity.test.ts`
Expected: PASS. This task adds match 12 (replacing 6), hash 2 and replay 3.

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 13: Commit**

```bash
git add src/game/titles/arcfire/match.ts src/game/titles/arcfire/match.test.ts src/game/titles/arcfire/hash.ts src/game/titles/arcfire/hash.test.ts src/game/titles/arcfire/replay.ts src/game/titles/arcfire/replay.test.ts
git commit -m "feat(arcfire): turn state machine, sudden death, match hash, replay" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 11: Golden determinism fixture + cross-engine gate

**Files:**
- Create: `src/game/titles/arcfire/determinism.test.ts`
- Create: `src/game/titles/arcfire/determinism.golden.json` (generated by the test, never hand-written)
- Modify: `src/game/test/cross-engine/harness.entry.ts` (full replacement)
- Modify: `e2e/cross-engine-determinism.spec.ts` (full replacement)

**Interfaces:**
- Consumes:
  - Task 10's `createMatch`, `applyPick`, `applyTurn`, `replayMatch` and `ArcfireReplay`.
  - Task 1's `runReplay(replay, circleTdTitle)`, now at `@/game/titles/circle-td/replay` after Task 2.
- Produces:
  - The pinned Arcfire golden (`hash`, `scores`, `winner`, and the full `replay`).
  - `window.runArcfireGolden(replay): string` in the cross-engine bundle.
  - One Playwright test per engine that asserts the hash.

**Spec §8:** the golden is generated by a fixed in-file strategy. The same code produces the same log and the same hash, so any unintended sim change moves the hash and fails loudly. The cross-engine gate proves Chromium, Firefox and WebKit reproduce the Node hash, the property the leaderboard verifier depends on.

- [ ] **Step 1: Write the golden test** `src/game/titles/arcfire/determinism.test.ts`. The purity guard skips `*.test.ts` files, so `node:fs` and `process` are allowed here.

```ts
// src/game/titles/arcfire/determinism.test.ts
//
// Arcfire's golden determinism gate (mirrors src/game/test/determinism.test.ts).
// A fixed in-file strategy GENERATES a complete 2-player command log; replaying
// it must land on the hash pinned in determinism.golden.json. Same code → same
// log → same hash; any unintended sim change moves the hash and fails loud.
// Re-pin ONLY for an intentional sim change:
//   UPDATE_ARCFIRE_GOLDEN=1 npx vitest run src/game/titles/arcfire/determinism.test.ts
// (This *.test.ts may use node:fs and process — the purity guard skips tests.)
import { describe, it, expect } from "vitest";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createMatch, applyPick, applyTurn } from "./match";
import { replayMatch, type ArcfireCommand, type ArcfireReplay } from "./replay";
import type { MatchSettings } from "./state";
import { SUDDEN_DEATH_WEAPON } from "./constants";

const FIXTURE = join("src/game/titles/arcfire/determinism.golden.json");
const SEED = 20260922;
const SETTINGS: MatchSettings = { weaponsEach: 4, poolSize: 8, wind: true, guaranteeTags: ["VOLLEY"] };

function buildGoldenReplay(): ArcfireReplay {
  const m = createMatch(SEED, SETTINGS);
  const commands: ArcfireCommand[] = [];
  while (m.phase === "draft") {
    const w = m.poolOwner.findIndex((o) => o === -1); // lowest free pool slot
    if (!applyPick(m, w).ok) throw new Error("golden strategy made an illegal pick");
    commands.push({ k: "pick", w });
  }
  for (let turn = 0; m.phase !== "over"; turn++) {
    const p = m.shooter;
    const w = m.phase === "suddenDeath" ? SUDDEN_DEATH_WEAPON : m.hands[p][0];
    const angle = p === 0 ? 40 + (turn % 5) * 5 : 140 - (turn % 5) * 5;
    const power = 55 + (turn % 7) * 5;
    const move: -1 | 0 | 1 = turn === 2 ? (p === 0 ? 1 : -1) : 0;
    if (!applyTurn(m, { move, w, angle, power }).ok) throw new Error(`golden strategy made an illegal turn at ${turn}`);
    commands.push({ k: "turn", move, w, angle, power });
  }
  return { seed: SEED, settings: SETTINGS, commands };
}

describe("arcfire golden determinism", () => {
  it("replays the generated log to the pinned golden hash", () => {
    const replay = buildGoldenReplay();
    const result = replayMatch(replay);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.phase).toBe("over");
    if (process.env.UPDATE_ARCFIRE_GOLDEN) {
      const fixture = { replay, hash: result.hash, scores: Array.from(result.state.scores), winner: result.state.winner };
      writeFileSync(FIXTURE, JSON.stringify(fixture, null, 2) + "\n");
    }
    expect(existsSync(FIXTURE), "create it once with UPDATE_ARCFIRE_GOLDEN=1").toBe(true);
    const golden = JSON.parse(readFileSync(FIXTURE, "utf8"));
    expect(replay).toEqual(golden.replay);
    expect(result.hash).toBe(golden.hash);
    expect(Array.from(result.state.scores)).toEqual(golden.scores);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/game/titles/arcfire/determinism.test.ts`
Expected: FAIL with `create it once with UPDATE_ARCFIRE_GOLDEN=1: expected false to be true`.

- [ ] **Step 3: Generate the fixture once** (Bash):

```bash
UPDATE_ARCFIRE_GOLDEN=1 npx vitest run src/game/titles/arcfire/determinism.test.ts
```

In PowerShell: `$env:UPDATE_ARCFIRE_GOLDEN = "1"; npx vitest run src/game/titles/arcfire/determinism.test.ts; Remove-Item Env:UPDATE_ARCFIRE_GOLDEN`.

Expected: PASS, and `src/game/titles/arcfire/determinism.golden.json` is written.

- [ ] **Step 4: Transcription check — the golden must match the validated prototype.**

Run: `node -e "const g=require('./src/game/titles/arcfire/determinism.golden.json');console.log(g.hash,JSON.stringify(g.scores),g.winner,g.replay.commands.length)"`
Expected, exactly: `63222780 [32,84] 1 16`

If any value differs, **STOP and do not commit.** The Arcfire code differs from this plan somewhere; diff each Arcfire file against its task's code block. Constants, the RNG consumption order, and operator/rounding choices are the usual culprits. Fix the code, delete the fixture, and redo Step 3.

- [ ] **Step 5: Run it again without the env var to verify it passes**

Run: `npx vitest run src/game/titles/arcfire/determinism.test.ts`
Expected: PASS (1 test).

- [ ] **Step 6: Expose Arcfire to the cross-engine bundle.** Replace `src/game/test/cross-engine/harness.entry.ts` with:

```ts
// src/game/test/cross-engine/harness.entry.ts
//
// esbuild bundles this into an IIFE injected into each Playwright browser.
// It exposes the SAME pure replay paths the Node verifier uses, so the
// cross-engine spec can assert every engine reproduces the Node golden
// hashes. Lives under src/game/test/** (outside the purity roots), so the
// `window` reference here is allowed.
import { runReplay, type Replay } from "@/game/titles/circle-td/replay";
import { circleTdTitle } from "@/game/titles/circle-td/title";
import { replayMatch, type ArcfireReplay } from "@/game/titles/arcfire/replay";

declare global {
  interface Window {
    runGolden: (replay: Replay) => string;
    runArcfireGolden: (replay: ArcfireReplay) => string;
  }
}

window.runGolden = (replay: Replay): string => runReplay(replay, circleTdTitle).hash;

window.runArcfireGolden = (replay: ArcfireReplay): string => {
  const r = replayMatch(replay);
  return r.ok ? r.hash : `invalid@${r.atIndex}`;
};
```

- [ ] **Step 7: Add the per-engine Arcfire test.** Replace `e2e/cross-engine-determinism.spec.ts` with:

```ts
// e2e/cross-engine-determinism.spec.ts
//
// §10.1 cross-engine determinism gate. Bundles the pure sim once with
// esbuild, then runs the committed golden replay in Chromium, Firefox and
// WebKit and asserts each reproduces the Node golden hash. Catches the
// single largest board-correctness risk: an honest Safari/Firefox run
// rejected by the V8 verifier over a ULP divergence.
//
// Run via the dedicated playwright.cross-engine.config.ts (no webServer —
// this spec never touches the Next.js app, it launches each browser engine
// directly and injects the bundled sim into a blank page). See that config
// file's header comment for why it's separate from playwright.config.ts.
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

const arcfireGolden = JSON.parse(readFileSync("src/game/titles/arcfire/determinism.golden.json", "utf8")) as {
  replay: unknown; hash: string;
};

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

for (const [name, engine] of engines) {
  test(`${name} reproduces the Arcfire golden hash ${arcfireGolden.hash}`, async () => {
    const js = await bundle();
    const browser = await engine.launch();
    try {
      const page = await browser.newPage();
      await page.addScriptTag({ content: js });
      const hash = await page.evaluate((replay) => window.runArcfireGolden(replay as never), arcfireGolden.replay);
      expect(hash, `${name} must reproduce the Arcfire golden hash`).toBe(arcfireGolden.hash);
    } finally {
      await browser.close();
    }
  });
}
```

- [ ] **Step 8: Run the cross-engine gate**

Run: `npm run test:e2e:cross-engine`

Expected:
- The Chromium and WebKit tests pass for both Circle TD (`5167b43d`) and Arcfire (`63222780`).
- On this Windows machine, both Firefox tests may fail to launch with `spawn UNKNOWN`. That is a pre-existing local environment issue: it fails identically for the existing Circle TD test, and CI runs Firefox.
- Any other failure, including a hash mismatch in any engine, is real. Stop and investigate.

- [ ] **Step 9: Final Plan 1 verification**

Run: `npm test`
Expected: all pass. That includes the purity guard, the engine boundary, Circle TD's golden `5167b43d`, and every Arcfire test.

Run: `npx tsc --noEmit`
Expected: exit 0.

Run: `git status --short src/game/test/determinism.golden.json`
Expected: no output (the Circle TD golden is untouched).

- [ ] **Step 10: Commit**

```bash
git add src/game/titles/arcfire/determinism.test.ts src/game/titles/arcfire/determinism.golden.json src/game/test/cross-engine/harness.entry.ts e2e/cross-engine-determinism.spec.ts
git status --short
```

Expected: only those four paths staged. `test-results/` is gitignored.

```bash
git commit -m "test(arcfire): golden determinism fixture + cross-engine gate" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Plan 1 done — handoff checks

- `git log --oneline master..HEAD` shows the spec and plan commits plus the 11 task commits. Nothing is pushed.
- Circle TD:
  - golden `5167b43d` is unchanged
  - its replay, verify and route tests are green
  - it renders and hit-tests identically on both backends (Task 3 smoke)
- Arcfire: golden `63222780` reproduces in Node, Chromium and WebKit (Firefox in CI).
- Picked up by later plans (spec §9):
  - **Plan 2 — weapons + AI:** the remaining primitives, the other 24 weapons, the AI tiers and worker, the balance harness, and the vs-AI replay that regenerates AI turns from a human-only log.
  - **Plan 3 — presentation:** renderers (via Task 3's `computeFit`), HUD, draft screen, flow screens, audio, resume, mobile.
  - **Plan 4 — leaderboard:**
    - route generalization (Arcfire's `TitleDef` binding + registry entry, per-slug score schema and daily seed)
    - migration 0002
    - daily challenge
    - board UI
