# Arcfire Plan 2B — AI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Arcfire's three AI tiers and the draft AI, vs-AI matches with human-only replay, a search-free local resume and the verifier-facing `scoreVsAi`, the Web Worker host and client, and the balance harness with its tier-separation sweep. Close Plan 2A's parked minors, and move no existing pin.

**Architecture:**
- **Every candidate is a full resolve of the real sim.** The AI copies the match into a reused scratch (`copyMatchInto`, 0.2 µs), fires the candidate with `resolveTurnPoints`, and values it as `points[me] − points[foe]`.
- **The search is ordered by a probe.** The probe is the weapon's own flight model (`ai/model.ts`), flown by the sim's own `muzzle` / `launchShell` / `stepShell` (`ai/probe.ts`), so there is no second integrator and nothing reads a Timeline.
- **Budgets are fixed counts of full resolves.** `tierBudget` = 300 / 1,500 / 4,000 sims, never a clock.
  - The search (`ai/search.ts`, `ai/plan.ts`) is RNG-free and never writes the match.
  - Only `ai/policy.ts` draws from the match RNG: exactly 1 value per AI pick and exactly 7 per AI turn, whatever the tier.
- **One interleaving rule** (`vsai.ts`) serves live play, replay, resume and verification: the AI acts whenever it is its move.
  - The Worker host (`src/game/runtime/arcfire/`) sequences `vsai.ts` and decides nothing.
  - The balance harness (`src/game/test/arcfire/`) plays AI-vs-AI matches on `worker_threads`.
- **Speed comes from three pin-neutral engine edits:** `copyMatchInto`, K12's quiet-path gating, and an exact quick-reject inside `stepShell`.

This plan adds no renderer, HUD, UI, audio or resume UI (Plan 3), and no route, migration, daily seed or board UI (Plan 4).

**Tech Stack:** TypeScript (strict), Vitest 4, esbuild (the bundled AI pins, timing, worker-bundle and sweep tests), Node `worker_threads` (the sweep), Playwright (the cross-engine config, with a real Web Worker), Next.js 16 (a build regression check only). The sim is integer / Q16.16 fixed point with the baked aim table, the mulberry32 match RNG and FNV-1a hashing.

**Spec:**
- `docs/superpowers/specs/2026-09-22-arcfire-design.md`: §1.3 turn contract, §1.4 threads, §2 rules, §3 sim model, §4.3 balance harness, §5 AI, §6.4/§6.5 flow and resume, §7 leaderboard, §8 testing, §9.1 the 2B hand-off.
- **Design addendum** (binding for 2B): `docs/superpowers/specs/2026-09-24-arcfire-plan2b-ai-design.md`, the final Plan 2B design, Revision 1, with the owner's decisions of 2026-09-24 (B1–B5 below).
  - It was validated on a prototype, and its code blocks are meant to be copied verbatim. Every code block below marked *design-verbatim* is mechanically copied from it.
  - Its `diff` blocks appear here as "replace / with" edits, one per hunk, cut from those diffs.
- **The Plan 2A addendum**, for engine context: `docs/superpowers/specs/2026-09-23-arcfire-plan2a-weapons-design.md` (the engine, the quiet path, K10/K12, its §11 hand-off to 2B).
- **The spec sync.** The spec already carries 2B's decisions and B1–B5: it was synced to the validated design and the owner decisions before execution. The Pre-flight step commits that sync together with the 2B addendum and this plan. No task edits the spec; Task 16 only confirms that nothing is left to sync.

## Global Constraints

- **Base.** Work on branch `worktree-games+arcfire`: `e77161d` (Plan 2A complete, not yet merged) plus the Pre-flight docs commit. Task 1 Step 1 checks it.
- **Sim purity.** Everything under `src/game/sim`, `src/game/titles/circle-td` and `src/game/titles/arcfire` is pure: integer / Q16.16 math and the seeded RNG only. That includes the new `src/game/titles/arcfire/ai/**`, `vsai.ts` and `verify.ts`.
  - `src/game/sim/purity.test.ts` scans every non-test `.ts` file in those roots, **including comments**.
  - Banned globals: `window`, `document`, `navigator`, `performance`, `new Date`, `Date.now`.
  - Banned math: `Math.random`, `Math.sin`, `cos`, `tan`, `atan`/`atan2`, `pow`, `exp`, `expm1`, `log`, `log2`, `log10`, `log1p`, `hypot`, `cbrt`, `asin`, `acos`, `sinh`, `cosh`, `tanh`, and the `**` operator.
  - Test files (`*.test.ts`) are exempt. `src/game/test/**` and `src/game/runtime/**` are outside the roots.
  - Never write a banned word in a sim file, even in prose. The AI files say "refine box", never the w-word.
- **No shared trig in Arcfire.** Arcfire never imports `src/game/sim/math/trig.ts` (the purity guard checks this). Directions come from `aimTable.ts` (`cosDeg`/`sinDeg`) only.
- **No BigInt literals** (the `tsconfig` targets ES2017). New sim code writes negations as `0 - x`.
- **Pins that must not move.** These stay byte-identical after every task:
  - the Circle TD golden `5167b43d` (`src/game/test/determinism.golden.json`; never regenerate it);
  - the Arcfire golden `389a1340`, scores `[31, 83]`, and the windless pin `8d7dc831`;
  - the 2A corpus `a7100140` (483 cases, 32 definition digests);
  - the full-roster golden `3f614265`, scores `[359, 448]`.
  - No task sets `UPDATE_ARCFIRE_GOLDEN` to `plan1`, `full` or `1`, and none sets `UPDATE_ARCFIRE_CORPUS`.
- **The new AI pins** are created once, in Task 10, and never move in 2B:
  - the AI corpus turn digest **`55df93ca`** (45 cases, power-independent) and draft digest **`c0d402d4`** (12 cases, reads `power`);
  - the vs-AI win golden **`be9db94d`**: seed 20260934, `STANDARD_SETTINGS`, Veteran, scores `[254, 169]`;
  - the vs-AI loss golden **`2097c8fc`**: seed 20260928, scores `[234, 329]`.
  - A value that differs from this plan means the code differs from this plan: stop and diff.
- **The budgets, enforced by counts or by the listed tests:**
  - sims per AI turn ≤ `tierBudget` = 300 / 1,500 / 4,000 (the search test, and every turn of the weekly sweep);
  - a single-shell `resolveTurn` ≤ 0.2 ms (2A's `perf.test.ts`, unchanged);
  - a cold daily verification < 5 s, with an Ace tripwire of a mean ≤ 1,500 ms (`ai.perf.test.ts`, times `ARCFIRE_PERF_MARGIN`);
  - the worker bundle < 64 KiB (`worker.bundle.test.ts`);
  - tier separation, weekly: Ace ≥ 85% against Rookie, ≥ 60% against Veteran, Veteran ≥ 70% against Rookie.
- **Update variables are set to exactly one value.**
  - 2B's AI modes (`ai.corpus.test.ts`): `UPDATE_ARCFIRE_AI=add` (new case ids only), `=draft` (the draft section only; refuses if a turn case moved), `=1` (both sections; needs `ARCFIRE_AI_EXPECT_MOVED=<n>`), and `UPDATE_ARCFIRE_GOLDEN=vsai` (the vs-AI goldens, and only `=vsai` re-pins them).
  - 2A's modes are unchanged: `UPDATE_ARCFIRE_GOLDEN=plan1|full|1`; `UPDATE_ARCFIRE_CORPUS=1` needs `ARCFIRE_CORPUS_EXPECT_MOVED=<n>`; `UPDATE_ARCFIRE_CORPUS=add` writes new keys only.
  - This plan uses exactly one update command: Task 10's creation of the two AI fixtures.
- **Roster order is a wire format.** `ROSTER` is append-only. 2B adds no weapon and changes no roster entry.
- **`power` stays the 2A placeholders.** No write-back in 2B (B5, ⚑ O9). `defDigest` excludes `power`, and Task 3 pins that for every roster entry, so a later write-back moves no 2A pin (only the AI draft section and the vs-AI goldens).
- **No wall clock in any decision.** The AI's budgets are counts. Only test code reads a clock: `ai.perf.test.ts`, and the sweep's injected `now`, which fills the informational `ShotRecord.ms`.
- **RNG only from the match RNG, in the documented order** (design §6.4; `hashMatch` folds `rng.state`):
  - an AI pick draws exactly 1 value before `applyPick`;
  - an AI turn draws exactly 7 after its search and before `applyTurn`: 1 choice, 3 angle noise, 3 power noise;
  - the search (probes, candidate resolves, threat estimates) draws nothing and never writes the match;
  - the wind draw of `beginTurn` is unchanged, and human commands draw nothing.
- **The runtime decides nothing.** `src/game/runtime/arcfire/**` (the worker host, protocol, entry and client) lives outside the purity roots and may use `self`. Every AI action it posts comes from `stepAi`. Nothing in 2B imports `client.ts`, so `lazy-boundary.test.ts`, the bundle budget and `npm run build`'s output are unchanged.
- **`ARCFIRE_SIM_VERSION` stays 1.** No leaderboard rows or saves exist yet; the owner freezes it at launch. After launch, any change to `ai/**`, `TIERS` or a `power` is a `simVersion` bump (design D23).
- **`src/game/sim/` and `src/game/titles/circle-td/` are untouched.**
- **Never run `next dev`.** Turbopack panics on the space in this repo's path. The build check is `npm run build`.
- **Git rules:**
  - Commit with the configured identity (Michael Wright <m.wright2@lafilm.edu>).
  - End every commit message with the trailer line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. The commit commands below pass it as the last `-m`.
  - **Each agent uses its own harness's trailer** (ruling R5). An executor whose harness names a different trailer uses that one in the last `-m`.
  - Never push. Never use `git stash`.
  - Keep git invocations simple: one command per line.
  - A commit message never puts an `=` directly before a letter or digit (the worktree guard refused one such message): it writes `NAME set to 1` instead.
- **Worktree guard.** The session's worktree guard refuses compound or computed commands. Run every command in this plan as written: one plain command per line, with no `&&` chains, no heredocs, and no `$(…)` or variables in arguments. If a command is refused, split it.
- **Status checks.** Every "Expected, exactly" `git status --short` check below also allows the line ` M docs/superpowers/plans/2026-09-24-arcfire-plan-2b.md` (this plan's ticked checkboxes). No task commits that file.
- **Transcribe verbatim.** The digests are the transcription check: a single changed constant, operator or tie-break moves one. Where a task gives a whole file, write exactly that file. Where it gives an edit, the quoted "replace" text occurs exactly once in the file.
- **Out of scope:**
  - Plan 3: renderers, HUD, UI, audio, the resume UI, the visible think time (⚑ O14), and verifying `new Worker(new URL(…))` inside `next build` (K10).
  - Plan 4: the route, the migration, the daily seed, the board UI, and the `TitleDef` binding that wraps `scoreVsAi`.
  - After 2B: the tuning pass (⚑ O11), any homing change (B2), and the `power` write-back with its declared AI re-pins (⚑ O9).

## Owner decisions B1–B5 (binding)

The owner settled the design's open questions (its §13.1, ⚑ O1–O19) on 2026-09-24. They are binding: the code below implements exactly these, and the pins depend on them. Changing one later is a data or one-rule change plus a declared AI re-pin, never a silent edit.

- **B1 — The daily challenge plays the spec Veteran** [⚑ O2].
  - The daily opponent is `DAILY_TIER = "veteran"`, with the spec's aim noise of ±2° / ±3 and exact-aim evaluation (`noiseAware: false`).
  - Loosening it (for example to ±3° / ±5, which a noise-free grid human beat 41 times in 60, against 25 for the spec Veteran) is a pre-launch playtest decision: one line in `TIERS.veteran` plus a declared AI re-pin. It is not part of 2B.
- **B2 — No homing change in 2B** [⚑ O12].
  - Seeker and Swarm stay at the spec rates (2° and 1° per step after the apex, no lock radius, no turn budget).
  - The first harness run finds Seeker never misses (50.0 points a shot, sd 0) and Swarm too strong (93.0, +15.9%). Both are handled in the post-2B tuning pass that the harness report drives.
- **B3 — The local resume blob holds both seats' commands** [⚑ O19, design D17].
  - The blob is `{ v, seed, settings, mode, opponent, log }`, with `log` holding both seats' commands in order. `resumeVsAi` re-applies it without a search, skipping each AI entry's fixed draws: 1.4–1.7 ms, against about 0.7 s to regenerate a Veteran log.
  - Leaderboard submissions stay human-only (`humanLog`), and the server regenerates every AI decision (`scoreVsAi`), so a tampered blob changes only the tamperer's local game.
  - This deviates from spec §6.5's "the resume blob is the human-only command format". The spec was updated before execution (the Pre-flight sync).
- **B4 — The Ace keeps the spec's 4,000-sim budget** [⚑ O15].
  - The budget is stay 3,000, plus 2 × 350 for moves, plus 300 for DIRT.
  - The worker searches during the human shot's playback: the host posts the human's event before the AI starts.
  - Plan 3 shows at least 700 ms of visible aiming before any AI shot (⚑ O14).
  - The heaviest measured Ace openings take 1.65–2.18 s at 4× CPU throttling; the owner playtests them on a real mid-range phone.
- **B5 — Every other owner item takes the design's stated default:**
  - O1: the Ace ranks aims by their exact expected value under its own noise (noise-aware).
  - O3: the noise is the literal "seeded sum of 3 uniform integers", with part half-ranges `⌊(bound + i) / 3⌋`.
  - O4–O6: the heuristics are kept. Veteran looks at moves while its best is < 25 and the Ace always; a move must gain ≥ 8. The DIRT rule is threat ≥ 60, a cut ≥ 20, placements 90 px in front and midway. The Ace saves a tier-3 weapon unless it beats the best other by ≥ 20%.
  - O7 / O8: the harness drafts at random (one match-RNG draw per pick) and judges net points per shot against the tier bands.
  - O9: no `power` write-back in 2B.
  - O10: the allow-list is seeded with the first run's failures (Task 15). The weekly sweep never blocks a merge, and the launch needs the list empty.
  - O11: the tuning pass comes after 2B.
  - O13: DIRT is accepted as it is.
  - O16: the human always plays player 0 (left, red) against the AI (player 1, blue).
  - O17: Rookie picks uniformly among its top 4, zero-value weapons included.
  - O18: the per-turn budgets are caps, spent as fixed per-weapon shares (`⌊stay / max(10, hand)⌋`).

## How this plan was validated

**The design.** The design addendum was validated on a prototype rebuilt mechanically from its own blocks (its §1 and Appendix C). `tsc` and the purity guard were clean, and every staged checkpoint was green. The four AI pins reproduced in Node, Chromium and WebKit; the tier separation and the harness table in Node.

**This plan.** It was dry-run end to end in two scratch clones of this branch at `e77161d`, each with the worktree's `node_modules` linked in.
- **The design, applied task by task.** The first clone received the design's own blocks in this plan's task order: its diffs through `git apply`, its files written whole.
  - Each task's test went in first and was run, to record the failures quoted below; then the code went in and the task's checks ran.
  - The checks were the Arcfire gate, `tsc` and `npm test` after every task; the cross-engine gate at Tasks 1, 2, 3 and 13; `npm run build` and the bundle budget at Task 12; and the full sweep, the four shards and the merge at Tasks 14 and 15.
  - Task 2's mutation check was run there.
- **This document's own text, executed mechanically.** The second clone received this plan itself, in document order: every whole-file block and every "replace / with" edit, with each edit's "replace" text matching exactly once.
  - Every command ran as written: the Pre-flight's status check and commit, each task's red and green runs, the fixture creation, the shards and the merge, the build, and every commit command.
  - Each task reproduced the counts, messages and pins quoted here.
  - The resulting tree equals the first clone's, file for file. Only the cost table's `ms` column in Task 15's report differs, and the Pre-flight's documents, which the dry run could only stand in for.
- **Results.**
  - All four AI pins reproduced, in Node and, at Task 13, in Chromium and WebKit, including the real-Worker smoke.
  - The five existing pins never moved.
  - The tier separation and the harness's 32-row table equal the design's §9.5, cell for cell.
  - At the end: `npm test` showed 512 passed and 11 skipped (the design's figure), the Arcfire gate 259 passed and 1 skipped, and `tsc` was clean. The review fixes below add one test (Task 5's termination test), so the counts in this document are 513 and 260. The build and the bundle budget are unchanged.
- **Firefox** cannot launch on this Windows machine (`spawn UNKNOWN`), so its cross-engine run is CI's.
- **The worktree guard** refused one draft commit message, whose body had an `=` directly before a word. Every commit message below avoids that pattern.

**The review fixes.** A review of this plan found one real defect and a set of smaller ones, fixed here on top of the design's blocks. Each changed block says so, and "Where this plan fills gaps in the design" lists them.
- **The defect:** the probe re-spawned at every apex, so a weapon the validator accepts (an apex split launching `up` at ≥ 100% into a child that is itself an apex stage) made `landingGrid` loop forever. That would hang the worker, the verifier and the sweep. The probe now follows an apex split once (Task 5), and a new probe test fires that weapon. No roster weapon reaches a second apex, so no pin moves.
- **The smaller fixes** are listed in "Where this plan fills gaps in the design". They add no other test.
- **Validated on a rebuilt prototype.** A throwaway prototype (`.superpowers/plan2b/fix-proto/`, from `git archive e77161d`, deleted afterwards) received this document's blocks mechanically: every whole-file block and every "replace / with" edit, in document order, each "replace" text matching exactly once.
  - `tsc` was clean after Task 5 and at the end. The Arcfire gate gave 23 files and 230 tests after Task 5, and 32 + 1 skipped files and 260 + 1 skipped tests at the end; `npm test` gave 513 passed and 11 skipped; the purity guard was green.
  - Task 10's command recreated the four AI pins: `55df93ca` / `c0d402d4` (45 / 12 cases), `be9db94d` [254, 169] and `2097c8fc` [234, 329]. The five existing pins did not move, and `src/game/sim` and `src/game/titles/circle-td` were identical to the base.
  - The full sweep's tier line and 32-row table equalled Task 15's text line for line, and so did the cost table's count columns. With the allow-list seeded, the merge judged `FAIL (0)` and `ACK (9)`.
  - The local cross-engine gate passed (4 tests), with the real-Worker smoke in Chromium and WebKit. The worker bundle is 40.1 KiB (41,012 bytes).
  - **Mutation checks:**
    - a scratch copy of the design's `flyShell`, made to throw after 10,000 re-spawns, threw on the new probe test's weapon;
    - moving the child's landing by 1 px failed the new test (`[202, 227]` against `[203, 227]`), so the test checks where the child lands, not only that it ends;
    - with the design's `start`, the new host assertions failed (`error` where `bad_log` is expected).
  - `npm run build` was not re-run: no fix touches code the app imports.

### Pin ledger

| After | 2A pins | AI corpus turn / draft | vs-AI win / loss | Arcfire gate (files, tests) | `npm test` (files, tests) |
|---|---|---|---|---|---|
| `e77161d` (base) | `389a1340` [31, 83], `8d7dc831`, `a7100140` (483), `3f614265` [359, 448]; Circle TD `5167b43d` | — | — | 18, 212 | 58 + 1 skipped, 465 + 10 skipped |
| Pre-flight | unchanged | — | — | 18, 212 | 58 + 1, 465 + 10 |
| Task 1 | unchanged | — | — | 19, 214 | 59 + 1, 467 + 10 |
| Task 2 | unchanged | — | — | 20, 215 | 60 + 1, 468 + 10 |
| Task 3 | unchanged | — | — | 21, 222 | 61 + 1, 475 + 10 |
| Task 4 | unchanged | — | — | 22, 227 | 62 + 1, 480 + 10 |
| Task 5 | unchanged | — | — | 23, 230 | 63 + 1, 483 + 10 |
| Task 6 | unchanged | — | — | 24, 234 | 64 + 1, 487 + 10 |
| Task 7 | unchanged | — | — | 25, 236 | 65 + 1, 489 + 10 |
| Task 8 | unchanged | — | — | 26, 242 | 66 + 1, 495 + 10 |
| Task 9 | unchanged | — | — | 27, 244 | 67 + 1, 497 + 10 |
| Task 10 | unchanged | **`55df93ca`** (45) / **`c0d402d4`** (12) | **`be9db94d`** [254, 169] / **`2097c8fc`** [234, 329] | 28, 247 | 68 + 1, 500 + 10 |
| Task 11 | unchanged | unchanged | unchanged | 29, 248 | 69 + 1, 501 + 10 |
| Task 12 | unchanged | unchanged | unchanged | 31, 253 | 71 + 1, 506 + 10 |
| Task 13 | unchanged; also in Chromium and WebKit | unchanged; also in Chromium and WebKit | unchanged; also in Chromium and WebKit, and in a real Worker | 31, 253 | 71 + 1, 506 + 10 |
| Task 14 | unchanged | unchanged | unchanged | 32 + 1 skipped, 260 + 1 skipped | 72 + 2, 513 + 11 |
| Tasks 15, 16 | unchanged | unchanged | unchanged | 32 + 1, 260 + 1 | 72 + 2, 513 + 11 |

- The Arcfire gate is `npx vitest run src/game/titles/arcfire src/game/test/arcfire src/game/runtime/arcfire src/game/sim/purity.test.ts`. The skipped file from Task 14 on is the gated sweep, `arcfire.sweep.test.ts`, which runs only under `BALANCE_SWEEP=1`.
- The budgets, where they land:
  - Task 2: 2A's `perf.test.ts` prints Pulse at about 0.02 ms, against the 0.2 ms budget.
  - Task 6: `sims ≤ tierBudget` for every tier.
  - Task 11: the cold daily verification, 0.55–0.57 s in the dry runs and the review fixes' prototype, against 5 s; the Ace mean, 186–237 ms, against the 1,500 ms tripwire.
  - Task 12: the worker bundle, 40.1 KiB against 64 KiB (39.9 KiB before the review fixes to `host.ts` and the probe).
  - Tasks 14 and 15: tier separation 99.5 / 93.5 / 85.5% against 85 / 60 / 70%, and every one of the sweep's 20,004 decisions within its tier's budget.
- The four AI pins are the design's own transcription checks (its §1 and Appendix B).

## File Structure

```
src/game/titles/arcfire/                        pure: under the purity guard
  state.ts            + copyMatchInto(dst, src)                                         T1
  match.ts            + toAct(m)                                                        T1
  replay.ts           + applyCommand(m, entry), CommandResult; replayMatch uses it      T1
  terrain.ts          K12: quiet settle returns the live heights; a reused capsule table T1
  resolve.ts          the quiet Timeline's contract, documented (comment only)          T1
  weapons/primitives.ts  K12: walks count columns, paths/children only when recording;
                      fanOffset never returns -0                                        T1
  ballistics.ts       the exact quick-reject sweep (clearStep); endStep shared with endBounce  T2
  weapons/validate.ts no descent into a forbidden delay entry; a (stage, depth) memo    T3
  corpus.test.ts      + the power-independence assertion (and one message)             T3
  ai/tiers.ts         TierSpec, TIERS, tierBudget, the §5 constants                     T4
  ai/noise.ts         drawNoise, noiseKernel, kernelTotal                               T4
  ai/model.ts         probeModelOf, dealsDamage: the AI's only weapon knowledge         T4
  ai/probe.ts         ProbeBoard, Grid, landingGrid (the weapon's own flight)           T5
  ai/search.ts        one weapon's search: SearchCtx, scratch, centres, searchWeapon    T6
  ai/plan.ts          planTurn / planWith (RNG-free), chooseOffence, byValue            T6
  ai/policy.ts        aiPick, aiTurn: the only RNG draws; AI_PICK_DRAWS / AI_TURN_DRAWS T7
  vsai.ts             HUMAN, AI, aiToAct, stepAi, advanceAi, replayVsAi, resumeVsAi     T8
  verify.ts           scoreVsAi, isArcfireCommand, DAILY_TIER                           T9
  ai.corpus.test.ts, ai.corpus.golden.json, determinism.vsai.golden.json               T10
  ai.perf.test.ts                                                                       T11
  balance.allow.json  acknowledged harness failures: {} (T14), the 9 first-run ids (T15)
  *.test.ts, ai/*.test.ts   one new test file per task, whole, never edited later
src/game/runtime/arcfire/                       runtime: outside the purity roots; decides nothing
  protocol.ts         HostRequest, HostEvent, Snapshot, Opponent                        T12
  host.ts             createArcfireHost(post), snapshot(m)                              T12
  worker.ts           the Web Worker entry                                              T12
  client.ts           ArcfireWorkerClient (Plan 3's handle), WorkerLike                 T12
  host.test.ts, worker.bundle.test.ts                                                   T12
src/game/test/arcfire/                          test support: outside the purity roots
  fixtures.ts         + corpusState, battleBoards, rngAfter                             T1
  vsaiGolden.ts       the goldens' scripted human; playVsAi                             T8
  aiCorpus.ts         the AI corpus (Node + browsers)                                   T10
  ai.entry.ts         bundled by the AI pins and timing tests                           T10
  aiMatch.ts          one AI-vs-AI match, recorded                                      T14
  sweep.entry.ts, sweep.ts   the bundled worker_threads sweep runner, shards           T14
  balance.ts          aggregation, verdicts, report, costs, powers, the roster write-back  T14
  balance.test.ts     the harness's pure half, always on                                T14
  arcfire.sweep.test.ts  BALANCE_SWEEP=1: tier separation + the harness                 T14
src/game/test/cross-engine/harness.entry.ts     + runArcfireAiCorpus(Cases), runArcfireVsAi  T13
e2e/cross-engine-determinism.spec.ts            + 2 PINS rows + a Worker smoke per engine    T13
.github/workflows/balance-sweep.yml             + the Arcfire shards and the merge job       T14
docs/superpowers/2026-09-24-arcfire-balance-first-run.md   the first sweep's report          T15
docs/superpowers/specs/2026-09-23-arcfire-plan2a-weapons-design.md   §7.3 and §11 notes    T16
docs/superpowers/specs/2026-09-22-arcfire-design.md   the 2B sync, committed with this plan (Pre-flight)
docs/superpowers/specs/2026-09-24-arcfire-plan2b-ai-design.md   the 2B addendum (Pre-flight)
```

## Commands

- **One test file or directory:** `npx vitest run <paths>`
- **The Arcfire gate** (the end of every task): `npx vitest run src/game/titles/arcfire src/game/test/arcfire src/game/runtime/arcfire src/game/sim/purity.test.ts`
  - It is the design's Arcfire suite: `titles/arcfire`, `test/arcfire`, `runtime/arcfire` and the purity guard.
  - Before Task 12, `src/game/runtime/arcfire` matches no file, and Vitest runs the rest.
- **Full suite:** `npm test`
- **Types:** `npx tsc --noEmit` (success = exit 0, no output)
- **Cross-engine gate (local):** `npm run test:e2e:cross-engine -- --grep-invert firefox`
  - Green is **exit 0**: the Chromium and WebKit tests pass.
  - Firefox cannot launch on this Windows machine (`spawn UNKNOWN`), so the local gate leaves it out rather than expecting a known failure. CI's `browser-smokes` job runs all three engines.
- **The AI fixtures, created once** (Task 10): `UPDATE_ARCFIRE_AI=1 ARCFIRE_AI_EXPECT_MOVED=0 UPDATE_ARCFIRE_GOLDEN=vsai npx vitest run src/game/titles/arcfire/ai.corpus.test.ts`
- **The weekly sweep, locally:** `BALANCE_SWEEP=1 npx vitest run src/game/test/arcfire/arcfire.sweep.test.ts`
  - It takes about 75 s on the dev machine's 64 threads; `ARCFIRE_SWEEP_THREADS=<n>` caps the threads.
  - `ARCFIRE_SWEEP_SHARD=k/4` plays one CI shard, and `ARCFIRE_SWEEP_MERGE=test-results/arcfire-sweep` judges the saved shard files.
- **Shell:** run every command in Git Bash (the Bash tool), exactly as written. If PowerShell must be used, give each `NAME=value <command>` as separate commands, never one compound line (the worktree guard refuses those): `$env:NAME = "value"`, then `<command>`, then `Remove-Item Env:NAME`.

## Where this plan fills gaps in the design

The design fixes every behaviour, file and pin. This plan adds only what turning it into ordered, green, guard-friendly tasks required. Every item was validated in the dry run.

- **Diffs as edits.** The design gives its changes to existing files as `diff -u` blocks against `e77161d`. This plan turns each hunk into one "In `<file>`, replace / with" edit, cut mechanically from the diff. Where a hunk's context is not unique in the file, the edit carries more of the file's own lines above it. Applied in order, they reproduce the design's files exactly.
- **Where the red comes from, when the code already exists or is an optimization:**
  - **Task 2.** The quick-reject reference test is green before the change, because both of its calls take today's per-sample path. Its red phase is the type check (`stepShell` gains an argument), and a mutation check that the design prescribes: drop the hitbox test, see it fail, restore it.
  - **Task 11.** The verification-budget test checks code that already exists, so it has no red phase (like 2A's `perf.test.ts`).
  - **Task 13.** The two new pin rows fail first because the harness functions do not exist yet. The Worker smoke passes at once, because Task 12's worker already exists.
- **One wording nit moved to Task 3.** The design's §11 lists a message edit in `corpus.test.ts` ("create it once with `UPDATE_ARCFIRE_CORPUS=1`" gains `ARCFIRE_CORPUS_EXPECT_MOVED=0`) under its docs task. Task 3 already edits `corpus.test.ts`, so the nit lands there, and no later task edits that file.
- **The cross-engine additions (Task 13)** are the design's §10.8 snippets, placed exactly:
  - the three `Window` declarations it gives as comments become real declarations inside `declare global`;
  - the harness and spec header comments gain one clause each for the new pins.
- **The first sweep's report (Task 15).**
  - The design names it `docs/superpowers/<the run's date>-arcfire-balance-first-run.md`. This plan fixes the name to `2026-09-24-arcfire-balance-first-run.md`, the date the numbers were first reproduced, so every command is literal.
  - The file is the test's `report.md` under a short header written here.
  - The allow-list's nine reasons are written here, from the report's verdicts and the design's ⚑ O11.
- **The docs task (Task 16)** cannot do everything the design's T16 lists:
  - The spec edits happened before execution: the Pre-flight commit holds them.
  - Recording the Node 22 performance baseline in spec §9.1 needs `ai.perf.test.ts`'s first CI run, and this plan never pushes, so it moves to the hand-off list.
  - What remains is the Plan 2A addendum's §7.3 (the re-pin commands) and §11 (K10/K12 and the minors "done in 2B", with K12's recorded deviation).
- **The CI path is exercised locally (Task 14):** four `ARCFIRE_SWEEP_SHARD=k/4` runs and one `ARCFIRE_SWEEP_MERGE` run reproduce the full run's verdict. Vitest's `--exclude`, which the workflow's Circle TD job uses, was checked to skip the Arcfire sweep.
- **The gate includes `src/game/test/arcfire` and `src/game/runtime/arcfire`,** which 2A's gate did not, because 2B puts tests there.
- **Review fixes on top of the design's blocks.** Each block that differs from the design says so. None moves a pin.
  - Task 1: `copyInto.test.ts` compares every `MatchState` key by value after the copy (the design's `Object.keys` comparison could not fail). `terrain.ts` freezes the quiet settle's shared `falls`, and `resolve.ts` documents that a quiet Timeline is for `.points` only (a comment-only edit).
  - Task 5: `probe.ts` follows an apex split at most once (the design's probe re-spawned at every apex and could loop forever on a legal weapon), and `probe.test.ts` gains a test that fires such a weapon.
  - Task 10: `ai.entry.ts`'s `turnTimes` returns each plain state's name with its time, so Task 11's `ai.perf.test.ts` can print the openings (full hands) apart from the states after 9 shots.
  - Task 12: `host.ts` builds a started match before it replaces the current one, and a start with an unknown opponent or settings that `createMatch` rejects is `rejected{bad_log}` (the design posted `error` and kept the old match with the new opponent). `host.test.ts` covers that and `not_your_move`, and `worker.bundle.test.ts` has a 60 s timeout like the other esbuild tests.

---

# Pre-flight — commit this plan, the 2B addendum and the synced spec

The controller runs this once, before Task 1, in the worktree that holds this plan, the 2B addendum and the synced spec. It follows the precedent of Plans 1 and 2A (the plan committed together with a pre-execution spec sync). **Skip it if already done:** if `git log --oneline -1` already shows the docs commit below, go to Task 1.

- [ ] **Step P1: Check the starting state**

Run: `git log --oneline -1`
Expected: `e77161d docs(arcfire): sync spec + design addendum to the Plan 2A final-review fixes`

If HEAD is an older commit of this branch instead (a worktree created from a stale base; the dry run's was created at `2f9e6ba`), fast-forward it with `git merge --ff-only e77161d` and run the check again. If HEAD is anything else, stop.

Run: `git status --short`
Expected, exactly these three lines:

```
 M docs/superpowers/specs/2026-09-22-arcfire-design.md
?? docs/superpowers/plans/2026-09-24-arcfire-plan-2b.md
?? docs/superpowers/specs/2026-09-24-arcfire-plan2b-ai-design.md
```

The spec change is the Plan 2B sync. It already records the design's readings and B1–B5. That includes the `ai/` module layout, `replayVsAi`, the both-seats resume blob (B3) and the harness's random draft, allow-list and local-only write-back. It also includes the §5 readings (a sim is a full resolve; the budget is a cap spent in fixed per-weapon shares), per-weapon probe models, the AI pins and their update commands, and the 2B hand-offs. It also carries this plan's review fixes: the probe follows an apex split once, and a bad start is `bad_log`. No later step edits it.

The 2B addendum carries a status note under its Status line: the owner decisions settle ⚑ O1–O19, and the plan's review fixes govern where its blocks differ from the addendum's.

- [ ] **Step P2: Commit the plan, the 2B addendum and the spec together**

```bash
git add docs/superpowers/plans/2026-09-24-arcfire-plan-2b.md docs/superpowers/specs/2026-09-22-arcfire-design.md docs/superpowers/specs/2026-09-24-arcfire-plan2b-ai-design.md
git commit -m "docs(arcfire): Plan 2B — AI; sync spec to the validated design and owner decisions" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Run: `git status --short`
Expected: no output.

---

# Part A — The engine, pin-neutral (Tasks 1–3)

### Task 1: Engine I — `copyMatchInto`, `toAct`, `applyCommand`, K12 and no −0 fan offset

**Files:**
- Modify: `src/game/test/arcfire/fixtures.ts` (2 edits: `corpusState`, `battleBoards`, `rngAfter`)
- Create: `src/game/titles/arcfire/copyInto.test.ts` (design §10.1, with one review fix: every key compared by value)
- Modify: `src/game/titles/arcfire/state.ts` (1 edit, §7.2: `copyMatchInto`)
- Modify: `src/game/titles/arcfire/weapons/primitives.ts` (4 edits, §7.3: `fanOffset`, K12)
- Modify: `src/game/titles/arcfire/terrain.ts` (4 edits, §7.3: K12, with the shared `falls` frozen, a review fix)
- Modify: `src/game/titles/arcfire/resolve.ts` (1 edit, a review fix: the quiet Timeline's contract, comments only)
- Modify: `src/game/titles/arcfire/match.ts` (1 edit, §6.2: `toAct`)
- Modify: `src/game/titles/arcfire/replay.ts` (3 edits, §6.2: `applyCommand`)

**Interfaces:**
- Consumes (2A): `createMatch`, `applyPick`, `applyTurn`, `TurnCommand` (`match.ts`); `MatchState`, `MatchSettings`, `STANDARD_SETTINGS`, `cloneMatch` (`state.ts`); `resolveTurn`, `resolveTurnPoints` (`resolve.ts`); `hashMatch`; `spansFromHeight`; `SUDDEN_DEATH_WEAPON`; `nextU32` (`@/game/sim/math/rng`); `runCorpus` (`test/arcfire/corpus.ts`); `flatBattle` (`test/arcfire/fixtures.ts`); `pickerAt(firstPicker: number, picksMade: number): number` (`draft.ts`, which `match.ts` already imports).
- Produces:
  - `copyMatchInto(dst: MatchState, src: MatchState): void` (`state.ts`). It copies every field in place, allocates nothing, shares no array with `src`, and leaves `dst.terrain.spans` stale until the next resolve or `spansFromHeight`.
  - `toAct(m: MatchState): number` (`match.ts`): the picker in the draft, the shooter after it, −1 once over.
  - `type CommandResult = { ok: true; timeline: Timeline | null } | { ok: false }` and `applyCommand(m: MatchState, entry: unknown): CommandResult` (`replay.ts`). It never throws; a malformed entry changes nothing. `replayMatch` now uses it.
  - `settle(t, false)` returns the live heightfield and a shared, frozen empty `falls`, so a quiet Timeline (`resolveWeapon(…, false)`, `resolveTurnPoints`) is for `.points` only, as `resolve.ts` now documents. `fanOffset` never returns −0. The walk, roll, burn and split paths are built only when recording.
  - In `src/game/test/arcfire/fixtures.ts`:
    - `corpusState(seed: number, shots: number): MatchState`: a `STANDARD_SETTINGS` match after the lowest-free-slot draft, then fixed shots;
    - `battleBoards(): MatchState[]`: the AI units' 8 boards;
    - `rngAfter(state: number, n: number): number`: the RNG state after `n` more draws.

**Why:** the AI resolves thousands of candidates per turn. `copyMatchInto` replaces a 33 µs `cloneMatch` per candidate with a 0.2 µs copy into a reused scratch, and K12 stops the quiet path from building Timeline-only arrays. `toAct` and `applyCommand` name "whose move" and "apply one log entry, never throwing" once, for `vsai.ts` and the host. All of it is inert, and the goldens and the parity test prove it. `corpusState` lands here, before any AI module exists, because the engine tests, the AI units and the AI corpus all use it.

- [ ] **Step 1: Confirm the base and that it is green**

Run: `git log --oneline -2`
Expected: HEAD is the Pre-flight commit, `docs(arcfire): Plan 2B — AI; sync spec to the validated design and owner decisions`, directly above `e77161d docs(arcfire): sync spec + design addendum to the Plan 2A final-review fixes`.

Run: `git status --short`
Expected: no output. The one line allowed is ` M docs/superpowers/plans/2026-09-24-arcfire-plan-2b.md`, if you tick this plan's checkboxes as you go; leave that file out of every task commit below. If the spec shows as modified, or HEAD is `e77161d` itself, the Pre-flight step has not run: stop and ask the controller. If HEAD is older still, the worktree was created from a stale base: stop and ask the controller.

Run: `npx vitest run src/game/titles/arcfire src/game/test/arcfire src/game/runtime/arcfire src/game/sim/purity.test.ts`
Expected: PASS: 18 files, 212 tests.

- [ ] **Step 2: Extend the shared test boards** (design §10.1's `fixtures.ts` diff, as 2 edits)

**Edit 1 of 2.** In `src/game/test/arcfire/fixtures.ts`, replace:

```ts
// Shared boards for the Arcfire weapon tests (test-only; outside the sim
// purity roots). flatBattle() is Plan 1's resolve.test.ts board: battle
// phase, flat ground at y = 400, player 0 to shoot, no wind, rosterSize 8.
import { createMatch } from "@/game/titles/arcfire/match";
import { spansFromHeight } from "@/game/titles/arcfire/terrain";
import type { MatchSettings, MatchState } from "@/game/titles/arcfire/state";

const SMALL: MatchSettings = { weaponsEach: 3, poolSize: 8, wind: false, guaranteeTags: [], rosterSize: 8 };

```

with:

```ts
// Shared boards for the Arcfire weapon tests (test-only; outside the sim
// purity roots). flatBattle() is Plan 1's resolve.test.ts board: battle
// phase, flat ground at y = 400, player 0 to shoot, no wind, rosterSize 8.
// corpusState() is a real STANDARD_SETTINGS match with no AI in it: the
// Plan 2B engine tests, the AI units and the AI corpus share it (so it lands
// with the first 2B task, before any AI module exists).
import { nextU32 } from "@/game/sim/math/rng";
import { applyPick, applyTurn, createMatch } from "@/game/titles/arcfire/match";
import { spansFromHeight } from "@/game/titles/arcfire/terrain";
import { SUDDEN_DEATH_WEAPON } from "@/game/titles/arcfire/constants";
import { STANDARD_SETTINGS, type MatchSettings, type MatchState } from "@/game/titles/arcfire/state";

const SMALL: MatchSettings = { weaponsEach: 3, poolSize: 8, wind: false, guaranteeTags: [], rosterSize: 8 };

```

**Edit 2 of 2.** In `src/game/test/arcfire/fixtures.ts`, replace:

```ts
  spansFromHeight(m.terrain);
  return m;
}
```

with:

```ts
  spansFromHeight(m.terrain);
  return m;
}

/** A STANDARD_SETTINGS match after the lowest-free-slot draft (never `power`), then `shots` fixed shots (the first weapon in hand at 50 or 130, power 65). */
export function corpusState(seed: number, shots: number): MatchState {
  const m = createMatch(seed, STANDARD_SETTINGS);
  while (m.phase === "draft") applyPick(m, m.poolOwner.findIndex((o) => o === -1));
  for (let i = 0; i < shots && m.phase !== "over"; i++) {
    const p = m.shooter;
    applyTurn(m, { move: 0, w: m.phase === "suddenDeath" ? SUDDEN_DEATH_WEAPON : m.hands[p][0], angle: p === 0 ? 50 : 130, power: 65 });
  }
  return m;
}

/** The AI units' 8 battle boards: corpusState 11/0 and 23/9, each with either player to shoot, windless and with wind 40. */
export function battleBoards(): MatchState[] {
  const out: MatchState[] = [];
  for (const [seed, shots] of [[11, 0], [23, 9]]) {
    for (const shooter of [0, 1]) {
      for (const wind of [0, 40]) {
        const m = corpusState(seed, shots);
        m.phase = "battle";
        m.shooter = shooter;
        m.wind = wind;
        out.push(m);
      }
    }
  }
  return out;
}

/** The RNG state after n more draws from `state`: what a decision that draws n values must leave behind. */
export function rngAfter(state: number, n: number): number {
  const r = { state };
  for (let i = 0; i < n; i++) nextU32(r);
  return r.state;
}
```

- [ ] **Step 3: Write the failing test**

Create `src/game/titles/arcfire/copyInto.test.ts` with (design §10.1, verbatim except one review fix: the design's `Object.keys(other)` against `Object.keys(s)` comparison could never fail, since `copyMatchInto` only assigns existing properties; the loop that replaces it compares every field by value, so a new `MatchState` field that `copyMatchInto` misses keeps another match's value and fails):

```ts
// src/game/titles/arcfire/copyInto.test.ts — Plan 2B T1: copyMatchInto, and no -0 shell angle (both pin-neutral)
import { describe, it, expect } from "vitest";
import { createMatch } from "./match";
import { STANDARD_SETTINGS, cloneMatch, copyMatchInto, type MatchState } from "./state";
import { hashMatch } from "./hash";
import { resolveTurn, resolveTurnPoints } from "./resolve";
import { ROSTER } from "./weapons/roster";
import { fanOffset } from "./weapons/primitives";
import { runCorpus } from "@/game/test/arcfire/corpus";
import { corpusState, flatBattle } from "@/game/test/arcfire/fixtures";

function sweepBoards(): MatchState[] {
  const hills = (shooter: number, wind: number): MatchState => {
    const m = corpusState(20260922, 0);
    m.shooter = shooter;
    m.wind = wind;
    return m;
  };
  return [hills(0, 0), hills(0, 40), hills(1, -40), corpusState(23, 9), flatBattle()];
}

/** Each column's live spans: [count, top0, bottom0, ...]. */
function liveSpans(m: MatchState): number[] {
  const out: number[] = [];
  for (let x = 0; x < 1200; x++) {
    const n = m.terrain.spanCount[x];
    out.push(n);
    for (let i = 0; i < 2 * n; i++) out.push(m.terrain.spans[x * 16 + i]);
  }
  return out;
}

describe("copyMatchInto", () => {
  it("copies every field, shares no array, and resolves exactly like a clone", () => {
    const states = [createMatch(5, STANDARD_SETTINGS), corpusState(11, 0), corpusState(23, 9), corpusState(37, 20)];
    const other = createMatch(99, { ...STANDARD_SETTINGS, poolSize: 22 }); // another pool length: poolOwner is reallocated
    for (const s of states) {
      copyMatchInto(other, s);
      expect(hashMatch(other)).toBe(hashMatch(s));
      for (const k of Object.keys(s) as (keyof MatchState)[]) { // every field by value: a new field fails until it is copied
        if (k !== "terrain") expect(other[k], k).toEqual(s[k]);
      }
      expect(other.terrain.height).toEqual(s.terrain.height); // the spans are scratch until the next resolve
      expect([other.pool, other.hands, Array.from(other.poolOwner), Array.from(other.scores)]).toEqual([s.pool, s.hands, Array.from(s.poolOwner), Array.from(s.scores)]);
      other.hands[0].push(99);
      other.scores[0] += 1;
      other.terrain.height[0] += 1;
      expect(hashMatch(other)).not.toBe(hashMatch(s)); // nothing shared with the source
    }
    const AIMS: [number, number][] = [[0, 100], [35, 70], [45, 60], [65, 95], [90, 100], [115, 70], [135, 60], [180, 100]];
    const scratch = cloneMatch(states[0]);
    for (const b of sweepBoards()) {
      for (let w = 0; w < ROSTER.length; w++) {
        for (const [angle, power] of AIMS) {
          const input = { move: 0 as const, weapon: w, angle, power };
          const loud = cloneMatch(b);
          const tl = resolveTurn(loud, input);
          copyMatchInto(scratch, b);
          expect(resolveTurnPoints(scratch, input)).toEqual(tl.points);
          expect(hashMatch(scratch)).toBe(hashMatch(loud));
          expect(liveSpans(scratch)).toEqual(liveSpans(loud)); // the slots past spanCount are scratch
        }
      }
    }
  }, 120_000);
});

describe("Timeline shell angles", () => {
  it("never records a -0 shell angle", () => {
    for (let i = 0; i < 6; i++) expect(Object.is(fanOffset(i, 6, 0), -0)).toBe(false);
    let angles = 0;
    runCorpus((_c, tl) => {
      for (const s of tl.shells) {
        angles++;
        expect(Object.is(s.angle, -0)).toBe(false);
      }
    });
    expect(angles).toBeGreaterThan(900);
  }, 60_000);
});
```

- [ ] **Step 4: Run it to verify it fails**

Run: `npx vitest run src/game/titles/arcfire/copyInto.test.ts`
Expected: FAIL, exactly 2 tests:
- `copyMatchInto > copies every field, shares no array, and resolves exactly like a clone`: `TypeError: copyMatchInto is not a function`
- `Timeline shell angles > never records a -0 shell angle`: `AssertionError: expected true to be false // Object.is equality` (today's `fanOffset(i, 6, 0)` is −0 for i < 3)

- [ ] **Step 5: Add `copyMatchInto`** (design §7.2, verbatim)

**Edit 1 of 1.** In `src/game/titles/arcfire/state.ts`, replace:

```ts
    scores: m.scores.slice(),
  };
}
```

with:

```ts
    scores: m.scores.slice(),
  };
}

/**
 * Copy every field of `src` into `dst` in place, allocating nothing (the AI's
 * per-candidate reset: one scratch match reused for thousands of resolves).
 * The in-shot spans are NOT copied: dst.terrain.spans / spanCount stay stale
 * until spansFromHeight runs, and resolveWeapon runs it before anything reads
 * them. So dst is a valid argument to resolveTurn / resolveTurnPoints /
 * resolveWeapon and to hashMatch, but not to an isSolid reader before a
 * resolve. dst must come from createMatch or cloneMatch; it never shares an
 * array with src (a poolOwner of another length is reallocated).
 */
export function copyMatchInto(dst: MatchState, src: MatchState): void {
  dst.settings = src.settings;
  dst.rng.state = src.rng.state;
  dst.phase = src.phase;
  dst.terrain.height.set(src.terrain.height);
  dst.tankX[0] = src.tankX[0];
  dst.tankX[1] = src.tankX[1];
  dst.movesLeft[0] = src.movesLeft[0];
  dst.movesLeft[1] = src.movesLeft[1];
  copyInts(dst.pool, src.pool);
  if (dst.poolOwner.length !== src.poolOwner.length) dst.poolOwner = new Int32Array(src.poolOwner.length);
  dst.poolOwner.set(src.poolOwner);
  dst.firstPicker = src.firstPicker;
  dst.picksMade = src.picksMade;
  copyInts(dst.hands[0], src.hands[0]);
  copyInts(dst.hands[1], src.hands[1]);
  dst.shooter = src.shooter;
  dst.shotsFired = src.shotsFired;
  dst.wind = src.wind;
  dst.scores[0] = src.scores[0];
  dst.scores[1] = src.scores[1];
  dst.winner = src.winner;
}

function copyInts(dst: number[], src: readonly number[]): void {
  dst.length = src.length;
  for (let i = 0; i < src.length; i++) dst[i] = src[i];
}
```

- [ ] **Step 6: `fanOffset` without −0, and K12's recording gates in the primitives** (design §7.3's `primitives.ts` diff, as 4 edits)

**Edit 1 of 4.** In `src/game/titles/arcfire/weapons/primitives.ts`, replace:

```ts
  return shot.shells.length - 1;
}

/** Fan offset of item i of count across a TOTAL spread (the volley rule; count > 1 guards the divisor). */
export const fanOffset = (i: number, count: number, spread: number): number =>
  count > 1 ? idiv((2 * i - (count - 1)) * spread, 2 * (count - 1)) : 0;

function split(shot: Shot, trig: Trigger, sp: Split): void {
  const children: number[] = [];
  const speed = idiv(trig.speed * sp.speedPct, 100); // the children's nominal speed
  for (let i = 0; i < sp.count; i++) {
    const off = fanOffset(i, sp.count, sp.spreadDeg);
```

with:

```ts
  return shot.shells.length - 1;
}

/** Fan offset of item i of count across a TOTAL spread (the volley rule; count > 1 guards the divisor). `| 0`: a zero offset is +0, never -0 (Timeline angles). */
export const fanOffset = (i: number, count: number, spread: number): number =>
  count > 1 ? idiv((2 * i - (count - 1)) * spread, 2 * (count - 1)) | 0 : 0;

function split(shot: Shot, trig: Trigger, sp: Split): void {
  const children: number[] | null = shot.rec ? [] : null;
  const speed = idiv(trig.speed * sp.speedPct, 100); // the children's nominal speed
  for (let i = 0; i < sp.count; i++) {
    const off = fanOffset(i, sp.count, sp.spreadDeg);
```

**Edit 2 of 4.** In `src/game/titles/arcfire/weapons/primitives.ts`, replace:

```ts
    const gx = sp.gapPx ? idiv((2 * i - (sp.count - 1)) * sp.gapPx, 2) : 0;
    const s = shellAt(trig.fx + fromInt(gx), trig.fy, vx, vy, speed, trig.gravityStep);
    const id = addShell(shot, s, sp.child, off, trig.shell, trig.step);
    if (id >= 0) children.push(id);
  }
  emit(shot, { step: trig.step, kind: "split", shell: trig.shell, x: trig.x, y: trig.y, children });
}

interface WalkEnd { x: number; g: number; stop: "far" | "rise" | "tank" | "edge"; tank: number }

/**
 * Walk along the ground from column x (standing on ground px g) toward dir,
 * up to maxPx columns. Level or downhill only: it stops before any rise (the
 * next column is solid at g - 1), at a world edge, or on entering a tank
 * hitbox (the walker's point is (x, g - 1)). Appends each point to `path`.
 */
function walk(shot: Shot, x: number, g: number, dir: number, maxPx: number, path: number[]): WalkEnd {
  for (let k = 0; k < maxPx; k++) {
    const nx = x + dir;
    if (nx < 0 || nx >= WORLD_W) return { x, g, stop: "edge", tank: -1 };
    if (isSolid(shot.t, nx, g - 1)) return { x, g, stop: "rise", tank: -1 };
    x = nx;
    g = groundBelow(shot.t, x, g);
    path.push(x, g - 1);
    const tank = tankAt(shot, x, g - 1);
    if (tank >= 0) return { x, g, stop: "tank", tank };
  }
  return { x, g, stop: "far", tank: -1 };
}

/** Downhill direction at (x, g) from the ground ROLL_PROBE px either side; on level ground, the travel direction. */
```

with:

```ts
    const gx = sp.gapPx ? idiv((2 * i - (sp.count - 1)) * sp.gapPx, 2) : 0;
    const s = shellAt(trig.fx + fromInt(gx), trig.fy, vx, vy, speed, trig.gravityStep);
    const id = addShell(shot, s, sp.child, off, trig.shell, trig.step);
    if (id >= 0 && children) children.push(id);
  }
  if (children) emit(shot, { step: trig.step, kind: "split", shell: trig.shell, x: trig.x, y: trig.y, children });
}

interface WalkEnd { x: number; g: number; stop: "far" | "rise" | "tank" | "edge"; tank: number; n: number } // n: columns walked

/**
 * Walk along the ground from column x (standing on ground px g) toward dir,
 * up to maxPx columns. Level or downhill only: it stops before any rise (the
 * next column is solid at g - 1), at a world edge, or on entering a tank
 * hitbox (the walker's point is (x, g - 1)). Appends each point to `path`
 * when there is one (recording); `n` counts the columns walked either way.
 */
function walk(shot: Shot, x: number, g: number, dir: number, maxPx: number, path: number[] | null): WalkEnd {
  for (let k = 0; k < maxPx; k++) {
    const nx = x + dir;
    if (nx < 0 || nx >= WORLD_W) return { x, g, stop: "edge", tank: -1, n: k };
    if (isSolid(shot.t, nx, g - 1)) return { x, g, stop: "rise", tank: -1, n: k };
    x = nx;
    g = groundBelow(shot.t, x, g);
    if (path) path.push(x, g - 1);
    const tank = tankAt(shot, x, g - 1);
    if (tank >= 0) return { x, g, stop: "tank", tank, n: k + 1 };
  }
  return { x, g, stop: "far", tank: -1, n: maxPx };
}

/** Downhill direction at (x, g) from the ground ROLL_PROBE px either side; on level ground, the travel direction. */
```

**Edit 3 of 4.** In `src/game/titles/arcfire/weapons/primitives.ts`, replace:

```ts
  if (trig.tank >= 0) return blastAt(shot, r.then, trig.x, trig.y, trig.step, trig.shell, 0); // a direct hit doesn't roll
  const x = floorPx(trig.fx);
  const g = groundBelow(shot.t, x, floorPx(trig.fy));
  const path = [x, g - 1];
  const against = tankAt(shot, x, g - 1); // landed against a tank: it stops at once
  const end: WalkEnd = against >= 0
    ? { x, g, stop: "tank", tank: against }
    : walk(shot, x, g, downhill(shot.t, x, g, trig.vx), r.maxDistance, path);
  const dur = showSteps(path.length / 2 - 1, SHOW_PX_PER_STEP.roll);
  emit(shot, { step: trig.step, kind: "roll", shell: trig.shell, path, dur });
  if (end.stop === "edge") { // rolled off the world: lost, like any shell leaving the side edges
    emit(shot, { step: trig.step, kind: "out", shell: trig.shell, x: end.x + (end.x === 0 ? -1 : 1), y: end.g - 1, lag: dur });
    return;
```

with:

```ts
  if (trig.tank >= 0) return blastAt(shot, r.then, trig.x, trig.y, trig.step, trig.shell, 0); // a direct hit doesn't roll
  const x = floorPx(trig.fx);
  const g = groundBelow(shot.t, x, floorPx(trig.fy));
  const path = shot.rec ? [x, g - 1] : null;
  const against = tankAt(shot, x, g - 1); // landed against a tank: it stops at once
  const end: WalkEnd = against >= 0
    ? { x, g, stop: "tank", tank: against, n: 0 }
    : walk(shot, x, g, downhill(shot.t, x, g, trig.vx), r.maxDistance, path);
  const dur = showSteps(end.n, SHOW_PX_PER_STEP.roll);
  if (path) emit(shot, { step: trig.step, kind: "roll", shell: trig.shell, path, dur });
  if (end.stop === "edge") { // rolled off the world: lost, like any shell leaving the side edges
    emit(shot, { step: trig.step, kind: "out", shell: trig.shell, x: end.x + (end.x === 0 ? -1 : 1), y: end.g - 1, lag: dur });
    return;
```

**Edit 4 of 4.** In `src/game/titles/arcfire/weapons/primitives.ts`, replace:

```ts
  if (half > 0) runs.push(-1, half, 1, half);
  if (b.split) runs.push(-1, b.flow, 1, b.flow);
  else runs.push(downhill(shot.t, x, g, trig.vx), b.flow);
  const flows: number[][] = [];
  let longest = 0;
  for (let j = 0; j < runs.length; j += 2) {
    const path = [x, g - 1];
    const end = walk(shot, x, g, runs[j], runs[j + 1], path);
    const px = path.length / 2 - 1;
    if (end.tank >= 0 && (touched[end.tank] < 0 || px < touched[end.tank])) touched[end.tank] = px;
    if (px > longest) longest = px;
    flows.push(path);
  }
  emit(shot, { step: trig.step, kind: "burn", shell: trig.shell, x, y: g - 1, flows, dur: showSteps(longest, SHOW_PX_PER_STEP.burn) });
  for (let p = 0; p < 2; p++) {
    if (touched[p] >= 0) hurt(shot, p, b.damage, trig.step, showSteps(touched[p], SHOW_PX_PER_STEP.burn));
  }
```

with:

```ts
  if (half > 0) runs.push(-1, half, 1, half);
  if (b.split) runs.push(-1, b.flow, 1, b.flow);
  else runs.push(downhill(shot.t, x, g, trig.vx), b.flow);
  const flows: number[][] | null = shot.rec ? [] : null;
  let longest = 0;
  for (let j = 0; j < runs.length; j += 2) {
    const path = flows ? [x, g - 1] : null;
    const end = walk(shot, x, g, runs[j], runs[j + 1], path);
    const px = end.n;
    if (end.tank >= 0 && (touched[end.tank] < 0 || px < touched[end.tank])) touched[end.tank] = px;
    if (px > longest) longest = px;
    if (flows && path) flows.push(path);
  }
  if (flows) emit(shot, { step: trig.step, kind: "burn", shell: trig.shell, x, y: g - 1, flows, dur: showSteps(longest, SHOW_PX_PER_STEP.burn) });
  for (let p = 0; p < 2; p++) {
    if (touched[p] >= 0) hurt(shot, p, b.damage, trig.step, showSteps(touched[p], SHOW_PX_PER_STEP.burn));
  }
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `npx vitest run src/game/titles/arcfire/copyInto.test.ts`
Expected: PASS (2 tests; the parity sweep takes about 1.5 s).

- [ ] **Step 8: K12 in the terrain: the quiet settle returns the live heights, and a reused capsule table** (design §7.3's `terrain.ts` diff, as 4 edits; a review fix freezes the shared `falls` in Edits 3 and 4, and one comment edit to `resolve.ts` states what a quiet Timeline may be used for)

**Edit 1 of 4.** In `src/game/titles/arcfire/terrain.ts`, replace:

```ts
// Scratch for carveCapsule: per-column [lo, hi) bounds over the columns it touches.
const CAP_LO = new Int32Array(WORLD_W);
const CAP_HI = new Int32Array(WORLD_W);

/**
 * Remove a capsule — the union of radius-r discs centred on every <= 1 px
```

with:

```ts
// Scratch for carveCapsule: per-column [lo, hi) bounds over the columns it touches.
const CAP_LO = new Int32Array(WORLD_W);
const CAP_HI = new Int32Array(WORLD_W);
const CAP_HALF = new Int32Array(17); // half-heights for radii up to 16 (the validator's largest capsule: dig width 32); larger radii allocate

/**
 * Remove a capsule — the union of radius-r discs centred on every <= 1 px
```

**Edit 2 of 4.** In `src/game/titles/arcfire/terrain.ts`, replace:

```ts
    CAP_LO[c] = 2147483647;
    CAP_HI[c] = -2147483648;
  }
  const half = new Int32Array(r + 1); // half[d] = the disc's half-height d columns from its centre
  for (let d = 0; d <= r; d++) half[d] = isqrt(r * r - d * d);
  const dx = x1 - x0;
  const dy = y1 - y0;
```

with:

```ts
    CAP_LO[c] = 2147483647;
    CAP_HI[c] = -2147483648;
  }
  const half = r < CAP_HALF.length ? CAP_HALF : new Int32Array(r + 1); // half[d] = the disc's half-height d columns from its centre
  for (let d = 0; d <= r; d++) half[d] = isqrt(r * r - d * d);
  const dx = x1 - x0;
  const dy = y1 - y0;
```

**Edit 3 of 4.** In `src/game/titles/arcfire/terrain.ts`, replace:

```ts
 * material in a column ends up as ONE span resting on the floor, so the new
 * surface is WORLD_H minus the column's total solid length. `collect = false`
 * skips building `falls` (the quiet resolve path); the terrain is identical.
 */
export function settle(t: Terrain, collect = true): SettleResult {
  const falls: SettleFall[] = [];
  for (let x = 0; x < WORLD_W; x++) {
    const o = x * STRIDE;
    let stackTop = WORLD_H;
```

with:

```ts
 * material in a column ends up as ONE span resting on the floor, so the new
 * surface is WORLD_H minus the column's total solid length. `collect = false`
 * skips building `falls` (the quiet resolve path); the terrain is identical.
 * With `collect = false`, `heights` is the live heightfield (no copy) and
 * `falls` is a shared, frozen empty array: the quiet path discards both.
 */
export function settle(t: Terrain, collect = true): SettleResult {
  const falls: SettleFall[] = collect ? [] : NO_FALLS;
  for (let x = 0; x < WORLD_W; x++) {
    const o = x * STRIDE;
    let stackTop = WORLD_H;
```

**Edit 4 of 4.** In `src/game/titles/arcfire/terrain.ts`, replace:

```ts
    t.height[x] = stackTop;
  }
  spansFromHeight(t);
  return { heights: t.height.slice(), falls };
}
```

with:

```ts
    t.height[x] = stackTop;
  }
  spansFromHeight(t);
  return { heights: collect ? t.height.slice() : t.height, falls }; // quiet: the live heightfield, not a copy
}

/** The quiet settle's `falls`: one array shared by every quiet resolve, frozen so that no caller can fill it. */
const NO_FALLS = Object.freeze([]) as unknown as SettleFall[];
```

**Edit 1 of 1.** In `src/game/titles/arcfire/resolve.ts`, replace:

```ts
/** resolveTurn without building the Timeline's paths or events: the same state and points, faster (AI search, verification). */
export function resolveTurnPoints(m: MatchState, input: TurnInput): [number, number] {
  return resolveWeapon(m, ROSTER[input.weapon], input, false).points;
}

/**
 * resolveTurn with the weapon passed in: the seam unit tests use to fire
 * synthetic WeaponDefs (and 2B's probe shell). `input.weapon` is only
 * recorded. `record = false` leaves `shells`, `events` and `settle.falls` empty.
 */
```

with:

```ts
/** resolveTurn without building the Timeline's paths or events: the same state and points, faster (AI search, verification). It returns only the points (resolveWeapon's `record = false`). */
export function resolveTurnPoints(m: MatchState, input: TurnInput): [number, number] {
  return resolveWeapon(m, ROSTER[input.weapon], input, false).points;
}

/**
 * resolveTurn with the weapon passed in: the seam unit tests use to fire
 * synthetic WeaponDefs. `input.weapon` is only recorded. `record = false`
 * leaves `shells`, `events` and `settle.falls` empty, and its Timeline is for
 * `.points` only: `settle.heights` is the live heightfield (the next resolve
 * changes it) and `settle.falls` a shared, frozen empty array, so a quiet
 * caller must not keep, write or transfer either.
 */
```

- [ ] **Step 9: `toAct` and `applyCommand`** (design §6.2's diffs: 1 edit to `match.ts`, 3 to `replay.ts`)

**Edit 1 of 1.** In `src/game/titles/arcfire/match.ts`, replace:

```ts
  };
}

/** Draft pick (by pool index) for whoever's pick it is. */
export function applyPick(m: MatchState, poolIndex: number): PickResult {
  if (m.phase !== "draft") return { ok: false, reason: "invalid_command" };
```

with:

```ts
  };
}

/** Whose command the match waits for: the picker in the draft, the shooter after it, or -1 once it is over. */
export function toAct(m: MatchState): number {
  if (m.phase === "over") return -1;
  return m.phase === "draft" ? pickerAt(m.firstPicker, m.picksMade) : m.shooter;
}

/** Draft pick (by pool index) for whoever's pick it is. */
export function applyPick(m: MatchState, poolIndex: number): PickResult {
  if (m.phase !== "draft") return { ok: false, reason: "invalid_command" };
```

**Edit 1 of 3.** In `src/game/titles/arcfire/replay.ts`, replace:

```ts
// src/game/titles/arcfire/replay.ts
//
// The Arcfire command log (spec §1.3, §7): one entry per draft pick or turn,
// in order. A 2-player log holds BOTH players' commands; a vs-AI log (Plan 2)
// holds only the human's, with the AI's regenerated during replay. Any illegal
// command rejects the whole log, and a malformed log (not an array, a
// non-object entry, an unknown `k`) is rejected the same way — replayMatch
// never throws on one. An UNFINISHED log is accepted (resume re-simulates a
```

with:

```ts
// src/game/titles/arcfire/replay.ts
//
// The Arcfire command log (spec §1.3, §7): one entry per draft pick or turn,
// in order. A 2-player log holds BOTH players' commands and replays here; a
// vs-AI log holds only the human's and replays in vsai.ts (replayVsAi), which
// regenerates every AI pick and shot. Both apply entries with applyCommand. Any illegal
// command rejects the whole log, and a malformed log (not an array, a
// non-object entry, an unknown `k`) is rejected the same way — replayMatch
// never throws on one. An UNFINISHED log is accepted (resume re-simulates a
```

**Edit 2 of 3.** In `src/game/titles/arcfire/replay.ts`, replace:

```ts
import { createMatch, applyPick, applyTurn } from "./match";
import { hashMatch } from "./hash";
import type { MatchSettings, MatchState } from "./state";

export type ArcfireCommand =
  | { k: "pick"; w: number } // w = pool index
```

with:

```ts
import { createMatch, applyPick, applyTurn } from "./match";
import { hashMatch } from "./hash";
import type { MatchSettings, MatchState } from "./state";
import type { Timeline } from "./timeline";

export type ArcfireCommand =
  | { k: "pick"; w: number } // w = pool index
```

**Edit 3 of 3.** In `src/game/titles/arcfire/replay.ts`, replace:

```ts
  | { ok: true; state: MatchState; hash: string }
  | { ok: false; reason: "invalid_command"; atIndex: number };

/** Replay a 2-player command log from a fresh match. */
export function replayMatch(r: ArcfireReplay): ReplayMatchResult {
  if (!Array.isArray(r.commands)) return { ok: false, reason: "invalid_command", atIndex: 0 };
  const m = createMatch(r.seed, r.settings);
  for (let i = 0; i < r.commands.length; i++) {
    const entry: unknown = r.commands[i];
    if (typeof entry !== "object" || entry === null) return { ok: false, reason: "invalid_command", atIndex: i };
    const c = entry as ArcfireCommand;
    let res: { ok: boolean };
    if (c.k === "pick") res = applyPick(m, c.w);
    else if (c.k === "turn") res = applyTurn(m, { move: c.move, w: c.w, angle: c.angle, power: c.power });
    else return { ok: false, reason: "invalid_command", atIndex: i };
    if (!res.ok) return { ok: false, reason: "invalid_command", atIndex: i };
  }
  return { ok: true, state: m, hash: hashMatch(m) };
}
```

with:

```ts
  | { ok: true; state: MatchState; hash: string }
  | { ok: false; reason: "invalid_command"; atIndex: number };

export type CommandResult = { ok: true; timeline: Timeline | null } | { ok: false };

/** Apply one log entry for whoever is to act (a pick has no Timeline). Never throws: a malformed entry is { ok: false } and changes nothing. */
export function applyCommand(m: MatchState, entry: unknown): CommandResult {
  if (typeof entry !== "object" || entry === null) return { ok: false };
  const c = entry as ArcfireCommand;
  if (c.k === "pick") return applyPick(m, c.w).ok ? { ok: true, timeline: null } : { ok: false };
  if (c.k === "turn") {
    const r = applyTurn(m, { move: c.move, w: c.w, angle: c.angle, power: c.power });
    return r.ok ? { ok: true, timeline: r.timeline } : { ok: false };
  }
  return { ok: false };
}

/** Replay a 2-player command log from a fresh match. */
export function replayMatch(r: ArcfireReplay): ReplayMatchResult {
  if (!Array.isArray(r.commands)) return { ok: false, reason: "invalid_command", atIndex: 0 };
  const m = createMatch(r.seed, r.settings);
  for (let i = 0; i < r.commands.length; i++) {
    if (!applyCommand(m, r.commands[i]).ok) return { ok: false, reason: "invalid_command", atIndex: i };
  }
  return { ok: true, state: m, hash: hashMatch(m) };
}
```

- [ ] **Step 10: Run the Arcfire gate, types and the full suite**

Run: `npx vitest run src/game/titles/arcfire src/game/test/arcfire src/game/runtime/arcfire src/game/sim/purity.test.ts`
Expected: PASS: 19 files, 214 tests. `determinism.test.ts` (`389a1340`, `8d7dc831`, `3f614265`), `corpus.test.ts` (`a7100140`), `resolve.test.ts`'s quiet-path parity test and `replay.test.ts` pass unchanged: the refactor is inert.

Run: `npx tsc --noEmit`
Expected: exit 0.

Run: `npm test`
Expected: all pass: 59 test files passed and 1 skipped; 467 tests passed and 10 skipped.

Run: `git status --short`
Expected, exactly these lines (no fixture JSON is listed: no pin moved):

```
 M src/game/test/arcfire/fixtures.ts
 M src/game/titles/arcfire/match.ts
 M src/game/titles/arcfire/replay.ts
 M src/game/titles/arcfire/resolve.ts
 M src/game/titles/arcfire/state.ts
 M src/game/titles/arcfire/terrain.ts
 M src/game/titles/arcfire/weapons/primitives.ts
?? src/game/titles/arcfire/copyInto.test.ts
```

- [ ] **Step 11: Run the cross-engine gate**

Run: `npm run test:e2e:cross-engine -- --grep-invert firefox`
Expected: exit 0, `2 passed`. Chromium and WebKit reproduce `5167b43d`, `389a1340`, `3f614265` and `a7100140`.

- [ ] **Step 12: Commit**

```bash
git add src/game/test/arcfire/fixtures.ts src/game/titles/arcfire/match.ts src/game/titles/arcfire/replay.ts src/game/titles/arcfire/resolve.ts src/game/titles/arcfire/state.ts src/game/titles/arcfire/terrain.ts src/game/titles/arcfire/weapons/primitives.ts src/game/titles/arcfire/copyInto.test.ts
git commit -m "feat(arcfire): copyMatchInto, toAct and applyCommand; gate the quiet path's allocations (K12); no -0 fan offset" -m "Plan 2B Task 1, pin-neutral: golden 389a1340 [31, 83], windless 8d7dc831, corpus a7100140 (483), full-roster 3f614265 [359, 448] and Circle TD 5167b43d unchanged. copyMatchInto copies every field in place (the AI's per-candidate reset), and the test compares every field by value; replayMatch applies entries through the never-throwing applyCommand; settle(t, false) returns the live heights and a shared, frozen empty falls, and resolve.ts documents that a quiet Timeline is for its points only; walk, roll, burn and split build paths and children only when recording; fanOffset | 0 (no -0 Timeline angle). fixtures.ts gains corpusState, battleBoards and rngAfter for the 2B tests." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 2: Engine II — the exact quick-reject sweep and `endStep`

**Files:**
- Create: `src/game/titles/arcfire/quickReject.test.ts` (design-verbatim, §10.1)
- Modify: `src/game/titles/arcfire/ballistics.ts` (5 edits, §7.4)

**Interfaces:**
- Consumes: `shellAt`, `stepShell`, `HitCircle`, `Shell` (`ballistics.ts`); `makeTerrain`, `spansFromHeight`, `carveCircle`, `addInterval`, `removeInterval`, `surfaceTop` (`terrain.ts`); `makeRng`, `nextRange`; `fromInt`.
- Produces: `stepShell(s: Shell, t: Terrain, tanks: readonly HitCircle[], windStep: Fx, exact = false): Impact | null`.
  - A step whose pixel box lies inside the world, strictly above every covered column's top span, and outside every hitbox square skips the per-sample loop with the same result.
  - `exact = true` forces the loop (the reference path).
  - `endStep` (private) counts a step and applies the flight cap for both the free-flight end and `endBounce`.

**Why:** a probe flight is mostly clear sky. Skipping the per-sample sweep there makes shell probes 2.2–6.3× faster and an Ace turn about 3× faster. It is exact by construction, so no decision and no pin moves; the design reproduced all four AI digests with it compiled out. This is 2A's hottest loop, so the gate is a reference property test (20,000 random shells, > 500,000 steps), mutation-checked once, plus every pin. The task is also optional: dropping it moves nothing but speed.

- [ ] **Step 1: Write the reference test**

Create `src/game/titles/arcfire/quickReject.test.ts` with (design-verbatim):

```ts
// src/game/titles/arcfire/quickReject.test.ts — Plan 2B T2: the exact quick-reject sweep against the per-sample reference
import { describe, it, expect } from "vitest";
import { makeRng, nextRange, type Rng } from "@/game/sim/math/rng";
import { fromInt } from "@/game/sim/math/fixed";
import { shellAt, stepShell, type HitCircle, type Shell } from "./ballistics";
import { addInterval, carveCircle, makeTerrain, removeInterval, spansFromHeight } from "./terrain";

const r = (rng: Rng, lo: number, hi: number): number => lo + nextRange(rng, hi - lo + 1);

const shellKey = (s: Shell): string =>
  [s.x, s.y, s.vx, s.vy, s.gravityStep, s.steps, s.alive, s.speed, s.apexed, s.stopAtApex, s.homeDeg, s.bounces, s.wallBounces, s.restitutionPct, s.ignore].join();

describe("the quick-reject sweep", () => {
  it("steps 20,000 random shells exactly like the per-sample sweep", () => {
    const rng = makeRng(2026);
    let t = makeTerrain();
    let steps = 0;
    const bad: string[] = [];
    for (let n = 0; n < 20000; n++) {
      if (n % 50 === 0) { // a fresh random terrain every 50 shells: hills, floor gaps, craters, floating dirt, tunnels
        t = makeTerrain();
        for (let x = 0; x < 1200; x++) t.height[x] = r(rng, 0, 9) === 0 ? 500 : r(rng, 60, 480);
        spansFromHeight(t);
        for (let k = r(rng, 0, 12); k > 0; k--) {
          const kind = r(rng, 0, 2);
          const cx = r(rng, 0, 1199);
          const cy = r(rng, 0, 499);
          if (kind === 0) carveCircle(t, cx, cy, r(rng, 3, 60));
          else if (kind === 1) for (let x = cx; x < Math.min(1200, cx + r(rng, 1, 40)); x++) addInterval(t, x, cy - r(rng, 1, 60), cy);
          else for (let x = cx; x < Math.min(1200, cx + r(rng, 1, 40)); x++) removeInterval(t, x, cy, cy + r(rng, 1, 30));
        }
      }
      const tanks: HitCircle[] = [{ x: r(rng, 0, 1199), y: r(rng, -20, 510) }, { x: r(rng, 0, 1199), y: r(rng, -20, 510) }];
      const s: Shell = shellAt(fromInt(r(rng, -8, 1207)) + r(rng, 0, 65535), fromInt(r(rng, -300, 520)), fromInt(r(rng, -1400, 1400)), fromInt(r(rng, -1400, 1400)), fromInt(r(rng, 0, 1400)), r(rng, 0, fromInt(12)));
      s.bounces = r(rng, 0, 3) === 0 ? r(rng, 1, 6) : 0;
      s.wallBounces = r(rng, 0, 3) === 0 ? r(rng, 1, 2) : 0;
      s.restitutionPct = r(rng, 40, 100);
      s.homeDeg = r(rng, 0, 3) === 0 ? r(rng, 1, 3) : 0;
      s.homeX = tanks[1].x;
      s.homeY = tanks[1].y;
      s.stopAtApex = r(rng, 0, 7) === 0;
      s.apexed = r(rng, 0, 1) === 0;
      s.ignore = r(rng, 0, 3);
      s.steps = r(rng, 0, 1199);
      const q = { ...s };
      const wind = fromInt(r(rng, -40, 40)) / 60 | 0;
      for (let step = 0; step < 1300 && s.alive; step++) {
        const a = JSON.stringify(stepShell(s, t, tanks, wind));
        const b = JSON.stringify(stepShell(q, t, tanks, wind, true));
        steps++;
        if (a !== b || shellKey(s) !== shellKey(q)) bad.push(`shell ${n} step ${step}: ${a} vs ${b}`);
      }
    }
    expect(bad.slice(0, 5)).toEqual([]);
    expect(steps).toBeGreaterThan(500000);
  }, 120_000);
});
```

- [ ] **Step 2: Run it, and the type check (the red phase)**

Run: `npx vitest run src/game/titles/arcfire/quickReject.test.ts`
Expected: PASS (1 test). Today both calls take the per-sample sweep (the fifth argument is ignored), so they agree. The test guards the optimization that follows.

Run: `npx tsc --noEmit`
Expected: exit 2, exactly one error: `src/game/titles/arcfire/quickReject.test.ts(49,63): error TS2554: Expected 4 arguments, but got 5.`

- [ ] **Step 3: Record the speed before**

Run: `npx vitest run src/game/titles/arcfire/perf.test.ts --reporter=verbose`
Expected: PASS, printing 32 lines. Note Pulse's line (the dry run: `pulse       0.0294 ms`) and Swarm's (`swarm       0.1004 ms`). Your figures will differ.

- [ ] **Step 4: Add the quick-reject and `endStep`** (design §7.4's diff, as 5 edits)

**Edit 1 of 5.** In `src/game/titles/arcfire/ballistics.ts`, replace:

```ts
import type { Fx } from "@/game/sim/types";
import { fromInt, toInt, mul } from "@/game/sim/math/fixed";
import { cosDeg, sinDeg } from "./aimTable";
import { isSolid, type Terrain } from "./terrain";
import {
  WORLD_W, STEPS_PER_SEC, GRAVITY_STEP, V_UNIT, MAX_FLIGHT_STEPS, BARREL_LEN, TANK_HIT_R, BOUNCE_PROBE_R,
} from "./constants";
```

with:

```ts
import type { Fx } from "@/game/sim/types";
import { fromInt, toInt, mul } from "@/game/sim/math/fixed";
import { cosDeg, sinDeg } from "./aimTable";
import { isSolid, surfaceTop, type Terrain } from "./terrain";
import {
  WORLD_W, STEPS_PER_SEC, GRAVITY_STEP, V_UNIT, MAX_FLIGHT_STEPS, BARREL_LEN, TANK_HIT_R, BOUNCE_PROBE_R,
} from "./constants";
```

**Edit 2 of 5.** In `src/game/titles/arcfire/ballistics.ts`, replace:

```ts
  s.vy = idiv(s.vy * s.restitutionPct, 100);
}

/** A bounce ends the step at the last free sample; the flight cap still applies. */
function endBounce(s: Shell, fx: Fx, fy: Fx, ev: Impact): Impact {
  s.x = fx;
  s.y = fy;
  s.steps++;
  if (s.steps >= MAX_FLIGHT_STEPS) {
    s.alive = false;
    return { kind: "out", x: floorPx(fx), y: floorPx(fy) };
  }
  return ev;
}

/**
```

with:

```ts
  s.vy = idiv(s.vy * s.restitutionPct, 100);
}

/**
 * Can this step's sweep hit nothing? Every sample of a step lies in the pixel box between its start
 * (x0, y0) and end (x1, y1) pixels: the samples interpolate the step monotonically and floorPx is
 * monotone. So the sweep is clear when that box lies inside the world, strictly above the top span of
 * every column it covers, and outside the square around each hitbox circle. Exact, never approximate:
 * when it answers false, the per-sample sweep decides exactly as before.
 */
function clearStep(t: Terrain, tanks: readonly HitCircle[], x0: number, y0: number, x1: number, y1: number): boolean {
  const lo = x0 < x1 ? x0 : x1;
  const hi = x0 < x1 ? x1 : x0;
  if (lo < 0 || hi >= WORLD_W) return false;
  const top = y0 < y1 ? y0 : y1;
  const bot = y0 < y1 ? y1 : y0;
  for (let k = 0; k < tanks.length; k++) {
    const tk = tanks[k];
    if (hi >= tk.x - TANK_HIT_R && lo <= tk.x + TANK_HIT_R && bot >= tk.y - TANK_HIT_R && top <= tk.y + TANK_HIT_R) return false;
  }
  for (let c = lo; c <= hi; c++) if (bot >= surfaceTop(t, c)) return false;
  return true;
}

/** End a flown step at Q16.16 (x, y): count it, and lose the shell there (out) if it reached its flight cap. */
function endStep(s: Shell, x: Fx, y: Fx): Impact | null {
  s.x = x;
  s.y = y;
  s.steps++;
  if (s.steps < MAX_FLIGHT_STEPS) return null;
  s.alive = false;
  return { kind: "out", x: floorPx(x), y: floorPx(y) };
}

/** A bounce ends the step at the last free sample; the flight cap still applies. */
function endBounce(s: Shell, fx: Fx, fy: Fx, ev: Impact): Impact {
  return endStep(s, fx, fy) ?? ev;
}

/**
```

**Edit 3 of 5.** In `src/game/titles/arcfire/ballistics.ts`, replace:

```ts
 * change per step (Fx). The order inside a step is part of the determinism
 * contract: wind, gravity, the apex latch (an apex stage ends the step here),
 * homing, then the sweep, whose every sample checks the side edges, then the
 * tanks in index order, then the terrain.
 */
export function stepShell(s: Shell, t: Terrain, tanks: readonly HitCircle[], windStep: Fx): Impact | null {
  const rising = s.vy < 0;
  s.vx += windStep;
  s.vy += s.gravityStep;
```

with:

```ts
 * change per step (Fx). The order inside a step is part of the determinism
 * contract: wind, gravity, the apex latch (an apex stage ends the step here),
 * homing, then the sweep, whose every sample checks the side edges, then the
 * tanks in index order, then the terrain. A step whose sweep provably meets
 * nothing (clearStep) skips the per-sample loop with the same result; `exact`
 * forces the loop (the reference property test compares the two).
 */
export function stepShell(s: Shell, t: Terrain, tanks: readonly HitCircle[], windStep: Fx, exact = false): Impact | null {
  const rising = s.vy < 0;
  s.vx += windStep;
  s.vy += s.gravityStep;
```

**Edit 4 of 5.** In `src/game/titles/arcfire/ballistics.ts`, replace:

```ts
  if (s.homeDeg > 0 && s.apexed) steer(s);
  const nx = s.x + idiv(s.vx, STEPS_PER_SEC);
  const ny = s.y + idiv(s.vy, STEPS_PER_SEC);
  const n = Math.max(Math.abs(floorPx(nx) - floorPx(s.x)), Math.abs(floorPx(ny) - floorPx(s.y)), 1);
  const r2 = TANK_HIT_R * TANK_HIT_R;
  let fx = s.x; // the last free sample
  let fy = s.y;
```

with:

```ts
  if (s.homeDeg > 0 && s.apexed) steer(s);
  const nx = s.x + idiv(s.vx, STEPS_PER_SEC);
  const ny = s.y + idiv(s.vy, STEPS_PER_SEC);
  const x0 = floorPx(s.x);
  const y0 = floorPx(s.y);
  const x1 = floorPx(nx);
  const y1 = floorPx(ny);
  if (!exact && clearStep(t, tanks, x0, y0, x1, y1)) {
    // the sweep below would find nothing, and every sample of it lies outside every hitbox, so it would clear every ignore bit
    s.ignore = 0;
    return endStep(s, nx, ny);
  }
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  const r2 = TANK_HIT_R * TANK_HIT_R;
  let fx = s.x; // the last free sample
  let fy = s.y;
```

**Edit 5 of 5.** In `src/game/titles/arcfire/ballistics.ts`, replace:

```ts
    fx = sx;
    fy = sy;
  }
  s.x = nx;
  s.y = ny;
  s.steps++;
  if (s.steps >= MAX_FLIGHT_STEPS) {
    s.alive = false;
    return { kind: "out", x: floorPx(nx), y: floorPx(ny) };
  }
  return null;
}
```

with:

```ts
    fx = sx;
    fy = sy;
  }
  return endStep(s, nx, ny);
}
```

- [ ] **Step 5: Run the reference test and the type check**

Run: `npx vitest run src/game/titles/arcfire/quickReject.test.ts`
Expected: PASS (1 test, about 2 s): every one of > 500,000 steps equals the per-sample sweep.

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 6: Mutation-check the reference test once** (the design's check: drop the hitbox test from `clearStep`)

In `src/game/titles/arcfire/ballistics.ts`, replace:

```ts
    if (hi >= tk.x - TANK_HIT_R && lo <= tk.x + TANK_HIT_R && bot >= tk.y - TANK_HIT_R && top <= tk.y + TANK_HIT_R) return false;
```

with:

```ts
    if (tk === null) return false; // MUTATION: the hitbox test dropped
```

Run: `npx vitest run src/game/titles/arcfire/quickReject.test.ts`
Expected: FAIL, 1 test: `AssertionError: expected [ …(5) ] to deeply equal []`, whose first entry is `shell 48 step 0: null vs {"kind":"tank","x":631,"y":39,"tank":0,"fx":41299851,"fy":2621440}`. The quick path flew through a hitbox that the reference hits.

Undo the mutation. In `src/game/titles/arcfire/ballistics.ts`, replace:

```ts
    if (tk === null) return false; // MUTATION: the hitbox test dropped
```

with:

```ts
    if (hi >= tk.x - TANK_HIT_R && lo <= tk.x + TANK_HIT_R && bot >= tk.y - TANK_HIT_R && top <= tk.y + TANK_HIT_R) return false;
```

Run: `npx vitest run src/game/titles/arcfire/quickReject.test.ts`
Expected: PASS (1 test).

Run: `git diff --stat`
Expected: `src/game/titles/arcfire/ballistics.ts | 68 ++++++++++++++++++++++++-----------`, and `1 file changed, 48 insertions(+), 20 deletions(-)` (the new test file is untracked). Anything else means the undo is incomplete.

- [ ] **Step 7: Record the speed after**

Run: `npx vitest run src/game/titles/arcfire/perf.test.ts --reporter=verbose`
Expected: PASS. Pulse is faster (the dry run: `0.0294` → `0.0195` ms, against the 0.2 ms budget) and Swarm about halves (`0.1004` → `0.0485`). Beams do not fly shells, so Prism is unchanged (about 0.13 ms).

- [ ] **Step 8: Run the Arcfire gate, types, the full suite and the cross-engine gate**

Run: `npx vitest run src/game/titles/arcfire src/game/test/arcfire src/game/runtime/arcfire src/game/sim/purity.test.ts`
Expected: PASS: 20 files, 215 tests. `ballistics.test.ts`'s bounce-at-the-cap test passes through the `endStep` refactor, and every pin reproduces.

Run: `npx tsc --noEmit`
Expected: exit 0.

Run: `npm test`
Expected: all pass: 60 test files passed and 1 skipped; 468 tests passed and 10 skipped.

Run: `npm run test:e2e:cross-engine -- --grep-invert firefox`
Expected: exit 0, `2 passed`.

- [ ] **Step 9: Commit**

```bash
git add src/game/titles/arcfire/ballistics.ts src/game/titles/arcfire/quickReject.test.ts
git commit -m "perf(arcfire): the exact quick-reject sweep in stepShell; endStep shared with endBounce" -m "Plan 2B Task 2. A step whose pixel box lies inside the world, strictly above every covered column's top span and outside every hitbox square skips the per-sample loop with the same result; stepShell(..., exact = true) keeps the reference path. quickReject.test.ts: 20,000 random shells, more than 500,000 steps, all equal to the per-sample sweep (mutation-checked: dropping the hitbox test turns it red). Pin-neutral: 389a1340, 8d7dc831, a7100140, 3f614265 and 5167b43d unchanged, also in Chromium and WebKit." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 3: The Plan 2A carry-overs

**Files:**
- Create: `src/game/titles/arcfire/carryovers.test.ts` (design-verbatim, §10.1)
- Modify: `src/game/titles/arcfire/corpus.test.ts` (2 edits: the power-independence assertion, §10.1; the §11 message nit)
- Modify: `src/game/titles/arcfire/weapons/validate.ts` (9 edits, §11)

**Interfaces:**
- Consumes: `weaponErrors`, `maxTurnSteps` (`weapons/validate.ts`); `resolveWeapon`; `hashMatch`; `ROSTER`, `ROSTER_INDEX`; `defDigest` (in `corpus.test.ts`); `flatBattle`.
- Produces:
  - `weaponErrors` never descends into a `split` or `delay` inside a delay list (one report, no `RangeError`).
  - `checkStage(errs, path, st, depth, onPath, seen: Map<Stage, number>)` skips a stage already checked at exactly this depth, after the cycle and depth checks. The walk is bounded by stages × `MAX_STAGE_DEPTH`.
  - An always-on pin: `defDigest({ ...def, power: x }) === defDigest(def)` for every roster entry.

**Why:** the parked 2A minors (design §11):
- `weaponErrors` throws on a self-containing delay list;
- a multi-stage cycle costs k^L (a 4-stage ring: 65,641 effect-list walks and 40^4 reports);
- the homing-null guard, the `maxTurnSteps` bound and the backstop's `out` events had no test.

The power pin makes the harness's later write-back provably move no 2A pin. The memo's direction ("exactly this depth", not "this depth or shallower") is pinned by the over-deep test. That test is green on 2A too, and fails for the wrong memo.

- [ ] **Step 1: Write the failing tests**

Create `src/game/titles/arcfire/carryovers.test.ts` with (design-verbatim):

```ts
// src/game/titles/arcfire/carryovers.test.ts — Plan 2B T3: the parked Plan 2A minors (the validator fixes and the missing tests)
import { describe, it, expect } from "vitest";
import { hashMatch } from "./hash";
import { resolveWeapon } from "./resolve";
import { ROSTER, ROSTER_INDEX } from "./weapons/roster";
import { maxTurnSteps, weaponErrors } from "./weapons/validate";
import { flatBattle } from "@/game/test/arcfire/fixtures";
import type { Blast, Effect, Stage, WeaponDef } from "./weapons/types";

const B: Blast = { radius: 28, damage: 40 };
const weapon = (stage: Stage): WeaponDef => ({ id: "t", name: "T", tag: "BLAST", tier: 1, power: 30, launch: { kind: "shell" }, stage });
const up = (child: Stage): Effect => ({ split: { count: 1, spreadDeg: 0, speedPct: 50, from: "up", child } });

describe("the Plan 2A carry-overs", () => {
  it("weaponErrors never descends into a delay: a self-containing or deep delay chain is one report, no throw", () => {
    const then: Effect[] = [{ blast: B }];
    then.push({ delay: { steps: 5, then: then as never } });
    expect(weaponErrors(weapon({ on: "impact", effects: [{ delay: { steps: 5, then: then as never } }] })))
      .toEqual(["stage.effects[0].delay.then[1]: a delay cannot schedule a delay"]);
    let deep: Effect = { blast: B };
    for (let i = 0; i < 10000; i++) deep = { delay: { steps: 1, then: [deep] as never } };
    expect(weaponErrors(weapon({ on: "impact", effects: [deep] }))).toEqual(["stage.effects[0].delay.then[0]: a delay cannot schedule a delay"]);
  });
  it("walks each stage of a multi-stage cycle once, and still reports every back-reference", () => {
    const ring: Stage[] = [0, 1, 2, 3].map(() => ({ on: "impact" as const, effects: [{ blast: B }] as Effect[] }));
    for (let i = 0; i < 4; i++) for (let k = 0; k < 40; k++) ring[i].effects.push(up(ring[(i + 1) % 4]));
    let walks = 0; // reads of a ring stage's effect list: one per stage check
    for (const st of ring) {
      const list = st.effects;
      Object.defineProperty(st, "effects", { get: () => { walks++; return list; } });
    }
    const errs = weaponErrors(weapon(ring[0]));
    expect(walks).toBe(4); // without the (stage, depth) memo: 1 + 40 + 1,600 + 64,000 walks and 40^4 reports
    expect(errs.length).toBe(40);
    expect(errs.every((e) => e.endsWith("split.child: cyclic stage, so its stages nest deeper than 4"))).toBe(true);
  });
  it("still reports an over-deep path through a stage it already checked at a shallower depth", () => {
    const leaf: Stage = { on: "impact", effects: [{ blast: B }] };
    const s: Stage = { on: "impact", effects: [{ blast: B }, up(leaf)] }; // leaf: depth 3 under s at 2, depth 5 under s at 4
    const b: Stage = { on: "impact", effects: [{ blast: B }, up(s)] };
    const a: Stage = { on: "impact", effects: [{ blast: B }, up(b)] };
    expect(weaponErrors(weapon({ on: "impact", effects: [{ blast: B }, up(s), up(a)] }))).toEqual([
      "stage.effects[2].split.child.effects[1].split.child.effects[1].split.child.effects[1].split.child: stages nest deeper than 4",
    ]);
  });
  it("reports homing: null as missing, and resolves such a def as if it had no homing", () => {
    const bad = weapon({ on: "impact", effects: [{ blast: B }], homing: null as never });
    expect(weaponErrors(bad)).toContain("stage.homing: missing");
    const a = flatBattle();
    const b = flatBattle();
    const input = { move: 0 as const, weapon: 0, angle: 45, power: 60 };
    expect(resolveWeapon(a, bad, input).points).toEqual(resolveWeapon(b, weapon({ on: "impact", effects: [{ blast: B }] }), input).points);
    expect(hashMatch(a)).toBe(hashMatch(b));
  });
  it("bounds a turn's steps statically", () => {
    expect(maxTurnSteps(ROSTER[ROSTER_INDEX.twinnova])).toBe(1230);
    expect(maxTurnSteps(ROSTER[ROSTER_INDEX.cascade])).toBe(3600);
    expect(maxTurnSteps(ROSTER[ROSTER_INDEX.lancer])).toBe(1);
    const leaf: Stage = { on: "impact", effects: [{ blast: B }, { delay: { steps: 600, then: [{ blast: B }] } }] };
    expect(maxTurnSteps(weapon({ on: "impact", effects: [{ split: { count: 2, spreadDeg: 10, speedPct: 50, from: "up", child: leaf } }] }))).toBe(3000);
  });
  it("abandons every shell still flying at the 4,800-step backstop with one out event each", () => {
    const hop: Stage = { on: "impact", effects: [] };
    hop.effects.push({ split: { count: 1, spreadDeg: 0, speedPct: 100, from: "up", child: hop } });
    const tl = resolveWeapon(flatBattle(), weapon(hop), { move: 0, weapon: 0, angle: 90, power: 100 });
    expect(tl.steps).toBe(4800);
    const outs = tl.events.filter((e) => e.kind === "out");
    expect(outs.length).toBe(1);
    expect(outs[0]).toMatchObject({ step: 4800, lag: 0 });
    expect(tl.events[tl.events.length - 1]).toBe(outs[0]);
    const alive = tl.shells.length - 1; // the one shell alive at the backstop: its path ends at the out point
    const pts = tl.shells[alive].points;
    expect([pts[pts.length - 2], pts[pts.length - 1]]).toEqual([(outs[0] as { x: number }).x, (outs[0] as { y: number }).y]);
  });
});
```

Add the power-independence pin to `corpus.test.ts` (design §10.1's diff):

**Edit 1 of 2.** In `src/game/titles/arcfire/corpus.test.ts`, replace:

```ts
interface CorpusFixture { digest: string; defs: Record<string, string>; cases: Record<string, Fingerprint> }

describe("arcfire corpus", () => {
  it("reproduces every pinned case and weapon definition", () => {
    const kinds = new Set<string>();
    const volleyAngles: number[] = [];
```

with:

```ts
interface CorpusFixture { digest: string; defs: Record<string, string>; cases: Record<string, Fingerprint> }

describe("arcfire corpus", () => {
  it("definition digests ignore `power`, so a balance write-back moves no corpus pin", () => {
    for (const def of ROSTER) expect(defDigest({ ...def, power: def.power === 1 ? 2 : 1 }), def.id).toBe(defDigest(def));
  });
  it("reproduces every pinned case and weapon definition", () => {
    const kinds = new Set<string>();
    const volleyAngles: number[] = [];
```

And the §11 wording nit: the fixture-creation message names the count variable that `UPDATE_ARCFIRE_CORPUS=1` requires.

**Edit 2 of 2.** In `src/game/titles/arcfire/corpus.test.ts`, replace:

```ts
    expect(existsSync(FIXTURE), "create it once with UPDATE_ARCFIRE_CORPUS=1").toBe(true);
```

with:

```ts
    expect(existsSync(FIXTURE), "create it once with UPDATE_ARCFIRE_CORPUS=1 ARCFIRE_CORPUS_EXPECT_MOVED=0").toBe(true);
```

- [ ] **Step 2: Run them to verify the right ones fail**

Run: `npx vitest run src/game/titles/arcfire/carryovers.test.ts src/game/titles/arcfire/corpus.test.ts`
Expected: FAIL, exactly 2 tests; the other 6 pass:
- `weaponErrors never descends into a delay: a self-containing or deep delay chain is one report, no throw`: `RangeError: Maximum call stack size exceeded` (inside `weapons/validate.ts`; the frame it surfaces in varies with the stack depth)
- `walks each stage of a multi-stage cycle once, and still reports every back-reference`: `AssertionError: expected 65641 to be 4`

The over-deep, homing-null, `maxTurnSteps` and backstop tests pass on the 2A code: they are the missing tests. `corpus.test.ts` passes (2 tests), including the new power pin.

- [ ] **Step 3: Fix the validator** (design §11's `validate.ts` diff, as 9 edits)

**Edit 1 of 9.** In `src/game/titles/arcfire/weapons/validate.ts`, replace:

```ts
// (zeros, count 0, a cyclic stage, the launch maxima) resolve without throwing;
// data far outside these ranges (a huge carve radius, NaN) is not covered.
// weaponErrors itself never throws: a missing or null nested object is reported
// as `<path>: missing`, and a cyclic stage is reported once per back-reference
// and not descended into, so a small cyclic def validates in linear time.
import type { Blast, Effect, Stage, WeaponDef } from "./types";
import { MAX_FLIGHT_STEPS, MAX_SHELLS, MAX_STAGE_DEPTH, MAX_TURN_STEPS } from "../constants";

```

with:

```ts
// (zeros, count 0, a cyclic stage, the launch maxima) resolve without throwing;
// data far outside these ranges (a huge carve radius, NaN) is not covered.
// weaponErrors itself never throws: a missing or null nested object is reported
// as `<path>: missing`; a cyclic stage is reported at each back-reference and
// not descended into; a split or delay inside a delay list is reported and not
// descended into (a delay list nests nothing); and a stage is checked at most
// once per depth. So any def, cyclic or shared, validates in linear time.
import type { Blast, Effect, Stage, WeaponDef } from "./types";
import { MAX_FLIGHT_STEPS, MAX_SHELLS, MAX_STAGE_DEPTH, MAX_TURN_STEPS } from "../constants";

```

**Edit 2 of 9.** In `src/game/titles/arcfire/weapons/validate.ts`, replace:

```ts

function checkEffects(
  errs: string[], path: string, effects: readonly Effect[], apexList: boolean, depth: number, inDelay: boolean, onPath: Set<Stage>,
): void {
  if (!Array.isArray(effects) || effects.length === 0) {
    errs.push(`${path}: must be a non-empty effect list`);
```

with:

```ts

function checkEffects(
  errs: string[], path: string, effects: readonly Effect[], apexList: boolean, depth: number, inDelay: boolean, onPath: Set<Stage>,
  seen: Map<Stage, number>,
): void {
  if (!Array.isArray(effects) || effects.length === 0) {
    errs.push(`${path}: must be a non-empty effect list`);
```

**Edit 3 of 9.** In `src/game/titles/arcfire/weapons/validate.ts`, replace:

```ts
      return;
    }
    if (!present(errs, `${p}.${keys[0]}`, (e as unknown as Record<string, unknown>)[keys[0]])) return;
    if (inDelay && (keys[0] === "split" || keys[0] === "delay")) errs.push(`${p}: a delay cannot schedule a ${keys[0]}`);
    if ("blast" in e) checkBlast(errs, `${p}.blast`, e.blast);
    else if ("split" in e) {
      const s = e.split;
```

with:

```ts
      return;
    }
    if (!present(errs, `${p}.${keys[0]}`, (e as unknown as Record<string, unknown>)[keys[0]])) return;
    if (inDelay && (keys[0] === "split" || keys[0] === "delay")) {
      errs.push(`${p}: a delay cannot schedule a ${keys[0]}`);
      return; // not descended into: a self-containing or deep delay chain is this one report
    }
    if ("blast" in e) checkBlast(errs, `${p}.blast`, e.blast);
    else if ("split" in e) {
      const s = e.split;
```

**Edit 4 of 9.** In `src/game/titles/arcfire/weapons/validate.ts`, replace:

```ts
      if (s.gapPx !== undefined) check(errs, `${p}.split.gapPx`, s.gapPx, 0, 200);
      if (s.from !== "up" && s.from !== "ahead" && s.from !== "cone") errs.push(`${p}.split.from: unknown`);
      else if (s.from !== "up" && !apexList) errs.push(`${p}.split.from: "${s.from}" only in an apex stage's effects (at an impact the heading points into the ground)`);
      checkStage(errs, `${p}.split.child`, s.child, depth + 1, onPath);
    } else if ("roll" in e) {
      check(errs, `${p}.roll.maxDistance`, e.roll.maxDistance, 1, 1200);
      checkBlast(errs, `${p}.roll.then`, e.roll.then);
```

with:

```ts
      if (s.gapPx !== undefined) check(errs, `${p}.split.gapPx`, s.gapPx, 0, 200);
      if (s.from !== "up" && s.from !== "ahead" && s.from !== "cone") errs.push(`${p}.split.from: unknown`);
      else if (s.from !== "up" && !apexList) errs.push(`${p}.split.from: "${s.from}" only in an apex stage's effects (at an impact the heading points into the ground)`);
      checkStage(errs, `${p}.split.child`, s.child, depth + 1, onPath, seen);
    } else if ("roll" in e) {
      check(errs, `${p}.roll.maxDistance`, e.roll.maxDistance, 1, 1200);
      checkBlast(errs, `${p}.roll.then`, e.roll.then);
```

**Edit 5 of 9.** In `src/game/titles/arcfire/weapons/validate.ts`, replace:

```ts
      check(errs, `${p}.quake.furrow`, e.quake.furrow, 0, 50);
    } else {
      check(errs, `${p}.delay.steps`, e.delay.steps, 1, 600);
      checkEffects(errs, `${p}.delay.then`, e.delay.then as Effect[], false, depth, true, onPath);
    }
  });
}
```

with:

```ts
      check(errs, `${p}.quake.furrow`, e.quake.furrow, 0, 50);
    } else {
      check(errs, `${p}.delay.steps`, e.delay.steps, 1, 600);
      checkEffects(errs, `${p}.delay.then`, e.delay.then as Effect[], false, depth, true, onPath, seen);
    }
  });
}
```

**Edit 6 of 9.** In `src/game/titles/arcfire/weapons/validate.ts`, replace:

```ts
 * Check one stage. `onPath` holds the stages from the root down to this one:
 * meeting one of them again is a cycle, reported once at that back-reference
 * and not descended into (a stage that refers to itself k times costs k
 * checks, not k^4).
 */
function checkStage(errs: string[], path: string, st: Stage, depth: number, onPath: Set<Stage>): void {
  if (!present(errs, path, st)) return;
  if (onPath.has(st)) {
    errs.push(`${path}: cyclic stage, so its stages nest deeper than ${MAX_STAGE_DEPTH}`);
```

with:

```ts
 * Check one stage. `onPath` holds the stages from the root down to this one:
 * meeting one of them again is a cycle, reported once at that back-reference
 * and not descended into (a stage that refers to itself k times costs k
 * checks, not k^4). `seen` maps each stage to a bitmask of the depths it was
 * checked at: a second check at the same depth would walk the same stages to
 * the same depth limit and find the same defects, so it is skipped, AFTER the
 * cycle and depth checks (every back-reference and every over-deep reference
 * is still reported). That bounds the walk by stages x MAX_STAGE_DEPTH, where
 * a multi-stage cycle with k back-references per stage used to cost k^L. Not
 * "this depth or a shallower one": a shallower check hits the depth limit
 * later, so it can miss an over-deep path through the stage.
 */
function checkStage(errs: string[], path: string, st: Stage, depth: number, onPath: Set<Stage>, seen: Map<Stage, number>): void {
  if (!present(errs, path, st)) return;
  if (onPath.has(st)) {
    errs.push(`${path}: cyclic stage, so its stages nest deeper than ${MAX_STAGE_DEPTH}`);
```

**Edit 7 of 9.** In `src/game/titles/arcfire/weapons/validate.ts`, replace:

```ts
    errs.push(`${path}: stages nest deeper than ${MAX_STAGE_DEPTH}`);
    return;
  }
  onPath.add(st);
  if (st.on !== "impact" && st.on !== "apex") errs.push(`${path}.on: unknown`);
  checkEffects(errs, `${path}.effects`, st.effects, st.on === "apex", depth, false, onPath);
  if (st.early !== undefined) {
    if (st.on !== "apex") errs.push(`${path}.early: only on an apex stage`);
    checkEffects(errs, `${path}.early`, st.early, false, depth, false, onPath);
  }
  if (st.homing !== undefined) {
    if (st.on !== "impact") errs.push(`${path}.homing: only on an impact stage`);
```

with:

```ts
    errs.push(`${path}: stages nest deeper than ${MAX_STAGE_DEPTH}`);
    return;
  }
  const at = seen.get(st) ?? 0;
  if ((at & (1 << depth)) !== 0) return; // already checked at this depth
  seen.set(st, at | (1 << depth));
  onPath.add(st);
  if (st.on !== "impact" && st.on !== "apex") errs.push(`${path}.on: unknown`);
  checkEffects(errs, `${path}.effects`, st.effects, st.on === "apex", depth, false, onPath, seen);
  if (st.early !== undefined) {
    if (st.on !== "apex") errs.push(`${path}.early: only on an apex stage`);
    checkEffects(errs, `${path}.early`, st.early, false, depth, false, onPath, seen);
  }
  if (st.homing !== undefined) {
    if (st.on !== "impact") errs.push(`${path}.homing: only on an impact stage`);
```

**Edit 8 of 9.** In `src/game/titles/arcfire/weapons/validate.ts`, replace:

```ts
  check(errs, "power", def.power, 1, 100);
  const l = def.launch;
  if (!present(errs, "launch", l)) {
    if (def.stage !== undefined) checkStage(errs, "stage", def.stage, 1, new Set());
    return errs;
  }
  check(errs, "launch.count", l.count ?? 1, 1, 9);
```

with:

```ts
  check(errs, "power", def.power, 1, 100);
  const l = def.launch;
  if (!present(errs, "launch", l)) {
    if (def.stage !== undefined) checkStage(errs, "stage", def.stage, 1, new Set(), new Map());
    return errs;
  }
  check(errs, "launch.count", l.count ?? 1, 1, 9);
```

**Edit 9 of 9.** In `src/game/titles/arcfire/weapons/validate.ts`, replace:

```ts
    check(errs, "launch.speedPct", l.speedPct ?? 100, 1, 300);
    check(errs, "launch.gravityPct", l.gravityPct ?? 100, 0, 200);
    if (!def.stage) errs.push("stage: a shell launch needs one");
    else checkStage(errs, "stage", def.stage, 1, new Set());
  } else if (l.kind === "beam") {
    check(errs, "launch.length", l.length, 1, 1400);
    check(errs, "launch.width", l.width, 2, 12);
```

with:

```ts
    check(errs, "launch.speedPct", l.speedPct ?? 100, 1, 300);
    check(errs, "launch.gravityPct", l.gravityPct ?? 100, 0, 200);
    if (!def.stage) errs.push("stage: a shell launch needs one");
    else checkStage(errs, "stage", def.stage, 1, new Set(), new Map());
  } else if (l.kind === "beam") {
    check(errs, "launch.length", l.length, 1, 1400);
    check(errs, "launch.width", l.width, 2, 12);
```

- [ ] **Step 4: Run the carry-over, corpus and validator tests**

Run: `npx vitest run src/game/titles/arcfire/carryovers.test.ts src/game/titles/arcfire/corpus.test.ts src/game/titles/arcfire/weapons/validate.test.ts`
Expected: PASS: 3 files, 21 tests. `validate.test.ts`'s 13 tests (cycles, a shared child, malformed input) pass unchanged.

- [ ] **Step 5: Run the Arcfire gate, types, the full suite and the cross-engine gate**

Run: `npx vitest run src/game/titles/arcfire src/game/test/arcfire src/game/runtime/arcfire src/game/sim/purity.test.ts`
Expected: PASS: 21 files, 222 tests.

Run: `npx tsc --noEmit`
Expected: exit 0.

Run: `npm test`
Expected: all pass: 61 test files passed and 1 skipped; 475 tests passed and 10 skipped.

Run: `npm run test:e2e:cross-engine -- --grep-invert firefox`
Expected: exit 0, `2 passed`.

Run: `git status --short`
Expected, exactly:

```
 M src/game/titles/arcfire/corpus.test.ts
 M src/game/titles/arcfire/weapons/validate.ts
?? src/game/titles/arcfire/carryovers.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add src/game/titles/arcfire/carryovers.test.ts src/game/titles/arcfire/corpus.test.ts src/game/titles/arcfire/weapons/validate.ts
git commit -m "fix(arcfire): the Plan 2A carry-overs; weaponErrors never descends into a delay, and a (stage, depth) memo bounds multi-stage cycles" -m "Plan 2B Task 3. carryovers.test.ts pins the delay fix (one report, no RangeError), the 4-stage ring (4 effect-list walks and 40 reports, against 65,641 walks before), the over-deep path through a stage already checked at a shallower depth, homing: null, maxTurnSteps (Twin Nova 1,230, Cascade 3,600, Lancer 1) and the backstop's single out event. corpus.test.ts pins that defDigest ignores power. Pin-neutral: 389a1340, 8d7dc831, a7100140, 3f614265 and 5167b43d unchanged." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

# Part B — The AI (Tasks 4–9)

Every task below adds one new test file, whole, and no later task edits it (the design's staging rule). So each task's test file imports only modules that exist when the task lands. Every unbundled test that searches or plays carries an explicit 30–120 s timeout in its code, because Vitest's 5 s default is too short for a search under a parallel `npm test`.

### Task 4: AI data — the tier table, the noise, the weapon models

**Files:**
- Create: `src/game/titles/arcfire/ai/data.test.ts` (design-verbatim, §10.2)
- Create: `src/game/titles/arcfire/ai/tiers.ts` (design-verbatim, §3.1)
- Create: `src/game/titles/arcfire/ai/noise.ts` (design-verbatim, §3.4)
- Create: `src/game/titles/arcfire/ai/model.ts` (design-verbatim, §4.2)

**Interfaces:**
- Consumes: `nextRange`, `Rng` (`@/game/sim/math/rng`); `idiv` (`imath.ts`); `Effect`, `Stage`, `WeaponDef` (`weapons/types.ts`); `ROSTER`, `ROSTER_INDEX`; `rngAfter` (T1).
- Produces:
  - `ai/tiers.ts`:
    - `type AiTier = "rookie" | "veteran" | "ace"`;
    - `interface TierSpec { angleStep: number; powerStep: number; refineA: number; refineP: number; stay: number; moveEach: number; movers: number; moveBelow: number; moveGain: number; dirt: number; noiseA: number; noiseP: number; noiseAware: boolean; pickTop: number; draftTop: number; saveTier3: boolean }`;
    - `MOVE_ALWAYS = 1 << 30`, `TIERS: Readonly<Record<AiTier, TierSpec>>`, `tierBudget(t: TierSpec): number` (300 / 1,500 / 4,000);
    - the shared constants `BUDGET_HAND = 10`, `DIRT_THREAT = 60`, `DIRT_GAIN = 20`, `DIRT_FRONT = 90`, `THREAT_AIMS = 2`, `BEAM_POWER = 50`.
  - `ai/noise.ts`: `noisePart(bound: number, i: number): number`, `drawNoise(rng: Rng, bound: number): number` (exactly 3 draws), `noiseKernel(bound: number): Int32Array`, `kernelTotal(k: Int32Array): number`.
  - `ai/model.ts`:
    - `interface FlightMods { stopAtApex: boolean; homeDeg: number; bounces: number; wallBounces: number; restitutionPct: number }`;
    - `interface ProbeModel { key: string; beam: { length: number; width: number; count: number; spreadDeg: number } | null; speedPct: number; gravityPct: number; mods: FlightMods; apex: { from: "up" | "ahead" | "cone"; speedPct: number; child: FlightMods } | null }`;
    - `probeModelOf(def: WeaponDef): ProbeModel`;
    - `dealsDamage(def: WeaponDef): boolean` (false exactly for the three DIRT weapons).

**Why:** the AI's one tuning surface (a 16-field table), the literal "seeded sum of 3 uniform integers" noise with its exact integer kernel, and the AI's only knowledge of weapons, derived from `WeaponDef` data. The roster flies 12 distinct probe models, and an appended weapon needs no AI code (Task 5's probe handles any weapon the validator accepts). The purity guard scans these files, comments included.

- [ ] **Step 1: Write the failing test**

Create `src/game/titles/arcfire/ai/data.test.ts` with (design-verbatim):

```ts
// src/game/titles/arcfire/ai/data.test.ts — Plan 2B T4: the tier table, the noise, the weapon models
import { describe, it, expect } from "vitest";
import { makeRng } from "@/game/sim/math/rng";
import { ROSTER, ROSTER_INDEX } from "../weapons/roster";
import { rngAfter } from "@/game/test/arcfire/fixtures";
import { drawNoise, kernelTotal, noiseKernel } from "./noise";
import { dealsDamage, probeModelOf } from "./model";
import { TIERS, tierBudget } from "./tiers";

describe("tiers", () => {
  it("budgets are the spec's fixed sim counts", () => {
    expect([TIERS.rookie, TIERS.veteran, TIERS.ace].map(tierBudget)).toEqual([300, 1500, 4000]);
  });
});

describe("noise (a seeded sum of 3 uniform integers)", () => {
  it("has the exact kernels", () => {
    expect(Array.from(noiseKernel(0))).toEqual([1]);
    expect(Array.from(noiseKernel(1))).toEqual([1, 1, 1]);
    expect(Array.from(noiseKernel(2))).toEqual([1, 2, 3, 2, 1]);
    expect(Array.from(noiseKernel(3))).toEqual([1, 3, 6, 7, 6, 3, 1]);
    for (const [b, total] of [[6, 125], [8, 245]]) {
      const k = Array.from(noiseKernel(b));
      expect(k.length).toBe(2 * b + 1);
      expect(kernelTotal(noiseKernel(b))).toBe(total);
      expect(k).toEqual(k.slice().reverse());
    }
  });
  it("draws exactly 3 values and spans exactly +-bound", () => {
    for (const bound of [1, 2, 3, 6, 8]) {
      const rng = makeRng(bound);
      const seen = new Set<number>();
      for (let i = 0; i < 20000; i++) {
        const before = rng.state;
        const v = drawNoise(rng, bound);
        expect(rng.state).toBe(rngAfter(before, 3));
        seen.add(v);
      }
      expect(Math.min(...seen)).toBe(0 - bound);
      expect(Math.max(...seen)).toBe(bound);
      expect(seen.size).toBe(2 * bound + 1);
    }
  }, 30_000);
});

describe("weapon models", () => {
  it("dealsDamage is false exactly for the DIRT weapons, and a cyclic def terminates", () => {
    expect(ROSTER.filter((w) => !dealsDamage(w)).map((w) => w.id)).toEqual(["rampart", "bastion", "leveler"]);
    const loop = { on: "impact" as const, effects: [] as never[] };
    (loop.effects as unknown[]).push({ split: { count: 1, spreadDeg: 0, speedPct: 50, from: "up", child: loop } });
    expect(dealsDamage({ ...ROSTER[0], stage: loop })).toBe(false);
  });
  it("the roster flies 12 distinct probe models", () => {
    expect(new Set(ROSTER.map((w) => probeModelOf(w).key)).size).toBe(12);
    expect(probeModelOf(ROSTER[ROSTER_INDEX.hydra]).key).toBe(probeModelOf(ROSTER[ROSTER_INDEX.barrage]).key);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/game/titles/arcfire/ai/data.test.ts`
Expected: FAIL: the file fails to load with `Error: Cannot find module './noise' imported from …/src/game/titles/arcfire/ai/data.test.ts`, and Vitest reports `Tests  no tests`.

- [ ] **Step 3: Create the tier table**

Create `src/game/titles/arcfire/ai/tiers.ts` with (design-verbatim):

```ts
// src/game/titles/arcfire/ai/tiers.ts
//
// The three AI tiers (spec §5) as data: the AI's one tuning surface. A budget
// is a FIXED count of full weapon resolves ("sims"), never a clock:
// tierBudget = stay + 2 x moveEach + dirt, pinned to 300 / 1,500 / 4,000 by a
// test. Probe flights are a separate count, fixed by the grid and the hand.
// After launch, any change here changes the regenerated AI of a vs-AI replay:
// it is a simVersion bump (the AI pins make it loud).
export type AiTier = "rookie" | "veteran" | "ace";

export interface TierSpec {
  angleStep: number; // probe grid: facing degrees 0..90 in this step (a wall bouncer 0..180; a beam the whole dial 0..180)
  powerStep: number; // probe grid: powers powerStep..100 in this step (beams: one power)
  refineA: number; // refine box: +-refineA degrees around a centre, step 1 (0 with refineP 0: no box, a centre is one cell)
  refineP: number; // refine box: +-refineP power, step 1 (beams: the angle only)
  stay: number; // sims from where the tank stands: each weapon in hand gets stay / max(BUDGET_HAND, hand size)
  moveEach: number; // sims from each legal moved position (0 = the tier never moves)
  movers: number; // the best stationary weapons re-searched from a moved position, sharing moveEach
  moveBelow: number; // look at moves only while the best stationary value is below this many points (MOVE_ALWAYS: always)
  moveGain: number; // a move must beat staying by at least this many points
  dirt: number; // sims for the DIRT decision (0 = the tier never defends)
  noiseA: number; // aim noise: a sum of 3 uniform integers within +-noiseA degrees (noise.ts)
  noiseP: number; // power noise, within +-noiseP
  noiseAware: boolean; // rank aims by their expected value under this tier's own noise (else by the value at the exact aim)
  pickTop: number; // weapon choice: uniform among the pickTop best weapons (1 = the best)
  draftTop: number; // draft: uniform among the draftTop available weapons with the highest roster power
  saveTier3: boolean; // fire a tier-3 weapon only when it beats the best other weapon by >= 20%
}

/** A moveBelow that every value is below: moves are always considered. */
export const MOVE_ALWAYS = 1 << 30;

export const TIERS: Readonly<Record<AiTier, TierSpec>> = Object.freeze({
  rookie: Object.freeze({
    angleStep: 5, powerStep: 10, refineA: 0, refineP: 0, stay: 300, moveEach: 0, movers: 0, moveBelow: 0, moveGain: 0,
    dirt: 0, noiseA: 6, noiseP: 8, noiseAware: false, pickTop: 4, draftTop: 8, saveTier3: false,
  }),
  veteran: Object.freeze({
    angleStep: 2, powerStep: 4, refineA: 2, refineP: 4, stay: 1200, moveEach: 150, movers: 1, moveBelow: 25, moveGain: 8,
    dirt: 0, noiseA: 2, noiseP: 3, noiseAware: false, pickTop: 1, draftTop: 3, saveTier3: false,
  }),
  ace: Object.freeze({
    angleStep: 1, powerStep: 2, refineA: 1, refineP: 2, stay: 3000, moveEach: 350, movers: 1, moveBelow: MOVE_ALWAYS, moveGain: 8,
    dirt: 300, noiseA: 1, noiseP: 1, noiseAware: true, pickTop: 1, draftTop: 1, saveTier3: true,
  }),
});

/** A tier's worst-case sims per turn: the stationary search, both move sides and the DIRT decision (spec §5: 300 / 1,500 / 4,000). */
export const tierBudget = (t: TierSpec): number => t.stay + 2 * t.moveEach + t.dirt;

// --- shared AI constants (spec §5)
export const BUDGET_HAND = 10; // stay is split into this many equal weapon shares at least (STANDARD hands hold 10): a smaller hand spends less
export const DIRT_THREAT = 60; // Ace considers DIRT when the enemy's estimated best reply to its planned shot is at least this
export const DIRT_GAIN = 20; // ... and fires DIRT when a build cuts that estimate by at least this many points
export const DIRT_FRONT = 90; // a DIRT placement: this many px in front of the AI's tank (the other is midway to the enemy)
export const THREAT_AIMS = 2; // the enemy's reply estimate: each enemy weapon at its THREAT_AIMS nearest probe aims on Rookie's grid
export const BEAM_POWER = 50; // the power an AI beam command carries (beams ignore power)
```

- [ ] **Step 4: Create the noise**

Create `src/game/titles/arcfire/ai/noise.ts` with (design-verbatim):

```ts
// src/game/titles/arcfire/ai/noise.ts
//
// Aim noise (spec §5): "a seeded sum of 3 uniform integers" from the MATCH
// RNG. Part i is uniform on [-a_i, a_i] with a_i = floor((bound + i) / 3), so
// the three half-ranges sum to the bound and |noise| <= bound:
//   bound 1 (Ace):     parts 0, 0, 1  -> uniform on -1..1
//   bound 2 (Veteran): parts 0, 1, 1  -> weights 1 2 3 2 1 (of 9)
//   bound 3 (Veteran): parts 1, 1, 1  -> weights 1 3 6 7 6 3 1 (of 27)
//   bound 6 (Rookie):  parts 2, 2, 2  -> a bell over -6..6 (of 125)
//   bound 8 (Rookie):  parts 2, 3, 3  -> a bell over -8..8 (of 245)
// Every call draws exactly 3 values (a part of 0 still draws nextRange(rng,
// 1)), so the RNG order never depends on the tier. noiseKernel is the exact
// integer distribution the noise-aware search ranks aims by.
import { nextRange, type Rng } from "@/game/sim/math/rng";
import { idiv } from "../imath";

/** The half-range of part i (0..2) of a noise of maximum `bound`. */
export const noisePart = (bound: number, i: number): number => idiv(bound + i, 3);

/** One noise value of maximum `bound`: exactly three draws from rng. */
export function drawNoise(rng: Rng, bound: number): number {
  let n = 0;
  for (let i = 0; i < 3; i++) {
    const a = noisePart(bound, i);
    n += nextRange(rng, 2 * a + 1) - a;
  }
  return n;
}

/** The exact distribution of drawNoise(rng, bound): integer weights for -bound..bound, summing to the product of (2 a_i + 1). */
export function noiseKernel(bound: number): Int32Array {
  let k = new Int32Array(1);
  k[0] = 1;
  for (let i = 0; i < 3; i++) {
    const a = noisePart(bound, i);
    const next = new Int32Array(k.length + 2 * a);
    for (let j = 0; j < k.length; j++) for (let d = 0; d <= 2 * a; d++) next[j + d] += k[j];
    k = next;
  }
  return k;
}

/** The sum of a kernel's weights (its denominator). */
export function kernelTotal(k: Int32Array): number {
  let s = 0;
  for (let i = 0; i < k.length; i++) s += k[i];
  return s;
}
```

- [ ] **Step 5: Create the weapon models**

Create `src/game/titles/arcfire/ai/model.ts` with (design-verbatim):

```ts
// src/game/titles/arcfire/ai/model.ts
//
// The AI's only knowledge of weapons, derived from WeaponDef data (no weapon
// ids anywhere in the AI), so an appended weapon needs no AI code:
//   probeModelOf: what the probe flies for a weapon (spec §5 step 1): the
//     launch's speed and gravity scales plus the first stage's flight
//     modifiers (homing, terrain bounces, wall bounces, stop at the apex),
//     and for an apex split the centre child it continues along;
//   dealsDamage: whether a weapon can score at all (the DIRT weapons cannot).
import type { Effect, Stage, WeaponDef } from "../weapons/types";

/** How a probe shell flies until its terminal trigger: the ballistics.ts Shell fields a Stage arms. */
export interface FlightMods {
  stopAtApex: boolean;
  homeDeg: number;
  bounces: number;
  wallBounces: number;
  restitutionPct: number;
}

export interface ProbeModel {
  key: string; // equal keys fly identically, so one landing grid serves every weapon with that key
  beam: { length: number; width: number; count: number; spreadDeg: number } | null; // beams: straight lines on the beam dial
  speedPct: number;
  gravityPct: number;
  mods: FlightMods;
  apex: { from: "up" | "ahead" | "cone"; speedPct: number; child: FlightMods } | null; // an apex split: its centre child
}

const modsOf = (st: Stage): FlightMods => ({
  stopAtApex: st.on === "apex",
  homeDeg: st.homing ? st.homing.degPerStep : 0,
  bounces: st.bounce && !st.bounce.walls ? st.bounce.times : 0,
  wallBounces: st.bounce && st.bounce.walls ? st.bounce.times : 0,
  restitutionPct: st.bounce ? st.bounce.restitutionPct : 100,
});

const modsKey = (f: FlightMods): string => `${f.stopAtApex ? 1 : 0}/${f.homeDeg}/${f.bounces}/${f.wallBounces}/${f.restitutionPct}`;

const PLAIN: FlightMods = { stopAtApex: false, homeDeg: 0, bounces: 0, wallBounces: 0, restitutionPct: 100 };

export function probeModelOf(def: WeaponDef): ProbeModel {
  const l = def.launch;
  if (l.kind === "beam") {
    const beam = { length: l.length, width: l.width, count: l.count ?? 1, spreadDeg: l.spreadDeg ?? 0 };
    return { key: `beam/${beam.length}/${beam.width}/${beam.count}/${beam.spreadDeg}`, beam, speedPct: 0, gravityPct: 0, mods: PLAIN, apex: null };
  }
  const speedPct = l.speedPct ?? 100;
  const gravityPct = l.gravityPct ?? 100;
  const st = def.stage;
  if (!st) return { key: `s/${speedPct}/${gravityPct}`, beam: null, speedPct, gravityPct, mods: PLAIN, apex: null };
  const mods = modsOf(st);
  let apex: ProbeModel["apex"] = null;
  if (st.on === "apex") {
    for (const e of st.effects) {
      if ("split" in e) {
        apex = { from: e.split.from, speedPct: e.split.speedPct, child: modsOf(e.split.child) };
        break;
      }
    }
  }
  const key = `s/${speedPct}/${gravityPct}/${modsKey(mods)}` + (apex ? `/${apex.from}/${apex.speedPct}/${modsKey(apex.child)}` : "");
  return { key, beam: null, speedPct, gravityPct, mods, apex };
}

/** Can this weapon score points at all? False exactly for pure DIRT (a build and nothing that hurts, anywhere in its stages). */
export function dealsDamage(def: WeaponDef): boolean {
  if (def.launch.kind === "beam") return def.launch.damage > 0;
  const seen = new Set<Stage>(); // a cyclic definition adds nothing new
  const listHurts = (list: readonly Effect[] | undefined): boolean => {
    for (const e of list ?? []) {
      if ("blast" in e || "roll" in e || "burn" in e || "quake" in e) return true;
      if ("dig" in e && (e.dig.then !== undefined || e.dig.each !== undefined)) return true;
      if ("split" in e && stageHurts(e.split.child)) return true;
      if ("delay" in e && listHurts(e.delay.then)) return true;
    }
    return false;
  };
  const stageHurts = (st: Stage): boolean => {
    if (seen.has(st)) return false;
    seen.add(st);
    return st.bounce?.blastEach !== undefined || listHurts(st.effects) || listHurts(st.early);
  };
  return def.stage !== undefined && stageHurts(def.stage);
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run src/game/titles/arcfire/ai/data.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 7: Run the Arcfire gate (with the purity guard), types and the full suite**

Run: `npx vitest run src/game/titles/arcfire src/game/test/arcfire src/game/runtime/arcfire src/game/sim/purity.test.ts`
Expected: PASS: 22 files, 227 tests. The purity guard now scans `ai/**`.

Run: `npx tsc --noEmit`
Expected: exit 0.

Run: `npm test`
Expected: all pass: 62 test files passed and 1 skipped; 480 tests passed and 10 skipped.

- [ ] **Step 8: Commit**

```bash
git add src/game/titles/arcfire/ai/data.test.ts src/game/titles/arcfire/ai/tiers.ts src/game/titles/arcfire/ai/noise.ts src/game/titles/arcfire/ai/model.ts
git commit -m "feat(arcfire): AI data; the tier table, the literal 3-part noise and the weapon probe models" -m "Plan 2B Task 4. TIERS as data with tierBudget 300 / 1,500 / 4,000 sims (stay + 2 x moveEach + dirt); drawNoise draws exactly 3 values (part i uniform on +-floor((bound + i) / 3)) and noiseKernel is its exact distribution (Ace 1 1 1, Veteran 1 2 3 2 1 and 1 3 6 7 6 3 1); probeModelOf derives each weapon's probe from its WeaponDef (12 models for the roster), dealsDamage is false exactly for the DIRT weapons." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 5: The probe — the weapon's own flight

**Files:**
- Create: `src/game/titles/arcfire/ai/probe.test.ts` (design §10.2, plus a review fix's termination test)
- Create: `src/game/titles/arcfire/ai/probe.ts` (design §4.2, with a review fix: an apex split is followed once)

**Interfaces:**
- Consumes:
  - `probe.ts`: `muzzle`, `launchShell`, `shellAt`, `stepShell`, `HitCircle`, `Shell` (`ballistics.ts`); `beamDir`, `fanOffset` (`weapons/primitives.ts`); `cosDeg`, `sinDeg` (`aimTable.ts`); `fromInt`, `mul`, `toInt` (`@/game/sim/math/fixed`); `Fx` (`@/game/sim/types`); `idiv` (`imath.ts`); `TANK_HIT_R`, `WORLD_H`, `WORLD_W` (`constants.ts`); `Terrain` (`terrain.ts`); `FlightMods`, `ProbeModel`, `BEAM_POWER`, `TierSpec` (T4).
  - `probe.test.ts`: `cloneMatch`; `resolveTurn`, `resolveWeapon`; `hitCircles` (`tanks.ts`); `spansFromHeight`; `ROSTER`, `ROSTER_INDEX`; `weaponErrors` (`weapons/validate.ts`); `Blast`, `Stage`, `WeaponDef` (`weapons/types.ts`); `battleBoards` (T1); `probeModelOf` (T4); `TIERS` (T4).
- Produces:
  - `interface ProbeBoard { t: Terrain; tanks: HitCircle[]; me: number; windStep: Fx }`;
  - `LAND_OUT = 0`, `LAND_TERRAIN = 1`, `LAND_FOE = 2`, `LAND_SELF = 3`, and `FAR = 1 << 30`;
  - `interface Grid { angles: Int32Array; powers: Int32Array; kind: Uint8Array; x: Int32Array; y: Int32Array; metric: Int32Array }` (cell `c = ia * powers.length + ip`);
  - `landingGrid(board: ProbeBoard, model: ProbeModel, spec: TierSpec, counter: { probes: number }): Grid`.

**Why:** the probe only orders aims, and every value the AI acts on comes from a full resolve. It flies the sim's own `muzzle` / `launchShell` / `stepShell`, so it is exact by construction: a plain probe lands on Pulse's blast pixel at every Rookie-grid aim of 8 boards, and a beam probe reaches the enemy exactly when Lancer damages it, on all 181 dial angles. An apex split continues along its centre child, which makes Hailstorm aimable.

**The review fix.** The design's `flyShell` re-spawned the centre child at every apex. Each re-spawn resets the shell's step count, so the flight cap never applies, and a weapon the validator accepts (an apex split launching `up` at 100% into a child that is itself an apex stage) looped forever: the first probe passed 100,000 re-spawns at a constant speed. The worker, the server's `scoreVsAi` and the sweep would hang on such an append. Now the split is followed once, and the child's own apex lands where it stops, which is where the sim's child acts. Every probe flight ends within two flight caps, whatever the weapon. No roster weapon reaches a second apex (its 3 apex stages have no apex child), so no decision and no pin moves; Task 10's four AI pins confirm it. The third test fires that weapon: it terminates, and it lands exactly where the sim's blast does.

- [ ] **Step 1: Write the failing test**

Create `src/game/titles/arcfire/ai/probe.test.ts` with (design §10.2, plus the review fix's third test and its imports):

```ts
// src/game/titles/arcfire/ai/probe.test.ts — Plan 2B T5: the probe flies the weapon's own flight, exactly
import { describe, it, expect } from "vitest";
import { cloneMatch } from "../state";
import { resolveTurn, resolveWeapon } from "../resolve";
import { hitCircles } from "../tanks";
import { spansFromHeight } from "../terrain";
import { ROSTER, ROSTER_INDEX } from "../weapons/roster";
import { weaponErrors } from "../weapons/validate";
import type { Blast, Stage, WeaponDef } from "../weapons/types";
import { battleBoards } from "@/game/test/arcfire/fixtures";
import { probeModelOf } from "./model";
import { LAND_FOE, LAND_OUT, landingGrid } from "./probe";
import { TIERS } from "./tiers";

describe("the probe", () => {
  it("lands a plain model exactly where Pulse's blast lands (or leaves the world where Pulse does)", () => {
    for (const b of battleBoards()) {
      const t = cloneMatch(b);
      spansFromHeight(t.terrain);
      const board = { t: t.terrain, tanks: hitCircles(t), me: b.shooter, windStep: Math.trunc((b.wind * 65536) / 60) };
      const g = landingGrid(board, probeModelOf(ROSTER[0]), TIERS.rookie, { probes: 0 });
      for (let c = 0; c < g.kind.length; c++) {
        const tl = resolveTurn(cloneMatch(b), { move: 0, weapon: 0, angle: g.angles[Math.trunc(c / g.powers.length)], power: g.powers[c % g.powers.length] });
        const blast = tl.events.find((e) => e.kind === "blast");
        if (g.kind[c] === LAND_OUT) expect(blast).toBeUndefined();
        else expect(blast && [blast.x, blast.y]).toEqual([g.x[c], g.y[c]]);
      }
    }
  }, 60_000);
  it("a beam probe reaches the enemy exactly when Lancer damages it, on the whole dial", () => {
    for (const b of battleBoards()) {
      const t = cloneMatch(b);
      spansFromHeight(t.terrain);
      const board = { t: t.terrain, tanks: hitCircles(t), me: b.shooter, windStep: 0 };
      const g = landingGrid(board, probeModelOf(ROSTER[ROSTER_INDEX.lancer]), TIERS.ace, { probes: 0 });
      expect(g.angles.length).toBe(181);
      for (let c = 0; c < g.angles.length; c++) {
        const tl = resolveTurn(cloneMatch(b), { move: 0, weapon: ROSTER_INDEX.lancer, angle: g.angles[c], power: 50 });
        expect(g.kind[c] === LAND_FOE, `angle ${g.angles[c]}`).toBe(tl.points[b.shooter] > 0);
      }
    }
  }, 60_000);
  it("follows an apex split once: an apex child that is itself an apex stage lands where the sim's child acts, so every probe ends", () => {
    const B: Blast = { radius: 28, damage: 40 };
    const child: Stage = { on: "apex", effects: [{ blast: B }], early: [{ blast: B }] };
    const def: WeaponDef = {
      id: "t", name: "T", tag: "SPLIT", tier: 1, power: 30, launch: { kind: "shell" },
      stage: { on: "apex", effects: [{ split: { count: 1, spreadDeg: 0, speedPct: 100, from: "up", child } }], early: [{ blast: B }] },
    };
    expect(weaponErrors(def)).toEqual([]); // a legal append, which the AI must handle with no AI code
    for (const b of battleBoards()) {
      const t = cloneMatch(b);
      spansFromHeight(t.terrain);
      const board = { t: t.terrain, tanks: hitCircles(t), me: b.shooter, windStep: Math.trunc((b.wind * 65536) / 60) };
      const counter = { probes: 0 };
      const g = landingGrid(board, probeModelOf(def), TIERS.rookie, counter); // re-spawning at every apex, this never returned
      expect(counter.probes).toBe(g.kind.length);
      for (let c = 0; c < g.kind.length; c++) {
        const tl = resolveWeapon(cloneMatch(b), def, { move: 0, weapon: 0, angle: g.angles[Math.trunc(c / g.powers.length)], power: g.powers[c % g.powers.length] });
        const blast = tl.events.find((e) => e.kind === "blast");
        if (g.kind[c] === LAND_OUT) expect(blast).toBeUndefined();
        else expect(blast && [blast.x, blast.y]).toEqual([g.x[c], g.y[c]]);
      }
    }
  }, 60_000);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/game/titles/arcfire/ai/probe.test.ts`
Expected: FAIL: `Error: Cannot find module './probe' imported from …/src/game/titles/arcfire/ai/probe.test.ts`; `Tests  no tests`.

- [ ] **Step 3: Create the probe**

Create `src/game/titles/arcfire/ai/probe.ts` with (design §4.2, verbatim except the review fix in `flyShell` and the header comment's matching sentence):

```ts
// src/game/titles/arcfire/ai/probe.ts
//
// The coarse probe (spec §5 step 1): where does an aim land? It flies the
// weapon's probe model (model.ts) with the sim's OWN flight code (muzzle,
// launchShell, stepShell: no second integrator), effect-free, over a settled
// board whose spans are built, and writes nothing to the board. A plain
// model lands exactly where a plain shell's blast would; bounces, wall
// bounces and homing fly exactly as the first shell of the weapon does; an
// apex split continues along its centre child from the apex (Hailstorm's
// cone lands 100-160 px short of a plain shell, and this follows it), and
// only once: a child that is itself an apex stage acts where it stops, as in
// the sim, so every probe ends within two flight caps, whatever the weapon.
// A beam probe is the fireBeams line on the beam dial, every beam of the fan.
// The probe only ORDERS aims: every value the AI acts on comes from a full
// resolve, so a probe that differs from the real weapon costs search
// quality, never correctness. Pure integer math.
import type { Fx } from "@/game/sim/types";
import { fromInt, mul, toInt } from "@/game/sim/math/fixed";
import { cosDeg, sinDeg } from "../aimTable";
import { launchShell, muzzle, shellAt, stepShell, type HitCircle, type Shell } from "../ballistics";
import { beamDir, fanOffset } from "../weapons/primitives";
import { idiv } from "../imath";
import { TANK_HIT_R, WORLD_H, WORLD_W } from "../constants";
import type { Terrain } from "../terrain";
import type { FlightMods, ProbeModel } from "./model";
import { BEAM_POWER, type TierSpec } from "./tiers";

/** What a probe flies over: settled terrain with its spans built, both hitbox centres (the shooter's possibly moved), the wind step. */
export interface ProbeBoard {
  t: Terrain;
  tanks: HitCircle[];
  me: number;
  windStep: Fx;
}

export const LAND_OUT = 0; // left the world, or its flight cap
export const LAND_TERRAIN = 1;
export const LAND_FOE = 2;
export const LAND_SELF = 3;
/** The metric of a landing that is no use: out, or on the shooter's own tank. Above every real squared distance. */
export const FAR = 1 << 30;

/** One landing grid: every (angle, power) of a tier's probe grid for one model from one position. Cell c = ia * powers.length + ip. */
export interface Grid {
  angles: Int32Array; // command angles
  powers: Int32Array;
  kind: Uint8Array; // LAND_*
  x: Int32Array; // the landing px (first solid or hitbox px; for a beam, its sample nearest the foe)
  y: Int32Array;
  metric: Int32Array; // squared px from the landing to the foe's hitbox centre: 0 = on the foe, FAR = no use
}

function arm(s: Shell, f: FlightMods, board: ProbeBoard): void {
  const foe = board.tanks[1 - board.me];
  s.stopAtApex = f.stopAtApex;
  s.homeDeg = f.homeDeg;
  s.homeX = foe.x; // addShell's homing target: the foe's hitbox centre, fixed for the shot
  s.homeY = foe.y;
  s.bounces = f.bounces;
  s.wallBounces = f.wallBounces;
  s.restitutionPct = f.restitutionPct;
}

/** Fly one shell probe; writes (kind, x, y) into out. An apex split is followed once, so the flight ends within two flight caps. */
function flyShell(board: ProbeBoard, model: ProbeModel, angle: number, power: number, out: Int32Array): void {
  const me = board.tanks[board.me];
  const mz = muzzle(me.x, me.y, angle);
  let s = launchShell(mz.x, mz.y, angle, power, model.speedPct, model.gravityPct);
  arm(s, model.mods, board);
  let split = false; // at most once: a re-spawned child starts a fresh flight cap, so splitting at every apex could fly forever
  for (;;) {
    const hit = stepShell(s, board.t, board.tanks, board.windStep);
    if (hit === null || hit.kind === "bounce") continue;
    if (hit.kind === "apex") {
      const a = model.apex;
      if (a === null || split) { // an apex stage with no split, or the split's own apex child, acts where it stops
        out[0] = LAND_TERRAIN;
        out[1] = hit.x;
        out[2] = hit.y;
        return;
      }
      split = true;
      // the centre child (fan offset 0, no gap), launched as primitives.split launches it
      const speed = idiv(s.speed * a.speedPct, 100);
      const vx = a.from === "up" ? 0 : a.from === "cone" ? s.vx : idiv(s.vx * a.speedPct, 100);
      const vy = a.from === "up" ? 0 - speed : a.from === "cone" ? s.vy + speed : idiv(s.vy * a.speedPct, 100);
      s = shellAt(hit.fx, hit.fy, vx, vy, speed, s.gravityStep);
      arm(s, a.child, board);
      continue;
    }
    if (hit.kind === "out") {
      out[0] = LAND_OUT;
      out[1] = hit.x;
      out[2] = hit.y;
      return;
    }
    out[0] = hit.kind === "tank" ? (hit.tank === board.me ? LAND_SELF : LAND_FOE) : LAND_TERRAIN;
    out[1] = hit.x;
    out[2] = hit.y;
    return;
  }
}

/** A beam fan on the beam dial: the fireBeams line of every beam; writes (kind, x, y) of the sample nearest the foe, and returns its squared distance. */
function flyBeam(board: ProbeBoard, beam: NonNullable<ProbeModel["beam"]>, angle: number, out: Int32Array): number {
  const me = board.tanks[board.me];
  const foe = board.tanks[1 - board.me];
  let best = FAR;
  out[1] = me.x;
  out[2] = me.y;
  for (let b = 0; b < beam.count; b++) {
    const a = beamDir(board.me, angle + fanOffset(b, beam.count, beam.spreadDeg));
    const mz = muzzle(me.x, me.y, a);
    const dx = toInt(mul(fromInt(beam.length), cosDeg(a)));
    const dy = 0 - toInt(mul(fromInt(beam.length), sinDeg(a)));
    const n = Math.max(Math.abs(dx), Math.abs(dy), 1);
    for (let i = 0; i <= n; i++) {
      const sx = mz.x + idiv(dx * i, n);
      const sy = mz.y + idiv(dy * i, n);
      if (sx < 0 || sx >= WORLD_W || sy >= WORLD_H) break; // fireBeams' stops: the side edges and the floor
      const ex = sx - foe.x;
      const ey = sy - foe.y;
      if (ex * ex + ey * ey < best) {
        best = ex * ex + ey * ey;
        out[1] = sx;
        out[2] = sy;
      }
    }
  }
  const reach = TANK_HIT_R + idiv(beam.width, 2);
  out[0] = best <= reach * reach ? LAND_FOE : LAND_TERRAIN;
  return best;
}

const LAND = new Int32Array(3);

/**
 * The tier's landing grid for one model from the board's shooter position. Shells fly the facing
 * quarter (facing degrees 0..90: command angle f for player 0, 180 - f for player 1), a wall bouncer
 * the facing half (0..180), at powers powerStep..100. A beam sweeps the whole dial 0..180 at BEAM_POWER
 * (dial 90 is level at the opponent for both players). counter.probes counts the flights.
 */
export function landingGrid(board: ProbeBoard, model: ProbeModel, spec: TierSpec, counter: { probes: number }): Grid {
  const span = model.beam !== null || model.mods.wallBounces > 0 ? 180 : 90;
  const na = idiv(span, spec.angleStep) + 1;
  const np = model.beam !== null ? 1 : idiv(100, spec.powerStep);
  const angles = new Int32Array(na);
  const powers = new Int32Array(np);
  for (let i = 0; i < na; i++) angles[i] = model.beam !== null || board.me === 0 ? i * spec.angleStep : 180 - i * spec.angleStep;
  if (model.beam !== null) powers[0] = BEAM_POWER;
  else for (let j = 0; j < np; j++) powers[j] = (j + 1) * spec.powerStep;
  const n = na * np;
  const g: Grid = { angles, powers, kind: new Uint8Array(n), x: new Int32Array(n), y: new Int32Array(n), metric: new Int32Array(n) };
  const foe = board.tanks[1 - board.me];
  for (let c = 0; c < n; c++) {
    const a = angles[idiv(c, np)];
    let d: number;
    if (model.beam !== null) d = flyBeam(board, model.beam, a, LAND);
    else {
      flyShell(board, model, a, powers[c % np], LAND);
      const ex = LAND[1] - foe.x;
      const ey = LAND[2] - foe.y;
      d = LAND[0] === LAND_FOE ? 0 : LAND[0] === LAND_TERRAIN ? ex * ex + ey * ey : FAR;
    }
    counter.probes++;
    g.kind[c] = LAND[0];
    g.x[c] = LAND[1];
    g.y[c] = LAND[2];
    g.metric[c] = d; // < FAR for every real landing (at most about 1,300^2 px), so it always ranks before a useless one
  }
  return g;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/game/titles/arcfire/ai/probe.test.ts`
Expected: PASS (3 tests). The third is the review fix's test. Against the design's `flyShell`, which re-spawns at every apex, it would never return: the loop is synchronous, so Vitest's timeout cannot stop it.

- [ ] **Step 5: Run the Arcfire gate, types and the full suite**

Run: `npx vitest run src/game/titles/arcfire src/game/test/arcfire src/game/runtime/arcfire src/game/sim/purity.test.ts`
Expected: PASS: 23 files, 230 tests.

Run: `npx tsc --noEmit`
Expected: exit 0.

Run: `npm test`
Expected: all pass: 63 test files passed and 1 skipped; 483 tests passed and 10 skipped.

- [ ] **Step 6: Commit**

```bash
git add src/game/titles/arcfire/ai/probe.test.ts src/game/titles/arcfire/ai/probe.ts
git commit -m "feat(arcfire): the AI probe flies the weapon's own flight (landingGrid)" -m "Plan 2B Task 5. The probe flies a weapon's probe model with the sim's own muzzle, launchShell and stepShell over a scratch board (no second integrator, no Timeline): a plain probe lands on Pulse's blast pixel at every Rookie-grid aim of 8 boards, and a beam probe reaches the enemy exactly when Lancer damages it on all 181 dial angles. Apex splits follow their centre child, once: a child that is itself an apex stage lands where it stops, so every probe ends within two flight caps for any weapon the validator accepts (a test fires such a weapon; re-spawning at every apex looped forever). Wall bouncers fly the facing half." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 6: The search — one weapon's refine boxes, and the RNG-free turn plan

**Files:**
- Create: `src/game/titles/arcfire/ai/search.test.ts` (design-verbatim, §10.2)
- Create: `src/game/titles/arcfire/ai/search.ts` (design-verbatim, §3.5)
- Create: `src/game/titles/arcfire/ai/plan.ts` (design-verbatim, §3.5)

**Interfaces:**
- Consumes: `copyMatchInto` (T1), `cloneMatch`; `resolveTurnPoints`; `spansFromHeight`; `hitCircles`, `moveTarget` (`tanks.ts`); `ROSTER`; `idiv`; `STEPS_PER_SEC`, `TANK_HIT_DY`, `SUDDEN_DEATH_WEAPON`, `WORLD_W`; `fromInt`; T4's tiers, noise and models; T5's `landingGrid`, `Grid`, `ProbeBoard`, `FAR`, `LAND_TERRAIN`.
- Produces:
  - `ai/search.ts`:
    - `interface Cand { w: number; move: -1 | 0 | 1; angle: number; power: number; ev: number; raw: number }`;
    - `type AiReason = "random" | "best" | "move" | "saveT3" | "dirt" | "forcedDirt" | "inertOnly"`;
    - `interface AiStats { sims: number; probes: number; staySims: number; moveSims: number; dirtSims: number; reply: number; replyDirt: number; reason: AiReason }`;
    - `interface SearchCtx { m: MatchState; t: TierSpec; me: number; foe: number; base: MatchState; windStep: number; ka: Int32Array; kp: Int32Array; scale: number; stats: AiStats; grids: Map<string, Grid> }`;
    - `BASE_SLOT = 0`, `RESOLVE_SLOT = 1`, `POST_SLOT = 2`, and `scratch(slot: number, src: MatchState): MatchState`;
    - `newStats(): AiStats`, `makeCtx(m: MatchState, t: TierSpec, stats: AiStats): SearchCtx`, `boardAt(ctx: SearchCtx, side: -1 | 0 | 1): ProbeBoard`, `gridFor(ctx: SearchCtx, side: -1 | 0 | 1, model: ProbeModel): Grid`, `valueOf(ctx: SearchCtx, from: MatchState, w: number, move: -1 | 0 | 1, angle: number, power: number): number`;
    - `centres(g: Grid, gap: number, perCell: boolean): number[]`, `searchWeapon(ctx: SearchCtx, w: number, move: -1 | 0 | 1, share: number): Cand`.
  - `ai/plan.ts`:
    - `interface Plan { choices: Cand[]; ranked: Cand[]; stats: AiStats }`;
    - `byValue(a: Cand, b: Cand): number`: ev descending, then the lower tier, then roster index;
    - `chooseOffence(cands: readonly Cand[], t: TierSpec): { pick: Cand | null; saved: boolean }`;
    - `planTurn(m: MatchState, tier: AiTier): Plan` and `planWith(m: MatchState, t: TierSpec): Plan`. Both are RNG-free and never write `m`.

**Why:** the heart of the AI (design §3):
- **Per weapon:** a probe grid, refine centres one box apart along the firing-solution curve, and every box cell fully resolved within a fixed share of `⌊stay / max(10, hand)⌋` sims.
- **Ranking:** the Ace by its exact expected value under its own ±1 noise; Rookie and Veteran by the exact value.
- **Then the turn rules:** moves re-probed from the moved tank; the Ace's tier-3 saving and DIRT rule.

The test proves the purity the resume and hints rely on: `planTurn` leaves the match and its RNG untouched, plans the same on a clone, and stays within `tierBudget`.

- [ ] **Step 1: Write the failing test**

Create `src/game/titles/arcfire/ai/search.test.ts` with (design-verbatim):

```ts
// src/game/titles/arcfire/ai/search.test.ts — Plan 2B T6: the RNG-free search and the choice rules
import { describe, it, expect } from "vitest";
import { cloneMatch } from "../state";
import { hashMatch } from "../hash";
import { resolveTurn } from "../resolve";
import { ROSTER, ROSTER_INDEX } from "../weapons/roster";
import { battleBoards, corpusState } from "@/game/test/arcfire/fixtures";
import { byValue, chooseOffence, planTurn } from "./plan";
import { TIERS, tierBudget } from "./tiers";
import type { Cand } from "./search";

describe("the search", () => {
  it("never writes the match or its RNG, stays within its budget, and plans the same on a clone", () => {
    const m = corpusState(11, 9);
    for (const tier of ["rookie", "veteran", "ace"] as const) {
      const hash = hashMatch(m);
      const a = planTurn(m, tier);
      expect(hashMatch(m)).toBe(hash);
      expect(planTurn(cloneMatch(m), tier)).toEqual(a);
      expect(a.stats.sims).toBeLessThanOrEqual(tierBudget(TIERS[tier]));
    }
  }, 120_000);
  it("finds the Hailstorm cone: a Veteran with only Hailstorm scores on every board", () => {
    for (const b of battleBoards().filter((x) => x.wind === 0)) {
      const m = cloneMatch(b);
      m.hands[m.shooter] = [ROSTER_INDEX.hailstorm];
      const c = planTurn(m, "veteran").choices[0];
      const tl = resolveTurn(cloneMatch(m), { move: c.move, weapon: c.w, angle: c.angle, power: c.power });
      expect(tl.points[m.shooter]).toBeGreaterThan(0);
    }
  }, 60_000);
});

const cand = (id: string, ev: number): Cand => ({ w: ROSTER_INDEX[id], move: 0, angle: 45, power: 60, ev, raw: ev });

describe("the choice rules", () => {
  it("Ace saves a tier-3 weapon unless it beats the best other by >= 20%, strictly", () => {
    expect(chooseOffence([cand("nova", 100), cand("pulse2", 83)], TIERS.ace).pick!.w).toBe(ROSTER_INDEX.nova); // 500 >= 498
    const saved = chooseOffence([cand("nova", 100), cand("pulse2", 84)], TIERS.ace); // 500 < 504
    expect([saved.pick!.w, saved.saved]).toEqual([ROSTER_INDEX.pulse2, true]);
    expect(chooseOffence([cand("nova", 0), cand("pulse2", 0)], TIERS.ace).pick!.w).toBe(ROSTER_INDEX.nova); // no alternative with ev > 0
    expect(chooseOffence([cand("nova", 90), cand("swarm", 80)], TIERS.ace).pick!.w).toBe(ROSTER_INDEX.nova); // only tier 3
    expect(chooseOffence([cand("nova", 100), cand("pulse2", 84)], TIERS.veteran).pick!.w).toBe(ROSTER_INDEX.nova); // Veteran never saves
    expect(chooseOffence([cand("pulse", 40), cand("tumbler", 40)], TIERS.veteran).pick!.w).toBe(ROSTER_INDEX.pulse); // the first of equals
  });
  it("ranks by ev, then the lower tier, then roster index", () => {
    const r = [cand("nova", 60), cand("pulse2", 60), cand("tumbler", 60), cand("pulse", 70)].sort(byValue).map((c) => ROSTER[c.w].id);
    expect(r).toEqual(["pulse", "tumbler", "pulse2", "nova"]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/game/titles/arcfire/ai/search.test.ts`
Expected: FAIL: `Error: Cannot find module './plan' imported from …/src/game/titles/arcfire/ai/search.test.ts`; `Tests  no tests`.

- [ ] **Step 3: Create one weapon's search**

Create `src/game/titles/arcfire/ai/search.ts` with (design-verbatim):

```ts
// src/game/titles/arcfire/ai/search.ts
//
// One weapon's search (spec §5 steps 1-2), under a fixed allowance of full
// resolves ("sims"):
//   1. its probe model's landing grid from the shooter's position (probe.ts);
//   2. refine centres: each angle row's aim that lands nearest the enemy,
//      rows in (distance, cell) order and at least one refine box apart, so
//      the boxes spread along the whole firing-solution curve (direct shots
//      and lobs); Rookie has no box, so its centres are single cells;
//   3. every cell of each centre's refine box, in order, fully resolved on a
//      scratch copy (copyMatchInto + resolveTurnPoints), each (angle, power)
//      at most once, until the allowance is spent;
//   4. the answer: the best value at an exact aim, or (a noise-aware tier)
//      the best expected value under the tier's own noise over the aims whose
//      whole noise support was resolved, compared with the best exact aim's
//      expected value when its support is resolved (completing it only if the
//      share still has room, which it seldom has: the boxes spend it).
// A candidate's value is points to the enemy minus points gifted by
// self-damage (spec §5). Pure with respect to the match: nothing here writes
// the searched state or draws from its RNG. Every comparison is a strict >
// in a fixed order, so ties keep the earlier candidate. Integer math only.
import { fromInt } from "@/game/sim/math/fixed";
import { cloneMatch, copyMatchInto, type MatchState } from "../state";
import { resolveTurnPoints } from "../resolve";
import { spansFromHeight } from "../terrain";
import { hitCircles, moveTarget } from "../tanks";
import { ROSTER } from "../weapons/roster";
import { idiv } from "../imath";
import { STEPS_PER_SEC, TANK_HIT_DY } from "../constants";
import { probeModelOf, type ProbeModel } from "./model";
import { landingGrid, type Grid, type ProbeBoard } from "./probe";
import { kernelTotal, noiseKernel } from "./noise";
import type { TierSpec } from "./tiers";

/** A candidate command and its worth: ev = value x ctx.scale (the expected value under noise for a noise-aware tier), raw = the value at exactly this aim. */
export interface Cand {
  w: number; // roster index
  move: -1 | 0 | 1;
  angle: number;
  power: number;
  ev: number;
  raw: number;
}

export type AiReason = "random" | "best" | "move" | "saveT3" | "dirt" | "forcedDirt" | "inertOnly";

/** What one AI decision cost and why it chose: counts only, never a clock. */
export interface AiStats {
  sims: number; // full resolves: never above the tier's budget
  probes: number; // probe flights
  staySims: number;
  moveSims: number;
  dirtSims: number;
  reply: number; // the enemy's estimated best reply to the offensive pick (-1: not estimated)
  replyDirt: number; // ... after the best DIRT option (-1: none tried)
  reason: AiReason;
}

export interface SearchCtx {
  m: MatchState; // the state searched: never written
  t: TierSpec;
  me: number;
  foe: number;
  base: MatchState; // m's scratch copy with spans built: every probe of this decision flies over it
  windStep: number;
  ka: Int32Array; // the angle noise kernel ([1] when the tier is not noise-aware)
  kp: Int32Array; // the power noise kernel ([1] likewise)
  scale: number; // the kernels' combined total: every ev is points x scale
  stats: AiStats;
  grids: Map<string, Grid>; // (side, model key) -> landing grid; get/set only, never iterated
}

// --- module scratch: the AI runs one decision at a time on its thread (worker or verifier), and never re-enters

const SLOTS: (MatchState | null)[] = [null, null, null];
export const BASE_SLOT = 0; // the probe board of a decision
export const RESOLVE_SLOT = 1; // every candidate resolve
export const POST_SLOT = 2; // a board after the AI's own shot (the DIRT rule)

/** A reused scratch match holding a copy of src (spans stale until a resolve or spansFromHeight). */
export function scratch(slot: number, src: MatchState): MatchState {
  const s = SLOTS[slot];
  if (s === null) {
    const c = cloneMatch(src);
    SLOTS[slot] = c;
    return c;
  }
  copyMatchInto(s, src);
  return s;
}

const CELLS = 181 * 101; // every (angle, power) a command can name: key a * 101 + p
const VALS = new Int32Array(CELLS); // the value of each resolved aim of the current weapon ...
const STAMP = new Int32Array(CELLS); // ... valid while STAMP[key] === GEN
const ORDER = new Int32Array(CELLS); // the keys resolved for the current weapon, in resolution order
let GEN = 0;
let COUNT = 0;

/** A fresh generation: forget every value (the stamp wraps before 2^31, so decisions never depend on history). */
function newWeapon(): void {
  GEN++;
  if (GEN > 0x3fffffff) {
    STAMP.fill(0);
    GEN = 1;
  }
  COUNT = 0;
}

export const newStats = (): AiStats => ({
  sims: 0, probes: 0, staySims: 0, moveSims: 0, dirtSims: 0, reply: -1, replyDirt: -1, reason: "best",
});

export function makeCtx(m: MatchState, t: TierSpec, stats: AiStats): SearchCtx {
  const base = scratch(BASE_SLOT, m);
  spansFromHeight(base.terrain);
  const ka = noiseKernel(t.noiseAware ? t.noiseA : 0);
  const kp = noiseKernel(t.noiseAware ? t.noiseP : 0);
  return {
    m, t, me: m.shooter, foe: 1 - m.shooter, base, windStep: idiv(fromInt(m.wind), STEPS_PER_SEC),
    ka, kp, scale: kernelTotal(ka) * kernelTotal(kp), stats, grids: new Map(),
  };
}

/** The probe board with the shooter where it stands (side 0) or after a legal one-step move to `side`. */
export function boardAt(ctx: SearchCtx, side: -1 | 0 | 1): ProbeBoard {
  const b = ctx.base;
  const tanks = hitCircles(b);
  if (side !== 0) {
    const nx = moveTarget(b, ctx.me, side);
    tanks[ctx.me] = { x: nx, y: b.terrain.height[nx] - TANK_HIT_DY };
  }
  return { t: b.terrain, tanks, me: ctx.me, windStep: ctx.windStep };
}

/** The tier's landing grid for `model` from `side`, flown once per decision. */
export function gridFor(ctx: SearchCtx, side: -1 | 0 | 1, model: ProbeModel): Grid {
  const key = `${side}|${model.key}`;
  let g = ctx.grids.get(key);
  if (g === undefined) {
    g = landingGrid(boardAt(ctx, side), model, ctx.t, ctx.stats);
    ctx.grids.set(key, g);
  }
  return g;
}

/** Resolve one candidate on the scratch copy: points scored minus points gifted (spec §5). */
export function valueOf(ctx: SearchCtx, from: MatchState, w: number, move: -1 | 0 | 1, angle: number, power: number): number {
  const r = scratch(RESOLVE_SLOT, from);
  const shooter = r.shooter;
  const pts = resolveTurnPoints(r, { move, weapon: w, angle, power });
  ctx.stats.sims++;
  return pts[shooter] - pts[1 - shooter];
}

/** The grid's cells in (metric, cell) order: every cell (perCell), or each angle row's nearest cell with rows at least `gap` apart. */
export function centres(g: Grid, gap: number, perCell: boolean): number[] {
  const np = g.powers.length;
  const cand: number[] = [];
  for (let i = 0; i < g.angles.length; i++) {
    if (perCell) {
      for (let j = 0; j < np; j++) cand.push(i * np + j);
      continue;
    }
    let bc = i * np;
    for (let j = 1; j < np; j++) if (g.metric[i * np + j] < g.metric[bc]) bc = i * np + j;
    cand.push(bc);
  }
  cand.sort((x, y) => g.metric[x] - g.metric[y] || x - y);
  if (perCell || gap <= 1) return cand;
  const out: number[] = [];
  for (const c of cand) {
    const row = idiv(c, np);
    let ok = true;
    for (const o of out) {
      const d = idiv(o, np) - row;
      if (d < gap && d > 0 - gap) {
        ok = false;
        break;
      }
    }
    if (ok) out.push(c);
  }
  return out;
}

const clampA = (a: number): number => (a < 0 ? 0 : a > 180 ? 180 : a);
const clampP = (p: number): number => (p < 0 ? 0 : p > 100 ? 100 : p);

/** The value at (a, p) if resolved for the current weapon, else null. */
function known(a: number, p: number): number | null {
  const k = a * 101 + p;
  return STAMP[k] === GEN ? VALS[k] : null;
}

/** The expected value x scale of aiming at (a, p) under the tier's noise (clamped as the command is), or null while its support is not all resolved. A beam ignores power: all its power weight sits on p. */
function evAt(ctx: SearchCtx, a: number, p: number, beam: boolean): number | null {
  const ka = ctx.ka;
  const kp = ctx.kp;
  const na = (ka.length - 1) >> 1;
  const np = (kp.length - 1) >> 1;
  let sum = 0;
  for (let i = 0; i < ka.length; i++) {
    const aa = clampA(a + i - na);
    for (let j = 0; j < kp.length; j++) {
      const v = known(aa, beam ? p : clampP(p + j - np));
      if (v === null) return null;
      sum += ka[i] * kp[j] * v;
    }
  }
  return sum;
}

/** Resolve (a, p) for weapon w if it is new and the allowance has room; true when it was resolved. */
function tryResolve(ctx: SearchCtx, w: number, move: -1 | 0 | 1, a: number, p: number, left: { n: number }): boolean {
  if (a < 0 || a > 180 || p < 0 || p > 100) return false;
  const k = a * 101 + p;
  if (STAMP[k] === GEN || left.n <= 0) return false;
  left.n--;
  VALS[k] = valueOf(ctx, ctx.m, w, move, a, p);
  STAMP[k] = GEN;
  ORDER[COUNT++] = k;
  return true;
}

/** Weapon w's best candidate after `move` (the move is part of every resolve), spending at most `share` sims. */
export function searchWeapon(ctx: SearchCtx, w: number, move: -1 | 0 | 1, share: number): Cand {
  const t = ctx.t;
  const model = probeModelOf(ROSTER[w]);
  const beam = model.beam !== null;
  const g = gridFor(ctx, move, model);
  const rA = t.refineA;
  const rP = beam ? 0 : t.refineP;
  const perCell = t.refineA === 0 && t.refineP === 0;
  const cs = centres(g, perCell ? 0 : idiv(2 * rA + t.angleStep, t.angleStep), perCell); // ceil((2 rA + 1) / angleStep) rows: the boxes never overlap
  const left = { n: share };
  newWeapon();
  for (const c of cs) {
    if (left.n <= 0) break;
    const a0 = g.angles[idiv(c, g.powers.length)];
    const p0 = g.powers[c % g.powers.length];
    for (let da = 0 - rA; da <= rA; da++) for (let dp = 0 - rP; dp <= rP; dp++) tryResolve(ctx, w, move, a0 + da, p0 + dp, left);
  }
  if (COUNT === 0) { // nothing resolved (a zero allowance): the nearest aim, unscored
    const c = cs[0];
    return { w, move, angle: g.angles[idiv(c, g.powers.length)], power: g.powers[c % g.powers.length], ev: 0, raw: 0 };
  }
  // the best exact aim (the first of equals)
  let top = ORDER[0];
  for (let i = 1; i < COUNT; i++) if (VALS[ORDER[i]] > VALS[top]) top = ORDER[i];
  const ta = idiv(top, 101);
  const tp = top % 101;
  if (!t.noiseAware) return { w, move, angle: ta, power: tp, ev: VALS[top] * ctx.scale, raw: VALS[top] };
  // noise-aware: the best expected value among aims whose support is resolved
  let best: Cand | null = null;
  const n = COUNT;
  for (let i = 0; i < n; i++) {
    const k = ORDER[i];
    const ev = evAt(ctx, idiv(k, 101), k % 101, beam);
    if (ev !== null && (best === null || ev > best.ev)) best = { w, move, angle: idiv(k, 101), power: k % 101, ev, raw: VALS[k] };
  }
  // the best exact aim's own EV: compared when its support is resolved (completed first only if the allowance still has room)
  if (best === null || best.angle !== ta || best.power !== tp) {
    const na = (ctx.ka.length - 1) >> 1;
    const np = beam ? 0 : (ctx.kp.length - 1) >> 1;
    let missing = 0;
    for (let i = 0 - na; i <= na; i++) {
      for (let j = 0 - np; j <= np; j++) if (known(clampA(ta + i), clampP(tp + j)) === null) missing++;
    }
    if (missing <= left.n) {
      for (let i = 0 - na; i <= na; i++) for (let j = 0 - np; j <= np; j++) tryResolve(ctx, w, move, clampA(ta + i), clampP(tp + j), left);
      const ev = evAt(ctx, ta, tp, beam);
      if (ev !== null && (best === null || ev > best.ev)) best = { w, move, angle: ta, power: tp, ev, raw: VALS[top] };
    }
  }
  return best ?? { w, move, angle: ta, power: tp, ev: VALS[top] * ctx.scale, raw: VALS[top] };
}
```

- [ ] **Step 4: Create the turn plan**

Create `src/game/titles/arcfire/ai/plan.ts` with (design-verbatim):

```ts
// src/game/titles/arcfire/ai/plan.ts
//
// The AI turn search (spec §5), RNG-free: planTurn(m, tier) never writes m
// and never draws from m.rng, so hints, previews and tests can call it
// freely; policy.ts draws the choice and the noise afterwards.
//   1. every damaging weapon in hand, from where the tank stands, with an
//      equal share of the tier's stationary budget (search.ts);
//   2. Rookie: its choices are the pickTop best by value (DIRT at 0);
//   3. moves (Veteran while its best is below moveBelow, Ace always): the
//      best `movers` weapons re-searched from each legal side, re-probed from
//      the moved tank; a move must gain moveGain points;
//   4. the offensive pick: the best value, then Ace's tier-3 saving;
//   5. DIRT (Ace, holding DIRT, in battle): when the enemy's estimated best
//      reply to the pick is >= DIRT_THREAT and a build cuts it by >= DIRT_GAIN.
// Every weapon in a hand is fired exactly once, so saving a tier-3 weapon or
// building a wall only reorders shots: the rules decide WHEN, not whether.
import { copyMatchInto, type MatchState } from "../state";
import { resolveTurnPoints } from "../resolve";
import { hitCircles, moveTarget } from "../tanks";
import { ROSTER } from "../weapons/roster";
import { idiv } from "../imath";
import { SUDDEN_DEATH_WEAPON, WORLD_W } from "../constants";
import { dealsDamage, probeModelOf } from "./model";
import { FAR, LAND_TERRAIN, landingGrid, type Grid, type ProbeBoard } from "./probe";
import {
  POST_SLOT, gridFor, makeCtx, newStats, scratch, searchWeapon, valueOf,
  type AiStats, type Cand, type SearchCtx,
} from "./search";
import {
  BUDGET_HAND, DIRT_FRONT, DIRT_GAIN, DIRT_THREAT, THREAT_AIMS, TIERS, type AiTier, type TierSpec,
} from "./tiers";

export interface Plan {
  choices: Cand[]; // policy.ts draws one uniformly: Rookie's top pickTop, otherwise exactly one
  ranked: Cand[]; // every weapon in hand from where the tank stands, best first (DIRT at 0)
  stats: AiStats;
}

/** Candidates best first: ev descending, then the lower tier (an equal shot spends the cheaper weapon), then roster index. */
export const byValue = (a: Cand, b: Cand): number => b.ev - a.ev || ROSTER[a.w].tier - ROSTER[b.w].tier || a.w - b.w;

/** The offensive pick: the first best ev; a saveTier3 tier then fires a tier-3 pick only if it beats the best other weapon (ev > 0) strictly and by >= 20%. */
export function chooseOffence(cands: readonly Cand[], t: TierSpec): { pick: Cand | null; saved: boolean } {
  let pick: Cand | null = null;
  for (const c of cands) if (pick === null || c.ev > pick.ev) pick = c;
  if (pick === null || !t.saveTier3 || ROSTER[pick.w].tier !== 3) return { pick, saved: false };
  let alt: Cand | null = null;
  for (const c of cands) if (ROSTER[c.w].tier !== 3 && c.ev > 0 && (alt === null || c.ev > alt.ev)) alt = c;
  if (alt === null || (pick.ev > alt.ev && pick.ev * 5 >= alt.ev * 6)) return { pick, saved: false };
  return { pick: alt, saved: true };
}

/** The first grid cell (in cell order) whose terrain landing is nearest column x: a DIRT placement aim. */
function aimNear(g: Grid, x: number): number {
  let bc = 0;
  let bd = FAR;
  for (let c = 0; c < g.metric.length; c++) {
    if (g.kind[c] !== LAND_TERRAIN) continue;
    const d = g.x[c] < x ? x - g.x[c] : g.x[c] - x;
    if (d < bd) {
      bd = d;
      bc = c;
    }
  }
  return bc;
}

const cellCand = (g: Grid, w: number, c: number): Cand => ({
  w, move: 0, angle: g.angles[idiv(c, g.powers.length)], power: g.powers[c % g.powers.length], ev: 0, raw: 0,
});

/**
 * The enemy's best reply on `post` (a board after the AI's shot, spans built, post.shooter = the enemy):
 * each damaging enemy weapon at its THREAT_AIMS nearest aims on Rookie's grid, fully resolved; at most
 * `allowance` sims. An estimate, deliberately cheap: it decides only whether a wall is worth building.
 */
function threat(ctx: SearchCtx, post: MatchState, allowance: number): number {
  const foe = post.shooter;
  const board: ProbeBoard = { t: post.terrain, tanks: hitCircles(post), me: foe, windStep: ctx.windStep };
  const grids = new Map<string, Grid>();
  let best = 0;
  let spent = 0;
  for (const w of post.hands[foe]) {
    if (!dealsDamage(ROSTER[w])) continue;
    const model = probeModelOf(ROSTER[w]);
    let g = grids.get(model.key);
    if (g === undefined) {
      g = landingGrid(board, model, TIERS.rookie, ctx.stats);
      grids.set(model.key, g);
    }
    const taken: number[] = [];
    for (let k = 0; k < THREAT_AIMS; k++) {
      let bc = -1;
      for (let c = 0; c < g.metric.length; c++) {
        if (taken.includes(c)) continue;
        if (bc < 0 || g.metric[c] < g.metric[bc]) bc = c;
      }
      if (bc < 0 || g.metric[bc] >= FAR || spent >= allowance) break;
      taken.push(bc);
      spent++;
      const v = valueOf(ctx, post, w, 0, g.angles[idiv(bc, g.powers.length)], g.powers[bc % g.powers.length]);
      if (v > best) best = v;
    }
  }
  ctx.stats.dirtSims += spent;
  return best;
}

/** Resolve `c` for the AI on the post-shot scratch and hand that board to the enemy. */
function afterShot(ctx: SearchCtx, c: Cand): MatchState {
  const post = scratch(POST_SLOT, ctx.m);
  resolveTurnPoints(post, { move: c.move, weapon: c.w, angle: c.angle, power: c.power });
  ctx.stats.sims++;
  ctx.stats.dirtSims++;
  post.shooter = ctx.foe;
  return post;
}

/** Search the turn of m.shooter at `tier`. Pure with respect to m (and m.rng). */
export function planTurn(m: MatchState, tier: AiTier): Plan {
  return planWith(m, TIERS[tier]);
}

export function planWith(m: MatchState, t: TierSpec): Plan {
  const stats = newStats();
  const ctx = makeCtx(m, t, stats);
  const me = ctx.me;
  const hand = m.phase === "suddenDeath" ? [SUDDEN_DEATH_WEAPON] : m.hands[me].slice();
  const offence = hand.filter((w) => dealsDamage(ROSTER[w]));
  const inert = hand.filter((w) => !dealsDamage(ROSTER[w]));

  // 1. every damaging weapon from where the tank stands, an equal fixed share each
  const share = idiv(t.stay, hand.length > BUDGET_HAND ? hand.length : BUDGET_HAND);
  const per: Cand[] = [];
  for (const w of offence) per.push(searchWeapon(ctx, w, 0, share));
  stats.staySims = stats.sims;
  per.sort(byValue);
  const ranked = per.slice();
  for (const w of inert) { // DIRT: worth 0 as an attack, aimed at its nearest landing to the enemy
    const g = gridFor(ctx, 0, probeModelOf(ROSTER[w]));
    let bc = 0;
    for (let c = 1; c < g.metric.length; c++) if (g.metric[c] < g.metric[bc]) bc = c;
    ranked.push(cellCand(g, w, bc));
  }
  ranked.sort(byValue);

  // 2. Rookie: uniform among its pickTop best (policy.ts draws)
  if (t.pickTop > 1) {
    stats.reason = "random";
    return { choices: ranked.slice(0, Math.min(t.pickTop, ranked.length)), ranked, stats };
  }

  // 3. moves: the best weapons again from each legal side, re-probed from the moved tank
  let bestMove: Cand | null = null;
  const stayBest = per.length > 0 ? per[0] : null;
  if (t.moveEach > 0 && stayBest !== null && stayBest.ev < t.moveBelow * ctx.scale) {
    const movers = per.slice(0, Math.min(t.movers, per.length));
    const mshare = idiv(t.moveEach, movers.length);
    const before = stats.sims;
    for (const d of [-1, 1] as const) {
      if (moveTarget(m, me, d) === -1) continue;
      for (const c of movers) {
        const r = searchWeapon(ctx, c.w, d, mshare);
        if (bestMove === null || r.ev > bestMove.ev) bestMove = r;
      }
    }
    stats.moveSims = stats.sims - before;
  }
  const cands = per.slice();
  const moved = bestMove !== null && stayBest !== null && bestMove.ev >= stayBest.ev + t.moveGain * ctx.scale;
  if (moved && bestMove !== null) cands.unshift(bestMove); // first: it wins an ev tie

  // 4. the offensive pick
  const chosen = chooseOffence(cands, t);
  let pick = chosen.pick;
  stats.reason = chosen.saved ? "saveT3" : pick !== null && pick.move !== 0 ? "move" : "best";

  // 5. DIRT: when the enemy's best reply to the pick is big and a build cuts it (or when only DIRT is left)
  if (t.dirt > 0 && m.phase === "battle" && inert.length > 0) {
    const options: Cand[] = [];
    const dir = m.tankX[ctx.foe] > m.tankX[me] ? 1 : -1;
    const spots = [m.tankX[me] + dir * DIRT_FRONT, (m.tankX[me] + m.tankX[ctx.foe]) >> 1];
    for (const w of inert.slice(0, 2)) {
      const g = gridFor(ctx, 0, probeModelOf(ROSTER[w]));
      for (const x of spots) options.push(cellCand(g, w, aimNear(g, x < 0 ? 0 : x > WORLD_W - 1 ? WORLD_W - 1 : x)));
    }
    const each = idiv(t.dirt, options.length + 1) - 1; // each estimate's allowance: the resolve before it is the 1
    let r0 = DIRT_THREAT; // with no offensive weapon left, DIRT is forced
    if (pick !== null) {
      r0 = threat(ctx, afterShot(ctx, pick), each);
      stats.reply = r0;
    }
    if (r0 >= DIRT_THREAT) {
      let bestD: Cand | null = null;
      let bestR = 0;
      for (const o of options) {
        const r = threat(ctx, afterShot(ctx, o), each);
        if (bestD === null || r < bestR) {
          bestD = o;
          bestR = r;
        }
      }
      stats.replyDirt = bestD === null ? -1 : bestR;
      if (bestD !== null && (pick === null || r0 - bestR >= DIRT_GAIN)) {
        stats.reason = pick === null ? "forcedDirt" : "dirt";
        pick = bestD;
      }
    }
  }
  if (pick === null) { // only DIRT in hand and no DIRT decision: fire the best-ranked
    stats.reason = "inertOnly";
    pick = ranked[0];
  }
  return { choices: [pick], ranked, stats };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/game/titles/arcfire/ai/search.test.ts`
Expected: PASS (4 tests; the purity test plans all three tiers and takes about 2–3 s unbundled).

- [ ] **Step 6: Run the Arcfire gate (with the purity guard), types and the full suite**

Run: `npx vitest run src/game/titles/arcfire src/game/test/arcfire src/game/runtime/arcfire src/game/sim/purity.test.ts`
Expected: PASS: 24 files, 234 tests.

Run: `npx tsc --noEmit`
Expected: exit 0.

Run: `npm test`
Expected: all pass: 64 test files passed and 1 skipped; 487 tests passed and 10 skipped.

- [ ] **Step 7: Commit**

```bash
git add src/game/titles/arcfire/ai/search.test.ts src/game/titles/arcfire/ai/search.ts src/game/titles/arcfire/ai/plan.ts
git commit -m "feat(arcfire): the AI search; per-weapon refine boxes, the noise-aware Ace, moves, tier-3 saving and the DIRT rule (planTurn)" -m "Plan 2B Task 6. Each weapon in hand gets a fixed share of floor(stay / max(10, hand)) full resolves around its probe centres; the Ace ranks aims by their exact expected value under its own noise, Rookie and Veteran by the exact value. planTurn never writes the match or draws from its RNG, plans the same on a clone, and stays within tierBudget; a Veteran holding only Hailstorm scores on every windless board." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 7: The policy and the draft AI — the only RNG draws

**Files:**
- Create: `src/game/titles/arcfire/ai/policy.test.ts` (design-verbatim, §10.2)
- Create: `src/game/titles/arcfire/ai/policy.ts` (design-verbatim, §3.6)

**Interfaces:**
- Consumes: `nextRange`; `ROSTER`; `MatchState`; `TurnCommand`; `drawNoise` (T4); `planTurn`, `Plan` (T6); `TIERS`, `AiTier` (T4); `corpusState`, `rngAfter` (T1).
- Produces:
  - `AI_PICK_DRAWS = 1` and `AI_TURN_DRAWS = 7`;
  - `aiPick(m: MatchState, tier: AiTier): number`: a pool index, taken uniformly among the `draftTop` available weapons with the highest `power` (ties by pool index); exactly 1 draw, even when there is only one choice;
  - `aiTurn(m: MatchState, tier: AiTier): { cmd: TurnCommand; plan: Plan }`: exactly 7 draws after the search (1 choice, 3 angle, 3 power); the command is clamped to the wire ranges and legal by construction.

**Why:** the RNG order is normative (`hashMatch` folds `rng.state`), and a fixed, tier-independent draw count is what lets a resume skip an AI entry's draws without searching (B3).

- [ ] **Step 1: Write the failing test**

Create `src/game/titles/arcfire/ai/policy.test.ts` with (design-verbatim):

```ts
// src/game/titles/arcfire/ai/policy.test.ts — Plan 2B T7: the only RNG draws (the turn policy and the draft AI)
import { describe, it, expect } from "vitest";
import { applyPick, applyTurn, createMatch } from "../match";
import { STANDARD_SETTINGS, cloneMatch } from "../state";
import { ROSTER } from "../weapons/roster";
import { corpusState, rngAfter } from "@/game/test/arcfire/fixtures";
import { planTurn } from "./plan";
import { AI_TURN_DRAWS, aiPick, aiTurn } from "./policy";

describe("the policy", () => {
  it("draws exactly 7 values after its search, decides the same on clones, and fires a legal command", () => {
    const m = corpusState(11, 9);
    for (const tier of ["rookie", "veteran", "ace"] as const) {
      const plan = planTurn(m, tier);
      const x = cloneMatch(m);
      const y = cloneMatch(m);
      const cx = aiTurn(x, tier);
      const cy = aiTurn(y, tier);
      expect(cx.cmd).toEqual(cy.cmd);
      expect(cx.plan.stats).toEqual(cy.plan.stats);
      expect(cx.plan.stats).toEqual(plan.stats);
      expect(x.rng.state).toBe(rngAfter(m.rng.state, AI_TURN_DRAWS));
      expect(applyTurn(cloneMatch(m), cx.cmd).ok).toBe(true);
    }
  }, 120_000);
});

describe("the draft AI", () => {
  it("takes the top by power (Ace), stays within its top N, and always draws exactly once", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const m = createMatch(seed, STANDARD_SETTINGS);
      const byPower = m.pool.map((_, i) => i).sort((a, b) => ROSTER[m.pool[b]].power - ROSTER[m.pool[a]].power || a - b);
      for (const [tier, top] of [["rookie", 8], ["veteran", 3], ["ace", 1]] as const) {
        const c = cloneMatch(m);
        const w = aiPick(c, tier);
        expect(byPower.slice(0, top)).toContain(w);
        expect(c.rng.state).toBe(rngAfter(m.rng.state, 1));
        expect(applyPick(c, w).ok).toBe(true);
      }
    }
  }, 30_000);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/game/titles/arcfire/ai/policy.test.ts`
Expected: FAIL: `Error: Cannot find module './policy' imported from …/src/game/titles/arcfire/ai/policy.test.ts`; `Tests  no tests`.

- [ ] **Step 3: Create the policy**

Create `src/game/titles/arcfire/ai/policy.ts` with (design-verbatim):

```ts
// src/game/titles/arcfire/ai/policy.ts
//
// An AI decision = a pure search + a FIXED number of match-RNG draws. The RNG
// order is normative (hashMatch folds rng.state), and it never depends on the
// tier, so a resume can skip an AI entry's draws without searching:
//   an AI draft pick consumes exactly AI_PICK_DRAWS = 1 draw:
//     nextRange(rng, k) over the k available weapons with the highest power;
//   an AI turn consumes exactly AI_TURN_DRAWS = 7 draws, after its search:
//     1 choosing among plan.choices, then 3 for the angle noise, then 3 for
//     the power noise.
// Nothing else in the AI touches the RNG.
import { nextRange } from "@/game/sim/math/rng";
import { ROSTER } from "../weapons/roster";
import type { MatchState } from "../state";
import type { TurnCommand } from "../match";
import { drawNoise } from "./noise";
import { planTurn, type Plan } from "./plan";
import { TIERS, type AiTier } from "./tiers";

export const AI_PICK_DRAWS = 1;
export const AI_TURN_DRAWS = 7;

/** The pool index the AI drafts (spec §5: by roster power; Rookie among the top 8, Veteran the top 3, Ace the best). Exactly 1 draw. */
export function aiPick(m: MatchState, tier: AiTier): number {
  const avail: number[] = [];
  for (let i = 0; i < m.pool.length; i++) if (m.poolOwner[i] === -1) avail.push(i);
  avail.sort((a, b) => ROSTER[m.pool[b]].power - ROSTER[m.pool[a]].power || a - b); // ties: pool order (= roster order)
  return avail[nextRange(m.rng, Math.min(TIERS[tier].draftTop, avail.length))];
}

/** The AI's turn command and the plan it came from. Exactly 7 draws; the command is legal by construction. */
export function aiTurn(m: MatchState, tier: AiTier): { cmd: TurnCommand; plan: Plan } {
  const t = TIERS[tier];
  const plan = planTurn(m, tier);
  const c = plan.choices[nextRange(m.rng, plan.choices.length)];
  const a = c.angle + drawNoise(m.rng, t.noiseA);
  const p = c.power + drawNoise(m.rng, t.noiseP);
  return { cmd: { move: c.move, w: c.w, angle: a < 0 ? 0 : a > 180 ? 180 : a, power: p < 0 ? 0 : p > 100 ? 100 : p }, plan };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/game/titles/arcfire/ai/policy.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Run the Arcfire gate, types and the full suite**

Run: `npx vitest run src/game/titles/arcfire src/game/test/arcfire src/game/runtime/arcfire src/game/sim/purity.test.ts`
Expected: PASS: 25 files, 236 tests.

Run: `npx tsc --noEmit`
Expected: exit 0.

Run: `npm test`
Expected: all pass: 65 test files passed and 1 skipped; 489 tests passed and 10 skipped.

- [ ] **Step 6: Commit**

```bash
git add src/game/titles/arcfire/ai/policy.test.ts src/game/titles/arcfire/ai/policy.ts
git commit -m "feat(arcfire): the AI policy and the draft AI, the only RNG draws (1 per pick, 7 per turn)" -m "Plan 2B Task 7. aiPick draws once among the draftTop available weapons by power (Rookie 8, Veteran 3, Ace 1); aiTurn searches, then draws 1 choice, 3 angle-noise and 3 power-noise values and clamps the command to the wire ranges. The counts are tier-independent, so a resume can skip an AI entry's draws without searching." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 8: vs-AI matches — human-only replay and the search-free resume

**Files:**
- Create: `src/game/test/arcfire/vsaiGolden.ts` (design-verbatim, §10.5: the scripted human and `playVsAi`)
- Create: `src/game/titles/arcfire/vsai.test.ts` (design-verbatim, §10.3)
- Create: `src/game/titles/arcfire/vsai.ts` (design-verbatim, §6.3)

**Interfaces:**
- Consumes: `nextU32`; `createMatch`, `applyPick`, `applyTurn`, `toAct` (T1), `TurnCommand`; `applyCommand` (T1), `ArcfireCommand`; `hashMatch`; `MatchSettings`, `MatchState`, `cloneMatch`; `Timeline`; `moveTarget`; `SUDDEN_DEATH_WEAPON`; `AI_PICK_DRAWS`, `AI_TURN_DRAWS`, `aiPick`, `aiTurn` (T7); `Plan` (T6); `AiTier` (T4).
- Produces:
  - `vsai.ts`:
    - `HUMAN = 0`, `AI = 1`, and `type AiAction = { k: "pick"; w: number } | { k: "turn"; cmd: TurnCommand; timeline: Timeline; plan: Plan }`;
    - `aiToAct(m): boolean` and `maxHumanCommands(s: MatchSettings): number` (2 × `weaponsEach` + 1; 21 for the daily);
    - `stepAi(m, tier): AiAction | null`, which throws only on an illegal AI command (a bug), and `advanceAi(m, tier): AiAction[]`;
    - `interface VsAiReplay { seed; settings; tier; commands: unknown }` and `replayVsAi(r): VsAiResult`, which never throws on the commands (`too_long` before any AI work, `invalid_command` at its index, unfinished logs accepted);
    - `resumeVsAi(r: { seed; settings; log: unknown }): VsAiResume` (`{ ok: true; state; log; humanLog; droppedFrom }` or `{ ok: false }`): no search, never throws. `vsai.test.ts` checks it against `replayVsAi` on every prefix of a short Rookie match; Task 10 resumes both goldens' full logs, Task 12's host test the win golden mid-draft, mid-battle and finished, and Task 13's Worker smoke after 25 entries.
  - `src/game/test/arcfire/vsaiGolden.ts`: `goldenHuman(m): ArcfireCommand`, `interface LivePlay { commands; log; aiTurns; state }`, and `playVsAi(seed, settings, tier, human = goldenHuman): LivePlay`.

**Why:** a vs-AI match is `seed + settings + tier + the human's commands`. The AI acts whenever it is its move: after `createMatch` and after every human command, twice at the draft's end when the human picked first. One rule, shared by live play, replay, resume and verification, is what makes the leaderboard's regeneration exact. The search-free resume (B3) re-applies a full both-seats log by skipping each AI entry's fixed draws.

- [ ] **Step 1: Write the scripted human** (test support: the tests import it)

Create `src/game/test/arcfire/vsaiGolden.ts` with (design-verbatim):

```ts
// src/game/test/arcfire/vsaiGolden.ts
//
// The vs-AI goldens' scripted human, and live play against the AI. The human
// (player 0) is deliberately simple and independent of the AI search: it
// drafts the highest free pool slot, and each turn fires the best command of a
// fixed grid over its hand (angles 20..75 step 5, powers 40..100 step 5),
// found on cloneMatch copies, the first best on a tie; its third battle shot
// moves one step toward the enemy when that is legal. It never touches the
// live match's RNG, so replaying its commands alone must regenerate exactly
// the match it played: the leaderboard's core guarantee.
import { applyTurn, createMatch } from "@/game/titles/arcfire/match";
import { moveTarget } from "@/game/titles/arcfire/tanks";
import { cloneMatch, type MatchSettings, type MatchState } from "@/game/titles/arcfire/state";
import { applyCommand, type ArcfireCommand } from "@/game/titles/arcfire/replay";
import { SUDDEN_DEATH_WEAPON } from "@/game/titles/arcfire/constants";
import { HUMAN, advanceAi } from "@/game/titles/arcfire/vsai";
import type { AiTier } from "@/game/titles/arcfire/ai/tiers";

/** The scripted human's command for the state it is to act in. */
export function goldenHuman(m: MatchState): ArcfireCommand {
  if (m.phase === "draft") {
    let w = m.poolOwner.length - 1;
    while (m.poolOwner[w] !== -1) w--;
    return { k: "pick", w };
  }
  const battleShot = m.phase === "battle" ? (m.shotsFired - (m.firstPicker === HUMAN ? 1 : 0)) >> 1 : -1; // the human's own shot number
  const move: -1 | 0 | 1 = battleShot === 2 && moveTarget(m, HUMAN, 1) !== -1 ? 1 : 0;
  const hand = m.phase === "suddenDeath" ? [SUDDEN_DEATH_WEAPON] : m.hands[HUMAN];
  let best: ArcfireCommand | null = null;
  let bestV = 0;
  for (const w of hand) {
    for (let angle = 20; angle <= 75; angle += 5) {
      for (let power = 40; power <= 100; power += 5) {
        const c = cloneMatch(m);
        if (!applyTurn(c, { move, w, angle, power }).ok) continue;
        const v = c.scores[HUMAN] - m.scores[HUMAN] - (c.scores[1 - HUMAN] - m.scores[1 - HUMAN]);
        if (best === null || v > bestV) {
          best = { k: "turn", move, w, angle, power };
          bestV = v;
        }
      }
    }
  }
  return best!;
}

/** A live vs-AI match: the human's commands (the submission), the full log (the resume blob), the AI's turns, the final state. */
export interface LivePlay { commands: ArcfireCommand[]; log: ArcfireCommand[]; aiTurns: ArcfireCommand[]; state: MatchState }

/** Play a whole vs-AI match live: the AI acts whenever it is its move (vsai.ts), `human` otherwise. */
export function playVsAi(seed: number, settings: MatchSettings, tier: AiTier, human: (m: MatchState) => ArcfireCommand = goldenHuman): LivePlay {
  const m = createMatch(seed, settings);
  const commands: ArcfireCommand[] = [];
  const log: ArcfireCommand[] = [];
  const aiTurns: ArcfireCommand[] = [];
  const record = (): void => {
    for (const a of advanceAi(m, tier)) {
      const c: ArcfireCommand = a.k === "pick" ? { k: "pick", w: a.w } : { k: "turn", ...a.cmd };
      log.push(c);
      if (c.k === "turn") aiTurns.push(c);
    }
  };
  record();
  while (m.phase !== "over") {
    const c = human(m);
    if (!applyCommand(m, c).ok) throw new Error(`the scripted human sent an illegal command: ${JSON.stringify(c)}`);
    commands.push(c);
    log.push(c);
    record();
  }
  return { commands, log, aiTurns, state: m };
}
```

- [ ] **Step 2: Write the failing test**

Create `src/game/titles/arcfire/vsai.test.ts` with (design-verbatim):

```ts
// src/game/titles/arcfire/vsai.test.ts — vs-AI flow, human-only replay, search-free resume (SHORT_SETTINGS: fast)
import { describe, it, expect } from "vitest";
import { makeRng, nextRange } from "@/game/sim/math/rng";
import { createMatch, toAct } from "./match";
import { SHORT_SETTINGS, STANDARD_SETTINGS } from "./state";
import { hashMatch } from "./hash";
import { AI, HUMAN, advanceAi, maxHumanCommands, replayVsAi, resumeVsAi } from "./vsai";
import { playVsAi } from "@/game/test/arcfire/vsaiGolden";
import type { ArcfireCommand } from "./replay";
import type { MatchState } from "./state";
import { moveTarget } from "./tanks";
import { SUDDEN_DEATH_WEAPON } from "./constants";

const S = SHORT_SETTINGS;

/** A cheap scripted human (the goldens use the grid human): the lowest free slot, then its first weapon at 45, power 70; its second shot moves toward the enemy when legal. */
const quick = (m: MatchState): ArcfireCommand => {
  if (m.phase === "draft") return { k: "pick", w: m.poolOwner.findIndex((o) => o === -1) };
  const w = m.phase === "suddenDeath" ? SUDDEN_DEATH_WEAPON : m.hands[HUMAN][0];
  const move = m.hands[HUMAN].length === S.weaponsEach - 1 && moveTarget(m, HUMAN, 1) !== -1 ? 1 : 0;
  return { k: "turn", move, w, angle: 45, power: 70 };
};

describe("vs-AI flow", () => {
  it("the AI acts after createMatch and after every human command, twice at the draft's end when the human picked first", () => {
    let aiFirst = -1;
    let humanFirst = -1;
    for (let seed = 1; aiFirst < 0 || humanFirst < 0; seed++) {
      if (createMatch(seed, S).firstPicker === AI) aiFirst = seed;
      else humanFirst = seed;
    }
    const a = createMatch(aiFirst, S);
    expect(advanceAi(a, "rookie").map((x) => x.k)).toEqual(["pick"]);
    expect(toAct(a)).toBe(HUMAN);
    const h = createMatch(humanFirst, S);
    expect(advanceAi(h, "rookie")).toEqual([]);
    const live = playVsAi(humanFirst, S, "rookie", quick);
    const lastPick = live.log.map((c) => c.k).lastIndexOf("pick");
    expect(live.log[lastPick - 1]).toBe(live.commands[S.weaponsEach - 1]); // the human's last pick ...
    expect(live.log[lastPick].k).toBe("pick"); // ... then the AI's last pick ...
    expect(live.log[lastPick + 1].k).toBe("turn"); // ... then the AI's opening shot
  }, 60_000);

  it("replays the human's commands alone to the live match, and resumes every prefix without a search", () => {
    for (const seed of [3, 4, 5]) {
      for (const tier of ["rookie", "veteran"] as const) {
        const live = playVsAi(seed, S, tier, quick);
        const r = replayVsAi({ seed, settings: S, tier, commands: live.commands });
        expect(r.ok && r.hash).toBe(hashMatch(live.state));
        expect(live.commands.length).toBeLessThanOrEqual(maxHumanCommands(S));
        if (seed !== 3 || tier !== "rookie") continue; // every prefix (Veteran: the bundled golden test resumes its full log)
        for (let k = 0; k <= live.log.length; k++) {
          const res = resumeVsAi({ seed, settings: S, log: live.log.slice(0, k) });
          expect(res.ok && res.droppedFrom).toBe(-1);
          if (!res.ok) return;
          expect(res.log).toEqual(live.log.slice(0, k));
          advanceAi(res.state, tier); // a host continues the AI after a resume
          const rr = replayVsAi({ seed, settings: S, tier, commands: res.humanLog });
          expect(rr.ok && rr.hash, `prefix ${k}`).toBe(hashMatch(res.state));
        }
      }
    }
  }, 120_000); // unbundled: about 8 s on the dev machine, so vitest's 5 s default would fail it

  it("resume drops a bad entry and everything after it, and never throws", () => {
    const live = playVsAi(4, S, "rookie", quick);
    const bad = live.log.slice();
    bad[7] = { k: "pick", w: 99 };
    const r = resumeVsAi({ seed: 4, settings: S, log: bad });
    expect(r.ok && r.droppedFrom).toBe(7);
    if (r.ok) expect(r.log).toEqual(live.log.slice(0, 7));
    expect(resumeVsAi({ seed: 4, settings: S, log: "nope" })).toEqual({ ok: false });
    expect(resumeVsAi({ seed: 4, settings: S, log: [null, 3] }).ok).toBe(true);
  }, 60_000);

  it("rejects a bad human log at the right index", () => {
    const live = playVsAi(5, S, "rookie", quick);
    const cmds = live.commands;
    const at = (commands: unknown): unknown => {
      const r = replayVsAi({ seed: 5, settings: S, tier: "rookie", commands });
      return r.ok ? "ok" : `${r.reason}@${r.atIndex}`;
    };
    expect(at(cmds)).toBe("ok");
    expect(at([...cmds, cmds[cmds.length - 1]])).toBe(cmds.length === maxHumanCommands(S) ? `too_long@${maxHumanCommands(S)}` : `invalid_command@${cmds.length}`);
    const turnAt = cmds.findIndex((c) => c.k === "turn");
    const turn = cmds[turnAt] as Extract<ArcfireCommand, { k: "turn" }>;
    expect(at(cmds.map((c, i) => (i === turnAt ? { ...turn, angle: 181 } : c)))).toBe(`invalid_command@${turnAt}`);
    const aiWeapon = live.state.pool[live.state.poolOwner.indexOf(AI)]; // drafted by the AI: never in the human's hand
    expect(at(cmds.map((c, i) => (i === turnAt ? { ...turn, w: aiWeapon } : c)))).toBe(`invalid_command@${turnAt}`);
    expect(at([null])).toBe("invalid_command@0");
    expect(at([{ k: "x" }])).toBe("invalid_command@0");
    expect(at("nope")).toBe("invalid_command@0");
    expect(at(new Array(maxHumanCommands(S) + 1).fill(cmds[0]))).toBe(`too_long@${maxHumanCommands(S)}`);
  }, 60_000);

  it("never throws on 300 random logs", () => {
    const rng = makeRng(20260924);
    for (let n = 0; n < 300; n++) {
      const cmds: unknown[] = [];
      const len = nextRange(rng, 14);
      for (let i = 0; i < len; i++) {
        const k = nextRange(rng, 5);
        cmds.push(k === 0 ? { k: "pick", w: nextRange(rng, 14) - 1 } : k === 1 ? { k: "turn", move: nextRange(rng, 3) - 1, w: nextRange(rng, 33), angle: nextRange(rng, 200) - 10, power: nextRange(rng, 120) - 10 } : k === 2 ? null : k === 3 ? { k: "pick", w: 0.5 } : "x");
      }
      const r = replayVsAi({ seed: n, settings: S, tier: "rookie", commands: cmds });
      expect(r.ok || r.reason === "invalid_command" || r.reason === "too_long").toBe(true);
    }
  }, 60_000);

  it("allows 2 x weaponsEach + 1 human commands (21 in the daily)", () => {
    expect(maxHumanCommands(STANDARD_SETTINGS)).toBe(21);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run src/game/titles/arcfire/vsai.test.ts`
Expected: FAIL: `Error: Cannot find module './vsai' imported from …/src/game/titles/arcfire/vsai.test.ts`; `Tests  no tests`.

- [ ] **Step 4: Create the vs-AI flow**

Create `src/game/titles/arcfire/vsai.ts` with (design-verbatim):

```ts
// src/game/titles/arcfire/vsai.ts
//
// vs-AI matches (spec §1.3, §7). The human is player 0 (left, red), the AI
// player 1 (right, blue); the seeded coin flip still decides who picks first.
// A vs-AI match is seed + settings + tier + the HUMAN's commands only: the
// AI's picks and shots are regenerated. The interleaving rule: the AI acts
// whenever it is its move, right after createMatch and after every human
// command, until the human is to act or the match is over (between two human
// commands it makes 0, 1 or 2 actions: its last pick, then the opening shot).
// The AI's commands are legal by construction; an illegal one is a bug and
// throws (the verifier's route answers 500, never a verdict on the player).
import { nextU32 } from "@/game/sim/math/rng";
import { applyPick, applyTurn, createMatch, toAct, type TurnCommand } from "./match";
import { applyCommand, type ArcfireCommand } from "./replay";
import { hashMatch } from "./hash";
import type { MatchSettings, MatchState } from "./state";
import type { Timeline } from "./timeline";
import { AI_PICK_DRAWS, AI_TURN_DRAWS, aiPick, aiTurn } from "./ai/policy";
import type { Plan } from "./ai/plan";
import type { AiTier } from "./ai/tiers";

export const HUMAN = 0;
export const AI = 1;

export type AiAction =
  | { k: "pick"; w: number }
  | { k: "turn"; cmd: TurnCommand; timeline: Timeline; plan: Plan };

export const aiToAct = (m: MatchState): boolean => toAct(m) === AI;

/** The most commands a human can send in a vs-AI match: every pick and shot, plus one sudden-death shot (21 for the daily). */
export const maxHumanCommands = (s: MatchSettings): number => 2 * s.weaponsEach + 1;

/** One AI action if it is the AI's move, else null. */
export function stepAi(m: MatchState, tier: AiTier): AiAction | null {
  if (!aiToAct(m)) return null;
  if (m.phase === "draft") {
    const w = aiPick(m, tier);
    if (!applyPick(m, w).ok) throw new Error("arcfire AI made an illegal pick");
    return { k: "pick", w };
  }
  const { cmd, plan } = aiTurn(m, tier);
  const r = applyTurn(m, cmd);
  if (!r.ok) throw new Error("arcfire AI made an illegal turn");
  return { k: "turn", cmd, timeline: r.timeline, plan };
}

/** Let the AI act until it is the human's move or the match is over. */
export function advanceAi(m: MatchState, tier: AiTier): AiAction[] {
  const out: AiAction[] = [];
  for (let a = stepAi(m, tier); a !== null; a = stepAi(m, tier)) out.push(a);
  return out;
}

export interface VsAiReplay {
  seed: number;
  settings: MatchSettings; // trusted (the verifier derives them from the mode)
  tier: AiTier; // trusted, likewise
  commands: unknown; // the human's commands only
}

export type VsAiResult =
  | { ok: true; state: MatchState; hash: string; finished: boolean; humanPoints: number; aiPoints: number; margin: number; humanWon: boolean }
  | { ok: false; reason: "invalid_command" | "too_long"; atIndex: number };

/**
 * Replay a vs-AI match from the human's commands alone, regenerating every AI pick and shot (the
 * leaderboard's core guarantee). Never throws on the commands: a non-array or an illegal or malformed
 * entry is invalid_command at its index, and more than maxHumanCommands is too_long before any AI
 * work. Like replayMatch it accepts an unfinished log, so a verifier also requires `finished`.
 */
export function replayVsAi(r: VsAiReplay): VsAiResult {
  if (!Array.isArray(r.commands)) return { ok: false, reason: "invalid_command", atIndex: 0 };
  const max = maxHumanCommands(r.settings);
  if (r.commands.length > max) return { ok: false, reason: "too_long", atIndex: max };
  const m = createMatch(r.seed, r.settings);
  advanceAi(m, r.tier);
  for (let i = 0; i < r.commands.length; i++) {
    if (toAct(m) !== HUMAN || !applyCommand(m, r.commands[i]).ok) return { ok: false, reason: "invalid_command", atIndex: i };
    advanceAi(m, r.tier);
  }
  const hp = m.scores[HUMAN];
  const ap = m.scores[AI];
  return {
    ok: true, state: m, hash: hashMatch(m), finished: m.phase === "over",
    humanPoints: hp, aiPoints: ap, margin: hp - ap, humanWon: m.phase === "over" && m.winner === HUMAN,
  };
}

export type VsAiResume =
  | { ok: true; state: MatchState; log: ArcfireCommand[]; humanLog: ArcfireCommand[]; droppedFrom: number }
  | { ok: false };

/**
 * Resume a vs-AI match from its local blob's FULL log (both seats, in order) without a single
 * search: an AI entry is applied as recorded after advancing the RNG by the draws its decision
 * consumed (AI_PICK_DRAWS / AI_TURN_DRAWS). The state equals replayVsAi of the human sub-log whenever
 * the AI entries came from this code at this simVersion (the blob key carries it). Never throws: the
 * first entry that is malformed or illegal, and everything after it, is dropped (droppedFrom; -1 when
 * none was), and a non-array log is { ok: false }. It does not run the AI: if the log ends on the AI's
 * move, the caller's advanceAi continues. Local resume only: a submission is the human sub-log, and
 * the server regenerates every AI decision from it.
 */
export function resumeVsAi(r: { seed: number; settings: MatchSettings; log: unknown }): VsAiResume {
  if (!Array.isArray(r.log)) return { ok: false };
  const m = createMatch(r.seed, r.settings);
  const log: ArcfireCommand[] = [];
  const humanLog: ArcfireCommand[] = [];
  for (let i = 0; i < r.log.length; i++) {
    const entry: unknown = r.log[i];
    const ai = aiToAct(m);
    const before = m.rng.state;
    if (ai) for (let d = 0; d < (m.phase === "draft" ? AI_PICK_DRAWS : AI_TURN_DRAWS); d++) nextU32(m.rng);
    if (!applyCommand(m, entry).ok) {
      m.rng.state = before; // an illegal entry changed nothing else
      return { ok: true, state: m, log, humanLog, droppedFrom: i };
    }
    log.push(entry as ArcfireCommand);
    if (!ai) humanLog.push(entry as ArcfireCommand);
  }
  return { ok: true, state: m, log, humanLog, droppedFrom: -1 };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/game/titles/arcfire/vsai.test.ts`
Expected: PASS (6 tests; the every-prefix resume test takes about 8–10 s unbundled, inside its 120 s timeout).

- [ ] **Step 6: Run the Arcfire gate, types and the full suite**

Run: `npx vitest run src/game/titles/arcfire src/game/test/arcfire src/game/runtime/arcfire src/game/sim/purity.test.ts`
Expected: PASS: 26 files, 242 tests.

Run: `npx tsc --noEmit`
Expected: exit 0.

Run: `npm test`
Expected: all pass: 66 test files passed and 1 skipped; 495 tests passed and 10 skipped.

- [ ] **Step 7: Commit**

```bash
git add src/game/test/arcfire/vsaiGolden.ts src/game/titles/arcfire/vsai.test.ts src/game/titles/arcfire/vsai.ts
git commit -m "feat(arcfire): vs-AI matches; human-only replay (replayVsAi) and the search-free resume (resumeVsAi)" -m "Plan 2B Task 8. The human is player 0 and the AI player 1; the AI acts whenever it is its move (twice at the draft's end when the human picked first). replayVsAi regenerates every AI pick and shot from the human's commands alone, never throws on them (too_long before any AI work, invalid_command at its index); resumeVsAi re-applies a full both-seats log without a search, drops a bad suffix and never throws (owner decision B3). Tested: replay equals live play, resume equals replay on every prefix of a short Rookie match, a 300-log fuzz." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 9: The verifier — `scoreVsAi`

**Files:**
- Create: `src/game/titles/arcfire/verify.test.ts` (design-verbatim, §10.4)
- Create: `src/game/titles/arcfire/verify.ts` (design-verbatim, §6.6)

**Interfaces:**
- Consumes: `ReplayOutcome`, `ReplayRejection` (`@/game/sim/title`); `STANDARD_SETTINGS`, `MatchSettings`; `maxHumanCommands`, `replayVsAi` (T8); `ArcfireCommand`; `AiTier`.
- Produces:
  - `DAILY_TIER: AiTier = "veteran"` (B1);
  - `isArcfireCommand(c: unknown): c is ArcfireCommand`, the spec §7 command shape;
  - `scoreVsAi(seed: number, commands: unknown, settings = STANDARD_SETTINGS, tier = DAILY_TIER): ReplayOutcome | { rejected: ReplayRejection }`:
    - it returns `score` = the margin, `stat` = the human's points and `hash`;
    - it rejects cheapest first: `invalid_command_shape` (not an array), `too_long`, `invalid_command_shape` (an entry's shape), `invalid_command`, `not_a_win`;
    - it never throws on any `commands` value. Plan 4's `TitleDef` binding wraps it in two lines.

**Why:** the verifier-facing result of a vs-AI match (spec §7). Its golden paths (a real win, a loss, a tampered log) run bundled in Task 10; this task pins the cheap rejections that happen before any AI work.

- [ ] **Step 1: Write the failing test**

Create `src/game/titles/arcfire/verify.test.ts` with (design-verbatim):

```ts
// src/game/titles/arcfire/verify.test.ts — the verifier's cheap paths (the golden paths run bundled in ai.corpus.test.ts)
import { describe, it, expect } from "vitest";
import { isArcfireCommand, scoreVsAi, DAILY_TIER } from "./verify";

describe("scoreVsAi", () => {
  it("checks the command shape", () => {
    expect([{ k: "pick", w: 3 }, { k: "turn", move: -1, w: 0, angle: 0, power: 100 }].map(isArcfireCommand)).toEqual([true, true]);
    expect([null, 3, "x", { k: "pick" }, { k: "pick", w: 1.5 }, { k: "turn", move: 2, w: 0, angle: 45, power: 50 }, { k: "turn", move: 0, w: 0, angle: "45", power: 50 }, { k: "boom" }]
      .map(isArcfireCommand)).toEqual([false, false, false, false, false, false, false, false]);
  });
  it("rejects cheapest first, before any AI work", () => {
    expect(scoreVsAi(1, "nope")).toEqual({ rejected: "invalid_command_shape" });
    expect(scoreVsAi(1, new Array(22).fill(null))).toEqual({ rejected: "too_long" });
    expect(scoreVsAi(1, [{ k: "pick", w: 0 }, 7])).toEqual({ rejected: "invalid_command_shape" });
    expect(scoreVsAi(1, [])).toEqual({ rejected: "not_a_win" });
    expect(DAILY_TIER).toBe("veteran");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/game/titles/arcfire/verify.test.ts`
Expected: FAIL: `Error: Cannot find module './verify' imported from …/src/game/titles/arcfire/verify.test.ts`; `Tests  no tests`.

- [ ] **Step 3: Create the verifier's result**

Create `src/game/titles/arcfire/verify.ts` with (design-verbatim):

```ts
// src/game/titles/arcfire/verify.ts
//
// The verifier-facing result of a vs-AI match (spec §7): the function Plan
// 4's Arcfire TitleDef binding wraps. Input: the seed and the HUMAN's
// commands only; the settings and the tier are trusted (the binding derives
// them from the mode: the daily challenge is STANDARD_SETTINGS vs Veteran).
// Every AI pick and shot is regenerated. Never throws on any `commands` value.
import type { ReplayOutcome, ReplayRejection } from "@/game/sim/title";
import { STANDARD_SETTINGS, type MatchSettings } from "./state";
import { maxHumanCommands, replayVsAi } from "./vsai";
import type { ArcfireCommand } from "./replay";
import type { AiTier } from "./ai/tiers";

/** The daily challenge's opponent (spec §6.4, §7). */
export const DAILY_TIER: AiTier = "veteran";

const isInt = (v: unknown): boolean => typeof v === "number" && Number.isInteger(v);

/** A structurally valid command (spec §7's shape); legality (whose move, which weapon, the ranges) is the replay's job. */
export function isArcfireCommand(c: unknown): c is ArcfireCommand {
  if (typeof c !== "object" || c === null) return false;
  const o = c as Record<string, unknown>;
  if (o.k === "pick") return isInt(o.w);
  if (o.k === "turn") return (o.move === -1 || o.move === 0 || o.move === 1) && isInt(o.w) && isInt(o.angle) && isInt(o.power);
  return false;
}

/**
 * Score a finished vs-AI match from the human's log: score = the margin (human - AI points), stat = the
 * human's points, hash = hashMatch of the final state. Rejections, cheapest first: invalid_command_shape
 * (not an array), too_long (more than 2 x weaponsEach + 1 commands, before any AI work),
 * invalid_command_shape (an entry of the wrong shape), invalid_command (an illegal command at any index),
 * not_a_win (unfinished, lost, or drawn).
 */
export function scoreVsAi(
  seed: number, commands: unknown, settings: MatchSettings = STANDARD_SETTINGS, tier: AiTier = DAILY_TIER,
): ReplayOutcome | { rejected: ReplayRejection } {
  if (!Array.isArray(commands)) return { rejected: "invalid_command_shape" };
  if (commands.length > maxHumanCommands(settings)) return { rejected: "too_long" };
  for (const c of commands) if (!isArcfireCommand(c)) return { rejected: "invalid_command_shape" };
  const r = replayVsAi({ seed, settings, tier, commands });
  if (!r.ok) return { rejected: r.reason };
  if (!r.finished || !r.humanWon) return { rejected: "not_a_win" };
  return { score: r.margin, stat: r.humanPoints, hash: r.hash };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/game/titles/arcfire/verify.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Run the Arcfire gate, types and the full suite**

Run: `npx vitest run src/game/titles/arcfire src/game/test/arcfire src/game/runtime/arcfire src/game/sim/purity.test.ts`
Expected: PASS: 27 files, 244 tests.

Run: `npx tsc --noEmit`
Expected: exit 0.

Run: `npm test`
Expected: all pass: 67 test files passed and 1 skipped; 497 tests passed and 10 skipped.

- [ ] **Step 6: Commit**

```bash
git add src/game/titles/arcfire/verify.test.ts src/game/titles/arcfire/verify.ts
git commit -m "feat(arcfire): scoreVsAi, the verifier-facing result Plan 4 wraps" -m "Plan 2B Task 9. The input is the seed and the human's commands only; the settings and the tier are trusted (the daily: STANDARD_SETTINGS vs Veteran). score = the margin, stat = the human's points, hash = hashMatch; rejections cheapest first (shape, too_long, shape per entry, invalid_command, not_a_win), and it never throws on any commands value." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

# Part C — The AI pins, the budget, the worker and the cross-engine gate (Tasks 10–13)

### Task 10: The AI pins — the AI corpus and the vs-AI goldens

**Files:**
- Create: `src/game/test/arcfire/aiCorpus.ts` (design-verbatim, §10.5)
- Create: `src/game/test/arcfire/ai.entry.ts` (design §10.5, with a review fix: `turnTimes` names each time's state)
- Create: `src/game/titles/arcfire/ai.corpus.test.ts` (design-verbatim, §10.5)
- Create (generated by the test, never hand-written): `src/game/titles/arcfire/ai.corpus.golden.json`, `src/game/titles/arcfire/determinism.vsai.golden.json`

**Interfaces:**
- Consumes: `FNV_OFFSET`, `fnvFold`, `fnvHex` (`@/game/sim/hash`); `createMatch`, `applyPick`; `STANDARD_SETTINGS`, `cloneMatch`; `ROSTER`, `ROSTER_INDEX`; `aiPick`, `aiTurn` (T7); `Plan` (T6); `corpusState` (T1); `goldenHuman`, `playVsAi`, `LivePlay` (T8); `advanceAi`, `replayVsAi`, `resumeVsAi`, `VsAiResult`, `VsAiResume` (T8); `hashMatch`; `scoreVsAi` (T9); esbuild.
- Produces:
  - `src/game/test/arcfire/aiCorpus.ts`:
    - `AI_TIERS`, `AI_CORPUS_SEEDS = [11, 23, 37, 41]`;
    - `turnStates(): [string, MatchState][]`: 8 plain states plus `wind`, `sudden`, `beam`, `saveT3`, `dirt`, `move` and `move2`;
    - `type AiFingerprint = number[]` and `interface AiCorpus { turn; draft }`;
    - `runAiCorpus(onTurn?): AiCorpus` and `aiDigest(cases): string`.
    - A turn fingerprint is `[w, move, angle, power, sims, probes, ev, rng.state]`; a draft fingerprint is the six picks, then the RNG state.
  - `src/game/test/arcfire/ai.entry.ts`: the bundle entry re-exporting the corpus, the goldens' human, `advanceAi`, `replayVsAi`, `resumeVsAi`, `hashMatch`, `scoreVsAi` and `STANDARD_SETTINGS`, plus `turnTimes(tier: AiTier, now: () => number): [string, number][]` (each plain state's name and decision time).
  - The fixtures:
    - `ai.corpus.golden.json`: `{ turnDigest, draftDigest, turn: { [id]: fingerprint }, draft: { [id]: fingerprint } }`;
    - `determinism.vsai.golden.json`: `{ win: GoldenCase, loss: GoldenCase }`, where a `GoldenCase` is `{ seed, commands, hash, scores, winner }`.

**Why:** the AI's transcription checks (spec §8).
- **The corpus** fingerprints 45 turn decisions (every tier on 15 states) and 12 draft decisions, so a change to the AI names the decision it moved.
- **Coverage gates** keep the case list from going inert. Some case must move, save a tier-3 weapon, build DIRT by the rule, fire a beam, play sudden death and face wind.
- **The goldens** are a human win and a human loss against Veteran with `STANDARD_SETTINGS`. The scripted human plays them live, then the test replays the human's commands alone. That regeneration is the leaderboard's core guarantee.
- **Bundled.** Everything runs on an esbuild bundle, because Vitest's module runner slows the sim 4–5× (2A K3).

- [ ] **Step 1: Create the AI corpus runner**

Create `src/game/test/arcfire/aiCorpus.ts` with (design-verbatim):

```ts
// src/game/test/arcfire/aiCorpus.ts
//
// The AI corpus: fixed AI decisions, fingerprinted, so Node and every browser
// engine must decide identically (spec §8), and a change to the AI names the
// decision it moved. Two sections with their own digests:
//   turn|<tier>|<state>  a turn decision on a fixed state. States are
//     fixtures.ts's corpusState (the lowest-free-slot draft, never `power`,
//     then fixed shots: no AI); the specials
//     edit a hand, the wind or the phase so that every heuristic is
//     exercised (a coverage gate in ai.corpus.test.ts checks it). The
//     fingerprint is the command after noise, the sim and probe counts, the
//     chosen ev and the RNG state after the 7 draws. Power-independent;
//   draft|<tier>|s<seed> the tier's first six picks on the seed's pool, and
//     the RNG state after them. These read `power`, so a balance write-back
//     moves this section (and the vs-AI golden) only.
// Pure: the corpus test (bundled, Node) and the cross-engine harness run it.
import { FNV_OFFSET, fnvFold, fnvHex } from "@/game/sim/hash";
import { applyPick, createMatch } from "@/game/titles/arcfire/match";
import { STANDARD_SETTINGS, cloneMatch, type MatchState } from "@/game/titles/arcfire/state";
import { ROSTER_INDEX } from "@/game/titles/arcfire/weapons/roster";
import { aiPick, aiTurn } from "@/game/titles/arcfire/ai/policy";
import type { Plan } from "@/game/titles/arcfire/ai/plan";
import type { TurnCommand } from "@/game/titles/arcfire/match";
import type { AiTier } from "@/game/titles/arcfire/ai/tiers";
import { corpusState } from "./fixtures";

export const AI_TIERS: AiTier[] = ["rookie", "veteran", "ace"];
export const AI_CORPUS_SEEDS = [11, 23, 37, 41];

const hand = (ids: string[]): number[] => ids.map((id) => ROSTER_INDEX[id]).sort((a, b) => a - b);

/** Every turn state by name: 8 plain states, then the specials that exercise wind, sudden death, a beam, tier-3 saving, DIRT and moves. */
export function turnStates(): [string, MatchState][] {
  const out: [string, MatchState][] = [];
  for (const seed of AI_CORPUS_SEEDS) for (const shots of [0, 9]) out.push([`s${seed}t${shots}`, corpusState(seed, shots)]);
  const wind = corpusState(11, 0);
  wind.wind = 40;
  out.push(["wind", wind]);
  const sudden = corpusState(23, 0);
  sudden.phase = "suddenDeath";
  out.push(["sudden", sudden]);
  const beam = corpusState(37, 0);
  beam.hands[beam.shooter] = hand(["pulse", "lancer"]);
  out.push(["beam", beam]);
  const save = corpusState(11, 0);
  save.hands[save.shooter] = hand(["fan", "cascade"]);
  out.push(["saveT3", save]);
  const dirt = corpusState(67, 0);
  dirt.hands[dirt.shooter] = hand(["pulse", "rampart"]);
  dirt.hands[1 - dirt.shooter] = hand(["nova", "twinnova", "juggernaut"]);
  out.push(["dirt", dirt]);
  const move = corpusState(30, 15);
  move.hands[move.shooter] = hand(["pulse"]);
  out.push(["move", move]);
  out.push(["move2", corpusState(6, 0)]);
  return out;
}

export type AiFingerprint = number[];
export interface AiCorpus { turn: Record<string, AiFingerprint>; draft: Record<string, AiFingerprint> }

/** Every case's fingerprint. `onTurn` sees each turn case's state, command and plan (Node-only coverage checks). */
export function runAiCorpus(onTurn?: (id: string, m: MatchState, cmd: TurnCommand, plan: Plan) => void): AiCorpus {
  const turn: Record<string, AiFingerprint> = {};
  const draft: Record<string, AiFingerprint> = {};
  for (const [name, s] of turnStates()) {
    for (const tier of AI_TIERS) {
      const m = cloneMatch(s);
      const { cmd, plan } = aiTurn(m, tier);
      const id = `turn|${tier}|${name}`;
      turn[id] = [cmd.w, cmd.move, cmd.angle, cmd.power, plan.stats.sims, plan.stats.probes, plan.choices[0].ev, m.rng.state];
      if (onTurn) onTurn(id, s, cmd, plan);
    }
  }
  for (const seed of AI_CORPUS_SEEDS) {
    for (const tier of AI_TIERS) {
      const m = createMatch(seed, STANDARD_SETTINGS);
      const picks: number[] = [];
      for (let i = 0; i < 6; i++) {
        const w = aiPick(m, tier);
        picks.push(m.pool[w]);
        applyPick(m, w);
      }
      draft[`draft|${tier}|s${seed}`] = [...picks, m.rng.state];
    }
  }
  return { turn, draft };
}

/** One digest over a section's cases, in id order. */
export function aiDigest(cases: Record<string, AiFingerprint>): string {
  let h = FNV_OFFSET;
  for (const id of Object.keys(cases).sort()) {
    for (let i = 0; i < id.length; i++) h = fnvFold(h, id.charCodeAt(i));
    for (const v of cases[id]) h = fnvFold(h, v);
  }
  return fnvHex(h);
}
```

- [ ] **Step 2: Create the bundle entry**

Create `src/game/test/arcfire/ai.entry.ts` with (design §10.5, verbatim except `turnTimes`, which returns each plain state's name with its time, so that Task 11 can print the 4 openings, whose hands are full, apart from the 4 states after 9 shots):

```ts
// src/game/test/arcfire/ai.entry.ts
//
// Bundled by ai.corpus.test.ts and ai.perf.test.ts with esbuild and run as
// ONE module (vitest's module runner slows the sim 4-5x, 2A K3): the AI
// corpus, the vs-AI goldens, verification and the per-turn timings.
export { runAiCorpus, aiDigest, turnStates } from "./aiCorpus";
export { goldenHuman, playVsAi } from "./vsaiGolden";
export { advanceAi, replayVsAi, resumeVsAi } from "@/game/titles/arcfire/vsai";
export { hashMatch } from "@/game/titles/arcfire/hash";
export { scoreVsAi } from "@/game/titles/arcfire/verify";
export { STANDARD_SETTINGS } from "@/game/titles/arcfire/state";
import { cloneMatch } from "@/game/titles/arcfire/state";
import { aiTurn } from "@/game/titles/arcfire/ai/policy";
import { turnStates } from "./aiCorpus";
import type { AiTier } from "@/game/titles/arcfire/ai/tiers";

/** Per-tier decision times (ms) on the corpus's 8 plain states, by name (s<seed>t0: an opening, full hands; s<seed>t9: after 9 shots): informational, printed for the hand-off. */
export function turnTimes(tier: AiTier, now: () => number): [string, number][] {
  const out: [string, number][] = [];
  for (const [name, s] of turnStates()) {
    if (!/^s\d+t\d+$/.test(name)) continue; // the 8 plain states
    const m = cloneMatch(s);
    const t0 = now();
    aiTurn(m, tier);
    out.push([name, now() - t0]);
  }
  return out;
}
```

- [ ] **Step 3: Write the pins test**

Create `src/game/titles/arcfire/ai.corpus.test.ts` with (design-verbatim):

```ts
// src/game/titles/arcfire/ai.corpus.test.ts
//
// The AI's pins (spec §8), run on the bundled sim (ai.entry.ts):
//   the AI corpus (ai.corpus.golden.json): two digests, `turn` (power-
//     independent) and `draft` (reads `power`), plus coverage gates so the
//     case list can never go inert: some case moved, saved a tier-3 weapon,
//     built DIRT by the rule, chose a beam, played sudden death, faced wind;
//   the vs-AI goldens (determinism.vsai.golden.json): a human win and a human
//     loss against Veteran with STANDARD_SETTINGS, played live by the scripted
//     human (vsaiGolden.ts), then replayed from the human's commands alone:
//     the replay must reproduce the live hash (the leaderboard's core
//     guarantee) and the pinned one; scoreVsAi scores the win and rejects the rest.
// Update modes, declared and loud (each writes what moved to stderr):
//   UPDATE_ARCFIRE_AI=add    write new case ids only; refuses if any pinned case moved
//   UPDATE_ARCFIRE_AI=draft  re-pin the draft section only (a `power` write-back)
//   UPDATE_ARCFIRE_AI=1      re-pin both sections; needs ARCFIRE_AI_EXPECT_MOVED=<n>, the moved count
//   UPDATE_ARCFIRE_GOLDEN=vsai re-pins the vs-AI goldens, and only =vsai does: determinism.test.ts's
//     =1 (plan1 + full) never touches them, so one re-pin command moves one cause's pins
import { describe, it, expect, beforeAll } from "vitest";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { build } from "esbuild";
import { ROSTER } from "./weapons/roster";
import type { ArcfireCommand } from "./replay";
import type { MatchSettings, MatchState } from "./state";
import type { TurnCommand } from "./match";
import type { Plan } from "./ai/plan";
import type { AiCorpus, AiFingerprint } from "@/game/test/arcfire/aiCorpus";
import type { LivePlay } from "@/game/test/arcfire/vsaiGolden";
import type { VsAiResult, VsAiResume } from "./vsai";
import type { ReplayOutcome, ReplayRejection } from "@/game/sim/title";

interface AiEntry {
  runAiCorpus(onTurn?: (id: string, m: MatchState, cmd: TurnCommand, plan: Plan) => void): AiCorpus;
  aiDigest(cases: Record<string, AiFingerprint>): string;
  playVsAi(seed: number, settings: MatchSettings, tier: "veteran"): LivePlay;
  replayVsAi(r: { seed: number; settings: MatchSettings; tier: "veteran"; commands: unknown }): VsAiResult;
  resumeVsAi(r: { seed: number; settings: MatchSettings; log: unknown }): VsAiResume;
  scoreVsAi(seed: number, commands: unknown): ReplayOutcome | { rejected: ReplayRejection };
  hashMatch(m: MatchState): string;
  STANDARD_SETTINGS: MatchSettings;
}

let ai: AiEntry;
beforeAll(async () => {
  const out = await build({
    entryPoints: [resolve("src/game/test/arcfire/ai.entry.ts")],
    bundle: true, format: "cjs", platform: "node", write: false, tsconfig: "tsconfig.json",
  });
  const mod: { exports: Partial<AiEntry> } = { exports: {} };
  new Function("module", "exports", out.outputFiles[0].text)(mod, mod.exports);
  ai = mod.exports as AiEntry;
}, 60000);

const CORPUS = "src/game/titles/arcfire/ai.corpus.golden.json";
const GOLDEN = "src/game/titles/arcfire/determinism.vsai.golden.json";

interface CorpusFixture { turnDigest: string; draftDigest: string; turn: Record<string, AiFingerprint>; draft: Record<string, AiFingerprint> }

const movedIn = (old: Record<string, AiFingerprint>, cur: Record<string, AiFingerprint>): string[] =>
  [...new Set([...Object.keys(old), ...Object.keys(cur)])].sort()
    .filter((id) => id in old && JSON.stringify(old[id]) !== JSON.stringify(cur[id] ?? null))
    .map((id) => `${id}: ${JSON.stringify(old[id])} -> ${JSON.stringify(cur[id] ?? null)}`);

describe("arcfire AI corpus", () => {
  it("reproduces every pinned AI decision, and exercises every heuristic", () => {
    const seen = new Set<string>();
    const corpus = ai.runAiCorpus((id, m, cmd, plan) => {
      expect(cmd.angle >= 0 && cmd.angle <= 180 && cmd.power >= 0 && cmd.power <= 100, id).toBe(true);
      if (plan.stats.reason === "move" && cmd.move !== 0) seen.add("move");
      if (plan.stats.reason === "saveT3") seen.add("saveT3");
      if (plan.stats.reason === "dirt" && ROSTER[cmd.w].tag === "DIRT") seen.add("dirt");
      if (ROSTER[cmd.w].launch.kind === "beam") seen.add("beam");
      if (m.phase === "suddenDeath") seen.add("sudden");
      if (m.wind !== 0) seen.add("wind");
    });
    expect([...seen].sort(), "coverage gates").toEqual(["beam", "dirt", "move", "saveT3", "sudden", "wind"]);
    const fresh: CorpusFixture = { turnDigest: ai.aiDigest(corpus.turn), draftDigest: ai.aiDigest(corpus.draft), turn: corpus.turn, draft: corpus.draft };
    const mode = process.env.UPDATE_ARCFIRE_AI;
    const old: CorpusFixture | null = existsSync(CORPUS) ? JSON.parse(readFileSync(CORPUS, "utf8")) : null;
    const movedTurn = old ? movedIn(old.turn, corpus.turn) : [];
    const movedDraft = old ? movedIn(old.draft, corpus.draft) : [];
    if (mode === "1" || mode === "draft") {
      const moved = mode === "draft" ? movedDraft : movedTurn.concat(movedDraft);
      process.stderr.write(`AI corpus re-pin (${mode}): ${moved.length} moved cases:\n${moved.join("\n")}\n`);
      if (mode === "draft") expect(movedTurn, "a draft re-pin must not move a turn case").toEqual([]);
      else expect(process.env.ARCFIRE_AI_EXPECT_MOVED, "UPDATE_ARCFIRE_AI=1 needs ARCFIRE_AI_EXPECT_MOVED=<n>; nothing was written").toBe(String(moved.length));
      writeFileSync(CORPUS, JSON.stringify(fresh, null, 1) + "\n");
    } else if (mode === "add" && movedTurn.length === 0 && movedDraft.length === 0) writeFileSync(CORPUS, JSON.stringify(fresh, null, 1) + "\n");
    expect(existsSync(CORPUS), "create it once with UPDATE_ARCFIRE_AI=1 ARCFIRE_AI_EXPECT_MOVED=0").toBe(true);
    if (mode !== "1" && mode !== "draft") {
      expect(movedTurn, "moved turn cases").toEqual([]);
      expect(movedDraft, "moved draft cases (a power write-back: UPDATE_ARCFIRE_AI=draft)").toEqual([]);
    }
    const pinned: CorpusFixture = JSON.parse(readFileSync(CORPUS, "utf8"));
    expect(Object.keys(corpus.turn).sort()).toEqual(Object.keys(pinned.turn).sort());
    expect(Object.keys(corpus.draft).sort()).toEqual(Object.keys(pinned.draft).sort());
    expect(fresh.turnDigest).toBe(pinned.turnDigest);
    expect(fresh.draftDigest).toBe(pinned.draftDigest);
  }, 120000);
});

interface GoldenCase { seed: number; commands: ArcfireCommand[]; hash: string; scores: number[]; winner: number }
interface VsAiGolden { win: GoldenCase; loss: GoldenCase }

describe("arcfire vs-AI goldens", () => {
  it("replays the human's commands alone to the live and the pinned hash", () => {
    const S = ai.STANDARD_SETTINGS;
    const fixture: VsAiGolden | null = existsSync(GOLDEN) ? JSON.parse(readFileSync(GOLDEN, "utf8")) : null;
    const mode = process.env.UPDATE_ARCFIRE_GOLDEN;
    const repin = mode === "vsai";
    const fresh: Partial<VsAiGolden> = {};
    for (const name of ["win", "loss"] as const) {
      const seed = fixture ? fixture[name].seed : name === "win" ? 20260934 : 20260928;
      const live = ai.playVsAi(seed, S, "veteran");
      const liveHash = ai.hashMatch(live.state);
      const r = ai.replayVsAi({ seed, settings: S, tier: "veteran", commands: live.commands });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.hash, `${name}: the human-only replay regenerates the live match`).toBe(liveHash);
      // not inert: finished, both sides scored, the human moved, the AI fired >= 6 tags
      expect(r.finished).toBe(true);
      expect(r.state.winner).toBe(name === "win" ? 0 : 1);
      expect(r.humanPoints).toBeGreaterThan(0);
      expect(r.aiPoints).toBeGreaterThan(0);
      expect(live.commands.some((c) => c.k === "turn" && c.move !== 0)).toBe(true);
      expect(new Set(live.aiTurns.map((c) => (c.k === "turn" ? ROSTER[c.w].tag : ""))).size).toBeGreaterThanOrEqual(6);
      // search-free resume of the full log lands on the same state
      const res = ai.resumeVsAi({ seed, settings: S, log: live.log });
      expect(res.ok && res.droppedFrom === -1 && ai.hashMatch(res.state) === liveHash).toBe(true);
      fresh[name] = { seed, commands: live.commands, hash: r.hash, scores: [r.humanPoints, r.aiPoints], winner: r.state.winner };
    }
    if (repin) {
      writeFileSync(GOLDEN, JSON.stringify(fresh, null, 1) + "\n");
      for (const name of ["win", "loss"] as const) {
        process.stderr.write(`golden vsai-${name}: ${fixture ? fixture[name].hash : "none"} -> ${fresh[name]!.hash} (scores ${fixture ? JSON.stringify(fixture[name].scores) : "none"} -> ${JSON.stringify(fresh[name]!.scores)})\n`);
      }
    }
    expect(existsSync(GOLDEN), "create it once with UPDATE_ARCFIRE_GOLDEN=vsai").toBe(true);
    const pinned: VsAiGolden = JSON.parse(readFileSync(GOLDEN, "utf8"));
    for (const name of ["win", "loss"] as const) {
      expect(fresh[name]!.commands, `${name}: the scripted human's log`).toEqual(pinned[name].commands);
      expect(fresh[name]!.hash, `${name} hash`).toBe(pinned[name].hash);
      expect(fresh[name]!.scores).toEqual(pinned[name].scores);
    }
  }, 120000);

  it("scores the win and rejects everything else (scoreVsAi)", () => {
    const g: VsAiGolden = JSON.parse(readFileSync(GOLDEN, "utf8"));
    const win = g.win.commands;
    expect(ai.scoreVsAi(g.win.seed, win)).toEqual({ score: g.win.scores[0] - g.win.scores[1], stat: g.win.scores[0], hash: g.win.hash });
    expect(ai.scoreVsAi(g.loss.seed, g.loss.commands)).toEqual({ rejected: "not_a_win" });
    expect(ai.scoreVsAi(g.win.seed, win.slice(0, 15))).toEqual({ rejected: "not_a_win" }); // unfinished
    expect(ai.scoreVsAi(g.win.seed + 1, win)).toEqual({ rejected: "invalid_command" }); // another pool
    const bent = win.map((c, i) => (i === win.length - 1 && c.k === "turn" ? { ...c, angle: 181 } : c));
    expect(ai.scoreVsAi(g.win.seed, bent)).toEqual({ rejected: "invalid_command" });
    expect(ai.scoreVsAi(g.win.seed, [...win.slice(0, 3), null])).toEqual({ rejected: "invalid_command_shape" });
    expect(ai.scoreVsAi(g.win.seed, [{ k: "turn", move: 2, w: 0, angle: 45, power: 50 }])).toEqual({ rejected: "invalid_command_shape" });
    expect(ai.scoreVsAi(g.win.seed, new Array(22).fill({ k: "pick", w: 0 }))).toEqual({ rejected: "too_long" });
    expect(ai.scoreVsAi(g.win.seed, "commands")).toEqual({ rejected: "invalid_command_shape" });
  }, 120000);
});
```

- [ ] **Step 4: Run it to verify it fails** (no fixtures yet)

Run: `npx vitest run src/game/titles/arcfire/ai.corpus.test.ts`
Expected: FAIL, exactly 3 tests (about 7 s):
- `arcfire AI corpus > reproduces every pinned AI decision, and exercises every heuristic`: `AssertionError: create it once with UPDATE_ARCFIRE_AI=1 ARCFIRE_AI_EXPECT_MOVED=0: expected false to be true`. The coverage gates and the legality checks pass before this assertion.
- `arcfire vs-AI goldens > replays the human's commands alone to the live and the pinned hash`: `AssertionError: create it once with UPDATE_ARCFIRE_GOLDEN=vsai: expected false to be true`. The replay-equals-live and inertness checks pass before it.
- `arcfire vs-AI goldens > scores the win and rejects everything else (scoreVsAi)`: `Error: ENOENT: no such file or directory, open '…\src\game\titles\arcfire\determinism.vsai.golden.json'`

- [ ] **Step 5: Create the two fixtures once**

Run: `UPDATE_ARCFIRE_AI=1 ARCFIRE_AI_EXPECT_MOVED=0 UPDATE_ARCFIRE_GOLDEN=vsai npx vitest run src/game/titles/arcfire/ai.corpus.test.ts`
Expected: PASS (3 tests), and stderr prints exactly these three lines:

```
AI corpus re-pin (1): 0 moved cases:
golden vsai-win: none -> be9db94d (scores none -> [254,169])
golden vsai-loss: none -> 2097c8fc (scores none -> [234,329])
```

- [ ] **Step 6: Transcription check — the four AI pins**

Run: `node -e "const c=require('./src/game/titles/arcfire/ai.corpus.golden.json');console.log(c.turnDigest,c.draftDigest,Object.keys(c.turn).length,Object.keys(c.draft).length)"`
Expected, exactly: `55df93ca c0d402d4 45 12`

Run: `node -e "const g=require('./src/game/titles/arcfire/determinism.vsai.golden.json');for(const k of ['win','loss'])console.log(k,g[k].seed,g[k].hash,JSON.stringify(g[k].scores),g[k].winner,g[k].commands.length)"`
Expected, exactly:

```
win 20260934 be9db94d [254,169] 0 20
loss 20260928 2097c8fc [234,329] 1 20
```

Run: `node -e "const c=require('./src/game/titles/arcfire/ai.corpus.golden.json');for(const id of ['turn|ace|s11t0','turn|veteran|s11t0','turn|rookie|sudden','turn|ace|dirt','turn|ace|move','turn|ace|saveT3','turn|veteran|beam'])console.log(id,JSON.stringify(c.turn[id]));console.log('draft|ace|s11',JSON.stringify(c.draft['draft|ace|s11']))"`
Expected, exactly (the design's §1 sample, `[w, move, angle, power, sims, probes, ev, rng.state]`):

```
turn|ace|s11t0 [8,0,150,72,3332,21201,1011,2015813115]
turn|veteran|s11t0 [8,0,167,95,1080,2391,115,2015813115]
turn|rookie|sudden [0,0,165,100,30,190,40,2015813127]
turn|ace|dirt [23,0,151,87,1021,14220,0,2015813171]
turn|ace|move [0,-1,157,86,1000,13650,345,2015813134]
turn|ace|saveT3 [6,0,140,70,1300,13650,590,2015813115]
turn|veteran|beam [26,0,87,51,240,1241,60,2015813141]
draft|ace|s11 [2,8,10,18,21,27,184247302]
```

If anything differs, **stop and do not commit.** The code differs from this plan somewhere. Delete both fixtures, compare each case of `ai.corpus.golden.json` with the listing below (the design's Appendix B) to find the first decision that moved, fix the transcription, and redo Step 5.

The expected `ai.corpus.golden.json`, by value (the test writes it with `JSON.stringify(…, null, 1)`, one value per line):

```json
{
 "turnDigest": "55df93ca",
 "draftDigest": "c0d402d4",
 "turn": {
  "turn|rookie|s11t0": [1,0,140,69,270,417,115,2015813115],
  "turn|veteran|s11t0": [8,0,167,95,1080,2391,115,2015813115],
  "turn|ace|s11t0": [8,0,150,72,3332,21201,1011,2015813115],
  "turn|rookie|s11t9": [21,0,65,89,120,750,84,2015813115],
  "turn|veteran|s11t9": [18,0,47,87,480,4575,85,2015813115],
  "turn|ace|s11t9": [18,0,51,86,1909,27477,762,2015813115],
  "turn|rookie|s23t0": [18,0,165,100,270,1130,115,2015813127],
  "turn|veteran|s23t0": [8,0,168,96,1080,6875,115,2015813127],
  "turn|ace|s23t0": [3,0,162,74,3457,38060,850,2015813127],
  "turn|rookie|s23t9": [14,0,35,83,150,570,60,2015813127],
  "turn|veteran|s23t9": [12,0,29,93,600,3450,52,2015813127],
  "turn|ace|s23t9": [10,0,64,86,2227,25000,454,2015813127],
  "turn|rookie|s37t0": [2,0,151,75,270,977,115,2015813141],
  "turn|veteran|s37t0": [8,0,160,97,1080,5816,115,2015813141],
  "turn|ace|s37t0": [8,0,148,78,3336,34831,998,2015813141],
  "turn|rookie|s37t9": [15,0,26,95,150,570,102,2015813141],
  "turn|veteran|s37t9": [13,0,26,99,600,3450,103,2015813141],
  "turn|ace|s37t9": [13,0,26,100,2227,24541,642,2015813141],
  "turn|rookie|s41t0": [3,0,12,89,240,760,115,2015813145],
  "turn|veteran|s41t0": [8,0,9,100,960,4600,115,2015813145],
  "turn|ace|s41t0": [3,0,22,70,3195,31100,874,2015813145],
  "turn|rookie|s41t9": [15,0,162,79,150,570,150,2015813145],
  "turn|veteran|s41t9": [9,0,154,94,600,3450,150,2015813145],
  "turn|ace|s41t9": [9,0,149,84,2221,23890,999,2015813145],
  "turn|rookie|wind": [1,0,155,79,270,417,115,2015813115],
  "turn|veteran|wind": [8,0,167,95,1080,2391,115,2015813115],
  "turn|ace|wind": [8,0,157,81,3332,21201,996,2015813115],
  "turn|rookie|sudden": [0,0,165,100,30,190,40,2015813127],
  "turn|veteran|sudden": [0,0,168,96,120,1150,40,2015813127],
  "turn|ace|sudden": [0,0,157,78,1000,13650,337,2015813127],
  "turn|rookie|beam": [26,0,91,45,60,227,40,2015813141],
  "turn|veteran|beam": [26,0,87,51,240,1241,60,2015813141],
  "turn|ace|beam": [26,0,89,51,837,5093,540,2015813141],
  "turn|rookie|saveT3": [6,0,140,69,60,190,103,2015813115],
  "turn|veteran|saveT3": [9,0,163,84,240,1150,150,2015813115],
  "turn|ace|saveT3": [6,0,140,70,1300,13650,590,2015813115],
  "turn|rookie|dirt": [0,0,135,70,30,190,40,2015813171],
  "turn|veteran|dirt": [0,0,144,69,120,1150,40,2015813171],
  "turn|ace|dirt": [23,0,151,87,1021,14220,0,2015813171],
  "turn|rookie|move": [0,0,113,89,30,190,0,2015813134],
  "turn|veteran|move": [0,0,114,82,120,1150,40,2015813134],
  "turn|ace|move": [0,-1,157,86,1000,13650,345,2015813134],
  "turn|rookie|move2": [1,0,150,88,300,797,85,2015813110],
  "turn|veteran|move2": [9,0,150,88,1200,4691,150,2015813110],
  "turn|ace|move2": [18,-1,133,76,3581,27481,762,2015813110]
 },
 "draft": {
  "draft|rookie|s11": [27,31,8,18,1,10,184247302],
  "draft|veteran|s11": [8,10,18,27,29,2,184247302],
  "draft|ace|s11": [2,8,10,18,21,27,184247302],
  "draft|rookie|s23": [3,10,11,13,8,31,184247314],
  "draft|veteran|s23": [8,10,18,31,1,2,184247314],
  "draft|ace|s23": [2,8,10,18,31,1,184247314],
  "draft|rookie|s37": [21,27,10,9,8,31,184247328],
  "draft|veteran|s37": [2,8,9,21,10,29,184247328],
  "draft|ace|s37": [2,8,9,10,18,21,184247328],
  "draft|rookie|s41": [31,3,21,7,11,14,184247332],
  "draft|veteran|s41": [8,2,9,10,31,3,184247332],
  "draft|ace|s41": [2,8,9,10,21,31,184247332]
 }
}
```

The expected `determinism.vsai.golden.json`, by value:

```json
{
 "win": {
  "seed": 20260934,
  "commands": [
   {"k":"pick","w":23},
   {"k":"pick","w":22},
   {"k":"pick","w":21},
   {"k":"pick","w":19},
   {"k":"pick","w":18},
   {"k":"pick","w":17},
   {"k":"pick","w":16},
   {"k":"pick","w":15},
   {"k":"pick","w":13},
   {"k":"pick","w":12},
   {"k":"turn","move":0,"w":31,"angle":30,"power":80},
   {"k":"turn","move":0,"w":19,"angle":55,"power":75},
   {"k":"turn","move":1,"w":30,"angle":70,"power":90},
   {"k":"turn","move":0,"w":28,"angle":75,"power":90},
   {"k":"turn","move":0,"w":20,"angle":75,"power":95},
   {"k":"turn","move":0,"w":22,"angle":20,"power":40},
   {"k":"turn","move":0,"w":23,"angle":20,"power":40},
   {"k":"turn","move":0,"w":24,"angle":20,"power":40},
   {"k":"turn","move":0,"w":25,"angle":20,"power":40},
   {"k":"turn","move":0,"w":26,"angle":20,"power":40}
  ],
  "hash": "be9db94d",
  "scores": [254,169],
  "winner": 0
 },
 "loss": {
  "seed": 20260928,
  "commands": [
   {"k":"pick","w":23},
   {"k":"pick","w":22},
   {"k":"pick","w":21},
   {"k":"pick","w":20},
   {"k":"pick","w":19},
   {"k":"pick","w":18},
   {"k":"pick","w":17},
   {"k":"pick","w":15},
   {"k":"pick","w":13},
   {"k":"pick","w":12},
   {"k":"turn","move":0,"w":29,"angle":55,"power":75},
   {"k":"turn","move":0,"w":31,"angle":65,"power":85},
   {"k":"turn","move":1,"w":30,"angle":75,"power":100},
   {"k":"turn","move":0,"w":16,"angle":35,"power":40},
   {"k":"turn","move":0,"w":20,"angle":75,"power":100},
   {"k":"turn","move":0,"w":17,"angle":75,"power":65},
   {"k":"turn","move":0,"w":22,"angle":20,"power":40},
   {"k":"turn","move":0,"w":23,"angle":20,"power":40},
   {"k":"turn","move":0,"w":24,"angle":20,"power":40},
   {"k":"turn","move":0,"w":27,"angle":20,"power":40}
  ],
  "hash": "2097c8fc",
  "scores": [234,329],
  "winner": 1
 }
}
```

- [ ] **Step 7: Run it again without the variables**

Run: `npx vitest run src/game/titles/arcfire/ai.corpus.test.ts`
Expected: PASS (3 tests, about 9 s).

- [ ] **Step 8: Run the Arcfire gate, types and the full suite**

Run: `npx vitest run src/game/titles/arcfire src/game/test/arcfire src/game/runtime/arcfire src/game/sim/purity.test.ts`
Expected: PASS: 28 files, 247 tests.

Run: `npx tsc --noEmit`
Expected: exit 0.

Run: `npm test`
Expected: all pass: 68 test files passed and 1 skipped; 500 tests passed and 10 skipped.

Run: `git status --short`
Expected, exactly (no 2A fixture is listed):

```
?? src/game/test/arcfire/ai.entry.ts
?? src/game/test/arcfire/aiCorpus.ts
?? src/game/titles/arcfire/ai.corpus.golden.json
?? src/game/titles/arcfire/ai.corpus.test.ts
?? src/game/titles/arcfire/determinism.vsai.golden.json
```

- [ ] **Step 9: Commit**

```bash
git add src/game/test/arcfire/aiCorpus.ts src/game/test/arcfire/ai.entry.ts src/game/titles/arcfire/ai.corpus.test.ts src/game/titles/arcfire/ai.corpus.golden.json src/game/titles/arcfire/determinism.vsai.golden.json
git commit -m "test(arcfire): the AI pins; AI corpus turn 55df93ca / draft c0d402d4, vs-AI goldens be9db94d / 2097c8fc" -m "Plan 2B Task 10, new pins only (every 2A pin unchanged). AI corpus: 45 turn cases (power-independent) digest 55df93ca, 12 draft cases (read power) digest c0d402d4, with coverage gates (a move, a tier-3 save, DIRT by the rule, a beam, sudden death, wind). vs-AI goldens against Veteran, STANDARD_SETTINGS, replayed from the human's commands alone: win seed 20260934 be9db94d [254, 169], scoreVsAi { score: 85, stat: 254 }; loss seed 20260928 2097c8fc [234, 329], not_a_win. Created once with UPDATE_ARCFIRE_AI set to 1, ARCFIRE_AI_EXPECT_MOVED set to 0 and UPDATE_ARCFIRE_GOLDEN set to vsai." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 11: The verification budget — `ai.perf.test.ts`

**Files:**
- Create: `src/game/titles/arcfire/ai.perf.test.ts` (design §10.6, with a review fix: the openings printed apart)

**Interfaces:**
- Consumes: `ai.entry.ts` (T10): `replayVsAi`, `turnTimes`, `STANDARD_SETTINGS`; `determinism.vsai.golden.json` (T10); esbuild.
- Produces: the spec §5/§8 budget test. A full daily verification (10 Veteran turns, 10 AI picks, 20 human commands) takes < 5 s cold, times `ARCFIRE_PERF_MARGIN`. It prints the warm time and each tier's decision times on the AI corpus's 8 plain states (4 openings, whose hands are full, and 4 states after 9 shots), with the openings' mean and maximum apart, since those are the heaviest decisions B4's phone playtest cares about. It trips if the Ace's mean over the 8 exceeds 1,500 ms.

**Why:** the verifier's real case is a cold bundle, so the first replay after evaluating the bundle is the one asserted. Its printed lines, on the first CI run, become the Node 22 baseline (see the hand-off). If CI ever flakes, raise `ARCFIRE_PERF_MARGIN`, never the literals. This test checks code that already exists, so it has no red phase.

- [ ] **Step 1: Write the budget test**

Create `src/game/titles/arcfire/ai.perf.test.ts` with (design §10.6, verbatim except a review fix: the design labelled its 8 plain states "full-hand", but 4 of them come after 9 shots, so the test now says so and prints the 4 openings apart):

```ts
// src/game/titles/arcfire/ai.perf.test.ts
//
// Spec §5/§8: verifying a full daily-challenge match (10 Veteran turns, 10 AI
// picks, 20 human commands) takes < 5 s on CI hardware. Timed on the bundled
// sim (ai.entry.ts), like perf.test.ts: the FIRST replay after the bundle is
// evaluated is the verifier's real, cold case, and it is the one asserted.
// Informational: the best of three warm replays and each tier's decision
// times on the AI corpus's 8 plain states (4 openings with full hands, also
// printed apart, and 4 states after 9 shots), with a loose Ace tripwire (the
// mean over the 8 <= 1,500 ms) that only catches pathological regressions.
// If CI ever flakes, raise ARCFIRE_PERF_MARGIN (a multiplier), never the literals.
import { it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { build } from "esbuild";
import type { MatchSettings } from "./state";
import type { VsAiResult } from "./vsai";

interface PerfEntry {
  replayVsAi(r: { seed: number; settings: MatchSettings; tier: "veteran"; commands: unknown }): VsAiResult;
  turnTimes(tier: "rookie" | "veteran" | "ace", now: () => number): [string, number][];
  STANDARD_SETTINGS: MatchSettings;
}

it("verifies a daily-challenge match in < 5 s, cold", async () => {
  const out = await build({
    entryPoints: [resolve("src/game/test/arcfire/ai.entry.ts")],
    bundle: true, format: "cjs", platform: "node", write: false, tsconfig: "tsconfig.json",
  });
  const mod: { exports: Partial<PerfEntry> } = { exports: {} };
  new Function("module", "exports", out.outputFiles[0].text)(mod, mod.exports);
  const ai = mod.exports as PerfEntry;
  const now = (): number => Number(process.hrtime.bigint()) / 1e6;
  const margin = Number(process.env.ARCFIRE_PERF_MARGIN ?? "1");
  const g = JSON.parse(readFileSync("src/game/titles/arcfire/determinism.vsai.golden.json", "utf8")).win;
  const verify = (): { ms: number; r: VsAiResult } => {
    const t0 = now();
    const r = ai.replayVsAi({ seed: g.seed, settings: ai.STANDARD_SETTINGS, tier: "veteran", commands: g.commands });
    return { ms: now() - t0, r };
  };
  const cold = verify();
  expect(cold.r.ok && cold.r.hash).toBe(g.hash);
  let warm = Infinity;
  for (let i = 0; i < 3; i++) warm = Math.min(warm, verify().ms);
  const lines = [`daily verification: cold ${cold.ms.toFixed(0)} ms, warm best of 3 ${warm.toFixed(0)} ms`];
  let aceMean = 0;
  const meanOf = (v: number[]): number => v.reduce((a, b) => a + b, 0) / v.length;
  for (const tier of ["rookie", "veteran", "ace"] as const) {
    ai.turnTimes(tier, now); // warm-up pass
    const t = ai.turnTimes(tier, now);
    const all = t.map(([, ms]) => ms);
    const openings = t.filter(([name]) => name.endsWith("t0")).map(([, ms]) => ms); // full hands: the heaviest decisions
    if (tier === "ace") aceMean = meanOf(all);
    lines.push(`${tier.padEnd(7)} decision: mean ${meanOf(all).toFixed(1)} ms, max ${Math.max(...all).toFixed(1)} ms (${all.length} plain states); ` +
      `openings: mean ${meanOf(openings).toFixed(1)} ms, max ${Math.max(...openings).toFixed(1)} ms (${openings.length}, full hands)`);
  }
  console.log(lines.join("\n"));
  expect(cold.ms).toBeLessThan(5000 * margin);
  expect(aceMean).toBeLessThanOrEqual(1500 * margin);
}, 120000);
```

- [ ] **Step 2: Run it**

Run: `npx vitest run src/game/titles/arcfire/ai.perf.test.ts --reporter=verbose`
Expected: PASS (1 test, about 7 s), printing four lines. The review fixes' prototype run on the dev machine (Node 24) printed:

```
daily verification: cold 545 ms, warm best of 3 440 ms
rookie  decision: mean 8.8 ms, max 11.8 ms (8 plain states); openings: mean 10.8 ms, max 11.8 ms (4, full hands)
veteran decision: mean 38.8 ms, max 51.1 ms (8 plain states); openings: mean 46.7 ms, max 51.1 ms (4, full hands)
ace     decision: mean 186.3 ms, max 228.9 ms (8 plain states); openings: mean 214.8 ms, max 228.9 ms (4, full hands)
```

Your figures will differ; only the cold < 5,000 ms and the Ace mean ≤ 1,500 ms are asserted. Keep the four printed lines for Step 4. If a busy machine fails it, re-run once.

- [ ] **Step 3: Run the Arcfire gate, types and the full suite**

Run: `npx vitest run src/game/titles/arcfire src/game/test/arcfire src/game/runtime/arcfire src/game/sim/purity.test.ts`
Expected: PASS: 29 files, 248 tests.

Run: `npx tsc --noEmit`
Expected: exit 0.

Run: `npm test`
Expected: all pass: 69 test files passed and 1 skipped; 501 tests passed and 10 skipped.

- [ ] **Step 4: Commit**

The local figures are informational: the Node 22 baseline comes from the first CI run (see the hand-off), so the commit message does not carry them. Report Step 2's four lines to the controller with the task's result.

```bash
git add src/game/titles/arcfire/ai.perf.test.ts
git commit -m "test(arcfire): the daily verification budget, bundled and cold (< 5 s)" -m "Plan 2B Task 11. Spec 5/8: a full daily verification (10 Veteran turns, 10 AI picks, 20 human commands) on the bundled sim, the cold first replay asserted < 5 s x ARCFIRE_PERF_MARGIN, with an Ace tripwire (mean <= 1,500 ms on the 8 plain corpus states). It prints the warm time and each tier's decision times, the 4 full-hand openings apart; the first CI run's lines are the Node 22 baseline." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 12: The Web Worker — host, protocol, entry and client

**Files:**
- Create: `src/game/runtime/arcfire/host.test.ts` (design §10.7, with review fixes: `not_your_move` and three bad starts are tested)
- Create: `src/game/runtime/arcfire/worker.bundle.test.ts` (design §10.7, with a 60 s timeout, a review fix)
- Create: `src/game/runtime/arcfire/protocol.ts` (design-verbatim, §8.2)
- Create: `src/game/runtime/arcfire/host.ts` (design §8.3, with a review fix: a start builds its match before it replaces the current one)
- Create: `src/game/runtime/arcfire/worker.ts` (design-verbatim, §8.3)
- Create: `src/game/runtime/arcfire/client.ts` (design-verbatim, §8.3)

**Interfaces:**
- Consumes: `createMatch`, `toAct`, `TurnCommand`; `applyCommand`, `ArcfireCommand`; `hashMatch`; `resolveTurn`; `spansFromHeight`; `ROSTER`; `SHORT_SETTINGS`, `STANDARD_SETTINGS`, `MatchSettings`, `MatchState`, `Phase`; `AI`, `HUMAN`, `aiToAct`, `resumeVsAi`, `stepAi`, `replayVsAi` (T8); `Timeline`; `AiTier` (T4); `AiStats` (T6); `determinism.vsai.golden.json` (T10); esbuild.
- Produces (the contract Plan 3 drives, design §8.5):
  - `protocol.ts`:
    - `type Opponent = AiTier | "local"`;
    - `HostRequest`: `start` (optionally with a resume log), `pick`, `turn` and `preview`, each with an `id`;
    - `interface Snapshot`;
    - `HostEvent`: `state`, `picked`, `shot`, `thinking`, `rejected` (`invalid_command | not_your_move | no_match | bad_log`), `preview` and `error`, each echoing its request's `id`, and `picked` / `shot` carrying `seq`.
  - `host.ts`: `type Post = (ev: HostEvent, transfer: Transferable[]) => void`, `snapshot(m: MatchState): Snapshot`, and `createArcfireHost(post: Post): { receive(req: HostRequest): void }`. The human's event is posted before the AI thinks, and every AI action is `stepAi`. A `start` whose log is not an array, whose opponent is not a tier or `"local"`, or whose settings `createMatch` rejects is `rejected{bad_log}`, and it leaves the current match and opponent as they were.
  - `worker.ts`: `self.onmessage` → `host.receive`, `post` → `self.postMessage` with its transfer list.
  - `client.ts`: `interface WorkerLike`, `type Listener`, and `class ArcfireWorkerClient { constructor(factory?); on(l); start(seed, settings, opponent, log?); pick(i); turn(cmd); preview(w, a, p); dispose() }`. Every sender returns the request id.

**Why:** spec §1.4. The sim and the AI's thinking run off the main thread.
- **The host decides nothing,** so the worker cannot make a replay diverge: the host test plays the win golden to `be9db94d`, and resumes it mid-draft, mid-battle and finished.
- **Malformed requests are rejections, never errors,** because every pick and turn goes through `applyCommand`.
- **A failed start changes nothing.** The design's `start` set the opponent before `resumeVsAi`, so settings that `createMatch` rejects posted `error` and left the old match paired with the new opponent. The host now builds the new match first and replaces the old one only on success; a damaged blob (bad settings, an unknown opponent, a log that is not an array) is `bad_log`, which Plan 3 answers by discarding the save.
- **The bundle stays small and self-contained:** it has no Node, React or Next input, and stays under 64 KiB.
- **Nothing in 2B imports `client.ts`,** so `npm run build` and the bundle budget are unchanged. Plan 3's first task verifies `new Worker(new URL(…))` under Turbopack (K10).

- [ ] **Step 1: Write the failing tests**

Create `src/game/runtime/arcfire/host.test.ts` with (design §10.7, verbatim except the review fixes' assertions: `not_your_move` once the golden is over; three bad starts that must be `bad_log` and leave the match untouched; and a pick that shows the match is still against Rookie):

```ts
// src/game/runtime/arcfire/host.test.ts — the worker's host and client, driven in Node
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { SHORT_SETTINGS, STANDARD_SETTINGS } from "@/game/titles/arcfire/state";
import { replayVsAi } from "@/game/titles/arcfire/vsai";
import type { ArcfireCommand } from "@/game/titles/arcfire/replay";
import { createArcfireHost } from "./host";
import { ArcfireWorkerClient, type WorkerLike } from "./client";
import type { HostEvent, HostRequest } from "./protocol";

function harness(): { events: HostEvent[]; send: (req: HostRequest) => HostEvent[] } {
  const events: HostEvent[] = [];
  const host = createArcfireHost((ev) => events.push(ev));
  return {
    events,
    send(req) {
      const from = events.length;
      host.receive(req);
      return events.slice(from);
    },
  };
}

/** Send the human's commands; returns every event. */
function drive(h: ReturnType<typeof harness>, commands: ArcfireCommand[]): void {
  let id = 10;
  for (const c of commands) {
    const out = c.k === "pick" ? h.send({ t: "pick", id: id++, poolIndex: c.w }) : h.send({ t: "turn", id: id++, cmd: { move: c.move, w: c.w, angle: c.angle, power: c.power } });
    expect(out[0].t === "picked" || out[0].t === "shot", JSON.stringify(out[0])).toBe(true);
    expect((out[0] as { by: number }).by).toBe(0); // the human's own event first, before the AI thinks
    for (let i = 1; i < out.length; i++) {
      const e = out[i];
      if (e.t === "thinking") expect(out[i + 1]).toMatchObject({ t: "shot", by: 1 });
      else expect(e).toMatchObject({ by: 1 });
    }
  }
}

describe("the Arcfire host", () => {
  it("plays the vs-AI win golden to its hash, and resumes it mid-draft, mid-battle and finished", () => {
    const g = JSON.parse(readFileSync("src/game/titles/arcfire/determinism.vsai.golden.json", "utf8")).win;
    const h = harness();
    h.send({ t: "start", id: 1, seed: g.seed, settings: STANDARD_SETTINGS, opponent: "veteran" });
    drive(h, g.commands);
    const last = [...h.events].reverse().find((e) => "snap" in e) as Extract<HostEvent, { snap: unknown }>;
    expect(last.snap.hash).toBe(g.hash);
    expect(last.snap.phase).toBe("over");
    expect(h.send({ t: "pick", id: 99, poolIndex: 0 })).toEqual([{ t: "rejected", id: 99, reason: "not_your_move" }]); // over: nobody's move
    const log = h.events.flatMap((e): ArcfireCommand[] => (e.t === "picked" ? [{ k: "pick", w: e.poolIndex }] : e.t === "shot" ? [{ k: "turn", ...e.cmd }] : []));
    expect(log.map((_, i) => i)).toEqual(h.events.flatMap((e) => (e.t === "picked" || e.t === "shot" ? [e.seq] : []))); // seq = the log index
    for (const k of [13, 30, log.length]) { // mid-draft, mid-battle, finished
      const r = harness();
      const out = r.send({ t: "start", id: 1, seed: g.seed, settings: STANDARD_SETTINGS, opponent: "veteran", log: log.slice(0, k) });
      expect(out[0]).toMatchObject({ t: "state", droppedFrom: -1, seq: k });
      const human = (out[0] as Extract<HostEvent, { t: "state" }>).humanLog;
      drive(r, g.commands.slice(human.length));
      const end = [...r.events].reverse().find((e) => "snap" in e) as Extract<HostEvent, { snap: unknown }>;
      expect(end.snap.hash, `resumed after ${k}`).toBe(g.hash);
    }
  }, 120000);

  it("rejects what it must, and never lets a request change a match it refuses", () => {
    const h = harness();
    expect(h.send({ t: "pick", id: 1, poolIndex: 0 })).toEqual([{ t: "rejected", id: 1, reason: "no_match" }]);
    expect(h.send({ t: "start", id: 2, seed: 7, settings: SHORT_SETTINGS, opponent: "rookie", log: "x" as never })).toEqual([{ t: "rejected", id: 2, reason: "bad_log" }]);
    const started = h.send({ t: "start", id: 3, seed: 7, settings: SHORT_SETTINGS, opponent: "rookie" });
    const snap = (started[0] as Extract<HostEvent, { t: "state" }>).snap;
    const hash = [...h.events].reverse().find((e) => "snap" in e) as Extract<HostEvent, { snap: unknown }>;
    expect(h.send({ t: "turn", id: 4, cmd: { move: 0, w: 0, angle: 45, power: 50 } })).toEqual([{ t: "rejected", id: 4, reason: "invalid_command" }]); // a turn in the draft
    expect(h.send({ t: "pick", id: 5, poolIndex: 99 })).toEqual([{ t: "rejected", id: 5, reason: "invalid_command" }]);
    expect(h.send({ t: "preview", id: 6, weapon: 99, angle: 45, power: 50 })).toEqual([{ t: "rejected", id: 6, reason: "invalid_command" }]);
    const pv = h.send({ t: "preview", id: 7, weapon: 1, angle: 45, power: 60 });
    expect(pv[0].t === "preview" && pv[0].timeline.events.some((e) => e.kind === "blast")).toBe(true);
    for (const bad of [{ settings: { ...SHORT_SETTINGS, weaponsEach: 0 }, opponent: "local" }, { settings: null, opponent: "rookie" }, { settings: SHORT_SETTINGS, opponent: "boss" }]) {
      expect(h.send({ t: "start", id: 8, seed: 7, ...bad } as never)).toEqual([{ t: "rejected", id: 8, reason: "bad_log" }]); // a damaged blob
    }
    expect(([...h.events].reverse().find((e) => "snap" in e) as Extract<HostEvent, { snap: unknown }>).snap.hash).toBe(hash.snap.hash); // untouched
    expect(snap.phase).toBe("draft");
    const free = hash.snap.poolOwner.findIndex((o) => o === -1);
    expect(h.send({ t: "pick", id: 9, poolIndex: free }).map((e) => e.t)).toEqual(["picked", "picked"]); // still against Rookie: the AI picks back
  }, 60_000);

  it("plays pass-and-play without the AI, and resumes it as a plain 2-player log", () => {
    const h = harness();
    h.send({ t: "start", id: 1, seed: 9, settings: SHORT_SETTINGS, opponent: "local" });
    const cmds: ArcfireCommand[] = [];
    for (let i = 0; i < 2 * SHORT_SETTINGS.weaponsEach; i++) {
      const last = [...h.events].reverse().find((e) => "snap" in e) as Extract<HostEvent, { snap: unknown }>;
      const w = last.snap.poolOwner.findIndex((o) => o === -1);
      expect(h.send({ t: "pick", id: 2 + i, poolIndex: w })[0]).toMatchObject({ t: "picked", by: last.snap.toAct });
      cmds.push({ k: "pick", w });
    }
    expect(h.events.some((e) => e.t === "thinking" || ("by" in e && e.t !== "picked"))).toBe(false);
    for (const cmd of [null, undefined, "x", { move: 0, w: 0, angle: "45", power: 50 }]) { // malformed in battle: rejected, never an error
      expect(h.send({ t: "turn", id: 90, cmd: cmd as never })).toEqual([{ t: "rejected", id: 90, reason: "invalid_command" }]);
    }
    expect(h.send({ t: "pick", id: 91, poolIndex: "3" as never })).toEqual([{ t: "rejected", id: 91, reason: "invalid_command" }]);
    const r = harness();
    const out = r.send({ t: "start", id: 1, seed: 9, settings: SHORT_SETTINGS, opponent: "local", log: cmds });
    expect(out.length).toBe(1);
    expect((out[0] as Extract<HostEvent, { t: "state" }>).snap.phase).toBe("battle");
  }, 60_000);
});

describe("ArcfireWorkerClient", () => {
  it("round-trips a short match against Rookie through a fake worker, with increasing ids", () => {
    let terminated = false;
    const fake: WorkerLike = { onmessage: null, onerror: null, terminate: () => { terminated = true; }, postMessage: () => undefined };
    const host = createArcfireHost((ev) => fake.onmessage!({ data: ev }));
    fake.postMessage = (req) => host.receive(req);
    const client = new ArcfireWorkerClient(() => fake);
    const seen: HostEvent[] = [];
    client.on((ev) => seen.push(ev));
    const ids = [client.start(21, SHORT_SETTINGS, "rookie")];
    const commands: ArcfireCommand[] = [];
    for (let guard = 0; guard < 40; guard++) {
      const last = [...seen].reverse().find((e) => "snap" in e) as Extract<HostEvent, { snap: unknown }>;
      if (last.snap.phase === "over") break;
      if (last.snap.phase === "draft") {
        const w = last.snap.poolOwner.findIndex((o) => o === -1);
        ids.push(client.pick(w));
        commands.push({ k: "pick", w });
      } else {
        const w = last.snap.phase === "suddenDeath" ? 0 : last.snap.hands[0][0];
        ids.push(client.turn({ move: 0, w, angle: 45, power: 70 }));
        commands.push({ k: "turn", move: 0, w, angle: 45, power: 70 });
      }
    }
    expect(ids).toEqual(ids.map((_, i) => i + 1));
    const end = [...seen].reverse().find((e) => "snap" in e) as Extract<HostEvent, { snap: unknown }>;
    expect(end.snap.phase).toBe("over");
    const r = replayVsAi({ seed: 21, settings: SHORT_SETTINGS, tier: "rookie", commands });
    expect(r.ok && r.hash).toBe(end.snap.hash);
    client.dispose();
    expect(terminated).toBe(true);
  }, 60_000);
});
```

Create `src/game/runtime/arcfire/worker.bundle.test.ts` with (design §10.7, verbatim except the 60 s timeout, a review fix: the other esbuild tests give their builds 60 s, and Vitest's 5 s default could flake on a loaded CI runner):

```ts
// src/game/runtime/arcfire/worker.bundle.test.ts — the worker bundles alone: sim + AI + host, nothing else
import { it, expect } from "vitest";
import { resolve } from "node:path";
import { build } from "esbuild";

it("bundles the worker for the browser: no Node, no React or Next, under 64 KiB", async () => {
  const out = await build({
    entryPoints: [resolve("src/game/runtime/arcfire/worker.ts")],
    bundle: true, format: "esm", platform: "browser", minify: true, write: false, metafile: true, tsconfig: "tsconfig.json",
  });
  const js = out.outputFiles[0].text;
  const inputs = Object.keys(out.metafile.inputs);
  expect(inputs.filter((p) => /src[\\/](app|components)[\\/]|node_modules/.test(p))).toEqual([]);
  expect(js).not.toMatch(/\brequire\(|node:/);
  console.log(`worker bundle: ${(js.length / 1024).toFixed(1)} KiB minified, ${inputs.length} inputs`);
  expect(js.length).toBeLessThan(64 * 1024);
}, 60_000); // esbuild's first service spawn on a loaded CI runner, like the other bundling tests
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/game/runtime/arcfire`
Expected: FAIL, both files:
- `host.test.ts` fails to load: `Error: Cannot find module './host' imported from …/src/game/runtime/arcfire/host.test.ts`
- `worker.bundle.test.ts > bundles the worker for the browser: no Node, no React or Next, under 64 KiB`: `Error: Build failed with 1 error: error: Could not resolve "…\src\game\runtime\arcfire\worker.ts"`

- [ ] **Step 3: Create the protocol**

Create `src/game/runtime/arcfire/protocol.ts` with (design-verbatim):

```ts
// src/game/runtime/arcfire/protocol.ts
//
// The message protocol between the main thread (rendering, HUD, input,
// localStorage) and the Arcfire worker (sim + AI), spec §1.4. Type-only.
// Every message is structured-clone safe (plain objects, arrays, Int32Arrays);
// a snapshot's and a timeline's heights are fresh copies the host transfers.
// Every request carries an `id`; every event it causes echoes that id, in
// order. `seq` is an applied action's index in the match log (0, 1, 2, ...),
// so the UI can queue and play actions in order.
import type { MatchSettings, Phase } from "@/game/titles/arcfire/state";
import type { TurnCommand } from "@/game/titles/arcfire/match";
import type { ArcfireCommand } from "@/game/titles/arcfire/replay";
import type { Timeline } from "@/game/titles/arcfire/timeline";
import type { AiTier } from "@/game/titles/arcfire/ai/tiers";
import type { AiStats } from "@/game/titles/arcfire/ai/search";

/** vs-AI (the human is player 0) or "local" pass-and-play (both seats send commands; no AI). */
export type Opponent = AiTier | "local";

export type HostRequest =
  | { t: "start"; id: number; seed: number; settings: MatchSettings; opponent: Opponent; log?: readonly ArcfireCommand[] } // log: a resume blob's full log, both seats in order
  | { t: "pick"; id: number; poolIndex: number }
  | { t: "turn"; id: number; cmd: TurnCommand }
  | { t: "preview"; id: number; weapon: number; angle: number; power: number }; // the draft panel's looping preview

/** What the HUD and renderer need between timelines. */
export interface Snapshot {
  phase: Phase;
  toAct: number; // the seat whose command is awaited: 0 or 1, or -1 when over
  shooter: number;
  firstPicker: number;
  picksMade: number;
  shotsFired: number;
  pool: number[];
  poolOwner: number[];
  hands: [number[], number[]];
  scores: [number, number];
  tankX: [number, number];
  movesLeft: [number, number];
  wind: number;
  winner: number;
  heights: Int32Array; // the settled surface per column (a fresh copy, transferred)
  hash: string; // hashMatch: desync checks now, online play later
}

export type HostEvent =
  | { t: "state"; id: number; seq: number; snap: Snapshot; log: ArcfireCommand[]; humanLog: ArcfireCommand[]; droppedFrom: number } // after start/resume: log = the resume blob, humanLog = the daily submission
  | { t: "picked"; id: number; seq: number; by: number; poolIndex: number; snap: Snapshot }
  | { t: "shot"; id: number; seq: number; by: number; cmd: TurnCommand; timeline: Timeline; snap: Snapshot; ai: AiStats | null }
  | { t: "thinking"; id: number; by: number } // an AI turn's search starts now (the human's own event is already posted)
  | { t: "rejected"; id: number; reason: "invalid_command" | "not_your_move" | "no_match" | "bad_log" }
  | { t: "preview"; id: number; timeline: Timeline }
  | { t: "error"; id: number; message: string }; // a bug report path: the AI's commands are legal by construction
```

- [ ] **Step 4: Create the host**

Create `src/game/runtime/arcfire/host.ts` with (design §8.3, verbatim except the review fix in `start` and its `OPPONENTS` list):

```ts
// src/game/runtime/arcfire/host.ts
//
// The Arcfire worker's brain as a pure module: it owns one match and its log,
// applies the local player's commands, runs the AI whenever it is the AI's
// move, and reports every action through `post`. No `self`, no clock, no DOM:
// Node tests drive it directly, and worker.ts binds it to postMessage.
// Runtime code (outside the purity roots) that never decides anything: every
// decision comes from vsai.ts and ai/**, so the worker can't make a replay
// diverge. A human command's event is posted BEFORE the AI starts, so the
// AI's search overlaps the human shot's playback on the main thread.
import { createMatch, toAct, type TurnCommand } from "@/game/titles/arcfire/match";
import { applyCommand, type ArcfireCommand } from "@/game/titles/arcfire/replay";
import { hashMatch } from "@/game/titles/arcfire/hash";
import { resolveTurn } from "@/game/titles/arcfire/resolve";
import { spansFromHeight } from "@/game/titles/arcfire/terrain";
import { ROSTER } from "@/game/titles/arcfire/weapons/roster";
import { SHORT_SETTINGS, type MatchState } from "@/game/titles/arcfire/state";
import { AI, HUMAN, aiToAct, resumeVsAi, stepAi } from "@/game/titles/arcfire/vsai";
import type { Timeline } from "@/game/titles/arcfire/timeline";
import type { AiStats } from "@/game/titles/arcfire/ai/search";
import type { HostEvent, HostRequest, Opponent, Snapshot } from "./protocol";

export type Post = (ev: HostEvent, transfer: Transferable[]) => void;

export function snapshot(m: MatchState): Snapshot {
  return {
    phase: m.phase, toAct: toAct(m), shooter: m.shooter, firstPicker: m.firstPicker, picksMade: m.picksMade, shotsFired: m.shotsFired,
    pool: m.pool.slice(), poolOwner: Array.from(m.poolOwner), hands: [m.hands[0].slice(), m.hands[1].slice()],
    scores: [m.scores[0], m.scores[1]], tankX: [m.tankX[0], m.tankX[1]], movesLeft: [m.movesLeft[0], m.movesLeft[1]],
    wind: m.wind, winner: m.winner, heights: m.terrain.height.slice(), hash: hashMatch(m),
  };
}

const isInt = (v: unknown, lo: number, hi: number): boolean => typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi;
const OPPONENTS: readonly unknown[] = ["rookie", "veteran", "ace", "local"];

/** The draft panel's preview board: flat ground at y = 400, tanks at 300 / 700, player 0 to shoot, no wind. */
function previewBoard(): MatchState {
  const p = createMatch(1, SHORT_SETTINGS);
  p.phase = "battle";
  p.terrain.height.fill(400);
  spansFromHeight(p.terrain);
  p.tankX[0] = 300;
  p.tankX[1] = 700;
  p.shooter = 0;
  return p;
}

export function createArcfireHost(post: Post): { receive(req: HostRequest): void } {
  let m: MatchState | null = null;
  let opponent: Opponent = "local";
  let log: ArcfireCommand[] = []; // every command in order, both seats: the resume blob
  let humanLog: ArcfireCommand[] = []; // the human's only (vs-AI): the daily submission

  const vsAi = (): boolean => opponent !== "local";

  /** Post one applied action (the log already holds it). */
  function applied(id: number, by: number, c: ArcfireCommand, timeline: Timeline | null, ai: AiStats | null): void {
    const snap = snapshot(m!);
    const seq = log.length - 1;
    if (c.k === "pick") post({ t: "picked", id, seq, by, poolIndex: c.w, snap }, [snap.heights.buffer]);
    else if (timeline !== null) post({ t: "shot", id, seq, by, cmd: { move: c.move, w: c.w, angle: c.angle, power: c.power }, timeline, snap, ai }, [snap.heights.buffer, timeline.settle.heights.buffer]);
  }

  /** Run the AI until it is not its move, reporting each action under request `id`. */
  function runAi(id: number): void {
    while (m !== null && opponent !== "local" && aiToAct(m)) {
      if (m.phase !== "draft") post({ t: "thinking", id, by: AI }, []);
      const a = stepAi(m, opponent);
      if (a === null) return;
      const c: ArcfireCommand = a.k === "pick" ? { k: "pick", w: a.w } : { k: "turn", ...a.cmd };
      log.push(c);
      applied(id, AI, c, a.k === "turn" ? a.timeline : null, a.k === "turn" ? a.plan.stats : null);
    }
  }

  function start(req: Extract<HostRequest, { t: "start" }>): void {
    const saved: unknown = req.log ?? [];
    // build the new match first: a start that fails leaves the current match and its opponent as they were
    let next: MatchState | null = null;
    let nextLog: ArcfireCommand[] = [];
    let nextHuman: ArcfireCommand[] = [];
    let droppedFrom = -1;
    if (Array.isArray(saved) && OPPONENTS.includes(req.opponent)) {
      try {
        if (req.opponent !== "local") {
          const r = resumeVsAi({ seed: req.seed, settings: req.settings, log: saved });
          if (r.ok) {
            next = r.state;
            nextLog = r.log;
            nextHuman = r.humanLog;
            droppedFrom = r.droppedFrom;
          }
        } else { // pass-and-play: the valid prefix of a plain 2-player log
          const p = createMatch(req.seed, req.settings);
          for (let i = 0; i < saved.length; i++) {
            if (!applyCommand(p, saved[i]).ok) { droppedFrom = i; break; }
            nextLog.push(saved[i] as ArcfireCommand);
          }
          next = p;
        }
      } catch {
        next = null; // createMatch rejected the settings: a damaged blob like any other
      }
    }
    if (next === null) { // a log that is not an array, an unknown opponent, or settings createMatch rejects
      post({ t: "rejected", id: req.id, reason: "bad_log" }, []);
      return;
    }
    opponent = req.opponent;
    m = next;
    log = nextLog;
    humanLog = nextHuman;
    const snap = snapshot(m);
    post({ t: "state", id: req.id, seq: log.length, snap, log: log.slice(), humanLog: humanLog.slice(), droppedFrom }, [snap.heights.buffer]);
    runAi(req.id); // the AI's opening pick, or the reply a save was taken before
  }

  function preview(req: Extract<HostRequest, { t: "preview" }>): void {
    if (!isInt(req.weapon, 0, ROSTER.length - 1) || !isInt(req.angle, 0, 180) || !isInt(req.power, 0, 100)) {
      post({ t: "rejected", id: req.id, reason: "invalid_command" }, []);
      return;
    }
    const timeline = resolveTurn(previewBoard(), { move: 0, weapon: req.weapon, angle: req.angle, power: req.power });
    post({ t: "preview", id: req.id, timeline }, [timeline.settle.heights.buffer]);
  }

  function command(req: Extract<HostRequest, { t: "pick" | "turn" }>): void {
    if (m === null) { post({ t: "rejected", id: req.id, reason: "no_match" }, []); return; }
    const by = toAct(m);
    if (by === -1 || (vsAi() && by !== HUMAN)) { post({ t: "rejected", id: req.id, reason: "not_your_move" }, []); return; }
    // a fresh plain entry (the log never aliases a request), applied by applyCommand, which never throws:
    // a malformed request (a null cmd, a string angle) is invalid_command, never an error event
    const cmd: Partial<TurnCommand> = req.t === "turn" && typeof req.cmd === "object" && req.cmd !== null ? req.cmd : {};
    const c = (req.t === "pick"
      ? { k: "pick", w: req.poolIndex }
      : { k: "turn", move: cmd.move, w: cmd.w, angle: cmd.angle, power: cmd.power }) as ArcfireCommand;
    const r = applyCommand(m, c);
    if (!r.ok) { post({ t: "rejected", id: req.id, reason: "invalid_command" }, []); return; }
    log.push(c);
    if (vsAi()) humanLog.push(c);
    applied(req.id, by, c, r.timeline, null);
    runAi(req.id); // starts at once: the search overlaps the human shot's playback
  }

  return {
    receive(req: HostRequest): void {
      try {
        if (req.t === "start") start(req);
        else if (req.t === "preview") preview(req);
        else command(req);
      } catch (e) {
        post({ t: "error", id: req.id, message: e instanceof Error ? e.message : String(e) }, []);
      }
    },
  };
}
```

- [ ] **Step 5: Create the worker entry**

Create `src/game/runtime/arcfire/worker.ts` with (design-verbatim):

```ts
// src/game/runtime/arcfire/worker.ts
//
// The Web Worker entry (spec §1.4): host.ts bound to postMessage, so the sim
// and the AI's thinking never block the main thread. Loaded only by client.ts.
import { createArcfireHost } from "./host";
import type { HostEvent, HostRequest } from "./protocol";

const scope = self as unknown as {
  postMessage(ev: HostEvent, transfer: Transferable[]): void;
  onmessage: ((e: MessageEvent<HostRequest>) => void) | null;
};
const host = createArcfireHost((ev, transfer) => scope.postMessage(ev, transfer));
scope.onmessage = (e) => host.receive(e.data);
```

- [ ] **Step 6: Create the client**

Create `src/game/runtime/arcfire/client.ts` with (design-verbatim):

```ts
// src/game/runtime/arcfire/client.ts
//
// The main thread's handle on the Arcfire worker: what Plan 3's GameClient
// (behind its ssr:false dynamic import) uses, and nothing else imports. It
// owns the request ids and the listeners; dispose() terminates the worker,
// which is also how the UI abandons an AI that is still thinking. Tests pass
// a factory that returns an in-process WorkerLike wired to createArcfireHost.
import type { MatchSettings } from "@/game/titles/arcfire/state";
import type { TurnCommand } from "@/game/titles/arcfire/match";
import type { ArcfireCommand } from "@/game/titles/arcfire/replay";
import type { HostEvent, HostRequest, Opponent } from "./protocol";

/** The part of a Worker the client uses. */
export interface WorkerLike {
  postMessage(req: HostRequest): void;
  terminate(): void;
  onmessage: ((e: { data: HostEvent }) => void) | null;
  onerror: ((e: { message: string }) => void) | null;
}

type WithoutId<T> = T extends unknown ? Omit<T, "id"> : never; // distributes over the union
export type Listener = (ev: HostEvent) => void;

const moduleWorker = (): WorkerLike =>
  new Worker(new URL("./worker.ts", import.meta.url), { type: "module" }) as unknown as WorkerLike;

export class ArcfireWorkerClient {
  private readonly worker: WorkerLike;
  private readonly listeners = new Set<Listener>();
  private nextId = 1;

  constructor(factory: () => WorkerLike = moduleWorker) {
    this.worker = factory();
    this.worker.onmessage = (e) => {
      for (const l of this.listeners) l(e.data);
    };
    this.worker.onerror = (e) => {
      for (const l of this.listeners) l({ t: "error", id: -1, message: e.message });
    };
  }

  /** Subscribe; returns the unsubscribe. */
  on(l: Listener): () => void {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  }

  start(seed: number, settings: MatchSettings, opponent: Opponent, log?: readonly ArcfireCommand[]): number {
    return this.send({ t: "start", seed, settings, opponent, log });
  }

  pick(poolIndex: number): number {
    return this.send({ t: "pick", poolIndex });
  }

  turn(cmd: TurnCommand): number {
    return this.send({ t: "turn", cmd });
  }

  preview(weapon: number, angle: number, power: number): number {
    return this.send({ t: "preview", weapon, angle, power });
  }

  dispose(): void {
    this.worker.terminate();
    this.listeners.clear();
  }

  private send(req: WithoutId<HostRequest>): number {
    const id = this.nextId++;
    this.worker.postMessage({ ...req, id } as HostRequest);
    return id;
  }
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run src/game/runtime/arcfire --reporter=verbose`
Expected: PASS: 2 files, 5 tests (the golden test takes about 7 s). The bundle test prints `worker bundle: 40.1 KiB minified, 29 inputs`.

- [ ] **Step 8: Run the Arcfire gate, types and the full suite**

Run: `npx vitest run src/game/titles/arcfire src/game/test/arcfire src/game/runtime/arcfire src/game/sim/purity.test.ts`
Expected: PASS: 31 files, 253 tests.

Run: `npx tsc --noEmit`
Expected: exit 0.

Run: `npm test`
Expected: all pass: 71 test files passed and 1 skipped; 506 tests passed and 10 skipped. `lazy-boundary.test.ts` stays green: nothing outside `src/game/**` imports the runtime.

- [ ] **Step 9: The build and the bundle budget are unchanged**

Run: `npm run build`
Expected: the Next.js build succeeds (exit 0). Nothing in 2B imports `client.ts`, so no route changes: the bundle-budget check below scans the same 20 prerendered routes as on the base. Never use `next dev`.

Run: `npm run check:bundle-budget`
Expected: exit 0, printing `✓ bundle-budget: 20 prerendered route(s) scanned, game engine chunk(s) […] referenced by none of them.`

Run: `git status --short`
Expected, exactly: `?? src/game/runtime/arcfire/` (`.next/`, `next-env.d.ts` and `tsconfig.tsbuildinfo` are gitignored).

- [ ] **Step 10: Commit**

```bash
git add src/game/runtime/arcfire/protocol.ts src/game/runtime/arcfire/host.ts src/game/runtime/arcfire/worker.ts src/game/runtime/arcfire/client.ts src/game/runtime/arcfire/host.test.ts src/game/runtime/arcfire/worker.bundle.test.ts
git commit -m "feat(arcfire): the Web Worker; host, protocol, entry and client" -m "Plan 2B Task 12. createArcfireHost(post) is a pure module that sequences vsai.ts and decides nothing: request ids and seq, transfer lists, the human's event posted before the AI thinks, every pick and turn through applyCommand (a malformed request is rejected, never an error), resume through resumeVsAi, and a start that fails (bad settings, an unknown opponent, a log that is not an array) is bad_log and changes nothing. Node tests play the win golden to be9db94d and resume it mid-draft, mid-battle and finished, and cover every rejection; the client round-trips a Rookie match through a fake worker; the worker bundle is 40.1 KiB with no Node, React or Next input. Nothing imports client.ts yet (Plan 3 does), so the build and the bundle budget are unchanged." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 13: Cross-engine — the AI pins in every engine, and a real-Worker smoke

**Files:**
- Modify: `e2e/cross-engine-determinism.spec.ts` (4 edits: the header comment, the AI fixtures and `movedAiCases`, 2 `PINS` rows, the Worker smoke; the code is the design's §10.8, verbatim)
- Modify: `src/game/test/cross-engine/harness.entry.ts` (4 edits: the header comment, the imports, the `Window` declarations, the three functions; §10.8)

**Interfaces:**
- Consumes: `runAiCorpus`, `aiDigest`, `AiFingerprint` (T10); `replayVsAi` (T8); `STANDARD_SETTINGS`; `ArcfireCommand`; the worker entry (T12); `ai.corpus.golden.json` and `determinism.vsai.golden.json` (T10).
- Produces, in the cross-engine bundle:
  - `window.runArcfireAiCorpus(): { turn: string; draft: string }`;
  - `window.runArcfireAiCorpusCases(): Record<string, AiFingerprint>`;
  - `window.runArcfireVsAi(seed: number, commands: ArcfireCommand[]): string`.
- Produces in the spec: two `PINS` rows, "Arcfire AI corpus digests (turn/draft)" and "Arcfire vs-AI goldens (win/loss)", and one test per engine that plays the win golden through the host in a real Worker, then resumes it after 25 log entries in a fresh Worker.

**Why:** spec §8's cross-engine gate. An honest Safari or Firefox run must reproduce every AI decision the V8 verifier regenerates. The Worker smoke proves the shipped worker code in real browser Workers. Firefox runs in CI only (2A ruling R10).

- [ ] **Step 1: Add the pins and the Worker smoke to the spec** (4 edits)

In `e2e/cross-engine-determinism.spec.ts`, replace:

```ts
// determinism pin and asserts each engine reproduces the Node value: Circle
// TD's golden, Arcfire's two goldens and the Arcfire corpus digest. Catches the
// single largest board-correctness risk: an honest Safari/Firefox run
// rejected by the V8 verifier over a ULP divergence.
```

with:

```ts
// determinism pin and asserts each engine reproduces the Node value: Circle
// TD's golden, Arcfire's two goldens, the Arcfire corpus digest, the Arcfire
// AI corpus digests and the vs-AI goldens. Catches the single largest
// board-correctness risk: an honest Safari/Firefox run rejected by the V8
// verifier over a ULP divergence. Each engine also plays the vs-AI win golden
// through the worker's host in a real Web Worker, and resumes it in a fresh one.
```

The AI fixtures and the per-case explanation go directly after `movedCorpusCases`. In `e2e/cross-engine-determinism.spec.ts`, replace:

```ts
  return `cases that differ from corpus.golden.json: ${ids.length > 0 ? ids.join(", ") : "none (only the digest differs)"}`;
}
```

with (the added lines are design-verbatim):

```ts
  return `cases that differ from corpus.golden.json: ${ids.length > 0 ? ids.join(", ") : "none (only the digest differs)"}`;
}

const aiCorpus = readJson<{ turnDigest: string; draftDigest: string; turn: Record<string, number[]>; draft: Record<string, number[]> }>(
  "src/game/titles/arcfire/ai.corpus.golden.json");
type VsAiCase = { seed: number; commands: unknown[]; hash: string };
const vsai = readJson<{ win: VsAiCase; loss: VsAiCase }>("src/game/titles/arcfire/determinism.vsai.golden.json");

/** The AI corpus case ids whose browser fingerprint differs from ai.corpus.golden.json. */
async function movedAiCases(page: Page): Promise<string> {
  const got = await page.evaluate(() => window.runArcfireAiCorpusCases());
  const pinned: Record<string, number[]> = { ...aiCorpus.turn, ...aiCorpus.draft };
  const ids = [...new Set([...Object.keys(pinned), ...Object.keys(got)])].sort()
    .filter((id) => JSON.stringify(got[id] ?? null) !== JSON.stringify(pinned[id] ?? null));
  return `AI cases that differ from ai.corpus.golden.json: ${ids.length > 0 ? ids.join(", ") : "none (only a digest differs)"}`;
}
```

The two rows close the `PINS` table. In `e2e/cross-engine-determinism.spec.ts`, replace:

```ts
    run: (page) => page.evaluate(() => window.runArcfireCorpus()),
    explain: movedCorpusCases,
  },
];
```

with (the added rows are design-verbatim):

```ts
    run: (page) => page.evaluate(() => window.runArcfireCorpus()),
    explain: movedCorpusCases,
  },
  {
    label: "Arcfire AI corpus digests (turn/draft)",
    expected: `${aiCorpus.turnDigest}/${aiCorpus.draftDigest}`,
    run: (page) => page.evaluate(() => { const d = window.runArcfireAiCorpus(); return `${d.turn}/${d.draft}`; }),
    explain: movedAiCases,
  },
  {
    label: "Arcfire vs-AI goldens (win/loss)",
    expected: `${vsai.win.hash}/${vsai.loss.hash}`,
    run: (page) => page.evaluate(([w, l]) =>
      `${window.runArcfireVsAi(w.seed, w.commands as never)}/${window.runArcfireVsAi(l.seed, l.commands as never)}`, [vsai.win, vsai.loss] as const),
  },
];
```

The Worker smoke goes after the `PINS` loop, at the end of the file. In `e2e/cross-engine-determinism.spec.ts`, replace:

```ts
        expect.soft(got, `${name} must reproduce the ${pin.label}${detail}`).toBe(pin.expected);
      }
    } finally {
      await browser.close();
    }
  });
}
```

with (the added test is design-verbatim):

```ts
        expect.soft(got, `${name} must reproduce the ${pin.label}${detail}`).toBe(pin.expected);
      }
    } finally {
      await browser.close();
    }
  });
}

// after the PINS loop: the vs-AI golden through the host in a real Worker, then resumed in a FRESH Worker
for (const [name, engine] of engines) {
  test(`${name} plays the vs-AI golden in a Worker and resumes it in a fresh one`, async () => {
    const out = await build({
      entryPoints: [resolve("src/game/runtime/arcfire/worker.ts")],
      bundle: true, format: "iife", write: false, platform: "browser", tsconfig: "tsconfig.json",
    });
    const browser = await engine.launch();
    try {
      const page = await browser.newPage();
      const hashes = await page.evaluate(async ([code, g]) => {
        const url = URL.createObjectURL(new Blob([code], { type: "text/javascript" }));
        const settings = { weaponsEach: 10, poolSize: 24, wind: false, guaranteeTags: ["BLAST", "SPLIT", "DIRT"], rosterSize: 32 };
        type Ev = { t: string; snap?: { toAct: number; phase: string; hash: string }; humanLog?: unknown[]; poolIndex?: number; cmd?: object };
        /** Start with `log`, send the golden's remaining human commands whenever the human is to act; resolve at the end. */
        const run = (log: unknown[]): Promise<{ hash: string; log: unknown[] }> => new Promise((done) => {
          const w = new Worker(url);
          const full: unknown[] = log.slice();
          let next = -1;
          let id = 2;
          w.onmessage = (e: MessageEvent<Ev>) => {
            const ev = e.data;
            if (ev.t === "state") next = ev.humanLog!.length;
            if (ev.t === "picked") full.push({ k: "pick", w: ev.poolIndex });
            if (ev.t === "shot") full.push({ k: "turn", ...ev.cmd });
            if (!ev.snap) return;
            if (ev.snap.phase === "over") { w.terminate(); done({ hash: ev.snap.hash, log: full }); return; }
            if (ev.snap.toAct === 0 && ev.t !== "thinking") {
              const c = g.commands[next++] as { k: string; w: number; move?: number; angle?: number; power?: number };
              w.postMessage(c.k === "pick" ? { t: "pick", id: id++, poolIndex: c.w }
                : { t: "turn", id: id++, cmd: { move: c.move, w: c.w, angle: c.angle, power: c.power } });
            }
          };
          w.postMessage({ t: "start", id: 1, seed: g.seed, settings, opponent: "veteran", log });
        });
        const live = await run([]);
        const resumed = await run(live.log.slice(0, 25));
        return [live.hash, resumed.hash];
      }, [out.outputFiles[0].text, vsai.win] as const);
      expect(hashes).toEqual([vsai.win.hash, vsai.win.hash]);
    } finally {
      await browser.close();
    }
  });
}
```

- [ ] **Step 2: Run the cross-engine gate to verify the new pins fail**

Run: `npm run test:e2e:cross-engine -- --grep-invert firefox`
Expected: exit 1: `2 failed`, `2 passed`.
- `chromium reproduces every Node determinism pin` and `webkit reproduces every Node determinism pin` fail with `page.evaluate: TypeError: window.runArcfireAiCorpus is not a function`.
- `chromium plays the vs-AI golden in a Worker and resumes it in a fresh one` and the WebKit one pass: the worker exists since Task 12.

(`npx tsc --noEmit` also fails until Step 3, on the undeclared `window.runArcfireAi…` members.)

- [ ] **Step 3: Add the AI functions to the harness** (4 edits)

In `src/game/test/cross-engine/harness.entry.ts`, replace:

```ts
// cross-engine spec can assert every engine reproduces the Node golden
// hashes and the Arcfire corpus digest. Lives under src/game/test/**
```

with:

```ts
// cross-engine spec can assert every engine reproduces the Node golden
// hashes, the Arcfire corpus digest, the Arcfire AI corpus digests and the
// vs-AI goldens. Lives under src/game/test/**
```

In `src/game/test/cross-engine/harness.entry.ts`, replace:

```ts
import { runCorpus, corpusDigest, type Fingerprint } from "@/game/test/arcfire/corpus";
```

with (the added imports are design-verbatim):

```ts
import { runCorpus, corpusDigest, type Fingerprint } from "@/game/test/arcfire/corpus";
import { runAiCorpus, aiDigest, type AiFingerprint } from "@/game/test/arcfire/aiCorpus";
import { replayVsAi } from "@/game/titles/arcfire/vsai";
import { STANDARD_SETTINGS } from "@/game/titles/arcfire/state";
import type { ArcfireCommand } from "@/game/titles/arcfire/replay";
```

The design gives the three `Window` members as comments ("inside `declare global { interface Window { ... } }`"); here they are the real declarations. In `src/game/test/cross-engine/harness.entry.ts`, replace:

```ts
    runArcfireCorpusCases: () => Record<string, Fingerprint>;
```

with:

```ts
    runArcfireCorpusCases: () => Record<string, Fingerprint>;
    runArcfireAiCorpus: () => { turn: string; draft: string };
    runArcfireAiCorpusCases: () => Record<string, AiFingerprint>;
    runArcfireVsAi: (seed: number, commands: ArcfireCommand[]) => string;
```

In `src/game/test/cross-engine/harness.entry.ts`, replace:

```ts
window.runArcfireCorpusCases = (): Record<string, Fingerprint> => runCorpus();
```

with (the three functions are design-verbatim):

```ts
window.runArcfireCorpusCases = (): Record<string, Fingerprint> => runCorpus();

// Plan 2B: the AI corpus (its two digests, and every case for the failure
// message) and the vs-AI goldens, replayed from the human's commands alone.
window.runArcfireAiCorpus = () => {
  const c = runAiCorpus();
  return { turn: aiDigest(c.turn), draft: aiDigest(c.draft) };
};
window.runArcfireAiCorpusCases = () => {
  const c = runAiCorpus();
  return { ...c.turn, ...c.draft };
};
window.runArcfireVsAi = (seed, commands) => {
  const r = replayVsAi({ seed, settings: STANDARD_SETTINGS, tier: "veteran", commands });
  return r.ok ? r.hash : `${r.reason}@${r.atIndex}`;
};
```

- [ ] **Step 4: Run the cross-engine gate and the types**

Run: `npm run test:e2e:cross-engine -- --grep-invert firefox`
Expected: exit 0, `4 passed` (about 15 s):
- Chromium and WebKit reproduce all six pins: `5167b43d`, `389a1340`, `3f614265`, `a7100140`, `55df93ca/c0d402d4` and `be9db94d/2097c8fc`.
- Both play the win golden in a Worker to `be9db94d`, then resume it in a fresh Worker to `be9db94d`.
- Any failure or mismatch is real: stop.

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 5: Run the Arcfire gate and the full suite**

Run: `npx vitest run src/game/titles/arcfire src/game/test/arcfire src/game/runtime/arcfire src/game/sim/purity.test.ts`
Expected: PASS: 31 files, 253 tests (unchanged).

Run: `npm test`
Expected: all pass: 71 test files passed and 1 skipped; 506 tests passed and 10 skipped.

- [ ] **Step 6: Commit**

```bash
git add e2e/cross-engine-determinism.spec.ts src/game/test/cross-engine/harness.entry.ts
git commit -m "test(arcfire): cross-engine AI pins and a real-Worker smoke" -m "Plan 2B Task 13. The cross-engine gate adds the AI corpus digests (55df93ca/c0d402d4, naming the moved case ids on a mismatch) and the vs-AI goldens (be9db94d/2097c8fc, replayed from the human's commands alone), and plays the win golden through the host in a real Web Worker, resumed after 25 log entries in a fresh one. Chromium and WebKit reproduce all of it locally; Firefox runs in CI." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

# Part D — The balance harness (Tasks 14–15)

### Task 14: The sweep — the harness, tier separation, shards and the workflow

**Files:**
- Create: `src/game/test/arcfire/balance.test.ts` (design-verbatim, §10.9)
- Create: `src/game/test/arcfire/aiMatch.ts` (design-verbatim, §9.2)
- Create: `src/game/test/arcfire/balance.ts` (design-verbatim, §9.2)
- Create: `src/game/test/arcfire/sweep.entry.ts` (design-verbatim, §9.2)
- Create: `src/game/test/arcfire/sweep.ts` (design-verbatim, §9.2)
- Create: `src/game/test/arcfire/arcfire.sweep.test.ts` (design-verbatim, §9.2)
- Create: `src/game/titles/arcfire/balance.allow.json` (`{}`)
- Modify: `.github/workflows/balance-sweep.yml` (full replacement, design-verbatim, §9.6)

**Interfaces:**
- Consumes: `nextRange`; `createMatch`, `applyPick`, `applyTurn`, `toAct`; `STANDARD_SETTINGS`, `cloneMatch`, `MatchSettings`; `aiPick`, `aiTurn` (T7); `TIERS`, `tierBudget`, `AiTier` (T4); `AiReason` (T6); `ROSTER`; esbuild; `node:worker_threads`, `node:os`, `node:fs`.
- Produces:
  - `aiMatch.ts`:
    - `interface ShotRecord { p: number; w: number; sd: boolean; pts: number; gift: number; move: number; reason: AiReason; reply: number; replyDirt: number; sims: number; probes: number; ms: number }`;
    - `interface MatchRecord { seed: number; tiers: [AiTier, AiTier]; firstPicker: number; pool: number[]; hands: [number[], number[]]; scores: [number, number]; winner: number; shots: ShotRecord[] }`;
    - `playAiMatch(seed: number, tiers: readonly [AiTier, AiTier], draft: "power" | "random", settings: MatchSettings = STANDARD_SETTINGS, now: () => number = () => 0): MatchRecord`. It checks every AI turn legal and within its tier's budget.
  - `balance.ts`:
    - `interface WeaponDefLite { id: string; tag: string; tier: number }`, `BANDS: Record<number, [number, number]>` (T1 15–40, T2 30–60, T3 50–90), `WR_LIMIT = 0.12`, `WeaponRow`, `interface Judged { rows: WeaponRow[]; failing: string[]; acked: string[]; stale: string[] }`, `TierCost`;
    - `aggregate(records: MatchRecord[], roster: readonly WeaponDefLite[], picksPerMatch: number): WeaponRow[]`, `judge(rows: WeaponRow[], allow: Record<string, string>): Judged` (FAIL / ACK / STALE ACK), `report(j: Judged, records: MatchRecord[], title: string): string`;
    - `costs(records: MatchRecord[]): TierCost[]`, `costTable(c: TierCost[]): string`;
    - `writePowers(src: string, powers: Record<string, number>): { src: string; changed: string[] }`: the anchored, exactly-once `power:` rewrite of `roster.ts`.
  - `sweep.ts`: `interface MatchJob { seed: number; tiers: [AiTier, AiTier]; draft: "power" | "random" }`, `bundleSweep(): Promise<string>`, `shardOf<T>(jobs: T[], spec: string | undefined): T[]` (`spec` = `"k/n"`), `runMatches(code: string, jobs: MatchJob[], threads?: number): Promise<MatchRecord[]>`, `separationJobs(a: AiTier, b: AiTier, n: number, first?: number): MatchJob[]`, `winRate(recs: MatchRecord[], a: AiTier): number`.
  - `arcfire.sweep.test.ts`: the weekly sweep, under `BALANCE_SWEEP=1` only. `ARCFIRE_SWEEP_SHARD`, `ARCFIRE_SWEEP_MERGE`, `ARCFIRE_SWEEP_THREADS` and `ARCFIRE_BALANCE_WRITE` (local only) steer it. It writes `test-results/arcfire-sweep/shard-<k|all>.json` and `test-results/arcfire-balance/report.{md,json}`.
  - `balance.allow.json`: `{ "<weapon id>": "<reason>" }`, `{}` for now.
  - The workflow: the Circle TD job (now excluding the Arcfire sweep), 4 Arcfire shard jobs and a merge job, all `schedule` + `workflow_dispatch` only, so never a merge blocker.

**Why:** spec §4.3 and §8.
- **The harness** plays seeds 1..400, Ace vs Ace, with a random draft, so it never reads the `power` it is about to propose. It judges each weapon's net points per shot against its tier band and the +12% win-rate rule, and suggests a fix.
- **Tier separation** is an AI-correctness property, always enforced: 200 seeds per pairing, power drafts.
- **Every one of the sweep's 20,004 decisions** is checked legal and within budget.
- **The pure half** (`balance.test.ts`) is always on and plays no match. The sweep itself never runs in `npm test`.

- [ ] **Step 1: Write the failing test** (the harness's pure half)

Create `src/game/test/arcfire/balance.test.ts` with (design-verbatim):

```ts
// src/game/test/arcfire/balance.test.ts — the balance harness's pure half, on hand-built records (always on; no match is played)
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { ROSTER } from "@/game/titles/arcfire/weapons/roster";
import { aggregate, costs, costTable, judge, report, writePowers, type WeaponDefLite } from "./balance";
import type { MatchRecord, ShotRecord } from "./aiMatch";

const LITE: WeaponDefLite[] = [
  { id: "a", tag: "BLAST", tier: 1 }, // band 15-40
  { id: "b", tag: "BLAST", tier: 3 }, // band 50-90
  { id: "c", tag: "BLAST", tier: 2 }, // never held, never fired
  { id: "d", tag: "DIRT", tier: 1 }, // judged by win-rate contribution only
];

const shot = (p: number, w: number, pts: number, more: Partial<ShotRecord> = {}): ShotRecord => ({
  p, w, sd: false, pts, gift: 0, move: 0, reason: "best", reply: -1, replyDirt: -1, sims: 10, probes: 100, ms: 1, ...more,
});

const rec = (seed: number, hands: [number[], number[]], scores: [number, number], winner: number, shots: ShotRecord[]): MatchRecord => ({
  seed, tiers: ["ace", "ace"], firstPicker: 1, pool: [0, 1, 2, 3], hands, scores, winner, shots,
});

/** Out of seed order on purpose: aggregate sorts by seed. */
const RECORDS: MatchRecord[] = [
  rec(4, [[1], [0]], [0, 50], 1, [shot(0, 1, 0), shot(1, 0, 50)]),
  rec(2, [[0], [1, 3]], [50, 0], 0, [shot(0, 0, 50), shot(1, 1, 0), shot(1, 3, 0, { reason: "forcedDirt" })]),
  rec(1, [[0], [1, 3]], [50, 40], 0, [
    shot(0, 0, 50), shot(1, 3, 0, { reason: "dirt", reply: 70, replyDirt: 30 }), shot(1, 1, 40),
    shot(0, 0, 99, { sd: true }), // sudden death: excluded from every per-weapon figure
  ]),
  rec(3, [[0], [1]], [50, 50], 2, [shot(0, 0, 50), shot(1, 1, 40)]),
];

describe("the balance harness", () => {
  it("aggregates per weapon: net points, hits, turns, holdings and win-rate contribution", () => {
    const [a, b, c, d] = aggregate(RECORDS, LITE, 2);
    expect([a.shots, a.mean, a.sd, a.hit, a.held, a.contrib, a.meanTurn]).toEqual([4, 50, 0, 1, 4, 0.375, 1.25]); // 3 wins + a draw in 4 holdings
    expect(a.ci).toBeCloseTo(0.49, 10); // 1.96 x sqrt(0.25 / 4)
    expect([b.shots, b.mean, b.hit, b.held, b.contrib, b.meanTurn]).toEqual([4, 20, 0.5, 4, -0.375, 2]);
    expect([c.shots, c.held, c.contrib, c.verdict]).toEqual([0, 0, 0, "ok"]); // no data: no band verdict
    expect([d.dirt, d.shots, d.held, d.contrib, d.defensive, d.replyCut]).toEqual([true, 2, 2, -0.5, 1, 40]);
  });

  it("judges the tier bands and the +12% rule, and suggests a fix", () => {
    const [a, b, c, d] = aggregate(RECORDS, LITE, 2);
    expect([a.verdict, b.verdict, c.verdict, d.verdict]).toEqual(["HIGH+WR", "LOW", "ok", "ok"]);
    expect(a.suggestion).toBe("damage x 0.55 (to the band's middle, 27.5); reduce damage or spread: win-rate contribution +37.5% +- 49.0");
    expect(b.suggestion).toBe("structural: hit 50%, 40.0 points on a hit"); // a hit rate under 80%: the geometry, not the numbers
    expect(d.suggestion).toBe("1 defensive uses, estimated reply cut 40.0");
  });

  it("proposes powers (DIRT on the damaging weapons' least-squares line) and the pick rate they would give", () => {
    const rows = aggregate(RECORDS, LITE, 2);
    // the line through (0.375, 50), (-0.375, 20), (0, 0): slope 40, so d = 70/3 + 40 x (-0.5 - 0) = 3.33
    expect(rows.map((r) => r.power)).toEqual([50, 20, 1, 3]); // c: round(0) clamped to 1
    expect(rows.map((r) => r.pickRate)).toEqual([1, 1, 0, 0]); // the power draft takes a and b, the top 2 of every pool
    const shuffled = aggregate(RECORDS.slice().reverse(), LITE, 2);
    expect(shuffled).toEqual(rows); // the record order never matters
  });

  it("gates through the allow-list: FAIL, ACK and STALE ACK", () => {
    const j = judge(aggregate(RECORDS, LITE, 2), { b: "structural, owner tuning", c: "was failing" });
    expect([j.failing, j.acked, j.stale]).toEqual([["a"], ["b"], ["c"]]);
    const text = report(j, RECORDS, "T");
    expect(text).toContain("4 matches; player 0 won 2, the first shooter 2, draws 1; mean |margin| 27.5");
    expect(text).toContain("| a | 1 | 50.0 | 15-40 | 0.0 | 100 | 0.0 | +37.5 +- 49.0 | 1.3 | HIGH+WR | FAIL | 50 | 100 | damage x 0.55");
    expect(text).toContain("| b | 3 | 20.0 | 50-90 |");
    expect(text).toContain("| LOW | ACK | 20 | 100 | structural");
    expect(text).toContain("| d | 1 | - | WR only | - | - | 0.0 | -50.0 +- 69.3 | 2.5 | ok |  | 3 | 0 |");
    expect(text.endsWith("FAIL (1): a; ACK (1): b; STALE ACK: c")).toBe(true);
  });

  it("reports each tier's decision costs", () => {
    const mixed = RECORDS.map((r) => ({ ...r, tiers: ["rookie", "ace"] as MatchRecord["tiers"] }));
    mixed[0].shots[1] = { ...mixed[0].shots[1], sims: 3700, probes: 49900, ms: 9 };
    const c = costs(mixed);
    expect(c.map((t) => [t.tier, t.decisions, t.simsMax, t.probesMax, t.msMax])).toEqual([["rookie", 5, 10, 100, 1], ["ace", 6, 3700, 49900, 9]]);
    expect(costTable(c).split("\n")[3]).toBe("| ace | 6 | 625 / 3700 | 8400 / 49900 | 2.3 / 9.0 / 9.0 |");
  });
});

describe("the power write-back", () => {
  const src = readFileSync("src/game/titles/arcfire/weapons/roster.ts", "utf8");

  it("rewrites exactly one line per changed power, and is idempotent", () => {
    const w = writePowers(src, { pulse: 28, nova: 90 });
    expect(w.changed).toEqual(["pulse: 30 -> 28", "nova: 80 -> 90"]);
    const before = src.split("\n");
    const after = w.src.split("\n");
    expect(after.length).toBe(before.length);
    const diff = after.flatMap((l, i) => (l === before[i] ? [] : [l.trim()]));
    expect(diff).toEqual([
      'id: "pulse", name: "Pulse", tag: "BLAST", tier: 1, power: 28,',
      'id: "nova", name: "Nova", tag: "BLAST", tier: 3, power: 90,',
    ]);
    expect(writePowers(w.src, { pulse: 28, nova: 90 })).toEqual({ src: w.src, changed: [] });
    const same = writePowers(src, Object.fromEntries(ROSTER.map((d) => [d.id, d.power]))); // every id matches exactly once
    expect(same).toEqual({ src, changed: [] });
  });

  it("refuses a power outside 1..100, an unknown id and an ambiguous line, writing nothing", () => {
    for (const p of [0, 101, 2.5, Number.NaN]) expect(() => writePowers(src, { pulse: p })).toThrow(RangeError);
    expect(() => writePowers(src, { nosuch: 5 })).toThrow("power nosuch: 0 roster lines match, need exactly 1");
    const line = src.split("\n").find((l) => l.includes('id: "pulse"'))!;
    expect(() => writePowers(`${src}\n${line}`, { pulse: 28 })).toThrow("power pulse: 2 roster lines match, need exactly 1");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/game/test/arcfire/balance.test.ts`
Expected: FAIL: `Error: Cannot find module './balance' imported from …/src/game/test/arcfire/balance.test.ts`; `Tests  no tests`.

- [ ] **Step 3: Create one recorded AI-vs-AI match**

Create `src/game/test/arcfire/aiMatch.ts` with (design-verbatim):

```ts
// src/game/test/arcfire/aiMatch.ts
//
// One whole AI-vs-AI match, recorded shot by shot: what the tier-separation
// sweep and the balance harness play (bundled into sweep.entry.ts). Pure and
// deterministic: a match is a function of (seed, tiers, draft, settings). The
// "random" draft makes every pick with one match-RNG draw over the free pool
// slots (the same count as aiPick), so the harness measures weapons without
// reading the `power` it is about to write. Every AI turn is checked legal and
// within its tier's sim budget, so every sweep decision is also a test. `now`
// (test code may read a clock) times each decision into ShotRecord.ms: the one
// field that is not a function of the seed, and nothing judged reads it.
import { nextRange } from "@/game/sim/math/rng";
import { applyPick, applyTurn, createMatch, toAct } from "@/game/titles/arcfire/match";
import { STANDARD_SETTINGS, cloneMatch, type MatchSettings } from "@/game/titles/arcfire/state";
import { aiPick, aiTurn } from "@/game/titles/arcfire/ai/policy";
import { TIERS, tierBudget, type AiTier } from "@/game/titles/arcfire/ai/tiers";
import type { AiReason } from "@/game/titles/arcfire/ai/search";

export interface ShotRecord {
  p: number; // the shooter
  w: number; // roster index fired
  sd: boolean; // a sudden-death shot (Pulse): excluded from the per-weapon figures
  pts: number; // points it scored
  gift: number; // points it gifted by self-damage
  move: number;
  reason: AiReason;
  reply: number; // the DIRT rule's estimates (-1: not made)
  replyDirt: number;
  sims: number;
  probes: number;
  ms: number; // the decision's wall time (aiTurn), by the injected clock: informational only
}

export interface MatchRecord {
  seed: number;
  tiers: [AiTier, AiTier];
  firstPicker: number;
  pool: number[]; // the draft pool (roster indices)
  hands: [number[], number[]]; // each player's drafted weapons
  scores: [number, number];
  winner: number; // 0, 1, or 2 for a draw
  shots: ShotRecord[];
}

export function playAiMatch(
  seed: number, tiers: readonly [AiTier, AiTier], draft: "power" | "random", settings: MatchSettings = STANDARD_SETTINGS, now: () => number = () => 0,
): MatchRecord {
  const m = createMatch(seed, settings);
  const shots: ShotRecord[] = [];
  let hands: [number[], number[]] = [[], []];
  while (m.phase !== "over") {
    const p = toAct(m);
    if (m.phase === "draft") {
      let w: number;
      if (draft === "power") w = aiPick(m, tiers[p]);
      else {
        const free: number[] = [];
        for (let i = 0; i < m.pool.length; i++) if (m.poolOwner[i] === -1) free.push(i);
        w = free[nextRange(m.rng, free.length)];
      }
      if (!applyPick(m, w).ok) throw new Error(`seed ${seed}: illegal pick`);
      if (m.phase !== "draft") hands = [m.hands[0].slice(), m.hands[1].slice()];
      continue;
    }
    const sd = m.phase === "suddenDeath";
    const before = [m.scores[0], m.scores[1]];
    const t0 = now();
    const { cmd, plan } = aiTurn(m, tiers[p]);
    const ms = now() - t0;
    if (plan.stats.sims > tierBudget(TIERS[tiers[p]])) throw new Error(`seed ${seed}: ${plan.stats.sims} sims over the ${tiers[p]} budget`);
    if (!applyTurn(cloneMatch(m), cmd).ok || !applyTurn(m, cmd).ok) throw new Error(`seed ${seed}: illegal AI turn ${JSON.stringify(cmd)}`);
    const s = plan.stats;
    shots.push({
      p, w: cmd.w, sd, pts: m.scores[p] - before[p], gift: m.scores[1 - p] - before[1 - p], move: cmd.move,
      reason: s.reason, reply: s.reply, replyDirt: s.replyDirt, sims: s.sims, probes: s.probes, ms,
    });
  }
  return {
    seed, tiers: [tiers[0], tiers[1]], firstPicker: m.firstPicker, pool: m.pool.slice(), hands,
    scores: [m.scores[0], m.scores[1]], winner: m.winner, shots,
  };
}
```

- [ ] **Step 4: Create the harness's pure half**

Create `src/game/test/arcfire/balance.ts` with (design-verbatim):

```ts
// src/game/test/arcfire/balance.ts
//
// The balance harness's pure half (spec §4.3): aggregate Ace-vs-Ace match
// records per weapon, judge each weapon against its tier band and the +12%
// win-rate rule, suggest a fix, compute the `power` table, and rewrite the
// `power:` literals of roster.ts. Test support (outside the purity roots):
// floats are fine here. Records are sorted by seed first, so a report is
// identical whatever the thread count or shard order.
import type { MatchRecord } from "./aiMatch";

export interface WeaponDefLite { id: string; tag: string; tier: number }

export const BANDS: Record<number, [number, number]> = { 1: [15, 40], 2: [30, 60], 3: [50, 90] };
export const WR_LIMIT = 0.12;

export interface WeaponRow {
  id: string;
  tier: number;
  dirt: boolean;
  shots: number;
  mean: number; // net points per shot: dealt minus gifted (the AI's own value)
  sd: number;
  gifted: number; // points gifted per shot
  hit: number; // share of shots that dealt damage
  held: number; // (match, player) hands holding it
  contrib: number; // the holder's win rate (a draw counts 1/2) minus 1/2
  ci: number; // 95% half-width of contrib
  meanTurn: number; // the mean battle turn it was fired on (1-based)
  defensive: number; // DIRT: shots the DIRT rule fired
  replyCut: number; // DIRT: the mean estimated reply cut over those shots
  verdict: "ok" | "HIGH" | "LOW" | "WR" | "HIGH+WR" | "LOW+WR";
  suggestion: string;
  power: number; // the proposed roster power
  pickRate: number; // how often Ace's power draft would take it, with the proposed powers, when it is in the pool
}

export function aggregate(records: MatchRecord[], roster: readonly WeaponDefLite[], picksPerMatch: number): WeaponRow[] {
  const recs = records.slice().sort((a, b) => a.seed - b.seed);
  const rows: WeaponRow[] = roster.map((def, w) => {
    const dirt = def.tag === "DIRT";
    let shots = 0, net = 0, net2 = 0, dealt = 0, gifted = 0, hits = 0, turnSum = 0, held = 0, won = 0, defensive = 0, cut = 0;
    for (const r of recs) {
      let turn = 0;
      for (const s of r.shots) {
        if (s.sd) continue;
        turn++;
        if (s.w !== w) continue;
        const v = s.pts - s.gift;
        shots++;
        net += v;
        net2 += v * v;
        dealt += s.pts;
        gifted += s.gift;
        if (s.pts > 0) hits++;
        turnSum += turn;
        if (s.reason === "dirt") {
          defensive++;
          cut += s.reply - s.replyDirt;
        }
      }
      for (const p of [0, 1]) {
        if (!r.hands[p].includes(w)) continue;
        held++;
        won += r.winner === p ? 1 : r.winner === 2 ? 0.5 : 0;
      }
    }
    const mean = shots > 0 ? net / shots : 0;
    const sd = shots > 1 ? Math.sqrt(Math.max(0, net2 / shots - mean * mean)) : 0;
    const contrib = held > 0 ? won / held - 0.5 : 0;
    const ci = held > 0 ? 1.96 * Math.sqrt(0.25 / held) : 0;
    const hit = shots > 0 ? hits / shots : 0;
    const [lo, hi] = BANDS[def.tier];
    const band = dirt || shots === 0 ? "" : mean > hi ? "HIGH" : mean < lo ? "LOW" : ""; // never fired: no data, no band verdict
    const wr = contrib > WR_LIMIT;
    const verdict = (band && wr ? `${band}+WR` : band || (wr ? "WR" : "ok")) as WeaponRow["verdict"];
    const parts: string[] = [];
    if (band) {
      const mid = (lo + hi) / 2;
      parts.push(hit >= 0.8
        ? `damage x ${(mid / mean).toFixed(2)} (to the band's middle, ${mid})`
        : `structural: hit ${(100 * hit).toFixed(0)}%, ${(hits > 0 ? dealt / hits : 0).toFixed(1)} points on a hit`);
    }
    if (wr) parts.push(`reduce damage or spread: win-rate contribution +${(100 * contrib).toFixed(1)}% +- ${(100 * ci).toFixed(1)}`);
    if (dirt) parts.push(`${defensive} defensive uses, estimated reply cut ${(defensive > 0 ? cut / defensive : 0).toFixed(1)}`);
    return {
      id: def.id, tier: def.tier, dirt, shots, mean, sd, gifted: shots > 0 ? gifted / shots : 0, hit, held, contrib, ci,
      meanTurn: shots > 0 ? turnSum / shots : 0, defensive, replyCut: defensive > 0 ? cut / defensive : 0,
      verdict, suggestion: parts.join("; "), power: 0, pickRate: 0,
    };
  });
  // power: a damaging weapon's net points per shot; a DIRT weapon's win-rate contribution converted to
  // points by the least-squares line (net per shot against contribution) through the damaging weapons
  const dmg = rows.filter((r) => !r.dirt);
  const mx = dmg.reduce((s, r) => s + r.contrib, 0) / dmg.length;
  const my = dmg.reduce((s, r) => s + r.mean, 0) / dmg.length;
  let sxy = 0, sxx = 0;
  for (const r of dmg) {
    sxy += (r.contrib - mx) * (r.mean - my);
    sxx += (r.contrib - mx) * (r.contrib - mx);
  }
  const slope = sxx > 0 ? sxy / sxx : 0;
  for (const r of rows) r.power = Math.min(100, Math.max(1, Math.round(r.dirt ? my + slope * (r.contrib - mx) : r.mean)));
  // pick rate with the proposed powers: Ace's draft takes the highest power first (ties: the lower roster index)
  const byPower = (a: number, b: number): number => rows[b].power - rows[a].power || a - b;
  const inPool = rows.map(() => 0);
  const picked = rows.map(() => 0);
  for (const r of recs) {
    const order = r.pool.slice().sort(byPower);
    order.forEach((w, rank) => {
      inPool[w]++;
      if (rank < picksPerMatch) picked[w]++;
    });
  }
  rows.forEach((r, w) => { r.pickRate = inPool[w] > 0 ? picked[w] / inPool[w] : 0; });
  return rows;
}

export interface Judged { rows: WeaponRow[]; failing: string[]; acked: string[]; stale: string[] }

/** The gate: a failing weapon on the allow-list is ACK (reported, not failed); an allow-listed weapon now passing is STALE ACK. */
export function judge(rows: WeaponRow[], allow: Record<string, string>): Judged {
  const failing: string[] = [];
  const acked: string[] = [];
  const stale: string[] = [];
  for (const r of rows) {
    const bad = r.verdict !== "ok";
    if (bad && allow[r.id] !== undefined) acked.push(r.id);
    else if (bad) failing.push(r.id);
    else if (allow[r.id] !== undefined) stale.push(r.id);
  }
  return { rows, failing, acked, stale };
}

const signed = (v: number): string => `${v >= 0 ? "+" : ""}${(100 * v).toFixed(1)}`;

export function report(j: Judged, records: MatchRecord[], title: string): string {
  const n = records.length;
  let p0 = 0, draws = 0, first = 0, margin = 0;
  for (const r of records) {
    if (r.winner === 0) p0++;
    if (r.winner === 2) draws++;
    if (r.winner === 1 - r.firstPicker) first++;
    margin += Math.abs(r.scores[0] - r.scores[1]);
  }
  const lines = [
    `### ${title}`,
    "",
    `${n} matches; player 0 won ${p0}, the first shooter ${first}, draws ${draws}; mean |margin| ${(margin / n).toFixed(1)}`,
    "",
    "| weapon | T | net/shot | band | sd | hit % | gift | WR contrib (95%) | turn | verdict | gate | power | pick % | suggestion |",
    "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|",
  ];
  for (const r of j.rows) {
    const band = r.dirt ? "WR only" : `${BANDS[r.tier][0]}-${BANDS[r.tier][1]}`;
    const gate = j.failing.includes(r.id) ? "FAIL" : j.acked.includes(r.id) ? "ACK" : j.stale.includes(r.id) ? "STALE ACK" : "";
    lines.push(`| ${r.id} | ${r.tier} | ${r.dirt ? "-" : r.mean.toFixed(1)} | ${band} | ${r.dirt ? "-" : r.sd.toFixed(1)} | ${r.dirt ? "-" : (100 * r.hit).toFixed(0)} | ${r.gifted.toFixed(1)} | ${signed(r.contrib)} +- ${(100 * r.ci).toFixed(1)} | ${r.meanTurn.toFixed(1)} | ${r.verdict} | ${gate} | ${r.power} | ${(100 * r.pickRate).toFixed(0)} | ${r.suggestion} |`);
  }
  lines.push("", `FAIL (${j.failing.length}): ${j.failing.join(", ") || "none"}; ACK (${j.acked.length}): ${j.acked.join(", ") || "none"}; STALE ACK: ${j.stale.join(", ") || "none"}`);
  return lines.join("\n");
}

export interface TierCost {
  tier: string;
  decisions: number;
  simsMean: number;
  simsMax: number;
  probesMean: number;
  probesMax: number;
  msMean: number; // ShotRecord.ms: wall time under the sweep's own load (every core busy), so an upper bound
  msP99: number;
  msMax: number;
}

/** Per-tier decision costs over every shot of `records` (sudden death included). The counts are exact and seed-determined; ms is not. */
export function costs(records: MatchRecord[]): TierCost[] {
  const by = new Map<string, { sims: number[]; probes: number[]; ms: number[] }>();
  for (const r of records) {
    for (const s of r.shots) {
      const tier = r.tiers[s.p];
      let b = by.get(tier);
      if (b === undefined) {
        b = { sims: [], probes: [], ms: [] };
        by.set(tier, b);
      }
      b.sims.push(s.sims);
      b.probes.push(s.probes);
      b.ms.push(s.ms);
    }
  }
  const mean = (v: number[]): number => v.reduce((a, b) => a + b, 0) / v.length;
  const top = (v: number[]): number => v.reduce((a, b) => (b > a ? b : a), 0);
  return ["rookie", "veteran", "ace"].filter((t) => by.has(t)).map((tier) => {
    const b = by.get(tier)!;
    const ms = b.ms.slice().sort((x, y) => x - y);
    return {
      tier, decisions: b.sims.length, simsMean: mean(b.sims), simsMax: top(b.sims), probesMean: mean(b.probes), probesMax: top(b.probes),
      msMean: mean(ms), msP99: ms[Math.min(ms.length - 1, Math.floor(0.99 * ms.length))], msMax: ms[ms.length - 1],
    };
  });
}

export function costTable(c: TierCost[]): string {
  const lines = [
    "| tier | decisions | sims mean / max | probe flights mean / max | ms mean / p99 / max (under the sweep's load) |",
    "|---|---|---|---|---|",
  ];
  for (const t of c) {
    lines.push(`| ${t.tier} | ${t.decisions} | ${t.simsMean.toFixed(0)} / ${t.simsMax} | ${t.probesMean.toFixed(0)} / ${t.probesMax} | ${t.msMean.toFixed(1)} / ${t.msP99.toFixed(1)} / ${t.msMax.toFixed(1)} |`);
  }
  return lines.join("\n");
}

/**
 * Rewrite each weapon's `power: N` literal in roster.ts's source text. Each id must match exactly one
 * `id: "<id>", name: "...", tag: "...", tier: n, power: N` and each power must be an integer in 1..100,
 * or it throws and nothing is written. Returns the new text and the changes as `id: old -> new`.
 */
export function writePowers(src: string, powers: Record<string, number>): { src: string; changed: string[] } {
  let out = src;
  const changed: string[] = [];
  for (const [id, p] of Object.entries(powers)) {
    if (!Number.isInteger(p) || p < 1 || p > 100) throw new RangeError(`power ${id}: ${p} is not an integer in 1..100`);
    const re = new RegExp(`(id: "${id}", name: "[^"]*", tag: "[A-Z]+", tier: [123], power: )(\\d+)`, "g");
    const hits = out.match(re);
    if (hits === null || hits.length !== 1) throw new Error(`power ${id}: ${hits === null ? 0 : hits.length} roster lines match, need exactly 1`);
    out = out.replace(re, (_all: string, head: string, old: string) => {
      if (Number(old) !== p) changed.push(`${id}: ${old} -> ${p}`);
      return `${head}${p}`;
    });
  }
  return { src: out, changed };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/game/test/arcfire/balance.test.ts`
Expected: PASS (7 tests, instant).

- [ ] **Step 6: Create the sweep runner and the gated sweep test**

Create `src/game/test/arcfire/sweep.entry.ts` with (design-verbatim):

```ts
// src/game/test/arcfire/sweep.entry.ts
//
// Bundled by sweep.ts with esbuild and loaded once per worker thread: the
// sweep's matches run as one module, as the worker and the verifier run the
// sim (vitest's module runner is 4-5x slower, 2A K3).
export { playAiMatch } from "./aiMatch";
```

Create `src/game/test/arcfire/sweep.ts` with (design-verbatim):

```ts
// src/game/test/arcfire/sweep.ts
//
// The sweep runner (Node only, test support): bundle sweep.entry.ts once with
// esbuild, then play AI-vs-AI matches on worker_threads. Results come back in
// job order, so every aggregate is identical whatever the thread count.
// ARCFIRE_SWEEP_SHARD=k/n keeps the jobs whose index is k - 1 mod n (a CI
// matrix shard); ARCFIRE_SWEEP_THREADS caps the threads (default: all cores).
import { Worker } from "node:worker_threads";
import { availableParallelism } from "node:os";
import { resolve } from "node:path";
import { build } from "esbuild";
import type { MatchRecord } from "./aiMatch";
import type { AiTier } from "@/game/titles/arcfire/ai/tiers";

export interface MatchJob { seed: number; tiers: [AiTier, AiTier]; draft: "power" | "random" }

export async function bundleSweep(): Promise<string> {
  const out = await build({
    entryPoints: [resolve("src/game/test/arcfire/sweep.entry.ts")],
    bundle: true, format: "cjs", platform: "node", write: false, tsconfig: "tsconfig.json",
  });
  return out.outputFiles[0].text;
}

const WORKER = `
const { parentPort, workerData } = require("node:worker_threads");
const mod = { exports: {} };
new Function("module", "exports", workerData.code)(mod, mod.exports);
parentPort.on("message", ({ i, job }) => {
  try { parentPort.postMessage({ i, rec: mod.exports.playAiMatch(job.seed, job.tiers, job.draft, undefined, () => performance.now()) }); }
  catch (e) { parentPort.postMessage({ i, error: String((e && e.stack) || e) }); }
});`;

/** The jobs of shard `spec` ("k/n"), or all of them. */
export function shardOf<T>(jobs: T[], spec: string | undefined): T[] {
  if (!spec) return jobs;
  const [k, n] = spec.split("/").map(Number);
  return jobs.filter((_, i) => i % n === k - 1);
}

export async function runMatches(code: string, jobs: MatchJob[], threads = availableParallelism()): Promise<MatchRecord[]> {
  const out: MatchRecord[] = new Array(jobs.length);
  let next = 0;
  let done = 0;
  const n = Math.max(1, Math.min(threads, jobs.length));
  await new Promise<void>((res, rej) => {
    if (jobs.length === 0) return res();
    for (let k = 0; k < n; k++) {
      const w = new Worker(WORKER, { eval: true, workerData: { code } });
      const feed = (): void => {
        if (next >= jobs.length) { void w.terminate(); return; }
        const i = next++;
        w.postMessage({ i, job: jobs[i] });
      };
      w.on("message", (msg: { i: number; rec?: MatchRecord; error?: string }) => {
        if (msg.error !== undefined) { rej(new Error(`job ${msg.i}: ${msg.error}`)); void w.terminate(); return; }
        out[msg.i] = msg.rec!;
        if (++done === jobs.length) res();
        feed();
      });
      w.on("error", rej);
      feed();
    }
  });
  return out;
}

/** Seeds first..first+n-1, the two tiers swapping seats on odd seeds, drafting by power (spec §8 tier separation). */
export function separationJobs(a: AiTier, b: AiTier, n: number, first = 1): MatchJob[] {
  const jobs: MatchJob[] = [];
  for (let s = first; s < first + n; s++) jobs.push({ seed: s, tiers: s % 2 === 0 ? [a, b] : [b, a], draft: "power" });
  return jobs;
}

/** How often tier `a` won the separation matches (draws are not wins). */
export function winRate(recs: MatchRecord[], a: AiTier): number {
  let wins = 0;
  for (const r of recs) if (r.winner !== 2 && r.tiers[r.winner] === a && r.tiers[1 - r.winner] !== a) wins++;
  return wins / recs.length;
}
```

Create `src/game/test/arcfire/arcfire.sweep.test.ts` with (design-verbatim):

```ts
// src/game/test/arcfire/arcfire.sweep.test.ts
//
// The weekly Arcfire sweeps, only under BALANCE_SWEEP=1 (spec §4.3, §8):
//   tier separation: 200 seeds each, power drafts, seats swapped on odd
//     seeds: Ace beats Rookie >= 85% and Veteran >= 60%, Veteran beats
//     Rookie >= 70%. Always enforced: these are AI-correctness properties.
//   the balance harness: seeds 1..400, Ace vs Ace, random draft. A weapon
//     fails outside its tier band (T1 15-40, T2 30-60, T3 50-90 net points
//     per shot; DIRT exempt) or above +12% win-rate contribution. A failure
//     on balance.allow.json is ACK (reported, not failed); anything else
//     fails the job; an allow-listed weapon now passing is STALE ACK. The
//     launch gate needs the allow-list empty.
// CI runs it as a matrix: ARCFIRE_SWEEP_SHARD=k/n plays shard k and writes
// test-results/arcfire-sweep/shard-k.json; ARCFIRE_SWEEP_MERGE=<dir> judges
// the merged shards. Locally, one run does everything on every core.
// ARCFIRE_BALANCE_WRITE=1 (local only: a full run or a merge) writes the
// harness's `power` table into roster.ts and prints the AI re-pins it needs.
import { describe, it, expect } from "vitest";
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROSTER } from "@/game/titles/arcfire/weapons/roster";
import type { MatchRecord } from "./aiMatch";
import { STANDARD_SETTINGS } from "@/game/titles/arcfire/state";
import { bundleSweep, runMatches, separationJobs, shardOf, winRate, type MatchJob } from "./sweep";
import { aggregate, costTable, costs, judge, report, writePowers } from "./balance";

const SWEEP = process.env.BALANCE_SWEEP === "1";
const SHARD = process.env.ARCFIRE_SWEEP_SHARD;
const MERGE = process.env.ARCFIRE_SWEEP_MERGE;
const OUT = "test-results/arcfire-sweep";
const ALLOW = "src/game/titles/arcfire/balance.allow.json";
const ROSTER_TS = "src/game/titles/arcfire/weapons/roster.ts";

interface SweepData { ar: MatchRecord[]; av: MatchRecord[]; vr: MatchRecord[]; balance: MatchRecord[] }

const balanceJobs = (): MatchJob[] => Array.from({ length: 400 }, (_, i) => ({ seed: i + 1, tiers: ["ace", "ace"], draft: "random" }));

async function play(): Promise<SweepData> {
  const code = await bundleSweep();
  const threads = process.env.ARCFIRE_SWEEP_THREADS ? Number(process.env.ARCFIRE_SWEEP_THREADS) : undefined;
  // ONE queue, the slowest matches first (Ace-Ace about 4.2 s, Ace-Veteran 2.4, Ace-Rookie 2.2, Veteran-Rookie 0.45),
  // so no thread idles at the end of a group; each group is sharded on its own, as the merge expects
  const groups: [keyof SweepData, MatchJob[]][] = [
    ["balance", shardOf(balanceJobs(), SHARD)],
    ["av", shardOf(separationJobs("ace", "veteran", 200), SHARD)],
    ["ar", shardOf(separationJobs("ace", "rookie", 200), SHARD)],
    ["vr", shardOf(separationJobs("veteran", "rookie", 200), SHARD)],
  ];
  const recs = await runMatches(code, groups.flatMap(([, jobs]) => jobs), threads);
  const data: SweepData = { ar: [], av: [], vr: [], balance: [] };
  let at = 0;
  for (const [k, jobs] of groups) {
    data[k] = recs.slice(at, at + jobs.length);
    at += jobs.length;
  }
  return data;
}

function merged(dir: string): SweepData {
  const all: SweepData = { ar: [], av: [], vr: [], balance: [] };
  for (const f of readdirSync(dir).filter((n) => n.endsWith(".json")).sort()) {
    const d: SweepData = JSON.parse(readFileSync(join(dir, f), "utf8"));
    for (const k of ["ar", "av", "vr", "balance"] as const) all[k].push(...d[k]);
  }
  for (const k of ["ar", "av", "vr", "balance"] as const) {
    all[k].sort((a, b) => a.seed - b.seed);
    all[k].forEach((r, i) => {
      if (i > 0 && all[k][i - 1].seed === r.seed) throw new Error(`${dir}: seed ${r.seed} of "${k}" is in two shard files`);
    });
  }
  return all;
}

function publish(text: string): void {
  process.stderr.write(`${text}\n`); // outside Vitest's console capture: every reporter shows it
  mkdirSync("test-results/arcfire-balance", { recursive: true });
  writeFileSync("test-results/arcfire-balance/report.md", `${text}\n`);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${text}\n`);
}

describe.runIf(SWEEP)("arcfire sweeps (BALANCE_SWEEP=1)", () => {
  it("separates the tiers and judges every weapon", async () => {
    const data = MERGE ? merged(MERGE) : await play();
    if (!MERGE) { // the records, for a later merge: a matrix shard stops here, and the merge job judges
      mkdirSync(OUT, { recursive: true });
      writeFileSync(join(OUT, `shard-${SHARD ? SHARD.split("/")[0] : "all"}.json`), JSON.stringify(data));
      if (SHARD) return;
    }
    const sep = { ar: winRate(data.ar, "ace"), av: winRate(data.av, "ace"), vr: winRate(data.vr, "veteran") };
    const rows = aggregate(data.balance, ROSTER, 2 * STANDARD_SETTINGS.weaponsEach);
    const allow: Record<string, string> = existsSync(ALLOW) ? JSON.parse(readFileSync(ALLOW, "utf8")) : {};
    const j = judge(rows, allow);
    const pctOf = (v: number): string => `${(100 * v).toFixed(1)}%`;
    const cost = costs([...data.ar, ...data.av, ...data.vr, ...data.balance]);
    publish([
      `## Arcfire sweeps`,
      `tier separation (200 seeds each): Ace-Rookie ${pctOf(sep.ar)} (>= 85%), Ace-Veteran ${pctOf(sep.av)} (>= 60%), Veteran-Rookie ${pctOf(sep.vr)} (>= 70%)`,
      "",
      report(j, data.balance, "Balance: Ace vs Ace, random draft, STANDARD_SETTINGS"),
      "",
      "Decision costs, every sweep match (sims and probe flights are exact; ms is wall time under the sweep's own load):",
      "",
      costTable(cost),
    ].join("\n"));
    writeFileSync("test-results/arcfire-balance/report.json", JSON.stringify({ sep, rows, cost }, null, 1));
    if (process.env.ARCFIRE_BALANCE_WRITE === "1" && !SHARD) {
      const w = writePowers(readFileSync(ROSTER_TS, "utf8"), Object.fromEntries(rows.map((r) => [r.id, r.power])));
      writeFileSync(ROSTER_TS, w.src);
      process.stderr.write(`power write-back (${w.changed.length}):\n${w.changed.join("\n")}\nnow re-pin the AI (declared):\n` +
        "  UPDATE_ARCFIRE_AI=draft npx vitest run src/game/titles/arcfire/ai.corpus.test.ts\n" +
        "  UPDATE_ARCFIRE_GOLDEN=vsai npx vitest run src/game/titles/arcfire/ai.corpus.test.ts\n");
    }
    expect(sep.ar, "Ace beats Rookie").toBeGreaterThanOrEqual(0.85);
    expect(sep.av, "Ace beats Veteran").toBeGreaterThanOrEqual(0.6);
    expect(sep.vr, "Veteran beats Rookie").toBeGreaterThanOrEqual(0.7);
    expect(j.failing, "weapons failing outside balance.allow.json").toEqual([]);
  }, 3_600_000);
});
```

Create `src/game/titles/arcfire/balance.allow.json` with (an empty allow-list until the first sweep):

```json
{}
```

- [ ] **Step 7: Schedule it: the workflow**

Replace the whole of `.github/workflows/balance-sweep.yml` with (design-verbatim, §9.6):

```yaml
name: Balance sweep (scheduled)

on:
  schedule:
    - cron: "0 6 * * 1"   # Mondays 06:00 UTC
  workflow_dispatch: {}

jobs:
  balance-sweep:
    name: Circle TD BALANCE_SWEEP=1 (Arcfire's sweep runs in its own jobs)
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - name: Full balance sweep + grid
        run: BALANCE_SWEEP=1 npx vitest run --exclude src/game/test/arcfire/arcfire.sweep.test.ts

  arcfire-sweep:
    name: Arcfire sweep shard ${{ matrix.shard }}/4
    runs-on: ubuntu-latest
    timeout-minutes: 30
    strategy:
      fail-fast: false
      matrix:
        shard: [1, 2, 3, 4]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: BALANCE_SWEEP=1 ARCFIRE_SWEEP_SHARD=${{ matrix.shard }}/4 npx vitest run src/game/test/arcfire/arcfire.sweep.test.ts
      - uses: actions/upload-artifact@v4
        with:
          name: arcfire-sweep-${{ matrix.shard }}
          path: test-results/arcfire-sweep/shard-${{ matrix.shard }}.json

  arcfire-sweep-report:
    name: Arcfire tier separation + balance verdict
    needs: arcfire-sweep
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - uses: actions/download-artifact@v4
        with:
          pattern: arcfire-sweep-*
          path: test-results/arcfire-sweep
          merge-multiple: true
      - run: BALANCE_SWEEP=1 ARCFIRE_SWEEP_MERGE=test-results/arcfire-sweep npx vitest run src/game/test/arcfire/arcfire.sweep.test.ts
      - if: always()
        uses: actions/upload-artifact@v4
        with:
          name: arcfire-balance-report
          path: test-results/arcfire-balance/
```

- [ ] **Step 8: Run the Arcfire gate, types and the full suite (the sweep skipped)**

Run: `npx vitest run src/game/titles/arcfire src/game/test/arcfire src/game/runtime/arcfire src/game/sim/purity.test.ts`
Expected: PASS: 32 files passed and 1 skipped; 260 tests passed and 1 skipped (the skipped file is `arcfire.sweep.test.ts`, gated on `BALANCE_SWEEP=1`).

Run: `npx tsc --noEmit`
Expected: exit 0.

Run: `npm test`
Expected: all pass: 72 test files passed and 2 skipped; 513 tests passed and 11 skipped.

- [ ] **Step 9: Run the sweep once locally**

Run: `BALANCE_SWEEP=1 npx vitest run src/game/test/arcfire/arcfire.sweep.test.ts`
Expected, after about 75 s on 64 threads (set `ARCFIRE_SWEEP_THREADS` to cap them; a 4-thread machine takes several minutes):
- It prints the report (Task 15 Step 1 lists it). The tier line is `tier separation (200 seeds each): Ace-Rookie 99.5% (>= 85%), Ace-Veteran 93.5% (>= 60%), Veteran-Rookie 85.5% (>= 70%)`. All three separation assertions pass, and no decision exceeded its budget (that would throw).
- It then FAILS, 1 test, on the harness gate, as expected before the allow-list is seeded: `AssertionError: weapons failing outside balance.allow.json: expected [ 'nova', 'needle', 'railshot', …(6) ] to deeply equal []`, with the nine ids `nova`, `needle`, `railshot`, `twinnova`, `shrapnel`, `skipper`, `auger`, `prism` and `swarm`.

This is the design's first-run result. Task 15 records it and seeds the allow-list.

- [ ] **Step 10: Exercise the CI path: four shards, then the merge**

The workflow plays four shards, then judges the merged shard files. Reproduce it locally. First clear the full run's record file (it holds every seed, so the merge would refuse it as a duplicate).

Run: `rm -r test-results/arcfire-sweep`
Expected: no output.

Run each of these four commands (about 25 s each here):

```bash
BALANCE_SWEEP=1 ARCFIRE_SWEEP_SHARD=1/4 npx vitest run src/game/test/arcfire/arcfire.sweep.test.ts
BALANCE_SWEEP=1 ARCFIRE_SWEEP_SHARD=2/4 npx vitest run src/game/test/arcfire/arcfire.sweep.test.ts
BALANCE_SWEEP=1 ARCFIRE_SWEEP_SHARD=3/4 npx vitest run src/game/test/arcfire/arcfire.sweep.test.ts
BALANCE_SWEEP=1 ARCFIRE_SWEEP_SHARD=4/4 npx vitest run src/game/test/arcfire/arcfire.sweep.test.ts
```

Expected: each PASSES (1 test): a shard only writes its records. `test-results/arcfire-sweep/` then holds `shard-1.json` … `shard-4.json`.

Run: `BALANCE_SWEEP=1 ARCFIRE_SWEEP_MERGE=test-results/arcfire-sweep npx vitest run src/game/test/arcfire/arcfire.sweep.test.ts`
Expected, in under a second: the same tier line and the same `FAIL (9): nova, needle, railshot, twinnova, shrapnel, skipper, auger, prism, swarm; ACK (0): none; STALE ACK: none`, and the same 1 failing test as Step 9. Every count in the report is seed-determined, so a merge of four shards equals the full run.

The workflow's Circle TD job runs `BALANCE_SWEEP=1 npx vitest run --exclude src/game/test/arcfire/arcfire.sweep.test.ts`. Vitest 4's `--exclude` skips the Arcfire sweep, so that job stays Circle TD's alone.

Run: `git status --short`
Expected, exactly (`test-results/` is gitignored):

```
 M .github/workflows/balance-sweep.yml
?? src/game/test/arcfire/aiMatch.ts
?? src/game/test/arcfire/arcfire.sweep.test.ts
?? src/game/test/arcfire/balance.test.ts
?? src/game/test/arcfire/balance.ts
?? src/game/test/arcfire/sweep.entry.ts
?? src/game/test/arcfire/sweep.ts
?? src/game/titles/arcfire/balance.allow.json
```

- [ ] **Step 11: Commit**

```bash
git add src/game/test/arcfire/aiMatch.ts src/game/test/arcfire/balance.ts src/game/test/arcfire/balance.test.ts src/game/test/arcfire/sweep.entry.ts src/game/test/arcfire/sweep.ts src/game/test/arcfire/arcfire.sweep.test.ts src/game/titles/arcfire/balance.allow.json .github/workflows/balance-sweep.yml
git commit -m "test(arcfire): the balance harness and the tier-separation sweep (weekly, sharded)" -m "Plan 2B Task 14. Under BALANCE_SWEEP set to 1: tier separation over 200 seeds per pairing (Ace-Rookie 99.5%, Ace-Veteran 93.5%, Veteran-Rookie 85.5%) and the harness over seeds 1..400, Ace vs Ace, random draft: per-weapon net points per shot, hit rate, win-rate contribution, verdicts against the tier bands and the +12% rule, suggestions, proposed powers and a per-tier decision-cost table; every sweep decision checked legal and within budget. Gated by balance.allow.json (FAIL / ACK / STALE ACK), never in npm test and never a merge blocker (schedule + workflow_dispatch: 4 shards + a merge job). balance.test.ts pins the pure half, including the roster power write-back." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 15: The first sweep — the report and the allow-list

**Files:**
- Create: `docs/superpowers/2026-09-24-arcfire-balance-first-run.md` (the sweep's `report.md` under a short header)
- Modify: `src/game/titles/arcfire/balance.allow.json` (full replacement: the nine first-run failures, each with its reason)

**Interfaces:**
- Consumes: Task 14's sweep and report.
- Produces: the first-run report, and an allow-list that makes the weekly job green with 9 ACKs. No `power` is written back (B5, ⚑ O9).

**Why:** the design's first run fails 9 weapons of 32, as the spec expects of an untuned roster.
- The allow-list (⚑ O10) acknowledges exactly those nine. The weekly job then stays green while the owner tunes (⚑ O11), yet a tenth failure still fails it, and a tuned weapon still on the list prints `STALE ACK`.
- The launch gate needs the list empty.

- [ ] **Step 1: Run the first sweep**

Run: `rm -r test-results/arcfire-sweep`
Expected: no output (it removes Task 14's shard files; if the folder does not exist, `rm` says so and nothing else is needed).

Run: `BALANCE_SWEEP=1 npx vitest run src/game/test/arcfire/arcfire.sweep.test.ts`
Expected: FAIL, 1 test, on `weapons failing outside balance.allow.json`, exactly as in Task 14 Step 9. It writes `test-results/arcfire-balance/report.md`. Everything but the cost table's `ms` column is seed-determined and must equal, line for line:

```text
## Arcfire sweeps
tier separation (200 seeds each): Ace-Rookie 99.5% (>= 85%), Ace-Veteran 93.5% (>= 60%), Veteran-Rookie 85.5% (>= 70%)

### Balance: Ace vs Ace, random draft, STANDARD_SETTINGS

400 matches; player 0 won 218, the first shooter 211, draws 1; mean |margin| 112.4

| weapon | T | net/shot | band | sd | hit % | gift | WR contrib (95%) | turn | verdict | gate | power | pick % | suggestion |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| pulse | 1 | 27.6 | 15-40 | 15.5 | 83 | 0.0 | -0.4 +- 6.2 | 14.9 | ok |  | 28 | 100 |  |
| pulse2 | 2 | 47.7 | 30-60 | 18.6 | 93 | 0.0 | +0.8 +- 6.2 | 9.0 | ok |  | 48 | 100 |  |
| nova | 3 | 90.5 | 50-90 | 19.2 | 98 | 0.0 | +12.0 +- 6.1 | 3.5 | HIGH+WR | FAIL | 90 | 100 | damage x 0.77 (to the band's middle, 70); reduce damage or spread: win-rate contribution +12.0% +- 6.1 |
| needle | 2 | 78.6 | 30-60 | 47.7 | 75 | 0.0 | +4.3 +- 6.1 | 3.5 | HIGH | FAIL | 79 | 100 | structural: hit 75%, 104.7 points on a hit |
| crater | 1 | 21.0 | 15-40 | 6.5 | 96 | 0.0 | -9.8 +- 6.2 | 17.1 | ok |  | 21 | 39 |  |
| triad | 1 | 39.7 | 15-40 | 23.3 | 91 | 0.0 | -5.7 +- 6.1 | 12.7 | ok |  | 40 | 100 |  |
| fan | 2 | 44.2 | 30-60 | 28.7 | 92 | 0.0 | -5.2 +- 6.2 | 11.2 | ok |  | 44 | 100 |  |
| railshot | 2 | 27.6 | 30-60 | 35.7 | 38 | 0.0 | -0.2 +- 6.2 | 14.7 | LOW | FAIL | 28 | 97 | structural: hit 38%, 72.5 points on a hit |
| twinnova | 3 | 104.3 | 50-90 | 22.6 | 99 | 0.0 | +17.3 +- 6.2 | 2.3 | HIGH+WR | FAIL | 100 | 100 | damage x 0.67 (to the band's middle, 70); reduce damage or spread: win-rate contribution +17.3% +- 6.2 |
| cascade | 3 | 54.7 | 50-90 | 45.7 | 92 | 0.0 | +5.0 +- 6.0 | 9.6 | ok |  | 55 | 100 |  |
| hydra | 3 | 50.9 | 50-90 | 22.0 | 98 | 0.0 | +1.4 +- 6.1 | 10.5 | ok |  | 51 | 100 |  |
| hailstorm | 2 | 42.2 | 30-60 | 19.6 | 99 | 0.0 | -1.4 +- 6.1 | 11.5 | ok |  | 42 | 100 |  |
| shrapnel | 2 | 24.4 | 30-60 | 12.9 | 95 | 0.0 | -5.3 +- 6.2 | 15.7 | LOW | FAIL | 24 | 72 | damage x 1.84 (to the band's middle, 45) |
| barrage | 2 | 31.3 | 30-60 | 12.9 | 100 | 0.0 | -6.5 +- 6.0 | 13.4 | ok |  | 31 | 100 |  |
| skipper | 2 | 26.5 | 30-60 | 10.3 | 95 | 0.0 | +0.8 +- 6.3 | 15.3 | LOW | FAIL | 27 | 85 | damage x 1.70 (to the band's middle, 45) |
| pinball | 2 | 50.8 | 30-60 | 13.7 | 94 | 0.0 | +5.2 +- 6.4 | 8.5 | ok |  | 51 | 100 |  |
| ricochet | 1 | 31.2 | 15-40 | 13.1 | 92 | 0.0 | +1.7 +- 6.4 | 13.0 | ok |  | 31 | 100 |  |
| tumbler | 1 | 35.3 | 15-40 | 10.8 | 94 | 0.0 | -6.3 +- 6.4 | 12.4 | ok |  | 35 | 100 |  |
| juggernaut | 3 | 83.6 | 50-90 | 7.4 | 100 | 0.0 | +8.6 +- 6.2 | 4.1 | ok |  | 84 | 100 |  |
| burrow | 2 | 44.5 | 30-60 | 20.7 | 84 | 0.0 | +0.2 +- 6.3 | 11.2 | ok |  | 45 | 100 |  |
| auger | 2 | 11.5 | 30-60 | 8.6 | 70 | 0.0 | -6.1 +- 6.2 | 18.1 | LOW | FAIL | 12 | 0 | structural: hit 70%, 16.4 points on a hit |
| inferno | 3 | 66.1 | 50-90 | 16.1 | 94 | 0.0 | +6.0 +- 6.4 | 6.8 | ok |  | 66 | 100 |  |
| wildfire | 2 | 40.1 | 30-60 | 14.0 | 89 | 0.0 | -0.6 +- 6.1 | 11.5 | ok |  | 40 | 100 |  |
| rampart | 1 | - | WR only | - | - | 0.0 | -11.2 +- 5.9 | 12.4 | ok |  | 10 | 0 | 125 defensive uses, estimated reply cut 39.4 |
| bastion | 1 | - | WR only | - | - | 0.0 | -7.9 +- 5.9 | 14.7 | ok |  | 20 | 0 | 96 defensive uses, estimated reply cut 37.2 |
| leveler | 1 | - | WR only | - | - | 0.0 | -17.3 +- 5.9 | 12.0 | ok |  | 1 | 0 | 142 defensive uses, estimated reply cut 38.9 |
| lancer | 2 | 59.2 | 30-60 | 6.7 | 99 | 0.0 | +5.4 +- 6.3 | 6.6 | ok |  | 59 | 100 |  |
| prism | 3 | 33.1 | 50-90 | 7.9 | 95 | 0.0 | +1.3 +- 6.3 | 14.8 | LOW | FAIL | 33 | 100 | damage x 2.12 (to the band's middle, 70) |
| seeker | 2 | 50.0 | 30-60 | 0.0 | 100 | 0.0 | +0.8 +- 6.2 | 7.9 | ok |  | 50 | 100 |  |
| swarm | 3 | 93.0 | 50-90 | 12.0 | 100 | 0.0 | +15.9 +- 6.5 | 3.3 | HIGH+WR | FAIL | 93 | 100 | damage x 0.75 (to the band's middle, 70); reduce damage or spread: win-rate contribution +15.9% +- 6.5 |
| quake | 2 | 52.6 | 30-60 | 3.8 | 100 | 0.0 | -2.4 +- 6.1 | 7.3 | ok |  | 53 | 100 |  |
| aftershock | 3 | 75.8 | 50-90 | 16.2 | 100 | 0.0 | +5.7 +- 6.4 | 5.3 | ok |  | 76 | 100 |  |

FAIL (9): nova, needle, railshot, twinnova, shrapnel, skipper, auger, prism, swarm; ACK (0): none; STALE ACK: none
```

The report then ends with the line `Decision costs, every sweep match (sims and probe flights are exact; ms is wall time under the sweep's own load):` and the cost table, whose count columns must be exactly these (the `ms` column differs from run to run):

```
| rookie | 4000 | 144 / 300 | 564 / 1737 | …
| veteran | 4000 | 651 / 1200 | 3559 / 9357 | …
| ace | 12004 | 2123 / 3700 | 21773 / 49900 | …
```

- [ ] **Step 2: Keep the report**

Run: `cp test-results/arcfire-balance/report.md docs/superpowers/2026-09-24-arcfire-balance-first-run.md`
Expected: no output.

Give it a header. In `docs/superpowers/2026-09-24-arcfire-balance-first-run.md`, replace:

```md
## Arcfire sweeps
```

with:

```md
# Arcfire balance sweep — first run (Plan 2B Task 15)

The first `BALANCE_SWEEP=1` run of the Plan 2B sweep, before any tuning, exactly as `src/game/test/arcfire/arcfire.sweep.test.ts` wrote it to `test-results/arcfire-balance/report.md`. The harness plays seeds 1..400, Ace vs Ace, with a random draft and `STANDARD_SETTINGS`; tier separation plays 200 seeds a pairing with power drafts. Every count is seed-determined; only the cost table's ms column depends on the machine and its load.

The 9 failing weapons are acknowledged in `src/game/titles/arcfire/balance.allow.json` (owner decision B5, design ⚑ O10), so the weekly job reports them as ACK and stays green until the tuning pass (⚑ O11) empties the list. The launch gate needs the list empty. No `power` was written back (⚑ O9).

The suggestion column follows spec §4.3's rule: a plain damage scaling when the hit rate is at least 80%. For a multi-shell or multi-beam weapon that rule can print a scaling where the fix is structural. Prism's row suggests damage × 2.12, but only one beam of its three reaches, so the tuning default (⚑ O11, spec §9.1) is a narrower spread or more damage a beam, as its allow-list reason says.

## Arcfire sweeps
```

- [ ] **Step 3: Seed the allow-list with the nine failures**

Replace the whole of `src/game/titles/arcfire/balance.allow.json` with:

```json
{
  "nova": "HIGH+WR: 90.5 net points a shot (tier 3 band 50-90), win-rate contribution +12.0%; tuning pass: damage x 0.77 (first sweep, 2026-09-24)",
  "needle": "HIGH, structural: 78.6 net points a shot (tier 2 band 30-60), 75% hits, 104.7 points on a hit; tuning pass: a smaller damage (first sweep, 2026-09-24)",
  "railshot": "LOW, structural: 27.6 net points a shot (tier 2 band 30-60), 38% hits; tuning pass: a larger radius (first sweep, 2026-09-24)",
  "twinnova": "HIGH+WR: 104.3 net points a shot (tier 3 band 50-90), win-rate contribution +17.3%; tuning pass: damage x 0.67 (first sweep, 2026-09-24)",
  "shrapnel": "LOW: 24.4 net points a shot (tier 2 band 30-60); tuning pass: damage x 1.84 (first sweep, 2026-09-24)",
  "skipper": "LOW: 26.5 net points a shot (tier 2 band 30-60); tuning pass: damage x 1.70 (first sweep, 2026-09-24)",
  "auger": "LOW, structural: 11.5 net points a shot (tier 2 band 30-60), 70% hits, 16.4 points on a hit; tuning pass: a shorter tunnel or a shallower pitch (first sweep, 2026-09-24)",
  "prism": "LOW: 33.1 net points a shot (tier 3 band 50-90), one beam of three reaches; tuning pass: a narrower spread or more damage a beam (first sweep, 2026-09-24)",
  "swarm": "HIGH+WR: 93.0 net points a shot (tier 3 band 50-90), win-rate contribution +15.9%; tuning pass: damage x 0.75, then the homing ruling (first sweep, 2026-09-24)"
}
```

- [ ] **Step 4: Re-judge the saved records, then run the weekly job in full**

Run: `BALANCE_SWEEP=1 ARCFIRE_SWEEP_MERGE=test-results/arcfire-sweep npx vitest run src/game/test/arcfire/arcfire.sweep.test.ts`
Expected: PASS (1 test, under a second; it judges Step 1's `shard-all.json`).
- The last line of the balance table's summary is `FAIL (0): none; ACK (9): nova, needle, railshot, twinnova, shrapnel, skipper, auger, prism, swarm; STALE ACK: none`.
- Each of the nine rows shows `ACK` in its gate column, for example `| nova | 3 | 90.5 | 50-90 | 19.2 | 98 | 0.0 | +12.0 +- 6.1 | 3.5 | HIGH+WR | ACK | 90 | 100 | …`.

Run: `BALANCE_SWEEP=1 npx vitest run src/game/test/arcfire/arcfire.sweep.test.ts`
Expected: PASS (1 test, about 75 s here), with the same tier line and `FAIL (0): none; ACK (9): …; STALE ACK: none`. This is what the weekly job will report until the tuning pass.

- [ ] **Step 5: Run the Arcfire gate and check the tree**

Run: `npx vitest run src/game/titles/arcfire src/game/test/arcfire src/game/runtime/arcfire src/game/sim/purity.test.ts`
Expected: PASS: 32 files passed and 1 skipped; 260 tests passed and 1 skipped.

Run: `git status --short`
Expected, exactly:

```
 M src/game/titles/arcfire/balance.allow.json
?? docs/superpowers/2026-09-24-arcfire-balance-first-run.md
```

- [ ] **Step 6: Commit**

```bash
git add src/game/titles/arcfire/balance.allow.json docs/superpowers/2026-09-24-arcfire-balance-first-run.md
git commit -m "test(arcfire): the first balance sweep; its report, and the allow-list seeded with the 9 first-run failures" -m "Plan 2B Task 15, data only. Tier separation 99.5 / 93.5 / 85.5% (>= 85 / 60 / 70%). Harness, 400 Ace-vs-Ace matches: FAIL 9 of 32 (nova, needle, railshot, twinnova, shrapnel, skipper, auger, prism, swarm), now ACK in balance.allow.json with their reasons, so the weekly job is green until the tuning pass empties the list (the launch gate). No power written back (owner decision B5 / O9)." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

# Part E — Docs and hand-off (Task 16)

### Task 16: The Plan 2A addendum notes, the final checks and the hand-off

**Files:**
- Modify: `docs/superpowers/specs/2026-09-23-arcfire-plan2a-weapons-design.md` (3 edits: §7.3's re-pin commands; §11's K10, K12 and minors, "done in 2B", with K12's recorded deviation)
- `docs/superpowers/specs/2026-09-22-arcfire-design.md` is unchanged: the Pre-flight commit already synced it (Step 2 confirms).

**Interfaces:**
- Consumes: everything above.
- Produces: the 2A addendum's hand-off marked done, and a verified branch for the owner's review.

**Why:** the design's T16 wording nits that concern the Plan 2A addendum. That addendum still quotes the pre-Revision-3 re-pin commands in its §7.3, and its §11 still lists K10, K12 and the minors as open. The spec's own 2B edits were synced before execution. Recording the Node 22 baseline needs a CI run, so it is on the hand-off list.

- [ ] **Step 1: Update the Plan 2A addendum** (3 edits)

In `docs/superpowers/specs/2026-09-23-arcfire-plan2a-weapons-design.md`, replace:

```md
3. **Re-pin with the variables set to exactly `1`:**
   - `UPDATE_ARCFIRE_GOLDEN=1 npx vitest run src/game/titles/arcfire/determinism.test.ts`
   - `UPDATE_ARCFIRE_CORPUS=1 npx vitest run src/game/titles/arcfire/corpus.test.ts`
```

with:

```md
3. **Re-pin, one golden or the corpus at a time** (the commands as of the final review, Revision 3):
   - `UPDATE_ARCFIRE_GOLDEN=plan1 npx vitest run src/game/titles/arcfire/determinism.test.ts` (`=full` re-pins the full-roster golden, `=1` both; neither touches Plan 2B's vs-AI goldens, which only `UPDATE_ARCFIRE_GOLDEN=vsai` re-pins, in `ai.corpus.test.ts`)
   - `UPDATE_ARCFIRE_CORPUS=1 ARCFIRE_CORPUS_EXPECT_MOVED=<n> npx vitest run src/game/titles/arcfire/corpus.test.ts`, where `<n>` is the declared number of moved cases plus moved definition digests
```

In `docs/superpowers/specs/2026-09-23-arcfire-plan2a-weapons-design.md`, replace:

```md
- **Timing:** bundle the sim before timing (§4.8), and use `copyMatchInto` (K10).
- **Quiet-path allocations to gate** before the AI's inner loop multiplies them (K12): the walk paths, `children`, the per-trigger objects, `settle`'s heights copy and `carveCapsule`'s `half` table. The parity test proves such a change inert.
```

with:

```md
- **Timing:** bundle the sim before timing (§4.8), and use `copyMatchInto` (K10). *Done in 2B:* `copyMatchInto` is in `state.ts`, and the AI's bundled timing test is `ai.perf.test.ts`.
- **Quiet-path allocations to gate** before the AI's inner loop multiplies them (K12): the walk paths, `children`, the per-trigger objects, `settle`'s heights copy and `carveCapsule`'s `half` table. The parity test proves such a change inert. *Done in 2B* (the Plan 2B addendum, `2026-09-24-arcfire-plan2b-ai-design.md` §7.3), **with a deliberate deviation:** the walk paths, `children`, `settle`'s heights copy and the `half` table are gated, but the `Timeline` object, one `Trigger` per trigger, the `[p0, p1]` points array and `stepShell`'s `Impact` results stay allocated on the quiet path. Gating them would save about 0.3% of an Ace match's time (GC), and a shared points array would be a trap for callers.
```

In `docs/superpowers/specs/2026-09-23-arcfire-plan2a-weapons-design.md`, replace:

```md
- **Deferred minors** from the final review (Revision 3; spec §9.1 lists them under Plan 2B): a split child's `Timeline.shells` angle can be −0 (compare sign-insensitively); `endBounce` repeats `stepShell`'s cap check (keep the bounce-at-the-cap test green through any refactor); and `abandon()`'s `out` events for shells alive at step 4,800 are untested (no legal weapon reaches them).
```

with:

```md
- **Deferred minors** from the final review (Revision 3; spec §9.1 lists them under Plan 2B): a split child's `Timeline.shells` angle can be −0 (compare sign-insensitively); `endBounce` repeats `stepShell`'s cap check (keep the bounce-at-the-cap test green through any refactor); and `abandon()`'s `out` events for shells alive at step 4,800 are untested (no legal weapon reaches them). *Done in 2B* (the Plan 2B addendum §11): `fanOffset` never returns −0, `endStep` is shared by the free-flight end and `endBounce`, the backstop's `out` events are pinned by `carryovers.test.ts`, and so are the validator's delay and multi-stage-cycle fixes, the homing-null guard and the `maxTurnSteps` bound. No pin moved.
```

- [ ] **Step 2: Confirm the spec needs no further sync**

The spec was synced to the validated design and B1–B5 before execution, and the Pre-flight commit holds that sync. It covers:
- §1.1: the `ai/` module layout (`tiers`, `noise`, `model`, `probe`, `search`, `plan`, `policy`) plus `vsai.ts` and `verify.ts`.
- §1.3 and §6.5: vs-AI replay is `replayVsAi`; the local resume blob holds both seats' commands plus the opponent and is re-applied without a search (B3); the submission stays human-only. §6.5 names what tests the resume (every prefix of a short Rookie match, both goldens' full logs, the host's three prefixes of the win golden, the Worker's 25 entries), and that a bad start is `bad_log` and changes nothing.
- §4.3: the random draft, net points per shot, the local-only `power` write-back after tuning, and the allow-list gating.
- §5: a sim is one full resolve; the budget column is a cap spent as fixed per-weapon shares; per-weapon probe models, with an apex split followed once (Task 5's review fix); the tiers as measured; the decision timings' 8 plain states (4 openings, 4 after 9 shots).
- §7: the verifier's run is bounded by `too_long`, the sim budgets and the probe grids.
- §8: the AI pins and their update commands, including that only `UPDATE_ARCFIRE_GOLDEN=vsai` re-pins the vs-AI goldens, and that a re-pin which flips a golden's outcome picks new seeds first.
- §9.1: 2B done, and the Plan 3 / Plan 4 hand-offs.

Every pin reproduced, so the code matches it, and no step edits it.

Run: `git log --oneline -1 -- docs/superpowers/specs/2026-09-22-arcfire-design.md`
Expected: the Pre-flight commit, `docs(arcfire): Plan 2B — AI; sync spec to the validated design and owner decisions`.

If any task had to depart from the spec (it cannot without moving a pin), stop and report it to the controller rather than editing the spec here.

- [ ] **Step 3: Run the final code verification**

Run: `npm test`
Expected: all pass: 72 test files passed and 2 skipped; 513 tests passed and 11 skipped.

Run: `npx vitest run src/game/titles/arcfire src/game/test/arcfire src/game/runtime/arcfire src/game/sim/purity.test.ts`
Expected: PASS: 32 files passed and 1 skipped; 260 tests passed and 1 skipped.

Run: `npx tsc --noEmit`
Expected: exit 0.

Run: `node -e "const a=require('./src/game/titles/arcfire/determinism.golden.json'),f=require('./src/game/titles/arcfire/determinism.full.golden.json'),c=require('./src/game/titles/arcfire/corpus.golden.json');console.log(a.hash,JSON.stringify(a.scores),f.hash,JSON.stringify(f.scores),c.digest,Object.keys(c.cases).length)"`
Expected, exactly: `389a1340 [31,83] 3f614265 [359,448] a7100140 483`

Run: `git diff --stat e77161d -- src/game/test/determinism.golden.json src/game/titles/arcfire/determinism.golden.json src/game/titles/arcfire/determinism.full.golden.json src/game/titles/arcfire/corpus.golden.json src/game/sim src/game/titles/circle-td`
Expected: no output. No 2A fixture, sim-core file or Circle TD file changed in 2B.

Run: `npm run build`
Expected: the Next.js build succeeds (exit 0). Never use `next dev`.

Run: `npm run check:bundle-budget`
Expected: exit 0 (`✓ bundle-budget: 20 prerendered route(s) scanned, …`).

Run: `npm run test:e2e:cross-engine -- --grep-invert firefox`
Expected: exit 0, `4 passed`: Chromium and WebKit reproduce every pin and play the vs-AI golden in a real Worker (Firefox runs in CI).

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-09-23-arcfire-plan2a-weapons-design.md
git commit -m "docs(arcfire): Plan 2A addendum; the re-pin commands, and K10, K12 and the minors done in 2B" -m "Plan 2B Task 16. Section 7.3 quotes the Revision 3 re-pin commands (plan1 / full, ARCFIRE_CORPUS_EXPECT_MOVED, and vsai for the 2B goldens); section 11 marks copyMatchInto (K10), the quiet-path gating (K12) and the deferred minors done in 2B, and records K12's deliberate deviation (the Timeline, the per-trigger objects, the points array and stepShell's Impact results stay allocated: about 0.3% of an Ace match)." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Run: `git status --short`
Expected: no output. The one line allowed is ` M docs/superpowers/plans/2026-09-24-arcfire-plan-2b.md`, if you ticked this plan's checkboxes.

---

## Plan 2B done — hand-off checks

- `git log --oneline e77161d..HEAD` shows 17 commits: the Pre-flight docs commit, then one commit for each of the 16 tasks. Nothing is pushed.
- **The pins,** all in Node, and in Chromium and WebKit through the cross-engine gate (Firefox in CI):
  - unchanged: Circle TD `5167b43d`; the Arcfire golden `389a1340` [31, 83]; windless `8d7dc831`; the 2A corpus `a7100140` (483 cases); the full-roster golden `3f614265` [359, 448];
  - new: the AI corpus turn `55df93ca` (45 cases) and draft `c0d402d4` (12 cases); the vs-AI win golden `be9db94d` [254, 169] and loss golden `2097c8fc` [234, 329].
- **The budgets:** a cold daily verification about 0.56 s (< 5 s); sims ≤ 300 / 1,500 / 4,000 on every decision; the worker bundle 40.1 KiB (< 64 KiB); tier separation 99.5 / 93.5 / 85.5%.
- `ARCFIRE_SIM_VERSION` is still 1. No `power` changed.
- **Handed to Plan 3** (design §8.5, recorded in spec §9.1):
  - `ArcfireWorkerClient` (`src/game/runtime/arcfire/client.ts`) is the only handle. `start` / `pick` / `turn` / `preview` / `on` / `dispose`; events carry the request `id`, and `picked` / `shot` carry `seq`.
  - The human's event arrives before the AI thinks. Queue events by `seq`, and play the AI's shot after the human's playback.
  - Show at least 700 ms of visible aiming before any AI shot (B4, ⚑ O14): presentation only, never in the worker.
  - Save `{ v, seed, settings, mode, opponent, log }` to `arcfire:match:v<simVersion>` after every event, with `log` = `state.log` plus each `picked` / `shot` in `seq` order. Resume with `start(…, log)` (B3).
  - Submit the daily's `humanLog`.
  - Handle `rejected{invalid_command | not_your_move | no_match | bad_log}` and `error` as the design's §8.5 lists.
  - Its first task verifies `new Worker(new URL("./worker.ts", import.meta.url), { type: "module" })` inside `npm run build` (K10). The fallback is the esbuild worker bundle emitted to `public/`.
  - `planTurn` is RNG-free, so a "what would Ace do" hint is a one-line host addition.
  - Playtest the heaviest Ace openings on a real mid-range phone (B4, ⚑ O15).
- **Handed to Plan 4** (design §6.6): the Arcfire `TitleDef` wraps `scoreVsAi(input.seed, input.commands, STANDARD_SETTINGS, DAILY_TIER)`.
  - The settings and the tier come from the mode, and `verifyScore` must refuse a non-daily Arcfire submission before `replay`.
  - The zod command schema mirrors `isArcfireCommand`.
  - `replay_hash` is Plan 4's per-title command-log digest over the human's commands.
  - `limits.maxTicks` does not apply: `too_long` (21 commands), the fixed sim budgets and the fixed probe grids bound the run (each probe flight ends within two flight caps, Task 5).
- **Open after 2B, for the owner and the controller:**
  - **The Node 22 baseline.** The numbers `ai.perf.test.ts` prints on its first CI run (daily verification cold and warm, and each tier's mean and maximum decision time over the 8 plain states and over the 4 full-hand openings) are the Node 22 baseline that spec §9.1 asked for. Record them there in a docs commit after the first CI run, together with the first weekly sweep's cost table (this plan's local one is in `docs/superpowers/2026-09-24-arcfire-balance-first-run.md`). This plan never pushes, so it cannot record them itself.
  - **The tuning pass** (⚑ O11). It changes weapon data only, with a declared re-pin of every pin it moves: the 2A corpus's cases and definition digests, the goldens, and the AI pins.
    - Round one scales damage: Nova ×0.77, Twin Nova ×0.67, Swarm ×0.75, Shrapnel ×1.84, Skipper ×1.70.
    - Round two fixes the structure: Needle, Railshot, Prism and Auger.
    - Homing (B2) is ruled after that.
    - Re-run the harness after each round, and remove each fixed weapon from `balance.allow.json` (a `STALE ACK` says when).
  - **Then the `power` write-back** (⚑ O9), locally: `BALANCE_SWEEP=1 ARCFIRE_BALANCE_WRITE=1 npx vitest run src/game/test/arcfire/arcfire.sweep.test.ts`. Follow it with the two declared re-pins it prints: `UPDATE_ARCFIRE_AI=draft` (the draft section; it refuses if a turn case moved) and `UPDATE_ARCFIRE_GOLDEN=vsai` (the vs-AI goldens). No 2A pin moves.
  - **A vs-AI re-pin may need new seeds.** The goldens' checks require the win golden to be a human win and the loss a human loss, finished, both sides scoring, a human move and 6 AI tags. A write-back or a loosened daily Veteran (B1) can flip an outcome, and then `UPDATE_ARCFIRE_GOLDEN=vsai` fails those checks and writes nothing. The procedure: edit the failing case's `seed` in `determinism.vsai.golden.json` to the next seed up, re-run `=vsai`, and repeat until it passes; the commit declares each `seed old -> new` with its hash. A loosened Veteran must also keep the weekly sweep's tier separation green (Ace ≥ 60% against it, it ≥ 70% against Rookie).
  - **Firefox, before the branch merges.** No Firefox run of 2B exists yet: Firefox cannot launch on the dev machine, and this plan never pushes. The first push runs CI's `browser-smokes` job in all three engines. It must show Firefox reproducing `55df93ca/c0d402d4` and `be9db94d/2097c8fc` and passing the real-Worker smoke before the branch merges. If only the Worker smoke fails in Firefox, serve the worker bundle through `page.route` on a real origin instead of a `blob:` URL on `about:blank`.
  - **The launch gate** (spec §7): the weekly sweep green with an empty allow-list, the cross-engine gate green in all three engines, and the owner's playtest (B1 decides then whether the daily Veteran is loosened). Then freeze `ARCFIRE_SIM_VERSION` and flip `LEADERBOARD_PUBLIC.arcfire`.
  - **After launch,** any change to `ai/**`, `TIERS`, the noise, the probe models or a `power` changes regenerated AI decisions: an `ARCFIRE_SIM_VERSION` bump (design D23). The AI pins make it loud.
