# Arcfire Plan 2A — Weapons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build every spec §4.1 weapon primitive and append the 24 remaining weapons (roster indices 8–31) to Plan 1's eight, each with its Timeline event. Close every spec §9.1 Plan 2 carry-forward, and re-pin the Arcfire goldens with one declared cause per move, behind a per-weapon corpus that Node, Chromium and WebKit all reproduce.

**Architecture:**
- **Only shells and delay timers take simulated time.** Blast, split, roll, dig, burn, build, quake and beam apply instantly at their trigger step, in closed form or one bounded pass (`weapons/primitives.ts`).
- **Shell flight lives in `ballistics.ts`.** Bounce and homing are `Stage` flight modifiers handled inside `stepShell`.
- **`resolve.ts` runs one step loop with a written, normative order:** due delays fire first, then shells step in creation order. It adds `resolveWeapon` (fire any definition) and `resolveTurnPoints` (the quiet path).
- **Weapons stay pure data** (`weapons/roster.ts`), checked statically by `weapons/validate.ts`.
- **Behaviour is pinned before anything moves:** a per-weapon-id corpus (Task 1) and `MatchSettings.rosterSize` (Task 2) make every pin immune to roster appends.

This plan adds no AI, worker, balance harness, renderer or UI; those are Plan 2B and Plan 3.

**Tech Stack:** TypeScript (strict), Vitest 4, esbuild (the bundled perf test and the cross-engine bundle), Playwright (cross-engine config), Next.js 16 (build regression check only). The sim is integer / Q16.16 fixed point (`src/game/sim/math/fixed.ts`) with the baked aim table (`src/game/titles/arcfire/aimTable.ts`), the mulberry32 RNG and FNV-1a hashing.

**Spec:**
- `docs/superpowers/specs/2026-09-22-arcfire-design.md`: §2 rules, §3 sim model, §4 weapons, §5 AI budgets, §8 testing, §9.1 carry-forwards.
- **Design addendum** (binding for 2A): `docs/superpowers/specs/2026-09-23-arcfire-plan2a-weapons-design.md`, the final Plan 2A design, Revision 2, with the owner's decisions of 2026-09-23.
  - Every code block below marked *design-verbatim* is copied mechanically from that document's *(verbatim)* blocks.
  - The spec already carries the addendum's decisions, D1–D6 included: it was synced to the validated design and the owner decisions before execution. The Pre-flight step below commits that sync, the addendum and this plan together (the repo's precedent, `6fa3050`). No task edits the spec; Task 14 Step 13 only confirms that nothing is left to sync.

## Global Constraints

- **Base.** Work on branch `worktree-games+arcfire`: master `2f9e6ba` (Plan 1 merged) plus the Pre-flight docs commit (this plan and the synced spec). Task 1 Step 1 checks it.
- **Sim purity.** Everything under `src/game/sim`, `src/game/titles/circle-td` and `src/game/titles/arcfire` is pure: integer / Q16.16 math and the seeded RNG only.
  - `src/game/sim/purity.test.ts` scans every non-test `.ts` file in those roots, **including comments**.
  - Banned globals: `window`, `document`, `navigator`, `performance`, `new Date`, `Date.now`.
  - Banned math: `Math.random`, `Math.sin`, `cos`, `tan`, `atan`/`atan2`, `pow`, `exp`, `expm1`, `log`, `log2`, `log10`, `log1p`, `hypot`, `cbrt`, `asin`, `acos`, `sinh`, `cosh`, `tanh`, and the `**` operator.
  - Test files (`*.test.ts`) are exempt. `src/game/test/**` is outside the roots.
  - Never write a banned word in a sim file, even in prose.
- **No shared trig in Arcfire.** Arcfire never imports `src/game/sim/math/trig.ts` (the purity guard checks this). Every direction comes from the baked table in `aimTable.ts`: `aimCos`/`aimSin`, and from Task 4 `cosDeg`/`sinDeg`.
- **No BigInt literals.** The repo's `tsconfig` targets ES2017, where `0n` is a type error. Use `BigInt(…)`. New code writes negations as `0 - x`, so it never produces `-0`.
- **Circle TD's golden never moves.** `src/game/test/determinism.golden.json` (hash `5167b43d`) stays byte-for-byte unchanged after every task. Never regenerate it.
- **The Arcfire pins move only where this plan says, and only with the declared cause.**
  - Golden `63222780` → `4c1d8598` (Task 2, the `rosterSize` fold) → `389a1340`, scores `[31, 83]` (Task 3, exact damage).
  - Windless pin `1c8832e9` → `8d7dc831`, scores `[36, 24]` (Task 2).
  - `resolve.test` Fan `[51, 0]` → `[50, 0]` (Task 3).
  - Corpus `09403dbb` (123 cases, Task 1) → `655486aa` (Task 3) → `fa6b1ed7` (Task 4) → **`a7100140`** (483 cases, Task 13).
  - Full-roster golden **`3f614265`**, scores `[359, 448]`, winner 1 (Task 14).
  - **From Task 4 on, `389a1340`, `8d7dc831` and every existing corpus key stay byte-identical.** Weapon tasks only add corpus keys, with `UPDATE_ARCFIRE_CORPUS=add`.
  - A value that differs from this plan means the code differs from this plan: stop and diff.
- **Update variables are set to exactly one value.** Use `UPDATE_ARCFIRE_GOLDEN=1` for the goldens. For the corpus, use `UPDATE_ARCFIRE_CORPUS=1` (a declared re-pin) or `UPDATE_ARCFIRE_CORPUS=add` (new keys only; it refuses to write if any existing key moved).
- **Roster order is a wire format.** `ROSTER` is append-only; never reorder or delete an entry.
  - Indices 0–7 stay byte-for-byte unchanged, and their definition digests are pinned from Task 1.
  - Indices 8–31 are appended in spec §4.2 display order, one contiguous slice per weapon task.
- **`ARCFIRE_SIM_VERSION` stays 1.** No leaderboard rows or saves exist yet; the owner freezes it at launch.
- **`src/game/sim/` stays title-agnostic.** Only `registry.ts` may import from `src/game/titles/**` (`src/game/sim/boundary.test.ts`).
- **Never run `next dev`.** Turbopack panics on the space in this repo's path. Exercise the app with `npm run build` (then `npm run start`).
- **Git rules:**
  - Commit with the configured identity (Michael Wright <m.wright2@lafilm.edu>).
  - End every commit message with the trailer line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. The commit commands below pass it as a second `-m`.
  - **Ruling R5:** each agent uses its own harness's trailer. An executor whose harness names a different trailer uses that one in the second `-m`.
  - Never push. Never use `git stash`.
  - Keep git invocations simple: one command per line.
- **Worktree guard.** The session's worktree guard refuses compound or computed commands. Run every command in this plan as written: one plain command per line, with no `&&` chains, no heredocs, and no `$(…)` or variables in arguments. If a command is refused, split it.
- **Transcribe verbatim.** The hashes are the transcription check: a single changed constant or operator moves one. Where a task gives a whole file, write exactly that file. Where it gives an edit, the quoted "replace" text occurs exactly once in the file.
- **Out of scope (Plan 2B and later):** the AI tiers, the draft AI, the Web Worker, vs-AI replay, the balance harness and `power` values (the harness rewrites the placeholders), `copyMatchInto`, and the quiet-path allocation gating (K12). Rendering, HUD and audio are Plan 3.

## Owner decisions D1–D6 (binding)

The owner settled the design's open questions on 2026-09-23. They are binding: the code below implements exactly these, and the pins depend on them. Changing one later is a data or one-rule change plus a declared corpus re-pin, never a silent edit. The design-document names are in brackets.

- **D1 — Beams are long and aim on the beam dial** [O1, design D19].
  - Lancer and Prism are 1,200 px long. Widths and damages stay as spec §4.2: Lancer 8 px / 60; Prism 3 beams, 8° spread, 6 px / 35 each.
  - The wire angle stays an integer 0..180. A beam reads it on the shell dial turned a quarter turn toward the shooter's facing. Player 0 always stands left of player 1, so the facing follows the player index: `beamDir(shooter, angle)` = `angle − 90` for player 0 and `angle + 90` for player 1 (aim degrees; 0 = right, 90 = up).
  - For both players, 90 fires level at the opponent. Each player's usual shell half of the dial (0–90 for player 0, 90–180 for player 1) aims from straight down to level, and the other half from level to straight up.
  - Turning the dial turns a beam the same way it turns a shell, and a mirrored beam command is `180 − angle`, exactly as for shells.
  - Plan 3's HUD draws the needle along `beamDir`, and shows the elevation as `angle − 90` (player 0) or `90 − angle` (player 1). 2B's AI calls the same exported function.
  - *Rejected:* "elevation = angle − 90 for both players". It reverses player 1's turning direction and breaks the `180 − angle` mirror rule that 2B's AI grids and the full-roster golden rely on.
- **D2 — Homing keeps the spec numbers** [O2].
  - Seeker turns ≤ 2°/step and Swarm ≤ 1°/step after the apex, toward the enemy's hitbox centre.
  - There is no lock radius and no turn budget.
- **D3 — The quake spares its shooter** [O9, design D21].
  - The shockwave's reach is horizontal (unblockable, it crosses chasms), and it damages only the opponent.
  - Aftershock's separate impact blast still follows the normal blast rules, so it can hurt the shooter (credited to the opponent).
- **D4 — Dig is pitch-clamped** [O3, design D20].
  - A tunnel follows the travel direction at impact, but never dives steeper than `DIG_MAX_PITCH = 30`° below level. A steeper heading is replaced by exactly 30° in the same horizontal sense; with no horizontal travel, it goes toward the opponent.
  - Upward and shallower headings are kept as they are.
- **D5 — The bounce normal samples a radius-8 disc** [O15, design D9]. `BOUNCE_PROBE_R = 8`: the normal is minus the centroid of the solid pixels, from ≤ 197 probes. It is exact on flat ground and at 45°.
- **D6 — Every other owner item takes its stated default** [O4–O8, O10–O14]:
  - Hailstorm's burst is carried by the parent's motion; Hydra keeps 100% of the apex speed; Barrage's line is centred on the parent and carries its velocity (O4).
  - A nearly flat Barrage can fly a rear child into its own shooter; this is pinned as documented behaviour (O5).
  - Volley edge shells may leave below the horizon (O6).
  - Roll and fire never climb, and a roller goes downhill first (O7).
  - Fire touches a tank's hitbox circle, burns each tank once per burn effect, and does not linger (O8).
  - Builds lift tanks and never bury them (O10).
  - Direct tank hits skip the roll and the tunnel (O11).
  - Restitution scales both velocity components, and walls are elastic (O12).
  - The open spec numbers are the bold values of the design's §5.1 table, and `power` stays a placeholder (O13).
  - Top-attack stacking is accepted for now (O14).
  - O16 is named in the owner's list but does not exist in the design, which defines O1–O15 (fifteen items); there is nothing further to implement.

The D-numbers are the owner's (D3 = quake, D4 = dig); the commit messages below cite them.

**Measured effect** (the owner's blind grid: 20 seeded hills boards × both shooters; shells at angles 5–85 step 2 toward the opponent × power 30–100 step 2; beams at every angle that points at the opponent's side). The reference is Pulse, which hits 3.2% of shots for 0.93 points per shot.

| Weapon | Before | After |
|---|---|---|
| Lancer (D1) | 0% | 1.4% of shots hit, 0.83 points per shot |
| Prism (D1) | 0% | 3.9%, 1.36 |
| Burrow (D4) | 1.9%, 0.96 | 2.7%, 1.23 |
| Auger (D4) | 2.1%, 0.30 | 3.3%, 0.46 |
| Quake self-damage (D3) | 42.7% of shots, 13.01 points gifted; net −6.73 | 0; net +6.28 |
| Aftershock self-damage (D3) | 33.7%, 9.24; net −4.59 | 10.2%, 2.57 (its blast only); net +2.07 |
| Seeker / Swarm (D2) | — | 46.6%, 23.1 / 42.5%, 32.06 |

From spawn, Lancer now hits at 2–3 command angles and Prism at 6–9, on all 40 board/shooter pairs.

## How this plan was validated

**The design.** The design addendum was itself validated on a prototype, rebuilt mechanically from its verbatim blocks after the owner decisions: `tsc --strict` and the purity guard were clean, and all 166 of its tests passed. Every pin below was reproduced in Node, and the final three (`389a1340`, `a7100140`, `3f614265`) also in Chromium and WebKit.

**This plan.** It was then dry-run end to end. A scratch copy of this worktree at `2f9e6ba` received every step of Tasks 1–14 in order:
- each task's tests went in first and were run to record the failures quoted below; then the code went in and the task's checks were run;
- afterwards the whole sequence was re-applied to a clean copy of `2f9e6ba`, and it reproduced the same tree;
- finally this document's own text was executed mechanically on a clean copy: every whole-file block and every replace/insert/append edit, in document order. It reproduced the same tree, with every edit's "replace" text matching exactly once. Its fixtures regenerated byte-identical, and all 188 Arcfire + purity tests passed.

What the dry run showed:
- **Code blocks.** Every block below is either design-verbatim or derived from the design's final files by leaving out the functions that later tasks add. After Task 13, every sim file is byte-identical to the design's final blocks: `types.ts`, `state.ts`, `terrain.ts`, `damage.ts`, `ballistics.ts`, `weapons/primitives.ts`, `weapons/validate.ts`, `timeline.ts`, `resolve.ts`, `corpus.ts`, `corpus.test.ts`, `damage.test.ts` and the final `roster.test.ts`.
- **Test values.** Every *(proto)* value the design quotes reproduced exactly, including the Revision 2 ones. Examples: Skipper's final blast at (699, 422); Burrow's tunnel (663, 400) → (740, 445); Auger's blasts (871, 419) … (975, 480); Lancer level ending at (1199, 388); Prism's lowest beam ending at (1199, 449); Lancer from the plateau hitting at command angles 67–71; Quake `[0, 0]` and Aftershock `[0, 50]` on their own tanks; Inferno igniting at x 470 with lag 55.
- **Pins.** Every pin reproduced, at the task where this plan puts it (the ledger below).
- **Cross-engine.** Chromium and WebKit reproduced every pin at Tasks 1, 2, 3, 4, 5, 13 and 14. Firefox cannot launch on this Windows machine (`spawn UNKNOWN`, the known Plan 1 environment issue) and runs in CI.
  - The local gate command leaves Firefox out with `--grep-invert firefox`; run against Plan 1's spec, it exits 0 with only the Chromium and WebKit tests.
  - The Chromium + WebKit gate in Tasks 7–12 was added after the dry run. Its expected digests follow from the ones that were checked: the corpus is keyed by weapon id and no existing key ever moves, so each Task 7–12 case has exactly its Task 13 fingerprint, which both engines reproduced inside `a7100140`.
- **Counts.** Task 14 ends with `tsc --noEmit` clean and 188 Arcfire + purity tests passing. The full suite is 58 files passed and 1 skipped, and 441 tests passed and 10 skipped; the baseline was 344 tests.
- **Build.** A later dry run in an isolated worktree, with a real `npm ci` and a path containing spaces, ran `npm run build` at Task 14 and it succeeded. (The first dry run could not: Turbopack refused its scratch copy's linked `node_modules`.) 2A changes no app code, so it is a regression check.
- **Re-verified in that isolated run:** every RED/GREEN expectation and failure message, every per-step test count, every ledger pin, the full-suite totals, every whole-file block, and every edit's "replace" text matching exactly once.
- **The spec.** The dry runs executed Tasks 1–14 against the spec as committed at `2f9e6ba`. The worktree's spec was then synced to the validated design and D1–D6 before execution (the Pre-flight step commits it), so no task edits the spec any more.

### Pin ledger

| After | Arcfire golden (scores) | Windless (scores) | Fan test | Corpus digest (cases) | Full-roster golden |
|---|---|---|---|---|---|
| Plan 1 (`2f9e6ba`) | `63222780` [32, 84] | `1c8832e9` [36, 24] | [51, 0] | — | — |
| Task 1 | unchanged | unchanged | unchanged | `09403dbb` (123) | — |
| Task 2, step A (plumbing) | `63222780` (the fixture gains only `"rosterSize": 8`) | unchanged | unchanged | `09403dbb` | — |
| Task 2, step B (fold) | **`4c1d8598`** [32, 84] | **`8d7dc831`** [36, 24] | unchanged | `09403dbb` | — |
| Task 3 (exact damage) | **`389a1340`** [31, 83] | `8d7dc831` | **[50, 0]** | **`655486aa`** (123; exactly 4 moved) | — |
| Task 4 (floor + unclamp) | `389a1340` | `8d7dc831` | [50, 0] | **`fa6b1ed7`** (123; exactly 11 moved) | — |
| Tasks 5, 6 | unchanged | unchanged | unchanged | `fa6b1ed7` (0 moved) | — |
| Task 7 (+6 weapons) | unchanged | unchanged | unchanged | `88f0bd53` (213) | — |
| Task 8 (+3) | unchanged | unchanged | unchanged | `673c1a97` (258) | — |
| Task 9 (+6) | unchanged | unchanged | unchanged | `0d68b775` (348) | — |
| Task 10 (+3) | unchanged | unchanged | unchanged | `085791c6` (393) | — |
| Task 11 (+2) | unchanged | unchanged | unchanged | `cc40894a` (423) | — |
| Task 12 (+2) | unchanged | unchanged | unchanged | `e0aad681` (453) | — |
| Task 13 (+2) | unchanged | unchanged | unchanged | **`a7100140`** (483) | — |
| Task 14 | unchanged | unchanged | unchanged | `a7100140` | **`3f614265`** [359, 448], winner 1, 40 commands |

- The Task 1–4 and Task 13 corpus digests, the Arcfire golden chain, the windless pin, the Fan test and the full-roster golden are the design's own transcription checks.
- The Task 7–12 corpus digests were measured in this plan's dry run. They are the same kind of check: the corpus is keyed by weapon id, so each one depends only on the weapons appended so far.
- **Definition digests.** The corpus fixture also pins each weapon's definition digest.
  - Plan 1's eight: pulse `e151d5df`, pulse2 `1a588902`, nova `bcb156c7`, needle `086899c2`, crater `922e1cbf`, triad `7028d65d`, fan `635370e6`, railshot `30e47b0c`.
  - After the owner decisions: lancer `26421a9a` and prism `540c4e8a`.
- Circle TD `5167b43d` is untouched throughout.

## File Structure

```
src/game/titles/arcfire/               all pure, purity-guarded
  aimTable.ts           + cosDeg, sinDeg (any integer angle, by exact symmetry)                (T4)
  imath.ts              + floorPx, ceilDiv                                                      (T4)
  constants.ts          + MAX_TURN_STEPS, MAX_SHELLS, MAX_STAGE_DEPTH, BOUNCE_PROBE_R (8),
                          ROLL_PROBE, DIG_MAX_PITCH (30)                                         (T5)
  state.ts              MatchSettings.rosterSize (T2); STANDARD_SETTINGS / SHORT_SETTINGS (T13)
  match.ts              rosterSize validation; the draft draws from ROSTER.slice(0, rosterSize) (T2)
  hash.ts               folds s.rosterSize                                                      (T2)
  damage.ts             exact-distance blastDamage                                              (T3)
  terrain.ts            settle(t, collect) (T5); PIECES/writeColumn, export removeInterval,
                        addInterval, carveCapsule, groundBelow, surfaceTop (T6)
  ballistics.ts         floor + cosDeg (T4); Plan 2A Shell fields, shellAt/launchAt (T5);
                        apex latch, ignore mask, rotateVel (T7); bounces (T8); homing steer (T12)
  timeline.ts           the Plan 2A Timeline: every event kind, dur/lag, ShellPath parent/start (T5)
  resolve.ts            unclamp + floor (T4); the step loop, resolveWeapon, resolveTurnPoints (T5);
                        early/dud (T7); bounce branch (T8); beams (T11)
  weapons/types.ts      the final data model                                                    (T5)
  weapons/validate.ts   CREATE: weaponErrors, maxShells, maxTurnSteps                           (T5)
  weapons/primitives.ts CREATE: skeleton (T5); split, delay (T7); walk, roll, dig, burn (T9);
                        build (T10); beamDir, fireBeams (T11); quake (T13)
  weapons/roster.ts     + 24 entries, indices 8..31                                           (T7–T13)
  corpus.test.ts, corpus.golden.json                                                           (T1; T5)
  perf.test.ts, determinism.full.golden.json                                                   (T14)
  *.test.ts             edits and additions per task (each task's Files list)
src/game/test/arcfire/                 test-only, outside the purity roots
  corpus.ts             CREATE: the per-weapon corpus runner                                    (T1)
  fixtures.ts           CREATE: flatBattle(), setHeights()                                      (T5)
  perf.entry.ts         CREATE: the bundled timing entry                                        (T14)
src/game/test/cross-engine/harness.entry.ts   + window.runArcfireCorpus                        (T1)
e2e/cross-engine-determinism.spec.ts          one table of pins for every engine (T1); + full golden (T14)
docs/superpowers/specs/2026-09-22-arcfire-design.md   the Plan 2A sync, committed with this plan (Pre-flight)
```

## Commands

- **One test file or directory:** `npx vitest run <paths>`
- **The Arcfire gate** (used at the end of every task): `npx vitest run src/game/titles/arcfire src/game/sim/purity.test.ts`
- **Full suite:** `npm test`
- **Types:** `npx tsc --noEmit` (success = exit 0, no output)
- **Cross-engine gate (local):** `npm run test:e2e:cross-engine -- --grep-invert firefox`
  - Green is **exit 0**: the Chromium and WebKit tests pass. Firefox cannot launch on this Windows machine (`spawn UNKNOWN`), so the local gate leaves it out rather than expecting a known failure.
  - CI's `browser-smokes` job (`.github/workflows/ci.yml`) runs the full three-engine gate, Firefox included.
- **Golden re-pin:** `UPDATE_ARCFIRE_GOLDEN=1 npx vitest run src/game/titles/arcfire/determinism.test.ts`
- **Corpus re-pin:**
  - `UPDATE_ARCFIRE_CORPUS=1 npx vitest run src/game/titles/arcfire/corpus.test.ts --reporter=verbose`
  - `--reporter=verbose` is what makes Vitest print the test's `re-pinned N moved cases:` list; the default reporter hides a passing test's console output. The only re-pins are Tasks 3 and 4, and their commit commands below already list every moved case.
- **Corpus append** (weapon tasks): `UPDATE_ARCFIRE_CORPUS=add npx vitest run src/game/titles/arcfire/corpus.test.ts`
- **Shell:** run every command in Git Bash (the Bash tool), exactly as written. If PowerShell must be used, give each `NAME=1 <command>` as three separate commands, never one compound line (the worktree guard refuses those): `$env:NAME = "1"`, then `<command>`, then `Remove-Item Env:NAME`.

## Where this plan fills gaps in the design

The design fixes every behaviour, file and pin. This plan adds only what turning it into ordered, green tasks required. Every item was validated in the dry run.

- **Staged files.** The design gives only the final `ballistics.ts`, `weapons/primitives.ts` and `resolve.ts`. The intermediate versions (Tasks 4, 5, 7, 8, 9, 10, 11, 12) are derived mechanically from them by leaving out later tasks' functions and imports; the kept code is byte-identical. Two expressions differ until their task lands:
  - The delay branch is `else if ("delay" in e)` until Task 13 makes it the final `else`.
  - The launch test is `launch.kind === "shell" && def.stage` until Task 11 adds beams.
- **Task 4's `ballistics.ts`** is Plan 1's file with only the two carry-forwards applied (the design's §7.1): `cosDeg`/`sinDeg` and `floorPx`.
- **The Task 1 corpus test** also omits the event-kind and beam gates. Against Plan 1's `TimelineEvent` and `Launch` unions, `e.kind === "bounce"` and `launch.kind === "beam"` are type errors. The design's full file lands in Task 5.
- **Printing the moved cases.** Vitest's default reporter hides a passing test's console output, so the corpus re-pin commands pass `--reporter=verbose` to print the moved-case list.
- **Prose-only tests.** The design lists these without code: aimTable, imath, terrain, ballistics, primitives, validate, hash and match. The plan writes them in full, with the design's values:
  - It adds exact board constructions where the prose had none: Tumbler's slope (`300 + ⌊(x − 300)/2⌋` over x 300–539), the Bastion/Rampart board (tanks 300/1000), and power sweeps of 40–80 for the no-burying tests (powers 50 and 49).
  - It adds exact pins the prose left implicit: Ricochet's blast at (609, 400) at step 101, and `height[300] = 494` after Lancer fires straight down.
- **A shared test-board module**, `src/game/test/arcfire/fixtures.ts` (`flatBattle(x0, x1)`, `setHeights`), lives outside the purity roots. The design's `flatBattle()` is a private helper in `resolve.test.ts`, which keeps its own copy.
- **Growing test files.** `weapons/primitives.test.ts` and `weapons/validate.test.ts` start in Task 5, and each primitive task appends its block. `primitives.test.ts` imports up front what later blocks use; Tasks 10 and 11 add one import line each.
- **The homing property test** checks bounds, which pass vacuously before `steer` exists. It also counts turns (`turned > 1800`), so it fails first as TDD requires.
- **Task 2** is two commits, one cause each: the plumbing (inert) and the fold.
- **The "not an integer" `rosterSize` case** uses `poolSize: 6`. With Plan 1's 8 weapons and a pool of 8, 8 is the only legal value, so a non-integer must sit inside a wider range to test the integer check on its own.
- **Intermediate corpus digests** for Tasks 7–12 are measured, not from the design. They pin each weapon slice as it lands.
- **The table-driven cross-engine spec** (Task 1) had no design code; it is written out in full.
- **The spec sync** is not a task step. The spec was synced to the validated design and the owner decisions before execution, and the Pre-flight step commits it with this plan.

---

# Pre-flight — commit this plan with the synced spec

Run this once, before Task 1, in the worktree that holds this plan and the synced spec. It follows Plan 1's precedent (`6fa3050` committed that plan together with a pre-execution spec sync). Skip it if `git log --oneline -1` already shows the docs commit below.

- [ ] **Step P1: Check the starting state**

Run: `git log --oneline -1`
Expected: `2f9e6ba docs(arcfire): sync spec to the implemented Plan 1 sim; record the Plan 1 hand-off list`

Run: `git status --short`
Expected, exactly these three lines:

```
 M docs/superpowers/specs/2026-09-22-arcfire-design.md
?? docs/superpowers/plans/2026-09-23-arcfire-plan-2a.md
?? docs/superpowers/specs/2026-09-23-arcfire-plan2a-weapons-design.md
```

The spec change is the Plan 2A sync. It already records D1–D6 (1,200 px beams on the beam dial, homing at the spec numbers, the quake's horizontal reach and shooter exemption, the dig's pitch clamp and the radius-8 bounce normal), the carry-forwards, the layout, the terrain edits, the Timeline and the 2B hand-off. No later step edits it.

- [ ] **Step P2: Commit the plan, the design addendum and the spec together**

```bash
git add docs/superpowers/plans/2026-09-23-arcfire-plan-2a.md docs/superpowers/specs/2026-09-22-arcfire-design.md docs/superpowers/specs/2026-09-23-arcfire-plan2a-weapons-design.md
git commit -m "docs(arcfire): Plan 2A — weapons; sync spec to the validated design and owner decisions" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Run: `git status --short`
Expected: no output.

---

# Part A — Pins, carry-forwards and the engine (Tasks 1–6)

### Task 1: Behaviour pins first — the per-weapon corpus and a table-driven cross-engine gate

**Files:**
- Create: `src/game/test/arcfire/corpus.ts`
- Create: `src/game/titles/arcfire/corpus.test.ts` (the Task 1 version; Task 5 replaces it)
- Create: `src/game/titles/arcfire/corpus.golden.json` (generated by the test, never hand-written)
- Modify: `src/game/test/cross-engine/harness.entry.ts` (full replacement)
- Modify: `e2e/cross-engine-determinism.spec.ts` (full replacement)

**Interfaces:**
- Consumes (Plan 1): `createMatch`, `applyPick`, `applyTurn` (`match.ts`); `cloneMatch`, `MatchSettings`, `MatchState` (`state.ts`); `resolveTurn` (`resolve.ts`); `spansFromHeight` (`terrain.ts`); `ROSTER`, `ROSTER_INDEX`; `SUDDEN_DEATH_WEAPON`, `MAX_FLIGHT_STEPS`; `Timeline`; `FNV_OFFSET`, `fnvFold`, `fnvHex` (`@/game/sim/hash`); `replayMatch`.
- Produces:
  - From `src/game/test/arcfire/corpus.ts`:
    - `CORPUS_SEED = 20260922` and `CORPUS_SETTINGS: MatchSettings`
    - `ShotCase { id; w; board: "hills" | "flat"; shooter: 0 | 1; wind; move: -1 | 0 | 1; angle; power }`
    - `shotCases(): ShotCase[]`: 15 cases per roster weapon, keyed `${weapon}|${board}|p${shooter}|w${wind}|m${move}|${angle}/${power}`
    - `hashBoard(m: MatchState): string` (FNV-1a of heights, tank x and moves left)
    - `Fingerprint { board: string; points: number[] }`
    - `runCorpus(onTurn?: (c: ShotCase, tl: Timeline) => void): Record<string, Fingerprint>`
    - `corpusDigest(res: Record<string, Fingerprint>): string`
  - The fixture `corpus.golden.json`: `{ digest, defs: { [id]: digest }, cases: { [id]: { board, points } } }`.
  - `window.runArcfireCorpus(): string` in the cross-engine bundle.
  - The e2e spec's `PINS` table, one row per pin that every engine must reproduce.

**Why first:** no sim code changes in this task. It pins today's behaviour for all 8 weapons, case by case, before anything is refactored. Every later task declares exactly which cases may move. The corpus hashes only the board and the points (never settings, pool, hands or RNG), and its keys are weapon ids, so a roster append only adds keys.

- [ ] **Step 1: Confirm the base and that it is green.**

Run: `git log --oneline -2`
Expected: HEAD is the Pre-flight commit, `docs(arcfire): Plan 2A — weapons; sync spec to the validated design and owner decisions`, directly above `2f9e6ba docs(arcfire): sync spec to the implemented Plan 1 sim; record the Plan 1 hand-off list`.

Run: `git status --short`
Expected: no output. The one line allowed is ` M docs/superpowers/plans/2026-09-23-arcfire-plan-2a.md`, if you tick this plan's checkboxes as you go; leave that file out of every task commit below. If the spec shows as modified, or HEAD is `2f9e6ba` itself, the Pre-flight step has not run: do it first.

Run: `npx vitest run src/game/titles/arcfire src/game/sim/purity.test.ts`
Expected: PASS: 14 files, 91 tests.

- [ ] **Step 2: Create the corpus runner** `src/game/test/arcfire/corpus.ts`. It is the design's file, except that `CORPUS_SETTINGS` has no `rosterSize` yet: that field arrives in Task 2, which adds `rosterSize: 8` here.

```ts
// src/game/test/arcfire/corpus.ts
//
// The Arcfire cross-engine corpus: fixed single-turn cases for EVERY roster
// weapon (keyed by weapon id, so a roster append only adds cases) plus a few
// whole-match specials. Each case fingerprints the board it leaves — the
// heightfield, tank x and moves left — and the points it scored. It never
// hashes settings, the pool, the hands or the RNG, so neither a roster append
// nor a MatchSettings change can move an existing case. Pure: Node (the
// corpus test) and each browser (the cross-engine harness) run this same code.
import { FNV_OFFSET, fnvFold, fnvHex } from "@/game/sim/hash";
import { createMatch, applyPick, applyTurn } from "@/game/titles/arcfire/match";
import { cloneMatch, type MatchSettings, type MatchState } from "@/game/titles/arcfire/state";
import { resolveTurn } from "@/game/titles/arcfire/resolve";
import { spansFromHeight } from "@/game/titles/arcfire/terrain";
import { ROSTER, ROSTER_INDEX } from "@/game/titles/arcfire/weapons/roster";
import { SUDDEN_DEATH_WEAPON } from "@/game/titles/arcfire/constants";
import type { Timeline } from "@/game/titles/arcfire/timeline";

export const CORPUS_SEED = 20260922;
export const CORPUS_SETTINGS: MatchSettings = { weaponsEach: 3, poolSize: 8, wind: false, guaranteeTags: [] };

export interface ShotCase {
  id: string; // `${weapon}|${board}|p${shooter}|w${wind}|m${move}|${angle}/${power}`
  w: string; // weapon id
  board: "hills" | "flat";
  shooter: 0 | 1;
  wind: number;
  move: -1 | 0 | 1;
  angle: number;
  power: number;
}

/** 15 cases per weapon: three plain aims, both winds, player 1, a move, six extreme aims, and two on flat ground. */
export function shotCases(): ShotCase[] {
  const out: ShotCase[] = [];
  const add = (w: string, board: "hills" | "flat", shooter: 0 | 1, wind: number, move: -1 | 0 | 1, angle: number, power: number): void => {
    out.push({ id: `${w}|${board}|p${shooter}|w${wind}|m${move}|${angle}/${power}`, w, board, shooter, wind, move, angle, power });
  };
  for (const { id: w } of ROSTER) {
    for (const [a, p] of [[35, 70], [50, 80], [65, 95]]) add(w, "hills", 0, 0, 0, a, p);
    add(w, "hills", 0, 40, 0, 50, 80);
    add(w, "hills", 0, -40, 0, 50, 80);
    add(w, "hills", 1, 0, 0, 130, 80);
    add(w, "hills", 0, 0, 1, 55, 75);
    for (const [a, p] of [[0, 100], [180, 100], [90, 0], [90, 100], [2, 30], [178, 30]]) add(w, "hills", 0, 0, 0, a, p);
    add(w, "flat", 0, 0, 0, 45, 60);
    add(w, "flat", 0, 0, 0, 0, 60); // volleys leave below the horizon; a beam cuts straight down to the floor
  }
  return out;
}

/** "hills": the corpus seed's terrain, tanks at spawn. "flat": y = 400, tanks at 300 / 700. Battle phase. */
function board(which: "hills" | "flat"): MatchState {
  const m = createMatch(CORPUS_SEED, CORPUS_SETTINGS);
  m.phase = "battle";
  if (which === "flat") {
    m.terrain.height.fill(400);
    spansFromHeight(m.terrain);
    m.tankX[0] = 300;
    m.tankX[1] = 700;
  }
  return m;
}

/** FNV-1a over the heightfield, tank x and moves left: what a shot can change besides the scores. */
export function hashBoard(m: MatchState): string {
  let h = FNV_OFFSET;
  for (let x = 0; x < m.terrain.height.length; x++) h = fnvFold(h, m.terrain.height[x]);
  for (const v of [m.tankX[0], m.tankX[1], m.movesLeft[0], m.movesLeft[1]]) h = fnvFold(h, v);
  return fnvHex(h);
}

export interface Fingerprint { board: string; points: number[] }

/** Every case's fingerprint, by id. `onTurn` sees each shot case's Timeline (Node-only coverage checks). */
export function runCorpus(onTurn?: (c: ShotCase, tl: Timeline) => void): Record<string, Fingerprint> {
  const bases = { hills: board("hills"), flat: board("flat") };
  const res: Record<string, Fingerprint> = {};
  for (const c of shotCases()) {
    const m = cloneMatch(bases[c.board]);
    m.shooter = c.shooter;
    m.wind = c.wind;
    const tl = resolveTurn(m, { move: c.move, weapon: ROSTER_INDEX[c.w], angle: c.angle, power: c.power });
    res[c.id] = { board: hashBoard(m), points: [tl.points[0], tl.points[1]] };
    if (onTurn) onTurn(c, tl);
  }
  {
    // a shell that crosses x in (-1, 0): off the world since Plan 2A's floor fix
    const m = createMatch(777, CORPUS_SETTINGS);
    m.phase = "battle";
    m.shooter = 0;
    const tl = resolveTurn(m, { move: 0, weapon: ROSTER_INDEX.railshot, angle: 129, power: 10 });
    res["special|left-edge|seed777|railshot|129/10"] = { board: hashBoard(m), points: [tl.points[0], tl.points[1]] };
  }
  for (const win of [false, true]) {
    // a whole tied match on low flat ground (everything shot off the world), then sudden death: missed, or won by a direct hit
    const m = createMatch(5, CORPUS_SETTINGS);
    while (m.phase === "draft") applyPick(m, m.poolOwner.findIndex((o) => o === -1));
    m.terrain.height.fill(450);
    spansFromHeight(m.terrain);
    const away = () => ({
      move: 0 as const,
      w: m.phase === "suddenDeath" ? SUDDEN_DEATH_WEAPON : m.hands[m.shooter][0],
      angle: m.shooter === 0 ? 180 : 0,
      power: 100,
    });
    while (m.phase === "battle") applyTurn(m, away());
    if (win) applyTurn(m, { move: 0, w: SUDDEN_DEATH_WEAPON, angle: m.shooter === 0 ? 45 : 135, power: 72 });
    while (m.phase === "suddenDeath") applyTurn(m, away());
    res[`match|sudden-death-${win ? "win" : "draw"}`] = { board: hashBoard(m), points: [m.scores[0], m.scores[1], m.winner, m.shotsFired] };
  }
  return res;
}

/** One hex digest over every case, in id order: what the browsers must reproduce. */
export function corpusDigest(res: Record<string, Fingerprint>): string {
  let h = FNV_OFFSET;
  for (const id of Object.keys(res).sort()) {
    for (let i = 0; i < id.length; i++) h = fnvFold(h, id.charCodeAt(i));
    h = fnvFold(h, parseInt(res[id].board, 16));
    for (const p of res[id].points) h = fnvFold(h, p);
  }
  return fnvHex(h);
}
```

- [ ] **Step 3: Write the corpus test** `src/game/titles/arcfire/corpus.test.ts`.
  - This is the design's test minus three kinds of check that need Plan 2A types: the static-bound checks (`tl.steps`, `maxShells`, `maxTurnSteps`), the horizon check (`ShellPath.parent`), and the event-kind and beam gates.
  - Task 5 replaces the file with the design's full version.

```ts
// src/game/titles/arcfire/corpus.test.ts
//
// Pins every roster weapon's behaviour, case by case (the corpus in
// src/game/test/arcfire/corpus.ts), plus each weapon's definition. Cases are
// keyed by weapon id, so a roster append only ADDS keys. Update modes (the
// variable set to exactly one of):
//   UPDATE_ARCFIRE_CORPUS=add   write new keys only; every existing key must still match
//   UPDATE_ARCFIRE_CORPUS=1     rewrite everything — only for a declared, reviewed re-pin
// On a mismatch the failure lists each moved case with its old and new fingerprint.
import { describe, it, expect } from "vitest";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { FNV_OFFSET, fnvFold, fnvHex } from "@/game/sim/hash";
import { runCorpus, corpusDigest, type Fingerprint } from "@/game/test/arcfire/corpus";
import { ROSTER } from "./weapons/roster";
import { MAX_FLIGHT_STEPS } from "./constants";
import type { WeaponDef } from "./weapons/types";

const FIXTURE = join("src/game/titles/arcfire/corpus.golden.json");

/** Canonical JSON (sorted keys, no `power`) of a def, FNV-1a'd: pins every behaviour number of the def. */
function defDigest(def: WeaponDef): string {
  const canon = (v: unknown): string => {
    if (Array.isArray(v)) return `[${v.map(canon).join(",")}]`;
    if (v !== null && typeof v === "object") {
      const o = v as Record<string, unknown>;
      return `{${Object.keys(o).filter((k) => k !== "power").sort().map((k) => `${JSON.stringify(k)}:${canon(o[k])}`).join(",")}}`;
    }
    return JSON.stringify(v);
  };
  const s = canon(def);
  let h = FNV_OFFSET;
  for (let i = 0; i < s.length; i++) h = fnvFold(h, s.charCodeAt(i));
  return fnvHex(h);
}

interface CorpusFixture { digest: string; defs: Record<string, string>; cases: Record<string, Fingerprint> }

describe("arcfire corpus", () => {
  it("reproduces every pinned case and weapon definition", () => {
    let capped = false;
    const cases = runCorpus((_c, tl) => {
      for (const s of tl.shells) if (s.points.length === 2 * (MAX_FLIGHT_STEPS + 1)) capped = true;
    });
    const defs = Object.fromEntries(ROSTER.map((w) => [w.id, defDigest(w)]));
    const fresh: CorpusFixture = { digest: corpusDigest(cases), defs, cases };

    // Not inert: the corpus exercises the flight cap. (The Plan 2A data model adds the
    // horizon, static-bound and event-kind gates to this test.)
    expect(capped, "a shell reached the per-shell flight cap").toBe(true);

    const mode = process.env.UPDATE_ARCFIRE_CORPUS;
    const old: CorpusFixture | null = existsSync(FIXTURE) ? JSON.parse(readFileSync(FIXTURE, "utf8")) : null;
    const moved = old
      ? Object.keys(old.cases).filter((id) => JSON.stringify(old.cases[id]) !== JSON.stringify(cases[id]))
        .map((id) => `${id}: ${JSON.stringify(old.cases[id])} -> ${JSON.stringify(cases[id] ?? null)}`)
        .concat(Object.keys(old.defs).filter((id) => old.defs[id] !== defs[id]).map((id) => `def ${id}: ${old.defs[id]} -> ${defs[id]}`))
      : [];
    if (mode === "1") console.log(`re-pinned ${moved.length} moved cases:\n${moved.join("\n")}`); // paste into the commit body
    if (mode === "1" || (mode === "add" && moved.length === 0)) writeFileSync(FIXTURE, JSON.stringify(fresh, null, 1) + "\n");
    expect(existsSync(FIXTURE), "create it once with UPDATE_ARCFIRE_CORPUS=1").toBe(true);
    if (mode !== "1") expect(moved, "moved cases").toEqual([]);
    const pinned: CorpusFixture = JSON.parse(readFileSync(FIXTURE, "utf8"));
    expect(Object.keys(cases).sort()).toEqual(Object.keys(pinned.cases).sort()); // no case missing or unpinned
    expect(defs).toEqual(pinned.defs);
    expect(fresh.digest).toBe(pinned.digest);
  });
});
```

- [ ] **Step 4: Run it to verify it fails**

Run: `npx vitest run src/game/titles/arcfire/corpus.test.ts`
Expected: FAIL with `create it once with UPDATE_ARCFIRE_CORPUS=1: expected false to be true`. The flight-cap gate before it already passes: some shell in the corpus reaches the 1,200-step cap.

- [ ] **Step 5: Generate the fixture once**

Run: `UPDATE_ARCFIRE_CORPUS=1 npx vitest run src/game/titles/arcfire/corpus.test.ts`
Expected: PASS, and `src/game/titles/arcfire/corpus.golden.json` is written.

- [ ] **Step 6: Transcription check — the corpus must match the validated prototype.**

Run: `node -e "const c=require('./src/game/titles/arcfire/corpus.golden.json');console.log(c.digest,Object.keys(c.cases).length,JSON.stringify(c.defs))"`
Expected, exactly:
`09403dbb 123 {"pulse":"e151d5df","pulse2":"1a588902","nova":"bcb156c7","needle":"086899c2","crater":"922e1cbf","triad":"7028d65d","fan":"635370e6","railshot":"30e47b0c"}`

If anything differs, **stop**: `corpus.ts` differs from Step 2. Delete the fixture, fix the file, and redo Step 5.

- [ ] **Step 7: Run it again without the variable**

Run: `npx vitest run src/game/titles/arcfire/corpus.test.ts`
Expected: PASS (1 test).

- [ ] **Step 8: Expose the corpus to the cross-engine bundle.** Replace `src/game/test/cross-engine/harness.entry.ts` with:

```ts
// src/game/test/cross-engine/harness.entry.ts
//
// esbuild bundles this into an IIFE injected into each Playwright browser.
// It exposes the SAME pure replay paths the Node verifier uses, so the
// cross-engine spec can assert every engine reproduces the Node golden
// hashes and the Arcfire corpus digest. Lives under src/game/test/**
// (outside the purity roots), so the `window` reference here is allowed.
import { runReplay, type Replay } from "@/game/titles/circle-td/replay";
import { circleTdTitle } from "@/game/titles/circle-td/title";
import { replayMatch, type ArcfireReplay } from "@/game/titles/arcfire/replay";
import { runCorpus, corpusDigest } from "@/game/test/arcfire/corpus";

declare global {
  interface Window {
    runGolden: (replay: Replay) => string;
    runArcfireGolden: (replay: ArcfireReplay) => string;
    runArcfireCorpus: () => string;
  }
}

window.runGolden = (replay: Replay): string => runReplay(replay, circleTdTitle).hash;

window.runArcfireGolden = (replay: ArcfireReplay): string => {
  const r = replayMatch(replay);
  return r.ok ? r.hash : `invalid@${r.atIndex}`;
};

window.runArcfireCorpus = (): string => corpusDigest(runCorpus());
```

- [ ] **Step 9: Make the cross-engine spec table-driven and add the corpus.** This closes spec §9.1's housekeeping item, the duplicated per-engine loops. One `PINS` table drives every engine; each engine launches once and checks every pin with soft assertions, so one run reports every divergence. Replace `e2e/cross-engine-determinism.spec.ts` with:

```ts
// e2e/cross-engine-determinism.spec.ts
//
// §10.1 cross-engine determinism gate. Bundles the pure sim once with
// esbuild, then in Chromium, Firefox and WebKit recomputes every committed
// determinism pin and asserts each engine reproduces the Node value: Circle
// TD's golden, Arcfire's golden and the Arcfire corpus digest. Catches the
// single largest board-correctness risk: an honest Safari/Firefox run
// rejected by the V8 verifier over a ULP divergence.
//
// One table (PINS) drives every engine, so adding a pin is one row.
//
// Run via the dedicated playwright.cross-engine.config.ts (no webServer —
// this spec never touches the Next.js app, it launches each browser engine
// directly and injects the bundled sim into a blank page). See that config
// file's header comment for why it's separate from playwright.config.ts.
import { test, expect, chromium, firefox, webkit, type BrowserType, type Page } from "@playwright/test";
import { build } from "esbuild";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, "utf8")) as T;
const circleGolden = readJson<{ replay: unknown; hash: string }>("src/game/test/determinism.golden.json");
const arcfireGolden = readJson<{ replay: unknown; hash: string }>("src/game/titles/arcfire/determinism.golden.json");
const arcfireCorpus = readJson<{ digest: string }>("src/game/titles/arcfire/corpus.golden.json");

/** Every pin an engine must reproduce: its name, the committed Node value, and how the page computes it. */
const PINS: Array<{ label: string; expected: string; run: (page: Page) => Promise<string> }> = [
  {
    label: "Circle TD golden",
    expected: circleGolden.hash,
    run: (page) => page.evaluate((replay) => window.runGolden(replay as never), circleGolden.replay),
  },
  {
    label: "Arcfire golden",
    expected: arcfireGolden.hash,
    run: (page) => page.evaluate((replay) => window.runArcfireGolden(replay as never), arcfireGolden.replay),
  },
  {
    label: "Arcfire corpus digest",
    expected: arcfireCorpus.digest,
    run: (page) => page.evaluate(() => window.runArcfireCorpus()),
  },
];

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
  test(`${name} reproduces every Node determinism pin`, async () => {
    const js = await bundle();
    const browser = await engine.launch();
    try {
      const page = await browser.newPage();
      await page.addScriptTag({ content: js });
      for (const pin of PINS) expect.soft(await pin.run(page), `${name} must reproduce the ${pin.label}`).toBe(pin.expected);
    } finally {
      await browser.close();
    }
  });
}
```

- [ ] **Step 10: Run the cross-engine gate**

Run: `npm run test:e2e:cross-engine -- --grep-invert firefox`
Expected: exit 0, `2 passed`.
- `chromium reproduces every Node determinism pin` and `webkit reproduces every Node determinism pin` pass. Between them they check the Circle TD golden `5167b43d`, the Arcfire golden `63222780` and the corpus digest `09403dbb`.
- Firefox is left out locally because it cannot launch on this Windows machine (`browserType.launch: spawn UNKNOWN`, the known environment issue). CI's `browser-smokes` job runs all three engines.
- Any failure, including any hash mismatch, is real: stop and investigate.

- [ ] **Step 11: Run the Arcfire gate, types and the full suite**

Run: `npx vitest run src/game/titles/arcfire src/game/sim/purity.test.ts`
Expected: PASS: 15 files, 92 tests.

Run: `npx tsc --noEmit`
Expected: exit 0.

Run: `npm test`
Expected: all pass (10 skipped, as before).

- [ ] **Step 12: Commit**

```bash
git add src/game/test/arcfire/corpus.ts src/game/titles/arcfire/corpus.test.ts src/game/titles/arcfire/corpus.golden.json src/game/test/cross-engine/harness.entry.ts e2e/cross-engine-determinism.spec.ts
git commit -m "test(arcfire): per-weapon corpus (09403dbb, 123 cases) + table-driven cross-engine gate" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 2: `MatchSettings.rosterSize` + the append-proof golden

**Files:**
- Modify: `src/game/titles/arcfire/state.ts` (one field)
- Modify: `src/game/titles/arcfire/match.ts` (validation + prefix draft)
- Modify: `src/game/titles/arcfire/hash.ts` (one fold, step B)
- Modify: `src/game/test/arcfire/corpus.ts` (`CORPUS_SETTINGS`)
- Modify (tests): `hash.test.ts`, `match.test.ts`, `replay.test.ts`, `resolve.test.ts`, `tanks.test.ts`, `determinism.test.ts`, all in `src/game/titles/arcfire/`
- Modify (fixture, regenerated): `src/game/titles/arcfire/determinism.golden.json`

**Interfaces:**
- Consumes: Plan 1's `createMatch`, `drawPool`, `hashMatch`, `ROSTER`.
- Produces:
  - `MatchSettings.rosterSize: number`, required. The pool is drawn from `ROSTER.slice(0, rosterSize)`.
  - `createMatch` throws `RangeError` unless `rosterSize` is an integer in [`poolSize`, `ROSTER.length`].
  - `hashMatch` folds `s.rosterSize` right after `s.guaranteeTags.length`.
  - Every test settings literal carries `rosterSize: 8`, so Plan 1's pinned matches stay on Plan 1's eight weapons forever.

**Two steps, two commits, one cause each:**
- **Step A** plumbs the field with **no** fold. It must reproduce `63222780` with a settings-only fixture diff, which proves the plumbing inert.
- **Step B** folds it into the hash: the golden goes to `4c1d8598`, the windless pin to `8d7dc831`, and the corpus (which never hashes settings) does not move.

- [ ] **Step 1: Give every test settings literal `rosterSize: 8`** (seven one-line edits).

In `src/game/titles/arcfire/hash.test.ts`, replace

```ts
const SMALL: MatchSettings = { weaponsEach: 3, poolSize: 8, wind: false, guaranteeTags: [] };
```

with

```ts
const SMALL: MatchSettings = { weaponsEach: 3, poolSize: 8, wind: false, guaranteeTags: [], rosterSize: 8 };
```

In `src/game/titles/arcfire/match.test.ts`, replace

```ts
const SMALL: MatchSettings = { weaponsEach: 3, poolSize: 8, wind: false, guaranteeTags: [] };
```

with

```ts
const SMALL: MatchSettings = { weaponsEach: 3, poolSize: 8, wind: false, guaranteeTags: [], rosterSize: 8 };
```

In `src/game/titles/arcfire/resolve.test.ts`, replace

```ts
const SMALL: MatchSettings = { weaponsEach: 3, poolSize: 8, wind: false, guaranteeTags: [] };
```

with

```ts
const SMALL: MatchSettings = { weaponsEach: 3, poolSize: 8, wind: false, guaranteeTags: [], rosterSize: 8 };
```

In `src/game/titles/arcfire/tanks.test.ts`, replace

```ts
const SMALL: MatchSettings = { weaponsEach: 3, poolSize: 8, wind: false, guaranteeTags: [] };
```

with

```ts
const SMALL: MatchSettings = { weaponsEach: 3, poolSize: 8, wind: false, guaranteeTags: [], rosterSize: 8 };
```

In `src/game/titles/arcfire/replay.test.ts`, replace

```ts
const SMALL: MatchSettings = { weaponsEach: 3, poolSize: 8, wind: true, guaranteeTags: [] };
```

with

```ts
const SMALL: MatchSettings = { weaponsEach: 3, poolSize: 8, wind: true, guaranteeTags: [], rosterSize: 8 };
```

In `src/game/titles/arcfire/determinism.test.ts`, replace

```ts
const SETTINGS: MatchSettings = { weaponsEach: 4, poolSize: 8, wind: true, guaranteeTags: ["VOLLEY"] };
```

with

```ts
const SETTINGS: MatchSettings = { weaponsEach: 4, poolSize: 8, wind: true, guaranteeTags: ["VOLLEY"], rosterSize: 8 };
```

In `src/game/test/arcfire/corpus.ts`, replace

```ts
export const CORPUS_SETTINGS: MatchSettings = { weaponsEach: 3, poolSize: 8, wind: false, guaranteeTags: [] };
```

with

```ts
export const CORPUS_SETTINGS: MatchSettings = { weaponsEach: 3, poolSize: 8, wind: false, guaranteeTags: [], rosterSize: 8 };
```

- [ ] **Step 2: Write the failing `rosterSize` tests in `match.test.ts`** (three edits).

In `src/game/titles/arcfire/match.test.ts`, insert directly after

```ts
import type { Tag } from "./weapons/types";
```

these lines:

```ts
import { ROSTER } from "./weapons/roster";
```

The "keeps a private, frozen copy" test must also prove `rosterSize` is copied and frozen:

In `src/game/titles/arcfire/match.test.ts`, replace

```ts
    const settings: { weaponsEach: number; poolSize: number; wind: boolean; guaranteeTags: Tag[] } = {
      weaponsEach: 3, poolSize: 8, wind: false, guaranteeTags: ["BLAST"],
    };
    const m = createMatch(4, settings);
    settings.weaponsEach = 4;
    settings.wind = true;
    settings.guaranteeTags.push("SPLIT");
    expect(m.settings).toEqual({ weaponsEach: 3, poolSize: 8, wind: false, guaranteeTags: ["BLAST"] });
```

with

```ts
    const settings: { weaponsEach: number; poolSize: number; wind: boolean; guaranteeTags: Tag[]; rosterSize: number } = {
      weaponsEach: 3, poolSize: 8, wind: false, guaranteeTags: ["BLAST"], rosterSize: 8,
    };
    const m = createMatch(4, settings);
    settings.weaponsEach = 4;
    settings.wind = true;
    settings.guaranteeTags.push("SPLIT");
    settings.rosterSize = 9;
    expect(m.settings).toEqual({ weaponsEach: 3, poolSize: 8, wind: false, guaranteeTags: ["BLAST"], rosterSize: 8 });
```

In `src/game/titles/arcfire/match.test.ts`, insert directly after

```ts
  it("rejects a pool too small to finish the draft", () => {
    expect(() => createMatch(1, { ...SMALL, poolSize: 5 })).toThrow(RangeError);
  });
```

these lines:

```ts
  it("rejects a rosterSize below poolSize, above the roster, or not an integer", () => {
    expect(() => createMatch(1, { ...SMALL, rosterSize: 7 })).toThrow(RangeError);
    expect(() => createMatch(1, { ...SMALL, rosterSize: ROSTER.length + 1 })).toThrow(RangeError);
    expect(() => createMatch(1, { ...SMALL, poolSize: 6, rosterSize: 7.5 })).toThrow(RangeError);
  });
  it("draws the pool from the roster prefix ROSTER[0, rosterSize)", () => {
    for (let seed = 0; seed < 20; seed++) {
      expect(createMatch(seed, { ...SMALL, poolSize: 6, rosterSize: 6 }).pool).toEqual([0, 1, 2, 3, 4, 5]);
    }
  });
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/game/titles/arcfire`
Expected: FAIL, exactly 3 tests:
- `match.test.ts > createMatch > rejects a rosterSize below poolSize, above the roster, or not an integer`: `expected function to throw an error, but it didn't`
- `match.test.ts > createMatch > draws the pool from the roster prefix ROSTER[0, rosterSize)`: `expected [ 1, 3, 4, 5, 6, 7 ] to deeply equal [ +0, 1, 2, 3, 4, 5 ]`
- `determinism.test.ts > arcfire golden determinism > replays the generated log to the pinned golden hash`: `expected { seed: 20260922, …(2) } to deeply equal { seed: 20260922, …(2) }`. The generated replay's settings now carry `rosterSize`, and the fixture's do not yet.

- [ ] **Step 4: Add the field** to `MatchSettings` in `src/game/titles/arcfire/state.ts`:

In `src/game/titles/arcfire/state.ts`, replace

```ts
  guaranteeTags: readonly Tag[]; // the pool always holds >= 1 weapon of each (spec: BLAST, SPLIT, DIRT)
}
```

with

```ts
  guaranteeTags: readonly Tag[]; // the pool always holds >= 1 weapon of each (spec: BLAST, SPLIT, DIRT)
  rosterSize: number; // the pool is drawn from ROSTER[0, rosterSize): pins a match to a roster prefix, so appends never move it
}
```

- [ ] **Step 5: Validate it and draft from the prefix** in `src/game/titles/arcfire/match.ts` (these are the only two changes to `createMatch`):

In `src/game/titles/arcfire/match.ts`, replace

```ts
    throw new RangeError(`createMatch: poolSize ${settings.poolSize} < 2 × weaponsEach ${settings.weaponsEach}`);
  }
```

with

```ts
    throw new RangeError(`createMatch: poolSize ${settings.poolSize} < 2 × weaponsEach ${settings.weaponsEach}`);
  }
  if (!Number.isInteger(settings.rosterSize) || settings.rosterSize < settings.poolSize || settings.rosterSize > ROSTER.length) {
    throw new RangeError(`createMatch: rosterSize ${settings.rosterSize} must be an integer in [poolSize, ${ROSTER.length}]`);
  }
```

In `src/game/titles/arcfire/match.ts`, replace

```ts
  const pool = drawPool(rng, ROSTER, own.poolSize, own.guaranteeTags);
```

with

```ts
  const pool = drawPool(rng, ROSTER.slice(0, own.rosterSize), own.poolSize, own.guaranteeTags);
```

- [ ] **Step 6: Run the tests**

Run: `npx vitest run src/game/titles/arcfire`
Expected: exactly 1 failure, the same `determinism.test.ts` settings mismatch. Everything else passes, including the windless pin `1c8832e9` and the corpus.

- [ ] **Step 7: Re-pin step A (plumbing only) and prove it inert.**

Run: `UPDATE_ARCFIRE_GOLDEN=1 npx vitest run src/game/titles/arcfire/determinism.test.ts`
Expected: PASS.

Run: `node -e "const g=require('./src/game/titles/arcfire/determinism.golden.json');console.log(g.hash,JSON.stringify(g.scores),g.winner,g.replay.commands.length)"`
Expected, exactly: `63222780 [32,84] 1 16`

Run: `git diff src/game/titles/arcfire/determinism.golden.json`
Expected: exactly this hunk and nothing else. The hash, scores, winner and all 16 commands are untouched:

```diff
       "guaranteeTags": [
         "VOLLEY"
-      ]
+      ],
+      "rosterSize": 8
     },
```

If the hash moved or anything else changed, **stop**: the plumbing is not inert.

- [ ] **Step 8: Run the Arcfire gate and types**

Run: `npx vitest run src/game/titles/arcfire src/game/sim/purity.test.ts`
Expected: PASS: 15 files, 94 tests.

Run: `npx tsc --noEmit`
Expected: exit 0.

Run: `node -e "console.log(require('./src/game/titles/arcfire/corpus.golden.json').digest)"`
Expected: `09403dbb` (the corpus test also passed above).

- [ ] **Step 9: Commit step A**

```bash
git add src/game/titles/arcfire/state.ts src/game/titles/arcfire/match.ts src/game/test/arcfire/corpus.ts src/game/titles/arcfire/hash.test.ts src/game/titles/arcfire/match.test.ts src/game/titles/arcfire/replay.test.ts src/game/titles/arcfire/resolve.test.ts src/game/titles/arcfire/tanks.test.ts src/game/titles/arcfire/determinism.test.ts src/game/titles/arcfire/determinism.golden.json
git commit -m "feat(arcfire): MatchSettings.rosterSize (validated; the pool is drawn from ROSTER[0, rosterSize)); golden unchanged 63222780" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 10: Write the failing hash test (step B).** A settings change alone, with nothing played, must change the hash:

In `src/game/titles/arcfire/hash.test.ts`, insert directly after

```ts
    expect(after((m) => { m.rng.state ^= 1; })).not.toBe(h);
```

these lines:

```ts
    expect(after((m) => { m.settings = { ...m.settings, rosterSize: 7 }; })).not.toBe(h); // settings alone, nothing played
```

- [ ] **Step 11: Run it to verify it fails**

Run: `npx vitest run src/game/titles/arcfire/hash.test.ts`
Expected: FAIL: `hashMatch > changes when any part of the state changes` with `expected '1a3fcf0a' not to be '1a3fcf0a'`.

- [ ] **Step 12: Fold the field** into `hashMatch` (`src/game/titles/arcfire/hash.ts`). The position, right after `guaranteeTags.length`, is part of the transcription check:

In `src/game/titles/arcfire/hash.ts`, replace

```ts
    s.weaponsEach, s.poolSize, s.wind ? 1 : 0, s.guaranteeTags.length,
```

with

```ts
    s.weaponsEach, s.poolSize, s.wind ? 1 : 0, s.guaranteeTags.length, s.rosterSize,
```

- [ ] **Step 13: Run the suite: only the two declared hash pins may fail**

Run: `npx vitest run src/game/titles/arcfire`
Expected: FAIL, exactly 2 tests:
- `determinism.test.ts`: `expected '4c1d8598' to be '63222780'`
- `match.test.ts > a windless match > plays a scripted game to a pinned hash`: `expected '8d7dc831' to be '1c8832e9'`

Anything else failing is a bug: stop.

- [ ] **Step 14: Re-pin step B**

Run: `UPDATE_ARCFIRE_GOLDEN=1 npx vitest run src/game/titles/arcfire/determinism.test.ts`
Expected: PASS.

Run: `node -e "const g=require('./src/game/titles/arcfire/determinism.golden.json');console.log(g.hash,JSON.stringify(g.scores),g.winner,g.replay.commands.length)"`
Expected, exactly: `4c1d8598 [32,84] 1 16`

Run: `git diff src/game/titles/arcfire/determinism.golden.json`
Expected: only the `"hash"` line changes, `63222780` → `4c1d8598`.

Then update the windless literal by hand. Its scores `[36, 24]` and winner 0 do not change:

In `src/game/titles/arcfire/match.test.ts`, replace

```ts
    expect(hashMatch(m)).toBe("1c8832e9");
```

with

```ts
    expect(hashMatch(m)).toBe("8d7dc831");
```

- [ ] **Step 15: Run the Arcfire gate, types and the full suite**

Run: `npx vitest run src/game/titles/arcfire src/game/sim/purity.test.ts`
Expected: PASS: 15 files, 94 tests. The corpus test passes unchanged at `09403dbb`.

Run: `npx tsc --noEmit`
Expected: exit 0.

Run: `npm test`
Expected: all pass.

- [ ] **Step 16: Run the cross-engine gate**

Run: `npm run test:e2e:cross-engine -- --grep-invert firefox`
Expected: exit 0, `2 passed`. Chromium and WebKit reproduce `5167b43d`, `4c1d8598` and `09403dbb` (Firefox runs in CI).

- [ ] **Step 17: Commit step B**

```bash
git add src/game/titles/arcfire/hash.ts src/game/titles/arcfire/hash.test.ts src/game/titles/arcfire/match.test.ts src/game/titles/arcfire/determinism.golden.json
git commit -m "feat(arcfire): fold rosterSize into hashMatch" -m "Re-pin, one cause (the fold): golden 63222780 -> 4c1d8598 (scores [32, 84], winner 1, commands unchanged); windless 1c8832e9 -> 8d7dc831 ([36, 24], winner 0); corpus 09403dbb unchanged." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 3: Exact-distance damage

**Files:**
- Modify: `src/game/titles/arcfire/damage.ts` (full replacement, design-verbatim)
- Modify: `src/game/titles/arcfire/damage.test.ts` (full replacement, design-verbatim; Plan 1's four cases unchanged)
- Modify: `src/game/titles/arcfire/resolve.test.ts` (the Fan literal)
- Modify (fixtures, regenerated): `determinism.golden.json`, `corpus.golden.json`

**Interfaces:**
- Consumes: `Blast` (`weapons/types.ts`), `isqrt` (`imath.ts`), `TANK_HIT_R`.
- Produces: `blastDamage(blast: Blast, bx: number, by: number, tx: number, ty: number): number`. The signature is unchanged; the value is now exact.
  - With `s` the true centre distance and `d = max(0, s − 14)`: linear `⌊D(R − d)/R⌋`, quadratic `⌊D(R² − d²)/R²⌋`, for `d < R`.
  - It returns 0 when `radius <= 0 || damage <= 0` (the divisor guard).

**Why:** spec §9.1's optional item, adopted (the design's D12). Plan 1 floored the centre distance and overstated damage by up to 17 points (Needle at offset (21, 9): 39 against an exact 23). The exact form is integer-only and has a proof in the file's header. It can only lower a value, so the inertness rule for this re-pin is "scores only go down".

- [ ] **Step 1: Replace the damage test** `src/game/titles/arcfire/damage.test.ts` with (design-verbatim):

```ts
import { describe, it, expect } from "vitest";
import { blastDamage } from "./damage";
import { TANK_HIT_R } from "./constants";
import { ROSTER } from "./weapons/roster";
import type { Blast } from "./weapons/types";

/** The exact damage in BigInt: the largest n with n <= the real formula, by bisection. (BigInt(...) calls: the repo targets ES2017, which has no 0n literals.) */
function reference(b: Blast, dx: number, dy: number): number {
  const q = BigInt(dx * dx + dy * dy);
  const R = BigInt(b.radius);
  const D = BigInt(b.damage);
  const H = BigInt(TANK_HIT_R);
  const zero = BigInt(0);
  if (q >= (R + H) * (R + H)) return 0;
  if (q <= H * H) return b.damage;
  const ok = (n: bigint): boolean => {
    if (b.falloff === "quadratic") { // n·R^2 <= D(R^2 - q - 196) + 28·D·s
      const need = n * R * R - D * (R * R - q - H * H);
      return need <= zero || BigInt(784) * D * D * q >= need * need;
    }
    const room = D * (R + H) - n * R; // n·R <= D(R + 14) - D·s
    return room >= zero && D * D * q <= room * room;
  };
  let lo = zero;
  let hi = D;
  while (lo < hi) {
    const mid = (lo + hi + BigInt(1)) / BigInt(2);
    if (ok(mid)) lo = mid;
    else hi = mid - BigInt(1);
  }
  return Number(lo);
}

/** Plan 1's floored-distance formula, for comparison. */
function floored(b: Blast, dx: number, dy: number): number {
  const c = Math.floor(Math.sqrt(dx * dx + dy * dy));
  const d = c > TANK_HIT_R ? c - TANK_HIT_R : 0;
  const r = b.radius;
  if (d >= r) return 0;
  return b.falloff === "quadratic" ? Math.trunc((b.damage * (r * r - d * d)) / (r * r)) : Math.trunc((b.damage * (r - d)) / r);
}

function rosterBlasts(): Blast[] {
  const out: Blast[] = [];
  const walk = (v: unknown): void => {
    if (!v || typeof v !== "object") return;
    const o = v as Record<string, unknown>;
    if (typeof o.radius === "number" && typeof o.damage === "number" && !("kind" in o)) out.push(o as unknown as Blast);
    for (const x of Object.values(o)) walk(x);
  };
  walk(ROSTER);
  return out;
}

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
  it("is exact at non-integer distances (Plan 1's floored distance overstated these)", () => {
    const needle = { radius: 10, damage: 110, falloff: "quadratic" as const };
    expect(blastDamage(needle, 0, 0, 21, 9)).toBe(23); // floored: 39
    expect(blastDamage(needle, 0, 0, 19, 5)).toBe(74); // floored: 82
    expect(blastDamage(pulse, 0, 0, 20, 5)).toBe(30); // floored: 31
  });
  it("equals a BigInt reference for every roster blast over its whole reach, and never exceeds the floored value", () => {
    let samples = 0;
    for (const b of rosterBlasts()) {
      const k = b.radius + TANK_HIT_R + 1;
      for (let dx = 0; dx <= k; dx++) {
        for (let dy = 0; dy <= k; dy++) {
          const got = blastDamage(b, 0, 0, dx, dy);
          expect(got).toBe(reference(b, dx, dy));
          expect(got).toBeLessThanOrEqual(floored(b, dx, dy));
          samples++;
        }
      }
    }
    expect(samples).toBeGreaterThan(20000); // 28,780 with Plan 1's eight weapons, 81,276 with all 32
  });
  it("deals nothing for a non-positive radius or damage (the divisor guard)", () => {
    expect(blastDamage({ radius: 0, damage: 40 }, 0, 0, 0, 0)).toBe(0);
    expect(blastDamage({ radius: 28, damage: 0 }, 0, 0, 0, 0)).toBe(0);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/game/titles/arcfire/damage.test.ts`
Expected: FAIL, exactly 2 tests; the other 5 pass:
- `is exact at non-integer distances (Plan 1's floored distance overstated these)`: `expected 39 to be 23`
- `equals a BigInt reference for every roster blast over its whole reach, and never exceeds the floored value`: `expected 40 to be 39`

- [ ] **Step 3: Replace** `src/game/titles/arcfire/damage.ts` with (design-verbatim):

```ts
// src/game/titles/arcfire/damage.ts
//
// Blast damage to one tank (spec §3.3), integer-only and EXACT. With s the
// true (real) distance from the blast centre to the tank's hitbox centre and
// d = max(0, s - TANK_HIT_R) the distance to the hitbox edge:
//   linear     floor(D * (R - d) / R)
//   quadratic  floor(D * (R^2 - d^2) / R^2)
// for d < R, else 0. s is irrational in general, so each formula is split
// into an integer part plus one isqrt term. Flooring that term first is exact:
// for an integer a, a real u in [a, a + 1) and an integer m >= 1,
// floor(u / m) = floor(a / m), because no multiple of m lies inside (a, a + 1).
import type { Blast } from "./weapons/types";
import { isqrt } from "./imath";
import { TANK_HIT_R } from "./constants";

export function blastDamage(blast: Blast, bx: number, by: number, tx: number, ty: number): number {
  const r = blast.radius;
  const D = blast.damage;
  if (r <= 0 || D <= 0) return 0; // divisor guard: bad data deals nothing (the roster validator rejects it)
  const dx = bx - tx;
  const dy = by - ty;
  const q = dx * dx + dy * dy; // s^2
  const k = r + TANK_HIT_R;
  if (q >= k * k) return 0; // d >= R
  if (q <= TANK_HIT_R * TANK_HIT_R) return D; // the blast centre is inside the hitbox: d = 0
  if (blast.falloff === "quadratic") {
    // D(R^2 - d^2) = D(R^2 - q - 196) + 28·D·s, and floor(28·D·s) = isqrt(784·D^2·q)
    const a = D * (r * r - q - TANK_HIT_R * TANK_HIT_R);
    return Math.floor((a + isqrt(4 * TANK_HIT_R * TANK_HIT_R * D * D * q)) / (r * r));
  }
  // D(R - d) = D·k - D·s, and ceil(D·s) = ceil(sqrt(D^2·q))
  const d2q = D * D * q;
  const fs = isqrt(d2q);
  return Math.floor((D * k - (fs * fs === d2q ? fs : fs + 1)) / r);
}
```

- [ ] **Step 4: Run the damage test**

Run: `npx vitest run src/game/titles/arcfire/damage.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Run the suite: only the declared set may fail**

Run: `npx vitest run src/game/titles/arcfire`
Expected: FAIL, exactly 3 tests:
- `determinism.test.ts`: `expected '389a1340' to be '4c1d8598'`
- `resolve.test.ts > resolveTurn > lands a Fan volley on the opponent: one terminal event per shell`: `expected [ 50, +0 ] to deeply equal [ 51, +0 ]`
- `corpus.test.ts`: `moved cases: expected [ …(4) ] to deeply equal []`

The windless pin `8d7dc831` must **not** fail. Anything else failing is a bug: stop.

- [ ] **Step 6: Re-pin the golden and check it is inert apart from damage**

Run: `UPDATE_ARCFIRE_GOLDEN=1 npx vitest run src/game/titles/arcfire/determinism.test.ts`
Expected: PASS.

Run: `node -e "const g=require('./src/game/titles/arcfire/determinism.golden.json');console.log(g.hash,JSON.stringify(g.scores),g.winner,g.replay.commands.length)"`
Expected, exactly: `389a1340 [31,83] 1 16`

Run: `git diff src/game/titles/arcfire/determinism.golden.json`
Expected: only the `"hash"` line (`4c1d8598` → `389a1340`) and the two score lines (`32` → `31`, `84` → `83`) change.
- The command log is identical and the winner is unchanged.
- Each score is ≤ its old value, as the damage test proves for every roster blast.

- [ ] **Step 7: Re-pin the corpus and check the moved cases**

Run: `UPDATE_ARCFIRE_CORPUS=1 npx vitest run src/game/titles/arcfire/corpus.test.ts --reporter=verbose`
Expected: PASS, and the output prints `re-pinned 4 moved cases:` followed by exactly these four lines. Each has the same `board`, and its points are lower:

```
triad|hills|p0|w-40|m0|50/80: {"board":"966b6d9b","points":[37,0]} -> {"board":"966b6d9b","points":[36,0]}
triad|hills|p0|w0|m1|55/75: {"board":"045786a6","points":[52,0]} -> {"board":"045786a6","points":[50,0]}
fan|hills|p0|w0|m0|65/95: {"board":"09844853","points":[5,0]} -> {"board":"09844853","points":[4,0]}
fan|hills|p0|w-40|m0|50/80: {"board":"6a2fa253","points":[24,0]} -> {"board":"6a2fa253","points":[23,0]}
```

Run: `node -e "const c=require('./src/game/titles/arcfire/corpus.golden.json');console.log(c.digest,Object.keys(c.cases).length)"`
Expected, exactly: `655486aa 123`

- [ ] **Step 8: Update the Fan literal by hand**

In `src/game/titles/arcfire/resolve.test.ts`, replace

```ts
    expect(tl.points).toEqual([51, 0]);
```

with

```ts
    expect(tl.points).toEqual([50, 0]); // 51 under Plan 1's floored distance (exact damage, Plan 2A Task 3)
```

- [ ] **Step 9: Run the Arcfire gate, types and the full suite**

Run: `npx vitest run src/game/titles/arcfire src/game/sim/purity.test.ts`
Expected: PASS: 15 files, 97 tests.

Run: `npx tsc --noEmit`
Expected: exit 0.

Run: `npm test`
Expected: all pass.

- [ ] **Step 10: Run the cross-engine gate**

Run: `npm run test:e2e:cross-engine -- --grep-invert firefox`
Expected: exit 0, `2 passed`. Chromium and WebKit reproduce `5167b43d`, `389a1340` and `655486aa` (Firefox runs in CI).

- [ ] **Step 11: Commit**

```bash
git add src/game/titles/arcfire/damage.ts src/game/titles/arcfire/damage.test.ts src/game/titles/arcfire/resolve.test.ts src/game/titles/arcfire/determinism.golden.json src/game/titles/arcfire/corpus.golden.json
git commit -m "feat(arcfire): exact-distance blast damage (spec 9.1)" -m "Re-pin, one cause (exact damage; only ever lower): golden 4c1d8598 -> 389a1340, scores [32, 84] -> [31, 83], winner and commands unchanged; windless 8d7dc831 unchanged; resolve.test Fan [51, 0] -> [50, 0]; corpus 09403dbb -> 655486aa, exactly 4 cases, points only: triad|hills|p0|w-40|m0|50/80 [37,0]->[36,0], triad|hills|p0|w0|m1|55/75 [52,0]->[50,0], fan|hills|p0|w0|m0|65/95 [5,0]->[4,0], fan|hills|p0|w-40|m0|50/80 [24,0]->[23,0]." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 4: Ballistics carry-forwards — any-angle directions, floored pixels, unclamped volleys

**Files:**
- Modify: `src/game/titles/arcfire/aimTable.ts` (append `cosDeg`/`sinDeg`, design-verbatim)
- Modify: `src/game/titles/arcfire/imath.ts` (append `floorPx`/`ceilDiv`, design-verbatim)
- Modify: `src/game/titles/arcfire/ballistics.ts` (full replacement: Plan 1's file on `cosDeg`/`sinDeg` and `floorPx`)
- Modify: `src/game/titles/arcfire/resolve.ts` (four edits: drop the clamp, floor the recorded points)
- Modify (tests): `aimTable.test.ts`, `imath.test.ts`, `ballistics.test.ts`, `resolve.test.ts`
- Modify (fixture, regenerated): `corpus.golden.json`

**Interfaces:**
- Consumes: Plan 1's baked `COS`/`SIN` tables inside `aimTable.ts`, `idiv`.
- Produces:
  - `cosDeg(deg: number): Fx` and `sinDeg(deg: number): Fx`: Q16.16 directions for **any** integer angle (aim sense: 0 = right, 90 = up, 270 = down), by exact symmetry of the 91 baked literals. They equal `aimCos`/`aimSin` bit for bit on 0..180, and never return `-0`. `aimCos`/`aimSin` keep their clamp for existing callers.
  - `floorPx(f: number): number` (the pixel containing a Q16.16 coordinate) and `ceilDiv(a: number, b: number): number` (for `a >= 0`, `b >= 1`).
  - `muzzle` and `launchShell` accept any integer angle.
  - `stepShell` floors every position-to-pixel conversion.
  - `resolveTurn` fires volley shell `i` at `aim + offset(i)`, never clamped.

**Why:**
- **Spec §9.1:** volleys near 0°/180° stacked shells on one path (the design's D13), and `stepShell`'s toward-zero rounding made the left world edge effectively x = −1 (D14).
- **Both pins stay put:**
  - Only shells that cross x ∈ (−1, 0), and Triad/Fan aimed within 3°/6° of the horizon, change.
  - Exactly 11 corpus cases move, to digest `fa6b1ed7`.
  - Switching `muzzle` and the launch to `cosDeg`/`sinDeg` is inert for every legal command (equal on 0..180).

- [ ] **Step 1: Write the failing tests** (six edits).

In `src/game/titles/arcfire/aimTable.test.ts`, replace

```ts
import { aimCos, aimSin } from "./aimTable";
```

with

```ts
import { aimCos, aimSin, cosDeg, sinDeg } from "./aimTable";
```

Append to the end of `src/game/titles/arcfire/aimTable.test.ts` (after one blank line):

```ts
describe("cosDeg / sinDeg (any integer angle)", () => {
  it("equal aimCos / aimSin bit for bit on 0..180", () => {
    for (let d = 0; d <= 180; d++) {
      expect(cosDeg(d)).toBe(aimCos(d));
      expect(sinDeg(d)).toBe(aimSin(d));
    }
  });
  it("are exactly even / odd and 360-periodic, and never return -0", () => {
    for (let d = -400; d <= 400; d++) {
      expect(cosDeg(-d)).toBe(cosDeg(d));
      expect(sinDeg(-d)).toBe(-sinDeg(d) || 0);
      expect(cosDeg(d + 360)).toBe(cosDeg(d));
      expect(sinDeg(d + 360)).toBe(sinDeg(d));
      expect(Object.is(cosDeg(d), -0) || Object.is(sinDeg(d), -0)).toBe(false);
    }
  });
  it("points straight down at 270", () => {
    expect([cosDeg(270), sinDeg(270)]).toEqual([0, -65536]);
    expect([cosDeg(-90), sinDeg(-90)]).toEqual([0, -65536]);
  });
});
```

In `src/game/titles/arcfire/imath.test.ts`, replace

```ts
import { isqrt, clampInt, idiv } from "./imath";
```

with

```ts
import { isqrt, clampInt, idiv, floorPx, ceilDiv } from "./imath";
```

Append to the end of `src/game/titles/arcfire/imath.test.ts` (after one blank line):

```ts
describe("floorPx / ceilDiv", () => {
  it("floorPx is the pixel containing a Q16.16 coordinate (floor, not truncation toward zero)", () => {
    expect([0, 65535, 65536, -1, -65536, -65537].map(floorPx)).toEqual([0, 0, 1, -1, -1, -2]);
  });
  it("ceilDiv rounds a >= 0 up to a multiple of b >= 1", () => {
    expect(ceilDiv(0, 3)).toBe(0);
    expect(ceilDiv(6, 3)).toBe(2);
    expect(ceilDiv(7, 3)).toBe(3);
  });
});
```

This test builds a `Shell` literal. Task 5 turns it into a `shellAt(...)` call when `Shell` gains fields:

Append to the end of `src/game/titles/arcfire/ballistics.test.ts` (after one blank line):

```ts
describe("Plan 2A carry-forwards", () => {
  it("muzzle and launch take any integer angle, including below the horizon", () => {
    expect(muzzle(500, 300, -90)).toEqual({ x: 500, y: 300 + BARREL_LEN });
    expect(muzzle(500, 300, 270)).toEqual({ x: 500, y: 300 + BARREL_LEN });
    const down = launchShell(100, 100, -30, 50);
    expect(down.vy).toBeGreaterThan(0); // leaves downward
    expect(down.vx).toBe(launchShell(100, 100, 30, 50).vx);
  });
  it("floors pixels: a shell crossing x in (-1, 0) is off the world at column -1", () => {
    // x = 100/65536 px, moving left at 6 px/s: its first sample is at x ≈ -0.098 px
    const s: Shell = { x: 100, y: fromInt(100), vx: fromInt(-6), vy: 0, gravityStep: 0, steps: 0, alive: true };
    expect(stepShell(s, flat(400), [], 0)).toEqual({ kind: "out", x: -1, y: 100 });
    expect(s.alive).toBe(false);
  });
});
```

In `src/game/titles/arcfire/resolve.test.ts`, insert directly after

```ts
  it("fans a volley symmetrically around the aim", () => {
    const tl = resolveTurn(flatBattle(), { move: 0, weapon: ROSTER_INDEX.fan, angle: 45, power: 50 });
    expect(tl.shells.map((s) => s.angle)).toEqual([39, 42, 45, 48, 51]);
  });
```

these lines:

```ts
  it("never clamps a volley near the horizon: the fan stays symmetric about the aim", () => {
    const low = resolveTurn(flatBattle(), { move: 0, weapon: ROSTER_INDEX.fan, angle: 2, power: 30 });
    expect(low.shells.map((s) => s.angle)).toEqual([-4, -1, 2, 5, 8]);
    const high = resolveTurn(flatBattle(), { move: 0, weapon: ROSTER_INDEX.fan, angle: 178, power: 30 });
    expect(high.shells.map((s) => s.angle)).toEqual([172, 175, 178, 181, 184]);
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/game/titles/arcfire/aimTable.test.ts src/game/titles/arcfire/imath.test.ts src/game/titles/arcfire/ballistics.test.ts src/game/titles/arcfire/resolve.test.ts`
Expected: FAIL, exactly 8 tests:
- the three `cosDeg / sinDeg` tests: `TypeError: cosDeg is not a function`
- the two `floorPx / ceilDiv` tests: `TypeError: undefined is not a function` (from `.map(floorPx)`) and `TypeError: ceilDiv is not a function`
- `muzzle and launch take any integer angle, including below the horizon`: `expected { x: 522, y: 300 } to deeply equal { x: 500, y: 322 }`
- `floors pixels: a shell crossing x in (-1, 0) is off the world at column -1`: `expected null to deeply equal { kind: 'out', x: -1, y: 100 }`
- `never clamps a volley near the horizon: the fan stays symmetric about the aim`: `expected [ +0, +0, 2, 5, 8 ] to deeply equal [ -4, -1, 2, 5, 8 ]`

- [ ] **Step 3: Append the any-angle directions** (design-verbatim):

Append to the end of `src/game/titles/arcfire/aimTable.ts` (after one blank line):

```ts
const norm360 = (deg: number): number => {
  const d = (deg | 0) % 360;
  return d < 0 ? d + 360 : d;
};

/** Q16.16 cos of ANY integer angle (aim sense: 0 = right, 90 = up, 270 = down), by exact symmetry of the baked table. */
export const cosDeg = (deg: number): Fx => {
  const d = norm360(deg);
  return d <= 180 ? COS[d] : COS[360 - d];
};

/** Q16.16 sin of ANY integer angle; negative below the horizon. `0 - x`, so it never yields negative zero. */
export const sinDeg = (deg: number): Fx => {
  const d = norm360(deg);
  return d <= 180 ? SIN[d] : 0 - SIN[360 - d];
};
```

- [ ] **Step 4: Append the pixel helpers** (design-verbatim):

Append to the end of `src/game/titles/arcfire/imath.ts` (after one blank line):

```ts
/** The pixel containing a Q16.16 coordinate: floor, so x in (-1, 0) is column -1, off the world. Exact: f / 65536 is exact in binary64. */
export const floorPx = (f: number): number => Math.floor(f / 65536);

/** ceil(a / b) for integers a >= 0 and b >= 1. */
export const ceilDiv = (a: number, b: number): number => idiv(a + b - 1, b);
```

- [ ] **Step 5: Replace** `src/game/titles/arcfire/ballistics.ts`. This is Plan 1's file with three changes: `cosDeg`/`sinDeg` in place of `aimCos`/`aimSin`, `floorPx` in place of `toInt` at every position-to-pixel conversion in `stepShell` (the sample count, the samples and the cap point), and doc comments to match. `muzzle` keeps `toInt` for its offsets, which are mirror-symmetric.

```ts
// src/game/titles/arcfire/ballistics.ts
//
// Shell flight (spec §3.2): launch from the muzzle along an integer angle,
// then fixed 1/60 s steps of semi-implicit Euler in Q16.16. Each step's
// movement is swept in <= 1 px increments against the tank hitboxes and the
// terrain spans, so nothing tunnels through a thin wall or clips past a tank.
import type { Fx } from "@/game/sim/types";
import { fromInt, toInt, mul } from "@/game/sim/math/fixed";
import { cosDeg, sinDeg } from "./aimTable";
import { isSolid, type Terrain } from "./terrain";
import {
  WORLD_W, STEPS_PER_SEC, GRAVITY_STEP, V_UNIT, MAX_FLIGHT_STEPS, BARREL_LEN, TANK_HIT_R,
} from "./constants";
import { idiv, floorPx } from "./imath";

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

/** The muzzle point for a hitbox centre and an integer angle (any integer degrees), px. */
export function muzzle(cx: number, cy: number, angleDeg: number): { x: number; y: number } {
  return {
    x: cx + toInt(mul(fromInt(BARREL_LEN), cosDeg(angleDeg))),
    y: cy - toInt(mul(fromInt(BARREL_LEN), sinDeg(angleDeg))),
  };
}

export function launchShell(
  x: number, y: number, angleDeg: number, power: number, speedPct = 100, gravityPct = 100
): Shell {
  const speed = idiv(power * V_UNIT * speedPct, 100);
  return {
    x: fromInt(x),
    y: fromInt(y),
    vx: mul(speed, cosDeg(angleDeg)),
    vy: 0 - mul(speed, sinDeg(angleDeg)),
    gravityStep: idiv(GRAVITY_STEP * gravityPct, 100),
    steps: 0,
    alive: true,
  };
}

/**
 * Advance one physics step. Returns the first impact along the swept path, or
 * null while the shell is still flying. windStep is the horizontal velocity
 * change per step (Fx). Pixels are floored (floorPx): column c is [c, c + 1),
 * so the left world edge is exactly x = 0.
 */
export function stepShell(s: Shell, t: Terrain, tanks: readonly HitCircle[], windStep: Fx): Impact | null {
  s.vx += windStep;
  s.vy += s.gravityStep;
  const nx = s.x + idiv(s.vx, STEPS_PER_SEC);
  const ny = s.y + idiv(s.vy, STEPS_PER_SEC);
  const n = Math.max(Math.abs(floorPx(nx) - floorPx(s.x)), Math.abs(floorPx(ny) - floorPx(s.y)), 1);
  const r2 = TANK_HIT_R * TANK_HIT_R;
  for (let i = 1; i <= n; i++) {
    const cx = floorPx(s.x + idiv((nx - s.x) * i, n));
    const cy = floorPx(s.y + idiv((ny - s.y) * i, n));
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
    return { kind: "out", x: floorPx(nx), y: floorPx(ny) };
  }
  return null;
}
```

- [ ] **Step 6: Unclamp the volley and floor the recorded points** in `src/game/titles/arcfire/resolve.ts` (four edits):

In `src/game/titles/arcfire/resolve.ts`, replace

```ts
import { fromInt, toInt } from "@/game/sim/math/fixed";
```

with

```ts
import { fromInt } from "@/game/sim/math/fixed";
```

In `src/game/titles/arcfire/resolve.ts`, replace

```ts
import { idiv, clampInt } from "./imath";
```

with

```ts
import { idiv, floorPx } from "./imath";
```

In `src/game/titles/arcfire/resolve.ts`, replace

```ts
    const angle = clampInt(input.angle + offset, 0, 180);
```

with

```ts
    const angle = input.angle + offset; // never clamped: an edge shell may leave below the horizon
```

In `src/game/titles/arcfire/resolve.ts`, replace

```ts
        tl.shells[i].points.push(toInt(s.x), toInt(s.y));
```

with

```ts
        tl.shells[i].points.push(floorPx(s.x), floorPx(s.y));
```

- [ ] **Step 7: Run the four test files**

Run: `npx vitest run src/game/titles/arcfire/aimTable.test.ts src/game/titles/arcfire/imath.test.ts src/game/titles/arcfire/ballistics.test.ts src/game/titles/arcfire/resolve.test.ts`
Expected: PASS.

- [ ] **Step 8: Run the suite: only the corpus may fail, and both pins must hold**

Run: `npx vitest run src/game/titles/arcfire`
Expected: FAIL, exactly 1 test: `corpus.test.ts` with `moved cases: expected [ …(11) ] to deeply equal []`. `determinism.test.ts` (`389a1340`) and the windless pin (`8d7dc831`) **pass**; if either fails, stop.

- [ ] **Step 9: Re-pin the corpus and check the moved cases**

Run: `UPDATE_ARCFIRE_CORPUS=1 npx vitest run src/game/titles/arcfire/corpus.test.ts --reporter=verbose`
Expected: PASS, printing `re-pinned 11 moved cases:` and exactly these 11 lines:
- The nine single-shot cases move only on their boards, except `fan|hills|p0|w0|m0|180/100`, whose edge shell now lands 2 points on its own shooter.
- The two sudden-death matches move only on their terrain: still a draw, and still won 40–0.

```
triad|hills|p0|w0|m0|0/100: {"board":"35953951","points":[0,0]} -> {"board":"373bf22f","points":[0,0]}
triad|hills|p0|w0|m0|2/30: {"board":"3eccfcc9","points":[0,0]} -> {"board":"56dbb2a1","points":[0,0]}
triad|flat|p0|w0|m0|0/60: {"board":"4d2de988","points":[0,0]} -> {"board":"43951d8b","points":[0,0]}
fan|hills|p1|w0|m0|130/80: {"board":"86f40d0a","points":[0,0]} -> {"board":"14e2cfd1","points":[0,0]}
fan|hills|p0|w0|m0|0/100: {"board":"3a70dd21","points":[0,0]} -> {"board":"4b6c601b","points":[0,0]}
fan|hills|p0|w0|m0|180/100: {"board":"14e2cfd1","points":[0,0]} -> {"board":"ca703a0c","points":[0,2]}
fan|hills|p0|w0|m0|2/30: {"board":"7744d580","points":[0,0]} -> {"board":"1c16b903","points":[0,0]}
fan|flat|p0|w0|m0|0/60: {"board":"e702576f","points":[0,0]} -> {"board":"f8902489","points":[0,0]}
special|left-edge|seed777|railshot|129/10: {"board":"9962cc1b","points":[0,0]} -> {"board":"8c2329ad","points":[0,0]}
match|sudden-death-draw: {"board":"1b1ac80c","points":[0,0,2,8]} -> {"board":"196d9539","points":[0,0,2,8]}
match|sudden-death-win: {"board":"20c40a1d","points":[40,0,0,8]} -> {"board":"edf8fbd8","points":[40,0,0,8]}
```

Run: `node -e "const c=require('./src/game/titles/arcfire/corpus.golden.json');console.log(c.digest,Object.keys(c.cases).length)"`
Expected, exactly: `fa6b1ed7 123`

- [ ] **Step 10: Run the Arcfire gate, types and the full suite**

Run: `npx vitest run src/game/titles/arcfire src/game/sim/purity.test.ts`
Expected: PASS: 15 files, 105 tests.

Run: `npx tsc --noEmit`
Expected: exit 0.

Run: `npm test`
Expected: all pass.

- [ ] **Step 11: Run the cross-engine gate**

Run: `npm run test:e2e:cross-engine -- --grep-invert firefox`
Expected: exit 0, `2 passed`. Chromium and WebKit reproduce `5167b43d`, `389a1340` and `fa6b1ed7` (Firefox runs in CI).

- [ ] **Step 12: Commit.** The third `-m` is the moved-case list from Step 9, one entry per case (`key board-before->board-after`; points are unchanged except where shown).

```bash
git add src/game/titles/arcfire/aimTable.ts src/game/titles/arcfire/imath.ts src/game/titles/arcfire/ballistics.ts src/game/titles/arcfire/resolve.ts src/game/titles/arcfire/aimTable.test.ts src/game/titles/arcfire/imath.test.ts src/game/titles/arcfire/ballistics.test.ts src/game/titles/arcfire/resolve.test.ts src/game/titles/arcfire/corpus.golden.json
git commit -m "feat(arcfire): any-angle directions, floored pixels, unclamped volleys (spec 9.1)" -m "Pins unchanged: golden 389a1340, windless 8d7dc831. Corpus 655486aa -> fa6b1ed7, exactly 11 cases (floor: the left-edge special and fan|hills|p1|w0|m0|130/80; unclamp: 7 volley cases near the horizon, fan 180/100 now [0, 2]; both sudden-death matches, terrain only)." -m "Moved cases: triad|hills|p0|w0|m0|0/100 35953951->373bf22f; triad|hills|p0|w0|m0|2/30 3eccfcc9->56dbb2a1; triad|flat|p0|w0|m0|0/60 4d2de988->43951d8b; fan|hills|p1|w0|m0|130/80 86f40d0a->14e2cfd1; fan|hills|p0|w0|m0|0/100 3a70dd21->4b6c601b; fan|hills|p0|w0|m0|180/100 14e2cfd1->ca703a0c, points [0,0]->[0,2]; fan|hills|p0|w0|m0|2/30 7744d580->1c16b903; fan|flat|p0|w0|m0|0/60 e702576f->f8902489; special|left-edge|seed777|railshot|129/10 9962cc1b->8c2329ad; match|sudden-death-draw 1b1ac80c->196d9539; match|sudden-death-win 20c40a1d->edf8fbd8." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 5: The data model, the step-loop refactor, the validator and the quiet path (behaviour-preserving)

**Files:**
- Modify: `src/game/titles/arcfire/weapons/types.ts` (full replacement: the final data model, design-verbatim)
- Modify: `src/game/titles/arcfire/timeline.ts` (full replacement: the final Timeline, design-verbatim)
- Create: `src/game/titles/arcfire/weapons/validate.ts` (design-verbatim)
- Modify: `src/game/titles/arcfire/constants.ts` (append the weapon constants, design-verbatim)
- Modify: `src/game/titles/arcfire/terrain.ts` (`settle(t, collect)`, two edits)
- Modify: `src/game/titles/arcfire/ballistics.ts` (full replacement: the Plan 2A `Shell`, `shellAt`/`launchAt`, and the last free sample)
- Create: `src/game/titles/arcfire/weapons/primitives.ts` (the skeleton)
- Modify: `src/game/titles/arcfire/resolve.ts` (full replacement: the step loop, `resolveWeapon`, `resolveTurnPoints`)
- Create: `src/game/test/arcfire/fixtures.ts`
- Create: `src/game/titles/arcfire/weapons/validate.test.ts`, `src/game/titles/arcfire/weapons/primitives.test.ts`
- Modify (tests): `weapons/roster.test.ts` (full replacement: the design's Task 5 version), `corpus.test.ts` (full replacement: the design's final version), `ballistics.test.ts` and `resolve.test.ts` (type-only edits)

**Interfaces:**
- Consumes: Tasks 1–4 (`floorPx`, `cosDeg`/`sinDeg`, `ceilDiv`, `CORPUS_SEED`/`CORPUS_SETTINGS`); Plan 1's `hitCircles`, `moveTarget`, `carveCircle`, `spansFromHeight`, `blastDamage`.
- Produces:
  - `weapons/types.ts` exports `Tag`, `Blast`, `ShellLaunch`, `BeamLaunch`, `Launch`, `Split`, `Build`, `Roll`, `Dig`, `Burn`, `Quake`, `DelayableEffect`, `Delay`, `Effect`, `Bounce`, `Stage` and `WeaponDef`. `WeaponDef.stage` is optional (beams have none).
  - `timeline.ts` exports:
    - `SHOW_PX_PER_STEP = { roll: 3, dig: 4, burn: 4, quake: 8 }` and `showSteps(px, rate): number`;
    - `TimelineEvent`, a union of 13 kinds: `blast`, `damage`, `out` (each with `lag`), `bounce`, `split`, `dud`, `fuse`, `roll`, `dig`, `burn`, `build`, `quake` and `beam`;
    - `ShellPath { angle; parent; start; points }`;
    - `Timeline`, which adds `steps`.
  - `weapons/validate.ts`: `weaponErrors(def: WeaponDef): string[]`, `maxShells(def): number`, `maxTurnSteps(def): number`.
  - `constants.ts`: `MAX_TURN_STEPS = 4800`, `MAX_SHELLS = 64`, `MAX_STAGE_DEPTH = 4`, `BOUNCE_PROBE_R = 8`, `ROLL_PROBE = 6`, `DIG_MAX_PITCH = 30`.
  - `terrain.ts`: `settle(t: Terrain, collect = true): SettleResult`.
  - `ballistics.ts`:
    - `Shell` gains `speed`, `apexed`, `stopAtApex`, `homeDeg`, `homeX`, `homeY`, `bounces`, `wallBounces`, `restitutionPct` and `ignore`, all inert at their defaults;
    - `Impact` = `terrain`/`tank` (with `fx, fy`, the last free position) | `out`;
    - `shellAt(x: Fx, y: Fx, vx: Fx, vy: Fx, speed: Fx, gravityStep: Fx): Shell`;
    - `launchAt(x: number, y: number, angleDeg: number, speed: Fx, gravityStep: Fx): Shell`;
    - `launchShell` keeps its signature.
  - `weapons/primitives.ts`: `Shot`, `Trigger`, `Pending`, `emit(shot, ev)`, `applyEffects(shot, trig, effects)` (the `blast` branch), `blastAt(shot, b, x, y, step, shell, lag)`, `addShell(shot, s, stage, angle, parent, step): number`, and `fanOffset(i, count, spread): number`.
  - `resolve.ts`: `TurnInput`, `resolveTurn(m, input): Timeline`, `resolveTurnPoints(m, input): [number, number]`, and `resolveWeapon(m, def, input, record = true): Timeline`.
  - `src/game/test/arcfire/fixtures.ts`: `flatBattle(x0 = 300, x1 = 700): MatchState` and `setHeights(m, f: (x) => number): MatchState`.

**The gate is behaviour preservation.** Every pin and all 123 corpus cases must stay byte-identical, and every Plan 1 test must stay green. This is the riskiest task, because it replaces the turn loop. Failures still localise:
- the corpus test names every moved case;
- the parity test separates the quiet path from the loop;
- the validator tests touch no loop code.

The loop's order (normative, part of the determinism contract; the design's §3.2):
1. Each step, the delays due fire first, in arming order.
2. Then every shell that existed at the start of the step moves once, in creation order.
3. A trigger applies its effect list completely, in list order.
4. Children first move on the next step.
5. At `MAX_TURN_STEPS` everything still flying is `out` and armed delays are dropped.
6. Then the terrain settles once and the turn is scored.

This task adds the loop minus three branches that later tasks add: early/dud (Task 7), bounce (Task 8) and beams (Task 11).

- [ ] **Step 1: Create the shared test boards** `src/game/test/arcfire/fixtures.ts`:

```ts
// src/game/test/arcfire/fixtures.ts
//
// Shared boards for the Arcfire weapon tests (test-only; outside the sim
// purity roots). flatBattle() is Plan 1's resolve.test.ts board: battle
// phase, flat ground at y = 400, player 0 to shoot, no wind, rosterSize 8.
import { createMatch } from "@/game/titles/arcfire/match";
import { spansFromHeight } from "@/game/titles/arcfire/terrain";
import type { MatchSettings, MatchState } from "@/game/titles/arcfire/state";

const SMALL: MatchSettings = { weaponsEach: 3, poolSize: 8, wind: false, guaranteeTags: [], rosterSize: 8 };

/** Battle phase on flat ground at y = 400 with the tanks at x0 / x1 (default 300 / 700), player 0 to shoot, no wind. */
export function flatBattle(x0 = 300, x1 = 700): MatchState {
  const m = createMatch(1, SMALL);
  m.terrain.height.fill(400);
  spansFromHeight(m.terrain);
  m.tankX[0] = x0;
  m.tankX[1] = x1;
  m.phase = "battle";
  m.shooter = 0;
  return m;
}

/** Reshape the board: height[x] = f(x) for every column (f may read the old height), then rebuild the spans. Returns m. */
export function setHeights(m: MatchState, f: (x: number) => number): MatchState {
  for (let x = 0; x < m.terrain.height.length; x++) m.terrain.height[x] = f(x);
  spansFromHeight(m.terrain);
  return m;
}
```

- [ ] **Step 2: Write the failing validator test** `src/game/titles/arcfire/weapons/validate.test.ts`. The totality cases are staged by primitive; this task has the three blast-only ones, and Tasks 7, 9, 10, 11 and 13 append theirs.

```ts
import { describe, it, expect } from "vitest";
import { weaponErrors, maxShells, maxTurnSteps } from "./validate";
import { ROSTER } from "./roster";
import { resolveWeapon } from "../resolve";
import { hashMatch } from "../hash";
import { MAX_SHELLS, MAX_TURN_STEPS, WORLD_H } from "../constants";
import { flatBattle } from "@/game/test/arcfire/fixtures";
import type { Blast, Effect, Stage, WeaponDef } from "./types";

const B: Blast = { radius: 28, damage: 40 };

/** A valid shell + blast weapon with `over` applied. */
const weapon = (over: Partial<WeaponDef>): WeaponDef => ({
  id: "test", name: "Test", tag: "BLAST", tier: 1, power: 30,
  launch: { kind: "shell" }, stage: { on: "impact", effects: [{ blast: B }] }, ...over,
});

/** A shell weapon whose impact stage has these effects (and `extra` stage fields). */
const impact = (effects: Effect[], extra: Partial<Stage> = {}): WeaponDef => weapon({ stage: { on: "impact", effects, ...extra } });

describe("weaponErrors", () => {
  it("accepts every roster weapon and a plain shell + blast", () => {
    for (const w of ROSTER) expect(weaponErrors(w), w.id).toEqual([]);
    expect(weaponErrors(weapon({}))).toEqual([]);
  });
  it("reports each seeded mistake at its path", () => {
    const cases: [WeaponDef, string][] = [
      [weapon({ power: 0 }), "power: 0 is not an integer in [1, 100]"],
      [impact([{ blast: { radius: 0, damage: 40 } }]), "stage.effects[0].blast.radius: 0 is not an integer in [1, 200]"],
      [impact([]), "stage.effects: must be a non-empty effect list"],
      [weapon({ stage: undefined }), "stage: a shell launch needs one"],
      [weapon({ launch: { kind: "beam", length: 1200, width: 20, damage: 60 }, stage: undefined }), "launch.width: 20 is not an integer in [2, 12]"],
      [impact([{ blast: B }], { early: [{ blast: B }] }), "stage.early: only on an apex stage"],
      [weapon({ stage: { on: "apex", effects: [{ blast: B }], homing: { degPerStep: 2 } } }), "stage.homing: only on an impact stage"],
      [
        impact([{ split: { count: 3, spreadDeg: 20, speedPct: 100, from: "ahead", child: { on: "impact", effects: [{ blast: B }] } } }]),
        "stage.effects[0].split.from: \"ahead\" only in an apex stage's effects (at an impact the heading points into the ground)",
      ],
      [impact([{ dig: { length: 90, width: 14, blastEvery: 30 } }]), "stage.effects[0].dig: blastEvery and each come together"],
      [impact([{ delay: { steps: 0, then: [{ blast: B }] } }]), "stage.effects[0].delay.steps: 0 is not an integer in [1, 600]"],
      [impact([{ blast: B, quake: { reach: 100, damage: 10, furrow: 2 } } as unknown as Effect]), "stage.effects[0]: an effect has exactly one known key"],
    ];
    for (const [def, err] of cases) expect(weaponErrors(def)).toContain(err);
  });
  it("reports a cyclic stage (nesting deeper than 4), whose static bounds exceed the backstops", () => {
    const loop: Stage = { on: "impact", effects: [{ blast: B }] };
    loop.effects.push({ split: { count: 2, spreadDeg: 30, speedPct: 50, from: "up", child: loop } });
    const def = weapon({ stage: loop });
    expect(weaponErrors(def).some((e) => e.endsWith("stages nest deeper than 4"))).toBe(true);
    expect(maxShells(def)).toBeGreaterThan(MAX_SHELLS);
    expect(maxTurnSteps(def)).toBeGreaterThan(MAX_TURN_STEPS);
  });
});

/** Resolve `def` at 45/60, 90/0 and 0/100 on flatBattle(): no throw, integer state, a valid hash, and within the backstops. */
function expectTotal(def: WeaponDef): void {
  for (const [angle, power] of [[45, 60], [90, 0], [0, 100]]) {
    const m = flatBattle();
    const tl = resolveWeapon(m, def, { move: 0, weapon: 0, angle, power });
    expect(Array.from(m.terrain.height).every((h) => Number.isInteger(h) && h >= 0 && h <= WORLD_H)).toBe(true);
    expect([...tl.points, ...Array.from(m.scores)].every(Number.isInteger)).toBe(true);
    expect(hashMatch(m)).toMatch(/^[0-9a-f]{8}$/);
    expect(tl.shells.length).toBeLessThanOrEqual(MAX_SHELLS);
    expect(tl.steps).toBeLessThanOrEqual(MAX_TURN_STEPS);
  }
}

describe("totality: degenerate definitions resolve without throwing", () => {
  it("a zero-shell volley, a zero blast, and the launch maxima", () => {
    expectTotal(weapon({ launch: { kind: "shell", count: 0 } }));
    expectTotal(impact([{ blast: { radius: 0, damage: 0 } }]));
    expectTotal(weapon({ launch: { kind: "shell", count: 9, spreadDeg: 180, speedPct: 300, gravityPct: 0 } }));
  });
});
```

- [ ] **Step 3: Write the failing primitives test** `src/game/titles/arcfire/weapons/primitives.test.ts`.
  - This task's blocks: every roster weapon's events are sorted and name valid shells; the `ShellPath` `parent`/`start` contract on Plan 1 weapons; the quiet-path parity; and the no-RNG check over the sweep boards.
  - Tasks 7–13 append one block per primitive. The header imports what those blocks use; unused imports are allowed, since the repo has no unused-import rule.

```ts
// src/game/titles/arcfire/weapons/primitives.test.ts
//
// The weapon primitives, fired through resolveTurn / resolveWeapon on small
// hand-built boards. Exact coordinates are pinned: they are what the plan's
// verbatim code produces, so a changed constant or operator anywhere in the
// sim shows up here as well as in the corpus.
import { describe, it, expect } from "vitest";
import { fromInt } from "@/game/sim/math/fixed";
import { resolveTurn, resolveTurnPoints, resolveWeapon, type TurnInput } from "../resolve";
import { cloneMatch, type MatchState } from "../state";
import { createMatch } from "../match";
import { hashMatch } from "../hash";
import { isSolid } from "../terrain";
import { ROSTER, ROSTER_INDEX } from "./roster";
import { MAX_TURN_STEPS, WORLD_H, TANK_HIT_DY } from "../constants";
import { CORPUS_SEED, CORPUS_SETTINGS } from "@/game/test/arcfire/corpus";
import { flatBattle, setHeights } from "@/game/test/arcfire/fixtures";
import type { Timeline, TimelineEvent } from "../timeline";
import type { Stage, WeaponDef } from "./types";

/** Fire roster weapon `id` for the current shooter, without moving. */
const fire = (m: MatchState, id: string, angle: number, power: number): Timeline =>
  resolveTurn(m, { move: 0, weapon: ROSTER_INDEX[id], angle, power });

/** A synthetic weapon, fired through resolveWeapon (the input's `weapon` is only recorded). */
const synth = (stage: Stage | undefined, launch: WeaponDef["launch"] = { kind: "shell" }): WeaponDef =>
  ({ id: "synthetic", name: "Synthetic", tag: "SPECIAL", tier: 1, power: 1, launch, stage });
const fireDef = (m: MatchState, def: WeaponDef, angle: number, power: number): Timeline =>
  resolveWeapon(m, def, { move: 0, weapon: 0, angle, power });

/** The events of one kind, typed. */
function eventsOf<K extends TimelineEvent["kind"]>(tl: Timeline, kind: K): Extract<TimelineEvent, { kind: K }>[] {
  return tl.events.filter((e): e is Extract<TimelineEvent, { kind: K }> => e.kind === kind);
}

describe("every roster weapon", () => {
  it("emits events sorted by step, each naming a valid shell", () => {
    for (let w = 0; w < ROSTER.length; w++) {
      for (const [angle, power] of [[45, 60], [60, 50], [0, 100], [180, 100], [90, 0]]) {
        const tl = resolveTurn(flatBattle(), { move: 0, weapon: w, angle, power });
        for (let i = 1; i < tl.events.length; i++) expect(tl.events[i].step).toBeGreaterThanOrEqual(tl.events[i - 1].step);
        for (const e of tl.events) {
          if ("shell" in e) expect(e.shell >= 0 && e.shell < tl.shells.length, `${ROSTER[w].id} ${e.kind}`).toBe(true);
        }
      }
    }
  });
});

describe("shell paths", () => {
  it("muzzle shells have parent -1 and start 0, and each path ends on its terminal step", () => {
    const tl = fire(flatBattle(), "fan", 45, 60);
    expect(tl.shells.map((s) => [s.parent, s.start])).toEqual([[-1, 0], [-1, 0], [-1, 0], [-1, 0], [-1, 0]]);
    for (const e of eventsOf(tl, "blast")) {
      const p = tl.shells[e.shell];
      expect(p.points.length / 2 - 1).toBe(e.step - p.start); // point k is at step start + k
      expect(p.points.slice(-2)).toEqual([e.x, e.y]);
    }
    expect(tl.steps).toBe(Math.max(...tl.events.map((e) => e.step)));
  });
});

/** The sweep boards: the corpus hills (player 0 in wind 0, +40 and -40; player 1 in wind 0) and flatBattle(). */
function sweepBoards(): MatchState[] {
  const hills = (shooter: number, wind: number): MatchState => {
    const m = createMatch(CORPUS_SEED, CORPUS_SETTINGS);
    m.phase = "battle";
    m.shooter = shooter;
    m.wind = wind;
    return m;
  };
  return [hills(0, 0), hills(0, 40), hills(0, -40), hills(1, 0), flatBattle()];
}

const AIMS: [number, number][] = [
  [0, 100], [15, 70], [35, 70], [45, 60], [50, 80], [65, 95], [90, 0], [90, 100], [115, 70], [135, 60], [165, 70], [180, 100],
];

describe("the quiet path", () => {
  it("resolveTurnPoints leaves the same state and points as resolveTurn, and no weapon draws from the RNG", () => {
    for (const base of sweepBoards()) {
      for (let w = 0; w < ROSTER.length; w++) {
        for (const [angle, power] of AIMS) {
          const input: TurnInput = { move: 0, weapon: w, angle, power };
          const loud = cloneMatch(base);
          const quiet = cloneMatch(base);
          const tl = resolveTurn(loud, input);
          expect(resolveTurnPoints(quiet, input)).toEqual(tl.points);
          expect(hashMatch(quiet)).toBe(hashMatch(loud));
          expect(loud.rng.state).toBe(base.rng.state);
          expect(quiet.rng.state).toBe(base.rng.state);
        }
      }
    }
  });
  it("records no paths, events or falls when record is false", () => {
    const tl = resolveWeapon(flatBattle(), ROSTER[ROSTER_INDEX.fan], { move: 0, weapon: ROSTER_INDEX.fan, angle: 45, power: 60 }, false);
    expect(tl.shells).toEqual([]);
    expect(tl.events).toEqual([]);
    expect(tl.settle.falls).toEqual([]);
    expect(tl.steps).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 4: Run them to verify they fail**

Run: `npx vitest run src/game/titles/arcfire/weapons`
Expected: FAIL:
- `validate.test.ts` cannot load: `Error: Cannot find module './validate'`.
- In `primitives.test.ts`, 3 tests fail:
  - `muzzle shells have parent -1 and start 0, …`: `expected [ [ undefined, undefined ], …(4) ] to deeply equal [ [ -1, +0 ], … ]`
  - `resolveTurnPoints leaves the same state …`: `TypeError: resolveTurnPoints is not a function`
  - `records no paths, events or falls when record is false`: `TypeError: resolveWeapon is not a function`
- `roster.test.ts` still passes.

- [ ] **Step 5: Replace** `src/game/titles/arcfire/weapons/types.ts` with the final data model (design-verbatim):

```ts
// src/game/titles/arcfire/weapons/types.ts
//
// Data-driven weapon definitions (spec §4.1). A weapon is a Launch (shells or
// beams) plus, for shells, a Stage: WHEN it triggers (impact or apex), HOW the
// shell flies until then (optional bounce and homing), and WHAT it does
// (effects, applied in array order at the trigger point). Pure data: the
// only weapon code is weapons/primitives.ts and ballistics.ts.

export type Tag =
  | "BLAST" | "VOLLEY" | "SPLIT" | "BOUNCE" | "ROLL" | "DIG"
  | "FIRE" | "DIRT" | "BEAM" | "HOMING" | "QUAKE" | "SPECIAL";

export interface Blast {
  radius: number; // px, >= 1
  damage: number; // points when the blast overlaps the hitbox
  falloff?: "linear" | "quadratic"; // default linear
}

export interface ShellLaunch {
  kind: "shell";
  count?: number; // shells in the volley (default 1)
  spreadDeg?: number; // TOTAL angular spread across the volley (default 0); never clamped
  speedPct?: number; // launch speed scale (default 100)
  gravityPct?: number; // gravity scale (default 100); children inherit it
}

export interface BeamLaunch {
  kind: "beam"; // straight lines from the muzzle, aimed on the beam dial (beamDir: can point down); ignore power, gravity and wind
  count?: number; // beams (default 1)
  spreadDeg?: number; // TOTAL angular spread across the beams (default 0)
  length: number; // px, >= 1
  width: number; // px, 2..12 (carves a width/2-radius capsule; <= 12 so a beam can never touch its own hitbox)
  damage: number; // flat points to each tank a beam passes within width/2 of
}

export type Launch = ShellLaunch | BeamLaunch;

export interface Split {
  count: number; // children, >= 1
  spreadDeg: number; // TOTAL fan across the children (0 = all parallel)
  speedPct: number; // % of the base speed (see `from`)
  // up:    a fan about straight up at the parent's nominal speed (impact splits: Cascade, Shrapnel)
  // ahead: a fan about the parent's current velocity, at its current speed (apex splits: Hydra, Barrage)
  // cone:  the parent's current velocity PLUS a fan about straight down at the parent's
  //        nominal speed — a burst carried by the parent's motion (Hailstorm)
  from: "up" | "ahead" | "cone";
  gapPx?: number; // spawn the children in a horizontal line this far apart, centred on the parent (Barrage)
  child: Stage;
}

export type Build =
  | { shape: "ball"; radius: number } // a disc of dirt centred on the impact
  | { shape: "wall"; width: number; height: number } // each column's surface rises by `height`
  | { shape: "level"; radius: number }; // columns within ±radius become solid exactly from the impact y down

export interface Roll { maxDistance: number; then: Blast } // px along the ground
export interface Dig { length: number; width: number; blastEvery?: number; each?: Blast; then?: Blast } // along travel, never steeper than DIG_MAX_PITCH below level
export interface Burn { flow: number; pool: number; damage: number; split?: boolean }
export interface Quake { reach: number; damage: number; furrow: number } // reach is horizontal; the shockwave never hurts the shooter

/** What a delay may schedule. None of these creates a shell or another delay, so every armed delay fires once and adds nothing that waits. */
export type DelayableEffect =
  | { blast: Blast }
  | { roll: Roll }
  | { dig: Dig }
  | { burn: Burn }
  | { build: Build }
  | { quake: Quake };

export interface Delay { steps: number; then: DelayableEffect[] }

export type Effect = DelayableEffect | { split: Split } | { delay: Delay };

export interface Bounce {
  times: number; // reflections before the stage triggers
  restitutionPct: number; // speed kept per reflection, 1..100
  blastEach?: Blast; // detonated at every reflection point
  walls?: boolean; // true: reflect off the world's side walls instead of the terrain (Ricochet)
}

export interface Stage {
  // impact: the first terrain or tank contact that isn't consumed by a bounce.
  // apex: the first step a RISING shell stops rising (vy < 0 before the step's
  //       gravity, vy >= 0 after it). A shell launched level or downward never apexes.
  on: "impact" | "apex";
  effects: Effect[];
  early?: Effect[]; // on "apex" only: applied instead when the shell hits something before its apex (omitted = a dud)
  homing?: { degPerStep: number }; // on "impact" only: once past the apex, turn <= this many whole degrees per step toward the enemy
  bounce?: Bounce; // on "impact" only
}

export interface WeaponDef {
  id: string;
  name: string;
  tag: Tag;
  tier: 1 | 2 | 3;
  power: number; // draft score 1..100 (the balance harness rewrites these)
  launch: Launch;
  stage?: Stage; // required for shell launches; beams have none
}
```

- [ ] **Step 6: Replace** `src/game/titles/arcfire/timeline.ts` with the final Timeline (design-verbatim):

```ts
// src/game/titles/arcfire/timeline.ts
//
// What one resolved turn looked like, for the renderer to play back (spec
// §3.4). Presentation-only: never hashed and never fed back into the sim.
//
// Every event's `step` is the sim step it was APPLIED on, and `events` is in
// application order (so it is sorted by step). Roll, dig, burn and quake
// resolve instantly in the sim; their events carry the geometry plus `dur`,
// the display steps the animation takes at SHOW_PX_PER_STEP, and the blasts,
// damage and exits they cause carry `lag`: show them at step + lag, when the
// animation reaches them. Changing these rates never moves a hash.
import type { SettleFall } from "./terrain";
import { ceilDiv } from "./imath";

/** Display speed of the instant effects' animations, px per step. Presentation only. */
export const SHOW_PX_PER_STEP = { roll: 3, dig: 4, burn: 4, quake: 8 } as const;

/** Display steps for `px` of animation at `rate` px per step. */
export const showSteps = (px: number, rate: number): number => ceilDiv(px < 0 ? 0 - px : px, rate);

export type TimelineEvent =
  | { step: number; kind: "blast"; shell: number; x: number; y: number; radius: number; lag: number }
  | { step: number; kind: "damage"; target: number; amount: number; lag: number }
  | { step: number; kind: "out"; shell: number; x: number; y: number; lag: number } // left a side edge, or a flight cap
  // Plan 2A — `shell` indexes Timeline.shells
  | { step: number; kind: "bounce"; shell: number; x: number; y: number; wall: boolean } // the path continues through it
  | { step: number; kind: "split"; shell: number; x: number; y: number; children: number[] }
  | { step: number; kind: "dud"; shell: number; x: number; y: number } // an apex weapon hit early and has no `early` effects
  | { step: number; kind: "fuse"; shell: number; x: number; y: number; at: number } // a delay armed here fires at step `at`
  | { step: number; kind: "roll"; shell: number; path: number[]; dur: number } // flat [x, y, ...], one point per column, ends at the stop
  | { step: number; kind: "dig"; shell: number; x0: number; y0: number; x1: number; y1: number; width: number; dur: number }
  | { step: number; kind: "burn"; shell: number; x: number; y: number; flows: number[][]; dur: number } // each run's flat path
  // build: size = the ball/level radius or the wall height; width = the columns it spans (the wall's width, or 2 × radius + 1), the first at x - floor(width / 2)
  | { step: number; kind: "build"; shell: number; shape: "ball" | "wall" | "level"; x: number; y: number; size: number; width: number }
  | { step: number; kind: "quake"; shell: number; x: number; y: number; reach: number; furrow: number; dur: number }
  | { step: number; kind: "beam"; beam: number; x0: number; y0: number; x1: number; y1: number; width: number }; // muzzle to end, along beamDir: may point down

export interface ShellPath {
  angle: number; // launch angle (muzzle shells; may lie outside 0..180 at a volley's edge), or the fan offset (children)
  parent: number; // index of the shell that spawned this one; -1 for muzzle shells
  start: number; // the step of points[0]: point k is at step start + k
  points: number[]; // flat [x0, y0, x1, y1, ...] px: the spawn point, then one point per step, ending at the terminal event
}

export interface Timeline {
  shooter: number;
  move: { fromX: number; toX: number } | null;
  wind: number; // px/s² during this turn
  weapon: number; // roster index fired
  steps: number; // sim steps the shot took (1 for beams); the renderer adds any dur/lag beyond it
  shells: ShellPath[];
  events: TimelineEvent[]; // in application order, so sorted by step
  settle: { heights: Int32Array; falls: SettleFall[] };
  points: [number, number]; // points awarded this turn to player 0 / player 1
}
```

- [ ] **Step 7: Create** `src/game/titles/arcfire/weapons/validate.ts` (design-verbatim):

```ts
// src/game/titles/arcfire/weapons/validate.ts
//
// The static half of the weapon contract: weaponErrors(def) lists every rule a
// WeaponDef breaks ([] = valid), and the cost bounds resolveTurn relies on.
// The roster test requires [] for every entry. The ranges keep every product
// in the sim below 2^53 and every data-fed divisor >= 1. The runtime guards in
// damage.ts / primitives.ts let the degenerate defs the totality test covers
// (zeros, count 0, a cyclic stage, the launch maxima) resolve without throwing;
// data far outside these ranges (a huge carve radius, NaN) is not covered.
import type { Blast, Effect, Stage, WeaponDef } from "./types";
import { MAX_FLIGHT_STEPS, MAX_SHELLS, MAX_STAGE_DEPTH, MAX_TURN_STEPS } from "../constants";

const isInt = (v: unknown, lo: number, hi: number): boolean =>
  typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi;

function check(errs: string[], path: string, v: unknown, lo: number, hi: number): void {
  if (!isInt(v, lo, hi)) errs.push(`${path}: ${String(v)} is not an integer in [${lo}, ${hi}]`);
}

function checkBlast(errs: string[], path: string, b: Blast): void {
  check(errs, `${path}.radius`, b.radius, 1, 200);
  check(errs, `${path}.damage`, b.damage, 1, 200);
  if (b.falloff !== undefined && b.falloff !== "linear" && b.falloff !== "quadratic") errs.push(`${path}.falloff: unknown`);
}

const EFFECT_KEYS = ["blast", "split", "roll", "dig", "burn", "build", "quake", "delay"];

function checkEffects(errs: string[], path: string, effects: readonly Effect[], apexList: boolean, depth: number, inDelay: boolean): void {
  if (!Array.isArray(effects) || effects.length === 0) {
    errs.push(`${path}: must be a non-empty effect list`);
    return;
  }
  effects.forEach((e, i) => {
    const p = `${path}[${i}]`;
    const keys = Object.keys(e);
    if (keys.length !== 1 || !EFFECT_KEYS.includes(keys[0])) {
      errs.push(`${p}: an effect has exactly one known key`);
      return;
    }
    if (inDelay && (keys[0] === "split" || keys[0] === "delay")) errs.push(`${p}: a delay cannot schedule a ${keys[0]}`);
    if ("blast" in e) checkBlast(errs, `${p}.blast`, e.blast);
    else if ("split" in e) {
      const s = e.split;
      check(errs, `${p}.split.count`, s.count, 1, 9);
      check(errs, `${p}.split.spreadDeg`, s.spreadDeg, 0, 180);
      check(errs, `${p}.split.speedPct`, s.speedPct, 1, 200);
      if (s.gapPx !== undefined) check(errs, `${p}.split.gapPx`, s.gapPx, 0, 200);
      if (s.from !== "up" && s.from !== "ahead" && s.from !== "cone") errs.push(`${p}.split.from: unknown`);
      else if (s.from !== "up" && !apexList) errs.push(`${p}.split.from: "${s.from}" only in an apex stage's effects (at an impact the heading points into the ground)`);
      checkStage(errs, `${p}.split.child`, s.child, depth + 1);
    } else if ("roll" in e) {
      check(errs, `${p}.roll.maxDistance`, e.roll.maxDistance, 1, 1200);
      checkBlast(errs, `${p}.roll.then`, e.roll.then);
    } else if ("dig" in e) {
      const d = e.dig;
      check(errs, `${p}.dig.length`, d.length, 1, 400);
      check(errs, `${p}.dig.width`, d.width, 2, 32);
      if (d.blastEvery !== undefined || d.each !== undefined) {
        if (d.each === undefined || d.blastEvery === undefined) errs.push(`${p}.dig: blastEvery and each come together`);
        else {
          check(errs, `${p}.dig.blastEvery`, d.blastEvery, 1, d.length);
          checkBlast(errs, `${p}.dig.each`, d.each);
        }
      }
      if (d.then !== undefined) checkBlast(errs, `${p}.dig.then`, d.then);
    } else if ("burn" in e) {
      check(errs, `${p}.burn.flow`, e.burn.flow, 0, 1200);
      check(errs, `${p}.burn.pool`, e.burn.pool, 0, 400);
      check(errs, `${p}.burn.damage`, e.burn.damage, 1, 200);
    } else if ("build" in e) {
      const b = e.build;
      if (b.shape === "wall") {
        check(errs, `${p}.build.width`, b.width, 1, 200);
        check(errs, `${p}.build.height`, b.height, 1, 200);
      } else if (b.shape === "ball" || b.shape === "level") check(errs, `${p}.build.radius`, b.radius, 1, 200);
      else errs.push(`${p}.build.shape: unknown`);
    } else if ("quake" in e) {
      check(errs, `${p}.quake.reach`, e.quake.reach, 1, 1200);
      check(errs, `${p}.quake.damage`, e.quake.damage, 1, 200);
      check(errs, `${p}.quake.furrow`, e.quake.furrow, 0, 50);
    } else {
      check(errs, `${p}.delay.steps`, e.delay.steps, 1, 600);
      checkEffects(errs, `${p}.delay.then`, e.delay.then as Effect[], false, depth, true);
    }
  });
}

function checkStage(errs: string[], path: string, st: Stage, depth: number): void {
  if (depth > MAX_STAGE_DEPTH) {
    errs.push(`${path}: stages nest deeper than ${MAX_STAGE_DEPTH}`);
    return; // also stops a cyclic def
  }
  if (st.on !== "impact" && st.on !== "apex") errs.push(`${path}.on: unknown`);
  checkEffects(errs, `${path}.effects`, st.effects, st.on === "apex", depth, false);
  if (st.early !== undefined) {
    if (st.on !== "apex") errs.push(`${path}.early: only on an apex stage`);
    checkEffects(errs, `${path}.early`, st.early, false, depth, false);
  }
  if (st.homing !== undefined) {
    if (st.on !== "impact") errs.push(`${path}.homing: only on an impact stage`);
    check(errs, `${path}.homing.degPerStep`, st.homing.degPerStep, 1, 10);
  }
  if (st.bounce !== undefined) {
    if (st.on !== "impact") errs.push(`${path}.bounce: only on an impact stage`);
    check(errs, `${path}.bounce.times`, st.bounce.times, 1, 10);
    check(errs, `${path}.bounce.restitutionPct`, st.bounce.restitutionPct, 1, 100);
    if (st.bounce.blastEach !== undefined) checkBlast(errs, `${path}.bounce.blastEach`, st.bounce.blastEach);
  }
}

/** Shells one stage's shell can lead to, itself included (the larger of its effects and its early list). */
function stageShells(st: Stage, depth: number): number {
  if (depth > MAX_STAGE_DEPTH) return MAX_SHELLS + 1;
  const list = (effects: readonly Effect[] | undefined): number => {
    let n = 0;
    for (const e of effects ?? []) if ("split" in e) n += e.split.count * stageShells(e.split.child, depth + 1);
    return n;
  };
  return 1 + Math.max(list(st.effects), list(st.early));
}

/** Steps from one stage's shell's spawn to the last thing it can cause. */
function stageSteps(st: Stage, depth: number): number {
  if (depth > MAX_STAGE_DEPTH) return MAX_TURN_STEPS + 1;
  let tail = 0;
  for (const e of [...st.effects, ...(st.early ?? [])]) {
    if ("delay" in e && e.delay.steps > tail) tail = e.delay.steps;
    if ("split" in e) tail = Math.max(tail, stageSteps(e.split.child, depth + 1));
  }
  return MAX_FLIGHT_STEPS + tail;
}

/** Static upper bound on the shells one turn with `def` creates. */
export function maxShells(def: WeaponDef): number {
  if (def.launch.kind === "beam" || !def.stage) return 0;
  return (def.launch.count ?? 1) * stageShells(def.stage, 1);
}

/** Static upper bound on the steps one turn with `def` runs. */
export function maxTurnSteps(def: WeaponDef): number {
  if (def.launch.kind === "beam" || !def.stage) return 1;
  return stageSteps(def.stage, 1);
}

/** Every rule `def` breaks; [] when it is valid. */
export function weaponErrors(def: WeaponDef): string[] {
  const errs: string[] = [];
  if (typeof def.id !== "string" || def.id === "") errs.push("id: empty");
  check(errs, "tier", def.tier, 1, 3);
  check(errs, "power", def.power, 1, 100);
  const l = def.launch;
  check(errs, "launch.count", l.count ?? 1, 1, 9);
  check(errs, "launch.spreadDeg", l.spreadDeg ?? 0, 0, 180);
  if (l.kind === "shell") {
    check(errs, "launch.speedPct", l.speedPct ?? 100, 1, 300);
    check(errs, "launch.gravityPct", l.gravityPct ?? 100, 0, 200);
    if (!def.stage) errs.push("stage: a shell launch needs one");
    else checkStage(errs, "stage", def.stage, 1);
  } else if (l.kind === "beam") {
    check(errs, "launch.length", l.length, 1, 1400);
    check(errs, "launch.width", l.width, 2, 12);
    check(errs, "launch.damage", l.damage, 1, 200);
    if (def.stage) errs.push("stage: a beam has none");
  } else errs.push("launch.kind: unknown");
  if (errs.length === 0) {
    if (maxShells(def) > MAX_SHELLS) errs.push(`maxShells ${maxShells(def)} > MAX_SHELLS ${MAX_SHELLS}`);
    if (maxTurnSteps(def) > MAX_TURN_STEPS) errs.push(`maxTurnSteps ${maxTurnSteps(def)} > MAX_TURN_STEPS ${MAX_TURN_STEPS}`);
  }
  return errs;
}
```

- [ ] **Step 8: Append the weapon constants** (design-verbatim):

Append to the end of `src/game/titles/arcfire/constants.ts` (after one blank line):

```ts
// --- weapons (Plan 2A, spec §4)
export const MAX_TURN_STEPS = 4800; // backstop on one turn's steps; the roster's static bound (3,600) never reaches it
export const MAX_SHELLS = 64; // backstop on the shells one turn may create; the roster's static bound (13) never reaches it
export const MAX_STAGE_DEPTH = 4; // stage nesting a WeaponDef may use (Cascade uses 3)
export const BOUNCE_PROBE_R = 8; // px: the disc sampled for a bounce's surface normal (8 reads gentle slopes, not their 1 px steps)
export const ROLL_PROBE = 6; // px either side sampled to find the downhill direction (roll, burn)
export const DIG_MAX_PITCH = 30; // degrees: a tunnel never dives steeper than this below level
```

- [ ] **Step 9: Give `settle` its `collect` flag** in `src/game/titles/arcfire/terrain.ts` (two edits; the terrain it leaves is identical either way):

In `src/game/titles/arcfire/terrain.ts`, replace

```ts
 * surface is WORLD_H minus the column's total solid length.
 */
export function settle(t: Terrain): SettleResult {
```

with

```ts
 * surface is WORLD_H minus the column's total solid length. `collect = false`
 * skips building `falls` (the quiet resolve path); the terrain is identical.
 */
export function settle(t: Terrain, collect = true): SettleResult {
```

In `src/game/titles/arcfire/terrain.ts`, replace

```ts
      if (stackTop > bot) falls.push({ x, top, bottom: bot, fall: stackTop - bot });
```

with

```ts
      if (collect && stackTop > bot) falls.push({ x, top, bottom: bot, fall: stackTop - bot });
```

- [ ] **Step 10: Replace** `src/game/titles/arcfire/ballistics.ts`.
  - It is the design's final file without the parts later tasks add: the apex latch, `rotateVel` and the spawn-inside mask (Task 7), the bounces (Task 8) and homing (Task 12).
  - Compared with Task 4, `Shell` gains the Plan 2A fields at inert defaults, `Impact` gains the last free position `fx, fy`, `shellAt`/`launchAt` build shells, and `stepShell` tracks the last free sample.
  - A shell with no modifiers takes exactly Task 4's path.

```ts
// src/game/titles/arcfire/ballistics.ts
//
// Shell flight (spec §3.2): launch from the muzzle along an integer angle,
// then fixed 1/60 s steps of semi-implicit Euler in Q16.16. Each step's
// movement is swept in <= 1 px increments against the tank hitboxes and the
// terrain spans, so nothing tunnels through a thin wall or clips past a tank.
// Plan 2A adds the flight modifiers a Stage can ask for — stop at the apex,
// homing after the apex, bounces off the terrain or the side walls — and a
// shell spawned inside a tank's hitbox ignores that tank until it has left it.
// A shell with no modifiers takes exactly Plan 1's path (pixels are floored).
import type { Fx } from "@/game/sim/types";
import { fromInt, toInt, mul } from "@/game/sim/math/fixed";
import { cosDeg, sinDeg } from "./aimTable";
import { isSolid, type Terrain } from "./terrain";
import {
  WORLD_W, STEPS_PER_SEC, GRAVITY_STEP, V_UNIT, MAX_FLIGHT_STEPS, BARREL_LEN, TANK_HIT_R,
} from "./constants";
import { idiv, floorPx } from "./imath";

export interface Shell {
  x: Fx;
  y: Fx;
  vx: Fx; // px/s
  vy: Fx; // px/s, positive = falling
  gravityStep: Fx; // fall-speed gain per step (weapon-scaled gravity)
  steps: number; // steps flown so far (the per-shell flight cap counts these)
  alive: boolean;
  // --- Plan 2A
  speed: Fx; // nominal speed: the launch speed, or a child's split speed ("up"/"cone" splits scale it)
  apexed: boolean; // latched on the step a rising shell stops rising
  stopAtApex: boolean; // die with an "apex" result on the step `apexed` latches
  homeDeg: number; // > 0: once apexed, turn <= this many whole degrees per step toward (homeX, homeY)
  homeX: number;
  homeY: number;
  bounces: number; // terrain reflections left
  wallBounces: number; // side-wall reflections left
  restitutionPct: number; // speed kept per reflection
  ignore: number; // bitmask of tanks whose hitbox the shell spawned inside; a bit clears once a sample is outside
}

/** A tank hitbox centre in px; the radius is TANK_HIT_R. */
export interface HitCircle {
  x: number;
  y: number;
}

export type Impact =
  | { kind: "terrain"; x: number; y: number; fx: Fx; fy: Fx } // (x, y) = first solid px; (fx, fy) = last free position
  | { kind: "tank"; x: number; y: number; tank: number; fx: Fx; fy: Fx }
  | { kind: "out"; x: number; y: number }; // left the world sideways, or hit the per-shell flight cap

/** The muzzle point for a hitbox centre and an integer angle (any integer degrees), px. */
export function muzzle(cx: number, cy: number, angleDeg: number): { x: number; y: number } {
  return {
    x: cx + toInt(mul(fromInt(BARREL_LEN), cosDeg(angleDeg))),
    y: cy - toInt(mul(fromInt(BARREL_LEN), sinDeg(angleDeg))),
  };
}

/** A shell at Q16.16 position (x, y) with velocity (vx, vy), nominal speed `speed` and no flight modifiers. */
export function shellAt(x: Fx, y: Fx, vx: Fx, vy: Fx, speed: Fx, gravityStep: Fx): Shell {
  return {
    x, y, vx, vy, gravityStep, steps: 0, alive: true,
    speed, apexed: false, stopAtApex: false, homeDeg: 0, homeX: 0, homeY: 0,
    bounces: 0, wallBounces: 0, restitutionPct: 100, ignore: 0,
  };
}

/** A shell at (x, y) px flying at `speed` (Fx px/s) along an integer angle (any integer degrees). */
export function launchAt(x: number, y: number, angleDeg: number, speed: Fx, gravityStep: Fx): Shell {
  return shellAt(fromInt(x), fromInt(y), mul(speed, cosDeg(angleDeg)), 0 - mul(speed, sinDeg(angleDeg)), speed, gravityStep);
}

export function launchShell(
  x: number, y: number, angleDeg: number, power: number, speedPct = 100, gravityPct = 100
): Shell {
  return launchAt(x, y, angleDeg, idiv(power * V_UNIT * speedPct, 100), idiv(GRAVITY_STEP * gravityPct, 100));
}

/**
 * Advance one physics step. Returns the first event along the swept path, or
 * null while the shell is still flying. windStep is the horizontal velocity
 * change per step (Fx). The order inside a step is part of the determinism
 * contract: wind, gravity, then the sweep, whose every sample checks the side
 * edges, then the tanks in index order, then the terrain.
 */
export function stepShell(s: Shell, t: Terrain, tanks: readonly HitCircle[], windStep: Fx): Impact | null {
  s.vx += windStep;
  s.vy += s.gravityStep;
  const nx = s.x + idiv(s.vx, STEPS_PER_SEC);
  const ny = s.y + idiv(s.vy, STEPS_PER_SEC);
  const n = Math.max(Math.abs(floorPx(nx) - floorPx(s.x)), Math.abs(floorPx(ny) - floorPx(s.y)), 1);
  const r2 = TANK_HIT_R * TANK_HIT_R;
  let fx = s.x; // the last free sample
  let fy = s.y;
  for (let i = 1; i <= n; i++) {
    const sx = s.x + idiv((nx - s.x) * i, n);
    const sy = s.y + idiv((ny - s.y) * i, n);
    const cx = floorPx(sx);
    const cy = floorPx(sy);
    if (cx < 0 || cx >= WORLD_W) {
      s.alive = false;
      return { kind: "out", x: cx, y: cy };
    }
    for (let k = 0; k < tanks.length; k++) {
      const dx = cx - tanks[k].x;
      const dy = cy - tanks[k].y;
      if (dx * dx + dy * dy <= r2) {
        s.alive = false;
        return { kind: "tank", x: cx, y: cy, tank: k, fx, fy };
      }
    }
    if (isSolid(t, cx, cy)) {
      s.alive = false;
      return { kind: "terrain", x: cx, y: cy, fx, fy };
    }
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

- [ ] **Step 11: Create the primitives skeleton** `src/game/titles/arcfire/weapons/primitives.ts`.
  - These are the design's `Shot`, `Trigger`, `Pending`, `emit`, `hurt`, `blastAt`, `tankMask`/`tankAt`, `addShell` and `fanOffset`, verbatim.
  - `applyEffects` has only its `blast` branch. `addShell` already arms every stage modifier, but `stepShell` ignores them until their tasks land.

```ts
// src/game/titles/arcfire/weapons/primitives.ts
//
// The effect implementations (spec §4.1): the only weapon code outside the
// shell flight in ballistics.ts. Every effect is applied INSTANTLY at its
// trigger step, in closed form or one bounded pass over the terrain; only
// shells and delays take simulated time. Integer px / Q16.16 throughout; no
// weapon draws from the match RNG. The order effects run in is part of the
// determinism contract (see resolve.ts).
import type { Fx } from "@/game/sim/types";
import { idiv, floorPx } from "../imath";
import { carveCircle, type Terrain } from "../terrain";
import type { HitCircle, Shell } from "../ballistics";
import { blastDamage } from "../damage";
import { TANK_HIT_R, MAX_SHELLS } from "../constants";
import type { Timeline, TimelineEvent } from "../timeline";
import type { Blast, Effect, Stage } from "./types";

/** Everything one shot's effects can touch. Built by resolveWeapon; lives for one turn. */
export interface Shot {
  t: Terrain;
  tanks: readonly HitCircle[]; // hitboxes, fixed for the whole shot (tanks ride the settle afterwards)
  shooter: number;
  shells: Shell[]; // every shell of the turn, by creation order (= Timeline.shells index)
  stages: Stage[]; // stages[i] = what shells[i] does on its trigger
  live: number; // shells still alive
  pending: Pending[]; // armed delays, in arming order
  received: number[]; // damage each tank took this turn
  rec: boolean; // build the Timeline's paths and events (false: the quiet AI path)
  tl: Timeline;
}

/** Where and how a stage fired. */
export interface Trigger {
  step: number;
  shell: number; // index of the shell that triggered
  x: number; // the trigger px: first solid (or tank) px on impact; the shell's px at the apex
  y: number;
  fx: Fx; // the last free position: children spawn here; roll and burn drop from here
  fy: Fx;
  vx: Fx; // velocity at the trigger: dig direction, the roll/burn tie-break, "ahead"/"cone" splits
  vy: Fx;
  speed: Fx; // the shell's nominal speed: the base of "up"/"cone" splits
  gravityStep: Fx; // inherited by children
  tank: number; // the tank struck, or -1
}

export interface Pending {
  at: number; // the step it fires on
  trig: Trigger;
  effects: readonly Effect[];
}

export function emit(shot: Shot, ev: TimelineEvent): void {
  if (shot.rec) shot.tl.events.push(ev);
}

/** Apply a list of effects at a trigger, completely and in array order (a delay only arms its list). */
export function applyEffects(shot: Shot, trig: Trigger, effects: readonly Effect[]): void {
  for (const e of effects) {
    if ("blast" in e) blastAt(shot, e.blast, trig.x, trig.y, trig.step, trig.shell, 0);
  }
}

/** Damage to tank p: it scores for whoever didn't take it (resolve.ts). */
function hurt(shot: Shot, p: number, amount: number, step: number, lag: number): void {
  if (amount <= 0) return;
  shot.received[p] += amount;
  emit(shot, { step, kind: "damage", target: p, amount, lag });
}

/** Plan 1's blast: carve a disc, then damage both tanks by distance (tank order 0, 1). */
export function blastAt(shot: Shot, b: Blast, x: number, y: number, step: number, shell: number, lag: number): void {
  carveCircle(shot.t, x, y, b.radius);
  emit(shot, { step, kind: "blast", shell, x, y, radius: b.radius, lag });
  for (let p = 0; p < 2; p++) hurt(shot, p, blastDamage(b, x, y, shot.tanks[p].x, shot.tanks[p].y), step, lag);
}

/** Bitmask of the tanks whose hitbox contains px (x, y). */
function tankMask(shot: Shot, x: number, y: number): number {
  let m = 0;
  for (let k = 0; k < 2; k++) {
    const dx = x - shot.tanks[k].x;
    const dy = y - shot.tanks[k].y;
    if (dx * dx + dy * dy <= TANK_HIT_R * TANK_HIT_R) m |= 1 << k;
  }
  return m;
}

/** The first tank whose hitbox contains (x, y), or -1. */
function tankAt(shot: Shot, x: number, y: number): number {
  const m = tankMask(shot, x, y);
  return m === 0 ? -1 : (m & 1) !== 0 ? 0 : 1;
}

/** Add a shell to the turn and arm its stage's flight modifiers. Returns its index, or -1 past MAX_SHELLS (dropped). */
export function addShell(shot: Shot, s: Shell, stage: Stage, angle: number, parent: number, step: number): number {
  if (shot.shells.length >= MAX_SHELLS) return -1;
  s.stopAtApex = stage.on === "apex";
  if (stage.homing) {
    const target = shot.tanks[1 - shot.shooter];
    s.homeDeg = stage.homing.degPerStep;
    s.homeX = target.x;
    s.homeY = target.y;
  }
  if (stage.bounce) {
    if (stage.bounce.walls) s.wallBounces = stage.bounce.times;
    else s.bounces = stage.bounce.times;
    s.restitutionPct = stage.bounce.restitutionPct;
  }
  s.ignore = tankMask(shot, floorPx(s.x), floorPx(s.y)); // only a line split can spawn inside a hitbox
  shot.shells.push(s);
  shot.stages.push(stage);
  shot.live++;
  if (shot.rec) shot.tl.shells.push({ angle, parent, start: step, points: [floorPx(s.x), floorPx(s.y)] });
  return shot.shells.length - 1;
}

/** Fan offset of item i of count across a TOTAL spread (the volley rule; count > 1 guards the divisor). */
export const fanOffset = (i: number, count: number, spread: number): number =>
  count > 1 ? idiv((2 * i - (count - 1)) * spread, 2 * (count - 1)) : 0;
```

- [ ] **Step 12: Replace** `src/game/titles/arcfire/resolve.ts` with the step loop. It is the design's final file without the early/dud trigger (Task 7), the bounce branch (Task 8) and beams (Task 11).

```ts
// src/game/titles/arcfire/resolve.ts
//
// resolveTurn (spec §1.3): one whole turn — the optional move, then the shot —
// resolved to completion. It MUTATES the MatchState it's given; callers that
// need the original (AI search, previews) resolve a cloneMatch() copy. The
// caller (match.ts applyTurn) validates the command first.
//
// The step loop and its ORDER are part of the determinism contract:
//   step s = 1, 2, ...:
//     1. delays due at s fire, in the order they were armed;
//     2. every shell that existed at the start of the step and is alive moves
//        once (stepShell), in creation order; a shell that triggers applies
//        its effects at once, in list order (so a later shell this step sees
//        their terrain); children it spawns are appended and first move at s + 1;
//   until no shell is alive and no delay is armed (or MAX_TURN_STEPS). Then
//   settle once, then score.
import { fromInt } from "@/game/sim/math/fixed";
import { ROSTER } from "./weapons/roster";
import { launchShell, muzzle, stepShell } from "./ballistics";
import { settle, spansFromHeight } from "./terrain";
import { hitCircles, moveTarget } from "./tanks";
import { idiv, floorPx } from "./imath";
import { STEPS_PER_SEC, MAX_TURN_STEPS } from "./constants";
import { addShell, applyEffects, emit, fanOffset, type Shot } from "./weapons/primitives";
import type { MatchState } from "./state";
import type { Timeline } from "./timeline";
import type { WeaponDef } from "./weapons/types";

export interface TurnInput {
  move: -1 | 0 | 1;
  weapon: number; // roster index
  angle: number; // integer degrees 0..180
  power: number; // integer 0..100
}

export function resolveTurn(m: MatchState, input: TurnInput): Timeline {
  return resolveWeapon(m, ROSTER[input.weapon], input, true);
}

/** resolveTurn without building the Timeline's paths or events: the same state and points, faster (AI search, verification). */
export function resolveTurnPoints(m: MatchState, input: TurnInput): [number, number] {
  return resolveWeapon(m, ROSTER[input.weapon], input, false).points;
}

/**
 * resolveTurn with the weapon passed in: the seam unit tests use to fire
 * synthetic WeaponDefs (and 2B's probe shell). `input.weapon` is only
 * recorded. `record = false` leaves `shells`, `events` and `settle.falls` empty.
 */
export function resolveWeapon(m: MatchState, def: WeaponDef, input: TurnInput, record = true): Timeline {
  const shooter = m.shooter;
  const tl: Timeline = {
    shooter,
    move: null,
    wind: m.wind,
    weapon: input.weapon,
    steps: 0,
    shells: [],
    events: [],
    settle: { heights: m.terrain.height, falls: [] }, // replaced by the settle below
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

  // 2. Launch: shells fan out from the muzzle.
  spansFromHeight(m.terrain);
  const shot: Shot = {
    t: m.terrain, tanks: hitCircles(m), shooter, shells: [], stages: [], live: 0, pending: [], received: [0, 0],
    rec: record, tl,
  };
  const launch = def.launch;
  if (launch.kind === "shell" && def.stage) {
    const count = launch.count ?? 1;
    for (let i = 0; i < count; i++) {
      const angle = input.angle + fanOffset(i, count, launch.spreadDeg ?? 0); // never clamped: may leave 0..180 near the horizon
      const mz = muzzle(shot.tanks[shooter].x, shot.tanks[shooter].y, angle);
      const s = launchShell(mz.x, mz.y, angle, input.power, launch.speedPct ?? 100, launch.gravityPct ?? 100);
      addShell(shot, s, def.stage, angle, -1, 0);
    }
  }

  // 3. The step loop.
  const windStep = idiv(fromInt(m.wind), STEPS_PER_SEC);
  for (let step = 1; shot.live > 0 || shot.pending.length > 0; step++) {
    if (step > MAX_TURN_STEPS) {
      abandon(shot, MAX_TURN_STEPS);
      break;
    }
    tl.steps = step;
    const n = shot.shells.length; // shells spawned during this step first move at step + 1
    for (let j = 0; j < shot.pending.length; ) {
      const p = shot.pending[j];
      if (p.at !== step) {
        j++;
        continue;
      }
      shot.pending.splice(j, 1);
      applyEffects(shot, { ...p.trig, step }, p.effects);
    }
    for (let i = 0; i < n; i++) {
      const s = shot.shells[i];
      if (!s.alive) continue;
      const hit = stepShell(s, shot.t, shot.tanks, windStep);
      const path = record ? tl.shells[i].points : null;
      if (hit === null) {
        if (path) path.push(floorPx(s.x), floorPx(s.y));
        continue;
      }
      if (!s.alive) shot.live--;
      if (hit.kind === "out") {
        if (path) path.push(hit.x, hit.y);
        emit(shot, { step, kind: "out", shell: i, x: hit.x, y: hit.y, lag: 0 });
        continue;
      }
      if (path) path.push(hit.x, hit.y);
      applyEffects(shot, {
        step, shell: i, x: hit.x, y: hit.y, fx: hit.fx, fy: hit.fy, vx: s.vx, vy: s.vy,
        speed: s.speed, gravityStep: s.gravityStep, tank: hit.kind === "tank" ? hit.tank : -1,
      }, shot.stages[i].effects);
    }
  }

  // 4. Dirt settles once, after the whole shot.
  tl.settle = settle(m.terrain, record);

  // 5. Damage to the opponent scores for the shooter; self-damage scores for the opponent.
  const opp = 1 - shooter;
  tl.points[shooter] += shot.received[opp];
  tl.points[opp] += shot.received[shooter];
  m.scores[0] += tl.points[0];
  m.scores[1] += tl.points[1];
  return tl;
}

/** The turn backstop: everything still flying is lost at `step` and armed delays are dropped (their `fuse` events keep an `at` beyond tl.steps: playback's cue). */
function abandon(shot: Shot, step: number): void {
  for (let i = 0; i < shot.shells.length; i++) {
    const s = shot.shells[i];
    if (!s.alive) continue;
    s.alive = false;
    emit(shot, { step, kind: "out", shell: i, x: floorPx(s.x), y: floorPx(s.y), lag: 0 });
  }
  shot.live = 0;
  shot.pending.length = 0;
}
```

- [ ] **Step 13: Make the type-only test edits** that the new `Shell` and `TimelineEvent` types require. They change no behaviour:

In `src/game/titles/arcfire/ballistics.test.ts`, replace

```ts
import { launchShell, stepShell, muzzle, type HitCircle, type Impact, type Shell } from "./ballistics";
```

with

```ts
import { launchShell, stepShell, muzzle, shellAt, type HitCircle, type Impact, type Shell } from "./ballistics";
```

In `src/game/titles/arcfire/ballistics.test.ts`, replace

```ts
    const s: Shell = { x: fromInt(600), y: fromInt(100), vx: 0, vy: 0, gravityStep: 0, steps: 0, alive: true };
```

with

```ts
    const s = shellAt(fromInt(600), fromInt(100), 0, 0, 0, 0);
```

In `src/game/titles/arcfire/ballistics.test.ts`, replace

```ts
    const s: Shell = { x: 100, y: fromInt(100), vx: fromInt(-6), vy: 0, gravityStep: 0, steps: 0, alive: true };
```

with

```ts
    const s = shellAt(100, fromInt(100), fromInt(-6), 0, 0, 0);
```

The weapons this test fires emit only `blast`, `damage` and `out`; the new union needs the narrowing spelled out:

In `src/game/titles/arcfire/resolve.test.ts`, replace

```ts
        if (e.kind === "damage") continue;
```

with

```ts
        if (e.kind !== "blast" && e.kind !== "out") continue;
```

- [ ] **Step 14: Replace the roster test** `src/game/titles/arcfire/weapons/roster.test.ts` with the design's Task 5 version (design-verbatim).
  - Plan 1's first two blocks are unchanged.
  - The old "shell launch + blast" block is a type error under the new model, so it becomes the validator block.
  - The exact 8-id pin becomes a **prefix pin** on `WIRE`, so later appends stay green. Tasks 7–12 each append their ids to `WIRE`, and Task 13 lands the final file.

```ts
import { describe, it, expect } from "vitest";
import { ROSTER, ROSTER_INDEX } from "./roster";
import { weaponErrors, maxShells, maxTurnSteps } from "./validate";
import { SUDDEN_DEATH_WEAPON, MAX_TURN_STEPS, MAX_SHELLS } from "../constants";

// The wire order pinned so far. Append-only: T7–T12 each append their slice of ids here; T13 replaces this
// prefix pin with the exact 32-id pin (§8.2). A prefix pin stays green when a later task appends weapons.
const WIRE = ["pulse", "pulse2", "nova", "needle", "crater", "triad", "fan", "railshot"];

describe("ROSTER", () => {
  it("has unique ids that index back to themselves", () => {
    const ids = ROSTER.map((w) => w.id);
    expect(new Set(ids).size).toBe(ids.length);
    ROSTER.forEach((w, i) => expect(ROSTER_INDEX[w.id]).toBe(i));
  });
  it("keeps Pulse at the sudden-death index", () => {
    expect(ROSTER[SUDDEN_DEATH_WEAPON].id).toBe("pulse");
  });
  it("pins the wire order so far (append-only: existing indices never move)", () => {
    expect(ROSTER.slice(0, WIRE.length).map((w) => w.id)).toEqual(WIRE);
  });
  it("every weapon is valid and within the static cost bounds", () => {
    for (const w of ROSTER) {
      expect(weaponErrors(w), w.id).toEqual([]);
      expect(maxShells(w)).toBeLessThanOrEqual(MAX_SHELLS);
      expect(maxTurnSteps(w)).toBeLessThan(MAX_TURN_STEPS);
    }
  });
});
```

- [ ] **Step 15: Replace the corpus test** `src/game/titles/arcfire/corpus.test.ts` with the design's final version (design-verbatim).
  - It adds the static-bound checks (`tl.steps ≤ maxTurnSteps`, `tl.shells.length ≤ maxShells`) and the horizon check.
  - It adds the event-kind and beam gates. Those switch on as each weapon lands (`id in ROSTER_INDEX`).

```ts
// src/game/titles/arcfire/corpus.test.ts
//
// Pins every roster weapon's behaviour, case by case (the corpus in
// src/game/test/arcfire/corpus.ts), plus each weapon's definition. Cases are
// keyed by weapon id, so a roster append only ADDS keys. Update modes (the
// variable set to exactly one of):
//   UPDATE_ARCFIRE_CORPUS=add   write new keys only; every existing key must still match
//   UPDATE_ARCFIRE_CORPUS=1     rewrite everything — only for a declared, reviewed re-pin
// On a mismatch the failure lists each moved case with its old and new fingerprint.
import { describe, it, expect } from "vitest";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { FNV_OFFSET, fnvFold, fnvHex } from "@/game/sim/hash";
import { runCorpus, corpusDigest, type Fingerprint } from "@/game/test/arcfire/corpus";
import { ROSTER, ROSTER_INDEX } from "./weapons/roster";
import { maxShells, maxTurnSteps } from "./weapons/validate";
import { MAX_FLIGHT_STEPS } from "./constants";
import type { WeaponDef } from "./weapons/types";

const FIXTURE = join("src/game/titles/arcfire/corpus.golden.json");

/** Canonical JSON (sorted keys, no `power`) of a def, FNV-1a'd: pins every behaviour number of the def. */
function defDigest(def: WeaponDef): string {
  const canon = (v: unknown): string => {
    if (Array.isArray(v)) return `[${v.map(canon).join(",")}]`;
    if (v !== null && typeof v === "object") {
      const o = v as Record<string, unknown>;
      return `{${Object.keys(o).filter((k) => k !== "power").sort().map((k) => `${JSON.stringify(k)}:${canon(o[k])}`).join(",")}}`;
    }
    return JSON.stringify(v);
  };
  const s = canon(def);
  let h = FNV_OFFSET;
  for (let i = 0; i < s.length; i++) h = fnvFold(h, s.charCodeAt(i));
  return fnvHex(h);
}

interface CorpusFixture { digest: string; defs: Record<string, string>; cases: Record<string, Fingerprint> }

describe("arcfire corpus", () => {
  it("reproduces every pinned case and weapon definition", () => {
    const kinds = new Set<string>();
    const volleyAngles: number[] = [];
    let capped = false;
    let beamHit = false;
    const cases = runCorpus((c, tl) => {
      const def = ROSTER[ROSTER_INDEX[c.w]];
      for (const e of tl.events) kinds.add(e.kind === "bounce" ? `bounce:${e.wall ? "wall" : "terrain"}` : e.kind === "build" ? `build:${e.shape}` : e.kind);
      for (const s of tl.shells) {
        if (s.parent === -1) volleyAngles.push(s.angle);
        if (s.points.length === 2 * (MAX_FLIGHT_STEPS + 1)) capped = true;
      }
      if (def.launch.kind === "beam" && tl.points[c.shooter] > 0) beamHit = true;
      // the static cost bounds hold for every case
      expect(tl.steps).toBeLessThanOrEqual(maxTurnSteps(def));
      expect(tl.shells.length).toBeLessThanOrEqual(maxShells(def));
    });
    const defs = Object.fromEntries(ROSTER.map((w) => [w.id, defDigest(w)]));
    const fresh: CorpusFixture = { digest: corpusDigest(cases), defs, cases };

    // Not inert: the corpus exercises the flight cap, both sides of the horizon, and — once
    // the weapon that makes it exists — every event kind (the gates switch on as weapons land).
    expect(capped, "a shell reached the per-shell flight cap").toBe(true);
    expect(Math.min(...volleyAngles)).toBeLessThan(0);
    expect(Math.max(...volleyAngles)).toBeGreaterThan(180);
    const gates: [string, string][] = [
      ["twinnova", "fuse"], ["cascade", "split"], ["skipper", "bounce:terrain"], ["ricochet", "bounce:wall"],
      ["tumbler", "roll"], ["burrow", "dig"], ["inferno", "burn"], ["rampart", "build:wall"], ["bastion", "build:ball"],
      ["leveler", "build:level"], ["lancer", "beam"], ["quake", "quake"],
    ];
    for (const [id, kind] of gates) if (id in ROSTER_INDEX) expect(kinds.has(kind), `${id} emits ${kind}`).toBe(true);
    if ("lancer" in ROSTER_INDEX) expect(beamHit, "a beam scored").toBe(true);

    const mode = process.env.UPDATE_ARCFIRE_CORPUS;
    const old: CorpusFixture | null = existsSync(FIXTURE) ? JSON.parse(readFileSync(FIXTURE, "utf8")) : null;
    const moved = old
      ? Object.keys(old.cases).filter((id) => JSON.stringify(old.cases[id]) !== JSON.stringify(cases[id]))
        .map((id) => `${id}: ${JSON.stringify(old.cases[id])} -> ${JSON.stringify(cases[id] ?? null)}`)
        .concat(Object.keys(old.defs).filter((id) => old.defs[id] !== defs[id]).map((id) => `def ${id}: ${old.defs[id]} -> ${defs[id]}`))
      : [];
    if (mode === "1") console.log(`re-pinned ${moved.length} moved cases:\n${moved.join("\n")}`); // paste into the commit body
    if (mode === "1" || (mode === "add" && moved.length === 0)) writeFileSync(FIXTURE, JSON.stringify(fresh, null, 1) + "\n");
    expect(existsSync(FIXTURE), "create it once with UPDATE_ARCFIRE_CORPUS=1").toBe(true);
    if (mode !== "1") expect(moved, "moved cases").toEqual([]);
    const pinned: CorpusFixture = JSON.parse(readFileSync(FIXTURE, "utf8"));
    expect(Object.keys(cases).sort()).toEqual(Object.keys(pinned.cases).sort()); // no case missing or unpinned
    expect(defs).toEqual(pinned.defs);
    expect(fresh.digest).toBe(pinned.digest);
  });
});
```

- [ ] **Step 16: Run the Arcfire gate: everything passes, and nothing moved**

Run: `npx vitest run src/game/titles/arcfire src/game/sim/purity.test.ts`
Expected: PASS: 17 files, 113 tests. Every Plan 1 test is green, and the corpus reproduces all 123 cases, `fa6b1ed7`, with no update variable set.

Run: `git status --short src/game/titles/arcfire`
Expected: no `.json` file is listed; no fixture was rewritten.

If the corpus test fails, its failure lists every moved case: the loop refactor has diverged from Plan 1's order. Diff `resolve.ts`, `ballistics.ts` and `weapons/primitives.ts` against this task's blocks.

- [ ] **Step 17: Types and the full suite**

Run: `npx tsc --noEmit`
Expected: exit 0.

Run: `npm test`
Expected: all pass.

- [ ] **Step 18: Run the cross-engine gate**

Run: `npm run test:e2e:cross-engine -- --grep-invert firefox`
Expected: exit 0, `2 passed`. Chromium and WebKit reproduce `5167b43d`, `389a1340` and `fa6b1ed7` (Firefox runs in CI).

- [ ] **Step 19: Commit**

```bash
git add src/game/titles/arcfire/weapons/types.ts src/game/titles/arcfire/timeline.ts src/game/titles/arcfire/weapons/validate.ts src/game/titles/arcfire/constants.ts src/game/titles/arcfire/terrain.ts src/game/titles/arcfire/ballistics.ts src/game/titles/arcfire/weapons/primitives.ts src/game/titles/arcfire/resolve.ts src/game/test/arcfire/fixtures.ts src/game/titles/arcfire/weapons/validate.test.ts src/game/titles/arcfire/weapons/primitives.test.ts src/game/titles/arcfire/weapons/roster.test.ts src/game/titles/arcfire/corpus.test.ts src/game/titles/arcfire/ballistics.test.ts src/game/titles/arcfire/resolve.test.ts
git commit -m "refactor(arcfire): Plan 2A data model, step loop, validator and quiet path (behaviour-preserving)" -m "Pins and corpus byte-identical: golden 389a1340, windless 8d7dc831, corpus fa6b1ed7 (0 of 123 cases moved)." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 6: Terrain operations — the allocation-free interval edits, `addInterval`, `carveCapsule`, `groundBelow`, `surfaceTop`

**Files:**
- Modify: `src/game/titles/arcfire/terrain.ts` (full replacement, design-verbatim)
- Modify: `src/game/titles/arcfire/terrain.test.ts` (imports + appended tests)

**Interfaces:**
- Consumes: Plan 1's `Terrain`, `isSolid`, `carveCircle`, `settle` (with Task 5's `collect`).
- Produces (all in `terrain.ts`):
  - `removeInterval(t, x, a, b): void` is now exported and allocation-free: a module scratch buffer `PIECES` and `writeColumn` replace the old array, and Plan 1's keep-the-lowest-8 overflow rule is unchanged.
  - `addInterval(t: Terrain, x: number, a: number, b: number): void`: a union clamped to [0, `WORLD_H`) that **never loses dirt**. A 9th piece absorbs the span below it, or the one above when there is none below.
  - `carveCapsule(t: Terrain, x0: number, y0: number, x1: number, y1: number, r: number): void`: the union of radius-r discs on every ≤ 1 px sample of the segment, done as one `removeInterval` per column. At zero length it is exactly `carveCircle`.
  - `groundBelow(t: Terrain, x: number, y: number): number`: the first solid y at or below y (`WORLD_H` when there is none).
  - `surfaceTop(t: Terrain, x: number): number`: the top of the column's highest span (`WORLD_H` if the column is empty).
  - `carveCircle` is byte-identical, so no Plan 1 crater can move.

- [ ] **Step 1: Write the failing tests** (three edits to `src/game/titles/arcfire/terrain.test.ts`):

In `src/game/titles/arcfire/terrain.test.ts`, replace

```ts
import { makeRng } from "@/game/sim/math/rng";
```

with

```ts
import { makeRng, nextRange } from "@/game/sim/math/rng";
```

In `src/game/titles/arcfire/terrain.test.ts`, replace

```ts
import { makeTerrain, generateTerrain, isSolid, carveCircle, settle, spansFromHeight, cloneTerrain } from "./terrain";
```

with

```ts
import {
  makeTerrain, generateTerrain, isSolid, carveCircle, settle, spansFromHeight, cloneTerrain,
  addInterval, removeInterval, carveCapsule, groundBelow, surfaceTop, type Terrain,
} from "./terrain";
import { idiv } from "./imath";
```

Append to the end of `src/game/titles/arcfire/terrain.test.ts` (after one blank line):

```ts
/** Column x's spans as [top, bottom] pairs. */
function spansOf(t: Terrain, x: number): number[][] {
  const out: number[][] = [];
  for (let i = 0; i < t.spanCount[x]; i++) out.push([t.spans[x * MAX_SPANS * 2 + i * 2], t.spans[x * MAX_SPANS * 2 + i * 2 + 1]]);
  return out;
}

/** An empty column (no spans) at x on flat ground y. */
function withEmptyColumn(y: number, x: number): Terrain {
  const t = flat(y);
  t.height[x] = WORLD_H;
  spansFromHeight(t);
  return t;
}

describe("groundBelow / surfaceTop", () => {
  it("finds the first solid y at or below y, through holes, down to the floor", () => {
    const t = flat(300);
    expect(groundBelow(t, 600, 100)).toBe(300);
    expect(groundBelow(t, 600, 350)).toBe(350); // already inside the ground
    carveCircle(t, 600, 360, 10); // hole 350..370 under a 50 px roof
    expect(groundBelow(t, 600, 355)).toBe(371);
    expect(groundBelow(withEmptyColumn(300, 9), 9, 100)).toBe(WORLD_H);
  });
  it("surfaceTop is the top of the highest span, or WORLD_H for an empty column", () => {
    const t = flat(300);
    expect(surfaceTop(t, 600)).toBe(300);
    carveCircle(t, 600, 360, 10);
    expect(surfaceTop(t, 600)).toBe(300);
    expect(surfaceTop(withEmptyColumn(300, 9), 9)).toBe(WORLD_H);
  });
});

describe("addInterval", () => {
  it("merges touching dirt into one span", () => {
    const t = flat(300);
    addInterval(t, 600, 290, 300);
    expect(spansOf(t, 600)).toEqual([[290, 500]]);
  });
  it("adds a floating span that settle then drops onto the ground", () => {
    const t = flat(400);
    addInterval(t, 600, 100, 150);
    expect(spansOf(t, 600)).toEqual([[100, 150], [400, 500]]);
    const r = settle(t);
    expect(r.heights[600]).toBe(350);
    expect(r.falls).toContainEqual({ x: 600, top: 100, bottom: 150, fall: 250 });
  });
  it("clamps to [0, WORLD_H)", () => {
    const t = withEmptyColumn(300, 9);
    addInterval(t, 9, -30, 20);
    addInterval(t, 9, 480, 600);
    expect(spansOf(t, 9)).toEqual([[0, 20], [480, 500]]);
  });
  it("never loses dirt: a 9th span merges with the span below it, or with the one above when none is below", () => {
    const t = withEmptyColumn(300, 9);
    for (let k = 0; k < 8; k++) addInterval(t, 9, 10 + 20 * k, 20 + 20 * k); // [10,20) [30,40) ... [150,160)
    expect(t.spanCount[9]).toBe(8);
    addInterval(t, 9, 0, 5); // above them all: closes the gap to [10,20)
    expect(spansOf(t, 9)[0]).toEqual([0, 20]);
    expect(t.spanCount[9]).toBe(8);
    addInterval(t, 9, 170, 175); // below them all: closes the gap to [150,160)
    expect(spansOf(t, 9)[7]).toEqual([150, 175]);
    expect(t.spanCount[9]).toBe(8);
  });
  it("is a union against a pixel model (300 random columns × 14 random adds / removes)", () => {
    const rng = makeRng(20260923);
    const x = 600;
    const bad: string[] = [];
    let overflows = 0;
    for (let col = 0; col < 300; col++) {
      const t = flat(200 + nextRange(rng, 300));
      for (let op = 0; op < 14; op++) {
        const want = new Uint8Array(WORLD_H);
        for (let y = 0; y < WORLD_H; y++) want[y] = isSolid(t, x, y) ? 1 : 0;
        const a = nextRange(rng, WORLD_H + 40) - 20;
        const b = a + 1 + nextRange(rng, 30);
        const add = nextRange(rng, 2) === 0;
        if (add) addInterval(t, x, a, b);
        else removeInterval(t, x, a, b);
        for (let y = Math.max(0, a); y < Math.min(WORLD_H, b); y++) want[y] = add ? 1 : 0;
        let runs = 0; // spans in the exact union / difference
        for (let y = 0; y < WORLD_H; y++) if (want[y] && (y === 0 || !want[y - 1])) runs++;
        if (runs > MAX_SPANS) overflows++;
        for (let y = 0; y < WORLD_H; y++) {
          const got = isSolid(t, x, y) ? 1 : 0;
          // exact when it fits; on overflow addInterval never loses dirt, and removeInterval keeps Plan 1's drop-the-top rule
          const ok = runs <= MAX_SPANS ? got === want[y] : add ? got >= want[y] : got <= want[y];
          if (!ok) bad.push(`column ${col} op ${op}: y ${y} is ${got}, want ${want[y]}`);
        }
        const s = spansOf(t, x);
        if (s.length > MAX_SPANS) bad.push(`column ${col} op ${op}: ${s.length} spans`);
        for (let i = 0; i < s.length; i++) {
          // ordered, disjoint and non-touching
          if (s[i][0] >= s[i][1] || (i > 0 && s[i][0] <= s[i - 1][1])) bad.push(`column ${col} op ${op}: ${JSON.stringify(s)}`);
        }
      }
    }
    expect(bad).toEqual([]);
    expect(overflows).toBeGreaterThan(0); // the overflow rules were exercised
  });
});

describe("carveCapsule", () => {
  it("equals carveCircle exactly at zero length", () => {
    const a = flat(300);
    const b = flat(300);
    carveCapsule(a, 600, 310, 600, 310, 12);
    carveCircle(b, 600, 310, 12);
    expect(Array.from(a.spanCount)).toEqual(Array.from(b.spanCount));
    expect(Array.from(a.spans)).toEqual(Array.from(b.spans));
  });
  it("equals the brute-force union of discs on every <= 1 px sample (60 random segments, r 1..8)", () => {
    const rng = makeRng(7);
    for (let k = 0; k < 60; k++) {
      const x0 = nextRange(rng, WORLD_W);
      const y0 = 250 + nextRange(rng, 260);
      const x1 = Math.min(WORLD_W - 1, Math.max(0, x0 + nextRange(rng, 241) - 120));
      const y1 = 250 + nextRange(rng, 260);
      const r = 1 + nextRange(rng, 8);
      const cap = flat(300);
      const discs = flat(300);
      carveCapsule(cap, x0, y0, x1, y1, r);
      const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
      for (let i = 0; i <= n; i++) carveCircle(discs, x0 + idiv((x1 - x0) * i, n), y0 + idiv((y1 - y0) * i, n), r);
      for (let x = Math.max(0, Math.min(x0, x1) - r - 1); x <= Math.min(WORLD_W - 1, Math.max(x0, x1) + r + 1); x++) {
        expect(spansOf(cap, x), `segment ${k} column ${x}`).toEqual(spansOf(discs, x));
      }
    }
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/game/titles/arcfire/terrain.test.ts`
Expected: FAIL, exactly the 9 new tests; Plan 1's 7 terrain tests pass. The new functions are not exported yet:
- the two `groundBelow / surfaceTop` tests: `TypeError: groundBelow is not a function` and `TypeError: surfaceTop is not a function`
- the five `addInterval` tests: `TypeError: addInterval is not a function`
- the two `carveCapsule` tests: `TypeError: carveCapsule is not a function`

- [ ] **Step 3: Replace** `src/game/titles/arcfire/terrain.ts` with (design-verbatim):

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
  WORLD_W, WORLD_H, MAX_SPANS, TERRAIN_MIN_Y, TERRAIN_MAX_Y, TERRAIN_CTRL_MIN_Y, TERRAIN_CTRL_MAX_Y,
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

// Scratch for the column edits: one column's pieces, at most MAX_SPANS + 1 of
// them. Module-level so an edit allocates nothing; the sim is single-threaded
// and no edit re-enters another.
const PIECES = new Int32Array(2 * (MAX_SPANS + 1));

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
  const lo = TERRAIN_CTRL_MIN_Y;
  const hi = TERRAIN_CTRL_MAX_Y;
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

/** The first solid y at or below y in column x (WORLD_H when nothing is: the floor). x must be in the world. */
export function groundBelow(t: Terrain, x: number, y: number): number {
  const o = x * STRIDE;
  const n = t.spanCount[x];
  for (let i = 0; i < n; i++) {
    const top = t.spans[o + i * 2];
    if (t.spans[o + i * 2 + 1] > y) return top > y ? top : y;
  }
  return y > WORLD_H ? y : WORLD_H;
}

/** The top of column x's highest span (WORLD_H if the column is empty). x must be in the world. */
export function surfaceTop(t: Terrain, x: number): number {
  return t.spanCount[x] > 0 ? t.spans[x * STRIDE] : WORLD_H;
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

/** Write `pieces` (top, bottom) pairs from PIECES into column x, keeping the LOWEST MAX_SPANS. */
function writeColumn(t: Terrain, x: number, pieces: number): void {
  const o = x * STRIDE;
  const keep = pieces < MAX_SPANS ? pieces : MAX_SPANS;
  const first = pieces - keep;
  for (let i = 0; i < keep; i++) {
    t.spans[o + i * 2] = PIECES[(first + i) * 2];
    t.spans[o + i * 2 + 1] = PIECES[(first + i) * 2 + 1];
  }
  t.spanCount[x] = keep;
}

/**
 * Remove the half-open interval [a, b) from column x's spans. More pieces than
 * MAX_SPANS (8+ separate holes in one column in one shot): keep the LOWEST
 * MAX_SPANS and drop the top one — Plan 1's rule, deterministic and rare.
 */
export function removeInterval(t: Terrain, x: number, a: number, b: number): void {
  if (b <= a) return;
  const o = x * STRIDE;
  const n = t.spanCount[x];
  let p = 0;
  for (let i = 0; i < n; i++) {
    const top = t.spans[o + i * 2];
    const bot = t.spans[o + i * 2 + 1];
    if (bot <= a || top >= b) {
      PIECES[p++] = top;
      PIECES[p++] = bot;
      continue;
    }
    if (top < a) {
      PIECES[p++] = top;
      PIECES[p++] = a;
    }
    if (bot > b) {
      PIECES[p++] = b;
      PIECES[p++] = bot;
    }
  }
  writeColumn(t, x, p / 2);
}

/**
 * Add solid [a, b) to column x (a union), clamped to [0, WORLD_H). Spans stay
 * ordered top-down, disjoint and non-touching. Never loses dirt: if the new
 * piece would be a 9th span, it is extended down to absorb the span below it
 * (or, with none below, up to absorb the span above) — dirt lands on dirt.
 */
export function addInterval(t: Terrain, x: number, a: number, b: number): void {
  if (a < 0) a = 0;
  if (b > WORLD_H) b = WORLD_H;
  if (b <= a) return;
  const o = x * STRIDE;
  const n = t.spanCount[x];
  let p = 0;
  let at = -1; // piece index of the new interval
  for (let i = 0; i < n; i++) {
    const top = t.spans[o + i * 2];
    const bot = t.spans[o + i * 2 + 1];
    if (bot < a) { // wholly above, not touching
      PIECES[p++] = top;
      PIECES[p++] = bot;
      continue;
    }
    if (top > b) { // wholly below, not touching
      if (at < 0) {
        at = p / 2;
        PIECES[p++] = a;
        PIECES[p++] = b;
      }
      PIECES[p++] = top;
      PIECES[p++] = bot;
      continue;
    }
    if (top < a) a = top; // overlapping or touching: absorb it into the new interval
    if (bot > b) b = bot;
  }
  if (at < 0) {
    at = p / 2;
    PIECES[p++] = a;
    PIECES[p++] = b;
  }
  let pieces = p / 2;
  if (pieces > MAX_SPANS) {
    // Close the gap on one side of the new piece: below it if there is a span below, else above it.
    const j = at + 1 < pieces ? at : at - 1; // merge pieces j and j + 1
    PIECES[j * 2 + 1] = PIECES[(j + 1) * 2 + 1];
    for (let k = j + 1; k < pieces - 1; k++) {
      PIECES[k * 2] = PIECES[(k + 1) * 2];
      PIECES[k * 2 + 1] = PIECES[(k + 1) * 2 + 1];
    }
    pieces--;
  }
  writeColumn(t, x, pieces);
}

// Scratch for carveCapsule: per-column [lo, hi) bounds over the columns it touches.
const CAP_LO = new Int32Array(WORLD_W);
const CAP_HI = new Int32Array(WORLD_W);

/**
 * Remove a capsule — the union of radius-r discs centred on every <= 1 px
 * sample of the integer segment (x0, y0) -> (x1, y1) — from the spans. One
 * removeInterval per column: consecutive samples are <= 1 px apart, so each
 * column's section of the union is a single interval. A zero-length capsule
 * is exactly carveCircle.
 */
export function carveCapsule(t: Terrain, x0: number, y0: number, x1: number, y1: number, r: number): void {
  if (r < 0) return;
  const left = Math.max(0, Math.min(x0, x1) - r);
  const right = Math.min(WORLD_W - 1, Math.max(x0, x1) + r);
  if (right < left) return;
  for (let c = left; c <= right; c++) {
    CAP_LO[c] = 2147483647;
    CAP_HI[c] = -2147483648;
  }
  const half = new Int32Array(r + 1); // half[d] = the disc's half-height d columns from its centre
  for (let d = 0; d <= r; d++) half[d] = isqrt(r * r - d * d);
  const dx = x1 - x0;
  const dy = y1 - y0;
  const n = Math.max(Math.abs(dx), Math.abs(dy), 1);
  for (let i = 0; i <= n; i++) {
    const sx = x0 + idiv(dx * i, n);
    const sy = y0 + idiv(dy * i, n);
    const c0 = Math.max(left, sx - r);
    const c1 = Math.min(right, sx + r);
    for (let c = c0; c <= c1; c++) {
      const h = half[c < sx ? sx - c : c - sx];
      if (sy - h < CAP_LO[c]) CAP_LO[c] = sy - h;
      if (sy + h + 1 > CAP_HI[c]) CAP_HI[c] = sy + h + 1;
    }
  }
  for (let c = left; c <= right; c++) if (CAP_LO[c] < CAP_HI[c]) removeInterval(t, c, CAP_LO[c], CAP_HI[c]);
}

/**
 * Drop every floating span straight down onto the stack below it. All solid
 * material in a column ends up as ONE span resting on the floor, so the new
 * surface is WORLD_H minus the column's total solid length. `collect = false`
 * skips building `falls` (the quiet resolve path); the terrain is identical.
 */
export function settle(t: Terrain, collect = true): SettleResult {
  const falls: SettleFall[] = [];
  for (let x = 0; x < WORLD_W; x++) {
    const o = x * STRIDE;
    let stackTop = WORLD_H;
    for (let i = t.spanCount[x] - 1; i >= 0; i--) {
      const top = t.spans[o + i * 2];
      const bot = t.spans[o + i * 2 + 1];
      if (collect && stackTop > bot) falls.push({ x, top, bottom: bot, fall: stackTop - bot });
      stackTop -= bot - top;
    }
    t.height[x] = stackTop;
  }
  spansFromHeight(t);
  return { heights: t.height.slice(), falls };
}
```

- [ ] **Step 4: Run the terrain tests**

Run: `npx vitest run src/game/titles/arcfire/terrain.test.ts`
Expected: PASS (16 tests). Plan 1's "keeps at most MAX_SPANS spans per column, deterministically" still passes, so `removeInterval` keeps Plan 1's rule.

- [ ] **Step 5: Run the Arcfire gate, types and the full suite**

Run: `npx vitest run src/game/titles/arcfire src/game/sim/purity.test.ts`
Expected: PASS: 17 files, 122 tests. The corpus stays `fa6b1ed7` and both pins hold.

Run: `npx tsc --noEmit`
Expected: exit 0.

Run: `npm test`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/game/titles/arcfire/terrain.ts src/game/titles/arcfire/terrain.test.ts
git commit -m "feat(arcfire): terrain ops — addInterval (never loses dirt), carveCapsule, groundBelow, surfaceTop; allocation-free removeInterval" -m "Pins and corpus unchanged (389a1340, 8d7dc831, fa6b1ed7)." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

# Part B — The weapons (Tasks 7–13)

Every weapon task follows the same shape:
1. Write the failing tests (primitive unit tests, the roster `WIRE` prefix append, and any staged totality cases), and run them to see the declared failures.
2. Land the code and the roster slice.
3. Append the new weapons' corpus keys with `UPDATE_ARCFIRE_CORPUS=add`. It writes only new keys and refuses if any existing key moved.
4. Check the corpus digest, run the gate, and commit.

`389a1340`, `8d7dc831` and every existing corpus key stay byte-identical throughout.

### Task 7: Delay + split + apex → Twin Nova, Cascade, Hydra, Hailstorm, Shrapnel, Barrage (indices 8–13)

**Files:**
- Modify: `src/game/titles/arcfire/ballistics.ts` (full replacement: + apex latch, `rotateVel`, spawn-inside mask)
- Modify: `src/game/titles/arcfire/weapons/primitives.ts` (full replacement: + `split`, the delay branch)
- Modify: `src/game/titles/arcfire/resolve.ts` (full replacement: + the apex trigger, `early` and `dud`)
- Modify: `src/game/titles/arcfire/weapons/roster.ts` (import + `blast` helper; append indices 8–13)
- Modify (tests): `ballistics.test.ts`, `weapons/primitives.test.ts`, `weapons/validate.test.ts`, `weapons/roster.test.ts`
- Modify (fixture): `corpus.golden.json` (new keys only)

**Interfaces:**
- Consumes: Task 5's `Shot`, `Trigger`, `addShell`, `fanOffset`, `applyEffects`, `shellAt`, `Stage`, `Split`; Task 4's `cosDeg`/`sinDeg`.
- Produces:
  - `rotateVel(vx: Fx, vy: Fx, deg: number): [Fx, Fx]` (aim sense: `+` turns a rightward vector toward up).
  - `Impact` gains `{ kind: "apex"; x; y; fx; fy }`.
  - `stepShell` latches the apex on the step a rising shell stops rising (`vy < 0` before the step's gravity, `vy ≥ 0` after it) and ends there for `stopAtApex` shells, without moving. It honours `Shell.ignore`: a tank whose hitbox the shell spawned inside is ignored until a sample leaves it.
  - `applyEffects` handles `split` and `delay`: a delay arms `{ at: step + max(1, steps), trig, effects }` and emits `fuse`.
  - The resolver applies `stage.early` when an apex-stage shell hits something before its apex, or emits `dud` without it.
  - `ROSTER_INDEX` gains `twinnova` 8, `cascade` 9, `hydra` 10, `hailstorm` 11, `shrapnel` 12, `barrage` 13.

**Rules this task implements** (the design's §3.2–§3.3, §4.6):
- **Split children.** Child `i` of `n` is offset `fanOffset(i, n, spreadDeg)`.
  - `"up"` fans about straight up at the parent's nominal speed × pct (Cascade, Shrapnel).
  - `"ahead"` rotates the parent's current velocity × pct (Hydra, Barrage).
  - `"cone"` is the parent's velocity **plus** a fan about straight down at nominal × pct (Hailstorm).
  - Children spawn at the parent's last free point, shifted by `gapPx` for a line (Barrage).
- **Spawning.** A spawn point is never tested. A child spawned inside terrain impacts at its first sample, one step later; one spawned inside a hitbox ignores that tank until it leaves it.

- [ ] **Step 1: Write the failing ballistics tests** (two edits):

In `src/game/titles/arcfire/ballistics.test.ts`, replace

```ts
import { launchShell, stepShell, muzzle, shellAt, type HitCircle, type Impact, type Shell } from "./ballistics";
```

with

```ts
import { launchShell, stepShell, muzzle, shellAt, rotateVel, type HitCircle, type Impact, type Shell } from "./ballistics";
import { floorPx } from "./imath";
```

Append to the end of `src/game/titles/arcfire/ballistics.test.ts` (after one blank line):

```ts
describe("rotateVel", () => {
  it("turns a rightward velocity toward up for a positive angle (aim sense)", () => {
    expect(rotateVel(fromInt(100), 0, 90)).toEqual([0, fromInt(-100)]);
  });
});

describe("the apex latch", () => {
  it("a stopAtApex shell ends on the step it stops rising, without moving that step", () => {
    const s = launchShell(600, 300, 60, 50);
    s.stopAtApex = true;
    const t = flat(WORLD_H);
    let step = 0;
    let hit: Impact | null = null;
    let at = { x: s.x, y: s.y };
    while (hit === null) {
      step++;
      const vyBefore = s.vy;
      at = { x: s.x, y: s.y };
      hit = stepShell(s, t, [], 0);
      if (hit !== null) {
        expect(vyBefore).toBeLessThan(0); // rising before the step's gravity ...
        expect(s.vy).toBeGreaterThanOrEqual(0); // ... and not after it
      }
    }
    expect(step).toBe(60);
    expect(hit).toEqual({ kind: "apex", x: floorPx(at.x), y: floorPx(at.y), fx: at.x, fy: at.y });
    expect([s.x, s.y]).toEqual([at.x, at.y]); // it did not move on the apex step
    expect([s.apexed, s.alive]).toEqual([true, false]);
  });
  it("a shell launched level never apexes", () => {
    const s = launchShell(100, 300, 0, 50);
    s.stopAtApex = true;
    expect(fly(s, flat(400)).kind).toBe("terrain");
    expect(s.apexed).toBe(false);
  });
});

describe("the spawn-inside mask", () => {
  it("ignores the tank it spawned inside until a sample leaves the hitbox, then can hit it", () => {
    const tanks = [{ x: 600, y: 300 }];
    const t = flat(WORLD_H);
    const s = shellAt(fromInt(600), fromInt(300), fromInt(600), 0, fromInt(600), 0); // 10 px/step right, no gravity
    s.ignore = 1;
    const back = fromInt(-40); // wind: -40 px/s per step, so it turns around after 15 steps
    let hit: Impact | null = null;
    for (let step = 1; hit === null && step <= 100; step++) {
      hit = stepShell(s, t, tanks, back);
      if (step === 1) expect(s.ignore).toBe(1); // still inside
      if (step === 2) expect(s.ignore).toBe(0); // a sample left the hitbox
    }
    expect(hit).toMatchObject({ kind: "tank", tank: 0, x: 614, y: 300 }); // back into it from the right
  });
});

describe("a spawn point is never tested (only the samples after it are)", () => {
  // flat ground at 400, no tanks, no wind, no gravity
  it("a shell spawned inside the ground impacts at its first sample", () => {
    const s = shellAt(fromInt(600), fromInt(420), fromInt(60), 0, fromInt(60), 0); // 20 px deep, 1 px/step right
    expect(stepShell(s, flat(400), [], 0)).toEqual({ kind: "terrain", x: 601, y: 420, fx: fromInt(600), fy: fromInt(420) });
  });
  it("a shell spawned on a surface pixel moving out flies on", () => {
    const s = shellAt(fromInt(600), fromInt(400), 0, fromInt(-60), fromInt(60), 0); // rising 1 px/step
    expect(stepShell(s, flat(400), [], 0)).toBeNull();
    expect([floorPx(s.x), floorPx(s.y), s.alive]).toEqual([600, 399, true]);
  });
  it("a shell spawned off the world is out at its first sample", () => {
    const s = shellAt(fromInt(-5), fromInt(300), fromInt(60), 0, fromInt(60), 0);
    expect(stepShell(s, flat(400), [], 0)).toEqual({ kind: "out", x: -4, y: 300 });
  });
});
```

- [ ] **Step 2: Write the failing primitive tests** (the design's *(proto)* values, pinned):

Append to the end of `src/game/titles/arcfire/weapons/primitives.test.ts` (after one blank line):

```ts
describe("delay", () => {
  it("Twin Nova blasts twice at one point, 30 steps apart, announced by a fuse", () => {
    const tl = fire(flatBattle(), "twinnova", 60, 50);
    expect(eventsOf(tl, "blast").map((b) => [b.step, b.x, b.y, b.radius])).toEqual([[124, 663, 400, 50], [154, 663, 400, 70]]);
    expect(eventsOf(tl, "fuse")).toEqual([{ step: 124, kind: "fuse", shell: 0, x: 663, y: 400, at: 154 }]);
    expect(tl.steps).toBe(154);
    expect(tl.points).toEqual([65, 0]);
  });
  it("a delay past the turn backstop is dropped: one blast, and a fuse whose `at` is beyond tl.steps", () => {
    const B = { radius: 28, damage: 40 };
    const tl = fireDef(flatBattle(), synth({ on: "impact", effects: [{ blast: B }, { delay: { steps: 5000, then: [{ blast: B }] } }] }), 60, 50);
    expect(eventsOf(tl, "blast").length).toBe(1);
    expect(tl.steps).toBe(MAX_TURN_STEPS);
    const fuses = eventsOf(tl, "fuse");
    expect(fuses.length).toBe(1);
    expect(fuses[0].at).toBeGreaterThan(tl.steps);
  });
});

describe("split", () => {
  it("Cascade: 13 shells over three generations, each fanned about straight up", () => {
    const tl = fire(flatBattle(), "cascade", 60, 50);
    expect(tl.shells.length).toBe(13);
    const splits = eventsOf(tl, "split");
    expect(splits.map((s) => [s.step, s.children.length])).toEqual([[124, 3], [156, 3], [173, 3], [186, 3]]);
    expect(eventsOf(tl, "blast").length).toBe(13);
    const first = splits[0];
    expect(first.shell).toBe(0);
    first.children.forEach((c, k) => {
      const p = tl.shells[c];
      expect([p.angle, p.parent, p.start]).toEqual([[-25, 0, 25][k], 0, first.step]);
      expect(p.points[3]).toBeLessThan(p.points[1]); // its first step moves up
    });
    expect(tl.points).toEqual([35, 0]);
  });
  it("Hydra splits at its apex, where the parent stopped, into 5 heavies about its heading", () => {
    const tl = fire(flatBattle(), "hydra", 45, 60);
    const splits = eventsOf(tl, "split");
    expect(splits.length).toBe(1);
    const sp = splits[0];
    expect([sp.step, sp.x, sp.y]).toEqual([59, 595, 235]);
    const parent = tl.shells[0].points;
    expect(parent.length / 2).toBe(sp.step); // no point for the apex step: it did not move
    expect(parent.slice(-2)).toEqual([sp.x, sp.y]);
    expect(sp.children.map((c) => tl.shells[c].angle)).toEqual([-20, -10, 0, 10, 20]);
  });
  it("Hydra fired level never apexes: its early effect is one child's blast", () => {
    const tl = fire(flatBattle(), "hydra", 0, 60);
    expect(eventsOf(tl, "split")).toEqual([]);
    expect(eventsOf(tl, "blast").map((b) => b.radius)).toEqual([26]);
  });
  it("an apex weapon that hits something before its apex uses `early`, or is a dud without it", () => {
    const wall = (): MatchState => setHeights(flatBattle(), (x) => (x >= 400 && x < 420 ? 100 : 400));
    const tl = fire(wall(), "barrage", 45, 90);
    expect(eventsOf(tl, "split")).toEqual([]);
    expect(eventsOf(tl, "blast").map((b) => b.radius)).toEqual([20]);
    const bare = synth({ on: "apex", effects: [{ split: { count: 2, spreadDeg: 10, speedPct: 100, from: "ahead",
      child: { on: "impact", effects: [{ blast: { radius: 20, damage: 18 } }] } } }] });
    const dud = fireDef(wall(), bare, 45, 90);
    expect(eventsOf(dud, "dud").length).toBe(1);
    expect(eventsOf(dud, "blast")).toEqual([]);
  });
  it("Barrage drops a line of 6 at its apex, 30 px apart, that lands exactly 30 px apart", () => {
    const tl = fire(flatBattle(300, 1000), "barrage", 45, 60);
    const sp = eventsOf(tl, "split")[0];
    expect(sp.children.map((c) => tl.shells[c].points[0])).toEqual([520, 550, 580, 610, 640, 670]);
    expect(eventsOf(tl, "blast").map((b) => b.x).sort((a, b) => a - b)).toEqual([818, 848, 878, 908, 938, 968]);
  });
  it("a line child spawned inside a hill impacts at its first sample, one step later", () => {
    const m = setHeights(flatBattle(300, 1000), (x) => (x >= 630 && x < 700 ? 200 : 400));
    const tl = fire(m, "barrage", 45, 60);
    const sp = eventsOf(tl, "split")[0];
    expect([sp.step, sp.x, sp.y]).toEqual([59, 595, 235]); // the split is unchanged
    for (const [shell, spawnX, hitX] of [[5, 640, 641], [6, 670, 671]]) {
      expect(tl.shells[shell].points).toEqual([spawnX, 235, hitX, 235]);
      expect(tl.events).toContainEqual({ step: 60, kind: "blast", shell, x: hitX, y: 235, radius: 20, lag: 0 });
    }
  });
  it("Hailstorm bursts 9 shells downward at its apex, carried by the parent's motion", () => {
    const tl = fire(flatBattle(300, 1000), "hailstorm", 45, 60);
    const sp = eventsOf(tl, "split")[0];
    expect([sp.x, sp.y, sp.children.length]).toEqual([595, 235, 9]);
    for (const c of sp.children) expect(tl.shells[c].points[3]).toBeGreaterThan(tl.shells[c].points[1]); // first step moves down
    const xs = eventsOf(tl, "blast").map((b) => b.x);
    expect([Math.min(...xs), Math.max(...xs)]).toEqual([737, 795]);
  });
  it("Shrapnel fans 6 fragments at -80, -48, -16, 16, 48 and 80 degrees off straight up", () => {
    const tl = fire(flatBattle(), "shrapnel", 60, 50);
    const sp = eventsOf(tl, "split")[0];
    expect(sp.children.map((c) => tl.shells[c].angle)).toEqual([-80, -48, -16, 16, 48, 80]);
  });
  it("a child spawned inside a hitbox ignores that tank until it leaves it; a rear child can still fly into the shooter (O5)", () => {
    const tl = fire(flatBattle(300, 400), "barrage", 3, 60);
    const sp = eventsOf(tl, "split")[0];
    expect(sp.step).toBe(5);
    const insideOf = (c: number): number => [300, 400].findIndex((tx) => {
      const dx = tl.shells[c].points[0] - tx;
      const dy = tl.shells[c].points[1] - 388; // both hitbox centres are at y = 400 - TANK_HIT_DY
      return dx * dx + dy * dy <= 14 * 14;
    });
    const inside = sp.children.filter((c) => insideOf(c) >= 0);
    expect(inside.map(insideOf)).toEqual([0, 1]); // one child spawned inside each hitbox ...
    const endStep = (c: number): number => tl.shells[c].start + tl.shells[c].points.length / 2 - 1;
    expect(inside.map(endStep)).toEqual([18, 22]); // ... and neither ended on its first sample
    expect(tl.shells[sp.children[0]].points[0]).toBe(273); // the rear child spawned outside the shooter's hitbox ...
    expect(tl.points[1]).toBe(18); // ... and flew into it: 18 self-damage, scored for the opponent
  });
});
```

- [ ] **Step 3: Stage the split totality cases**

Append to the end of `src/game/titles/arcfire/weapons/validate.test.ts` (after one blank line):

```ts
describe("totality: split", () => {
  it("a zero-child split and a cyclic split", () => {
    const child: Stage = { on: "impact", effects: [{ blast: B }] };
    expectTotal(impact([{ blast: B }, { split: { count: 0, spreadDeg: 30, speedPct: 50, from: "up", child } }]));
    const loop: Stage = { on: "impact", effects: [{ blast: B }] };
    loop.effects.push({ split: { count: 3, spreadDeg: 60, speedPct: 80, from: "up", child: loop } });
    expectTotal(weapon({ stage: loop }));
  });
});
```

- [ ] **Step 4: Extend the roster test.** Append this task's ids to `WIRE`, and add the static maxima: Cascade is the roster maximum from this task on.

In `src/game/titles/arcfire/weapons/roster.test.ts`, replace

```ts
const WIRE = ["pulse", "pulse2", "nova", "needle", "crater", "triad", "fan", "railshot"];
```

with

```ts
const WIRE = [
  "pulse", "pulse2", "nova", "needle", "crater", "triad", "fan", "railshot",
  "twinnova", "cascade", "hydra", "hailstorm", "shrapnel", "barrage",
];
```

In `src/game/titles/arcfire/weapons/roster.test.ts`, insert directly after

```ts
      expect(maxTurnSteps(w)).toBeLessThan(MAX_TURN_STEPS);
    }
```

these lines:

```ts
    expect(Math.max(...ROSTER.map(maxShells))).toBe(13); // Cascade
    expect(Math.max(...ROSTER.map(maxTurnSteps))).toBe(3600); // Cascade: three generations of 1,200 steps
```

- [ ] **Step 5: Run the tests to verify they fail**

Run: `npx vitest run src/game/titles/arcfire`
Expected: FAIL, exactly 16 tests:
- `roster.test.ts`:
  - `pins the wire order so far …`: `expected [ 'pulse', 'pulse2', 'nova', …(5) ] to deeply equal [ 'pulse', 'pulse2', 'nova', …(11) ]`
  - `every weapon is valid and within the static cost bounds`: `expected 5 to be 13`
- `ballistics.test.ts`:
  - `turns a rightward velocity toward up …`: `TypeError: rotateVel is not a function`
  - `a stopAtApex shell ends on the step it stops rising …`: `expected 29413779 to be less than 0`. With no latch, the shell falls all the way to the floor.
  - `ignores the tank it spawned inside …`: `expected { kind: 'tank', x: 601, y: 300, …(3) } to match object …`. With no mask, it hits its spawn tank at once.
- `primitives.test.ts`: the 10 tests that fire the new weapons fail with `TypeError: Cannot read properties of undefined (reading 'launch')` (they are not in `ROSTER` yet). The synthetic backstop test fails with `expected 124 to be 4800`, because there is no delay branch yet.

These new tests already pass, because they pin behaviour Task 5 already has: `a shell launched level never apexes`, the three `a spawn point is never tested` cases, and `totality: split`.

- [ ] **Step 6: Replace** `src/game/titles/arcfire/ballistics.ts`. Compared with Task 5 it adds, from the design's final file verbatim:
  - `rotateVel`;
  - the apex member of `Impact`;
  - the apex latch at the top of `stepShell`, which reads `rising` before wind and gravity;
  - the `ignore` handling in the tank loop.

  A shell with no modifiers still takes exactly Task 5's path.

```ts
// src/game/titles/arcfire/ballistics.ts
//
// Shell flight (spec §3.2): launch from the muzzle along an integer angle,
// then fixed 1/60 s steps of semi-implicit Euler in Q16.16. Each step's
// movement is swept in <= 1 px increments against the tank hitboxes and the
// terrain spans, so nothing tunnels through a thin wall or clips past a tank.
// Plan 2A adds the flight modifiers a Stage can ask for — stop at the apex,
// homing after the apex, bounces off the terrain or the side walls — and a
// shell spawned inside a tank's hitbox ignores that tank until it has left it.
// A shell with no modifiers takes exactly Plan 1's path (pixels are floored).
import type { Fx } from "@/game/sim/types";
import { fromInt, toInt, mul } from "@/game/sim/math/fixed";
import { cosDeg, sinDeg } from "./aimTable";
import { isSolid, type Terrain } from "./terrain";
import {
  WORLD_W, STEPS_PER_SEC, GRAVITY_STEP, V_UNIT, MAX_FLIGHT_STEPS, BARREL_LEN, TANK_HIT_R,
} from "./constants";
import { idiv, floorPx } from "./imath";

export interface Shell {
  x: Fx;
  y: Fx;
  vx: Fx; // px/s
  vy: Fx; // px/s, positive = falling
  gravityStep: Fx; // fall-speed gain per step (weapon-scaled gravity)
  steps: number; // steps flown so far (the per-shell flight cap counts these)
  alive: boolean;
  // --- Plan 2A
  speed: Fx; // nominal speed: the launch speed, or a child's split speed ("up"/"cone" splits scale it)
  apexed: boolean; // latched on the step a rising shell stops rising
  stopAtApex: boolean; // die with an "apex" result on the step `apexed` latches
  homeDeg: number; // > 0: once apexed, turn <= this many whole degrees per step toward (homeX, homeY)
  homeX: number;
  homeY: number;
  bounces: number; // terrain reflections left
  wallBounces: number; // side-wall reflections left
  restitutionPct: number; // speed kept per reflection
  ignore: number; // bitmask of tanks whose hitbox the shell spawned inside; a bit clears once a sample is outside
}

/** A tank hitbox centre in px; the radius is TANK_HIT_R. */
export interface HitCircle {
  x: number;
  y: number;
}

export type Impact =
  | { kind: "terrain"; x: number; y: number; fx: Fx; fy: Fx } // (x, y) = first solid px; (fx, fy) = last free position
  | { kind: "tank"; x: number; y: number; tank: number; fx: Fx; fy: Fx }
  | { kind: "apex"; x: number; y: number; fx: Fx; fy: Fx } // only for stopAtApex shells; the shell has not moved this step
  | { kind: "out"; x: number; y: number }; // left the world sideways, or hit the per-shell flight cap

/** The muzzle point for a hitbox centre and an integer angle (any integer degrees), px. */
export function muzzle(cx: number, cy: number, angleDeg: number): { x: number; y: number } {
  return {
    x: cx + toInt(mul(fromInt(BARREL_LEN), cosDeg(angleDeg))),
    y: cy - toInt(mul(fromInt(BARREL_LEN), sinDeg(angleDeg))),
  };
}

/** A shell at Q16.16 position (x, y) with velocity (vx, vy), nominal speed `speed` and no flight modifiers. */
export function shellAt(x: Fx, y: Fx, vx: Fx, vy: Fx, speed: Fx, gravityStep: Fx): Shell {
  return {
    x, y, vx, vy, gravityStep, steps: 0, alive: true,
    speed, apexed: false, stopAtApex: false, homeDeg: 0, homeX: 0, homeY: 0,
    bounces: 0, wallBounces: 0, restitutionPct: 100, ignore: 0,
  };
}

/** A shell at (x, y) px flying at `speed` (Fx px/s) along an integer angle (any integer degrees). */
export function launchAt(x: number, y: number, angleDeg: number, speed: Fx, gravityStep: Fx): Shell {
  return shellAt(fromInt(x), fromInt(y), mul(speed, cosDeg(angleDeg)), 0 - mul(speed, sinDeg(angleDeg)), speed, gravityStep);
}

export function launchShell(
  x: number, y: number, angleDeg: number, power: number, speedPct = 100, gravityPct = 100
): Shell {
  return launchAt(x, y, angleDeg, idiv(power * V_UNIT * speedPct, 100), idiv(GRAVITY_STEP * gravityPct, 100));
}

/** Rotate a velocity by an integer angle in the aim sense (+ turns a rightward vector toward up). */
export function rotateVel(vx: Fx, vy: Fx, deg: number): [Fx, Fx] {
  const c = cosDeg(deg);
  const s = sinDeg(deg);
  return [mul(vx, c) + mul(vy, s), mul(vy, c) - mul(vx, s)];
}

/**
 * Advance one physics step. Returns the first event along the swept path, or
 * null while the shell is still flying. windStep is the horizontal velocity
 * change per step (Fx). The order inside a step is part of the determinism
 * contract: wind, gravity, the apex latch (an apex stage ends the step here),
 * then the sweep, whose every sample checks the side edges, then the
 * tanks in index order, then the terrain.
 */
export function stepShell(s: Shell, t: Terrain, tanks: readonly HitCircle[], windStep: Fx): Impact | null {
  const rising = s.vy < 0;
  s.vx += windStep;
  s.vy += s.gravityStep;
  if (!s.apexed && rising && s.vy >= 0) {
    s.apexed = true;
    if (s.stopAtApex) {
      s.alive = false;
      return { kind: "apex", x: floorPx(s.x), y: floorPx(s.y), fx: s.x, fy: s.y };
    }
  }
  const nx = s.x + idiv(s.vx, STEPS_PER_SEC);
  const ny = s.y + idiv(s.vy, STEPS_PER_SEC);
  const n = Math.max(Math.abs(floorPx(nx) - floorPx(s.x)), Math.abs(floorPx(ny) - floorPx(s.y)), 1);
  const r2 = TANK_HIT_R * TANK_HIT_R;
  let fx = s.x; // the last free sample
  let fy = s.y;
  for (let i = 1; i <= n; i++) {
    const sx = s.x + idiv((nx - s.x) * i, n);
    const sy = s.y + idiv((ny - s.y) * i, n);
    const cx = floorPx(sx);
    const cy = floorPx(sy);
    if (cx < 0 || cx >= WORLD_W) {
      s.alive = false;
      return { kind: "out", x: cx, y: cy };
    }
    for (let k = 0; k < tanks.length; k++) {
      const dx = cx - tanks[k].x;
      const dy = cy - tanks[k].y;
      const inside = dx * dx + dy * dy <= r2;
      if ((s.ignore >> k) & 1) {
        if (!inside) s.ignore &= ~(1 << k);
        continue;
      }
      if (inside) {
        s.alive = false;
        return { kind: "tank", x: cx, y: cy, tank: k, fx, fy };
      }
    }
    if (isSolid(t, cx, cy)) {
      s.alive = false;
      return { kind: "terrain", x: cx, y: cy, fx, fy };
    }
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

- [ ] **Step 7: Replace** `src/game/titles/arcfire/weapons/primitives.ts`. It adds `split` and the delay branch of `applyEffects` (armed as `else if ("delay" in e)`; it becomes the final `else` in Task 13), and their imports.

```ts
// src/game/titles/arcfire/weapons/primitives.ts
//
// The effect implementations (spec §4.1): the only weapon code outside the
// shell flight in ballistics.ts. Every effect is applied INSTANTLY at its
// trigger step, in closed form or one bounded pass over the terrain; only
// shells and delays take simulated time. Integer px / Q16.16 throughout; no
// weapon draws from the match RNG. The order effects run in is part of the
// determinism contract (see resolve.ts).
import type { Fx } from "@/game/sim/types";
import { fromInt, mul } from "@/game/sim/math/fixed";
import { cosDeg, sinDeg } from "../aimTable";
import { idiv, floorPx } from "../imath";
import { carveCircle, type Terrain } from "../terrain";
import { rotateVel, shellAt, type HitCircle, type Shell } from "../ballistics";
import { blastDamage } from "../damage";
import { TANK_HIT_R, MAX_SHELLS } from "../constants";
import type { Timeline, TimelineEvent } from "../timeline";
import type { Blast, Effect, Split, Stage } from "./types";

/** Everything one shot's effects can touch. Built by resolveWeapon; lives for one turn. */
export interface Shot {
  t: Terrain;
  tanks: readonly HitCircle[]; // hitboxes, fixed for the whole shot (tanks ride the settle afterwards)
  shooter: number;
  shells: Shell[]; // every shell of the turn, by creation order (= Timeline.shells index)
  stages: Stage[]; // stages[i] = what shells[i] does on its trigger
  live: number; // shells still alive
  pending: Pending[]; // armed delays, in arming order
  received: number[]; // damage each tank took this turn
  rec: boolean; // build the Timeline's paths and events (false: the quiet AI path)
  tl: Timeline;
}

/** Where and how a stage fired. */
export interface Trigger {
  step: number;
  shell: number; // index of the shell that triggered
  x: number; // the trigger px: first solid (or tank) px on impact; the shell's px at the apex
  y: number;
  fx: Fx; // the last free position: children spawn here; roll and burn drop from here
  fy: Fx;
  vx: Fx; // velocity at the trigger: dig direction, the roll/burn tie-break, "ahead"/"cone" splits
  vy: Fx;
  speed: Fx; // the shell's nominal speed: the base of "up"/"cone" splits
  gravityStep: Fx; // inherited by children
  tank: number; // the tank struck, or -1
}

export interface Pending {
  at: number; // the step it fires on
  trig: Trigger;
  effects: readonly Effect[];
}

export function emit(shot: Shot, ev: TimelineEvent): void {
  if (shot.rec) shot.tl.events.push(ev);
}

/** Apply a list of effects at a trigger, completely and in array order (a delay only arms its list). */
export function applyEffects(shot: Shot, trig: Trigger, effects: readonly Effect[]): void {
  for (const e of effects) {
    if ("blast" in e) blastAt(shot, e.blast, trig.x, trig.y, trig.step, trig.shell, 0);
    else if ("split" in e) split(shot, trig, e.split);
    else if ("delay" in e) {
      const at = trig.step + (e.delay.steps > 1 ? e.delay.steps : 1);
      shot.pending.push({ at, trig, effects: e.delay.then });
      emit(shot, { step: trig.step, kind: "fuse", shell: trig.shell, x: trig.x, y: trig.y, at });
    }
  }
}

/** Damage to tank p: it scores for whoever didn't take it (resolve.ts). */
function hurt(shot: Shot, p: number, amount: number, step: number, lag: number): void {
  if (amount <= 0) return;
  shot.received[p] += amount;
  emit(shot, { step, kind: "damage", target: p, amount, lag });
}

/** Plan 1's blast: carve a disc, then damage both tanks by distance (tank order 0, 1). */
export function blastAt(shot: Shot, b: Blast, x: number, y: number, step: number, shell: number, lag: number): void {
  carveCircle(shot.t, x, y, b.radius);
  emit(shot, { step, kind: "blast", shell, x, y, radius: b.radius, lag });
  for (let p = 0; p < 2; p++) hurt(shot, p, blastDamage(b, x, y, shot.tanks[p].x, shot.tanks[p].y), step, lag);
}

/** Bitmask of the tanks whose hitbox contains px (x, y). */
function tankMask(shot: Shot, x: number, y: number): number {
  let m = 0;
  for (let k = 0; k < 2; k++) {
    const dx = x - shot.tanks[k].x;
    const dy = y - shot.tanks[k].y;
    if (dx * dx + dy * dy <= TANK_HIT_R * TANK_HIT_R) m |= 1 << k;
  }
  return m;
}

/** The first tank whose hitbox contains (x, y), or -1. */
function tankAt(shot: Shot, x: number, y: number): number {
  const m = tankMask(shot, x, y);
  return m === 0 ? -1 : (m & 1) !== 0 ? 0 : 1;
}

/** Add a shell to the turn and arm its stage's flight modifiers. Returns its index, or -1 past MAX_SHELLS (dropped). */
export function addShell(shot: Shot, s: Shell, stage: Stage, angle: number, parent: number, step: number): number {
  if (shot.shells.length >= MAX_SHELLS) return -1;
  s.stopAtApex = stage.on === "apex";
  if (stage.homing) {
    const target = shot.tanks[1 - shot.shooter];
    s.homeDeg = stage.homing.degPerStep;
    s.homeX = target.x;
    s.homeY = target.y;
  }
  if (stage.bounce) {
    if (stage.bounce.walls) s.wallBounces = stage.bounce.times;
    else s.bounces = stage.bounce.times;
    s.restitutionPct = stage.bounce.restitutionPct;
  }
  s.ignore = tankMask(shot, floorPx(s.x), floorPx(s.y)); // only a line split can spawn inside a hitbox
  shot.shells.push(s);
  shot.stages.push(stage);
  shot.live++;
  if (shot.rec) shot.tl.shells.push({ angle, parent, start: step, points: [floorPx(s.x), floorPx(s.y)] });
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
    let vx: Fx;
    let vy: Fx;
    if (sp.from === "up") {
      vx = mul(speed, cosDeg(90 + off));
      vy = 0 - mul(speed, sinDeg(90 + off));
    } else if (sp.from === "cone") {
      vx = trig.vx + mul(speed, cosDeg(270 + off));
      vy = trig.vy - mul(speed, sinDeg(270 + off));
    } else {
      const [rx, ry] = rotateVel(trig.vx, trig.vy, off);
      vx = idiv(rx * sp.speedPct, 100);
      vy = idiv(ry * sp.speedPct, 100);
    }
    const gx = sp.gapPx ? idiv((2 * i - (sp.count - 1)) * sp.gapPx, 2) : 0;
    const s = shellAt(trig.fx + fromInt(gx), trig.fy, vx, vy, speed, trig.gravityStep);
    const id = addShell(shot, s, sp.child, off, trig.shell, trig.step);
    if (id >= 0) children.push(id);
  }
  emit(shot, { step: trig.step, kind: "split", shell: trig.shell, x: trig.x, y: trig.y, children });
}
```

- [ ] **Step 8: Replace** `src/game/titles/arcfire/resolve.ts`. It adds the apex trigger: an apex result pushes no path point (the shell did not move), and an apex-stage shell that hit something first applies `early`, or emits `dud` without it.

```ts
// src/game/titles/arcfire/resolve.ts
//
// resolveTurn (spec §1.3): one whole turn — the optional move, then the shot —
// resolved to completion. It MUTATES the MatchState it's given; callers that
// need the original (AI search, previews) resolve a cloneMatch() copy. The
// caller (match.ts applyTurn) validates the command first.
//
// The step loop and its ORDER are part of the determinism contract:
//   step s = 1, 2, ...:
//     1. delays due at s fire, in the order they were armed;
//     2. every shell that existed at the start of the step and is alive moves
//        once (stepShell), in creation order; a shell that triggers applies
//        its effects at once, in list order (so a later shell this step sees
//        their terrain); children it spawns are appended and first move at s + 1;
//   until no shell is alive and no delay is armed (or MAX_TURN_STEPS). Then
//   settle once, then score.
import { fromInt } from "@/game/sim/math/fixed";
import { ROSTER } from "./weapons/roster";
import { launchShell, muzzle, stepShell } from "./ballistics";
import { settle, spansFromHeight } from "./terrain";
import { hitCircles, moveTarget } from "./tanks";
import { idiv, floorPx } from "./imath";
import { STEPS_PER_SEC, MAX_TURN_STEPS } from "./constants";
import { addShell, applyEffects, emit, fanOffset, type Shot } from "./weapons/primitives";
import type { MatchState } from "./state";
import type { Timeline } from "./timeline";
import type { WeaponDef } from "./weapons/types";

export interface TurnInput {
  move: -1 | 0 | 1;
  weapon: number; // roster index
  angle: number; // integer degrees 0..180
  power: number; // integer 0..100
}

export function resolveTurn(m: MatchState, input: TurnInput): Timeline {
  return resolveWeapon(m, ROSTER[input.weapon], input, true);
}

/** resolveTurn without building the Timeline's paths or events: the same state and points, faster (AI search, verification). */
export function resolveTurnPoints(m: MatchState, input: TurnInput): [number, number] {
  return resolveWeapon(m, ROSTER[input.weapon], input, false).points;
}

/**
 * resolveTurn with the weapon passed in: the seam unit tests use to fire
 * synthetic WeaponDefs (and 2B's probe shell). `input.weapon` is only
 * recorded. `record = false` leaves `shells`, `events` and `settle.falls` empty.
 */
export function resolveWeapon(m: MatchState, def: WeaponDef, input: TurnInput, record = true): Timeline {
  const shooter = m.shooter;
  const tl: Timeline = {
    shooter,
    move: null,
    wind: m.wind,
    weapon: input.weapon,
    steps: 0,
    shells: [],
    events: [],
    settle: { heights: m.terrain.height, falls: [] }, // replaced by the settle below
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

  // 2. Launch: shells fan out from the muzzle.
  spansFromHeight(m.terrain);
  const shot: Shot = {
    t: m.terrain, tanks: hitCircles(m), shooter, shells: [], stages: [], live: 0, pending: [], received: [0, 0],
    rec: record, tl,
  };
  const launch = def.launch;
  if (launch.kind === "shell" && def.stage) {
    const count = launch.count ?? 1;
    for (let i = 0; i < count; i++) {
      const angle = input.angle + fanOffset(i, count, launch.spreadDeg ?? 0); // never clamped: may leave 0..180 near the horizon
      const mz = muzzle(shot.tanks[shooter].x, shot.tanks[shooter].y, angle);
      const s = launchShell(mz.x, mz.y, angle, input.power, launch.speedPct ?? 100, launch.gravityPct ?? 100);
      addShell(shot, s, def.stage, angle, -1, 0);
    }
  }

  // 3. The step loop.
  const windStep = idiv(fromInt(m.wind), STEPS_PER_SEC);
  for (let step = 1; shot.live > 0 || shot.pending.length > 0; step++) {
    if (step > MAX_TURN_STEPS) {
      abandon(shot, MAX_TURN_STEPS);
      break;
    }
    tl.steps = step;
    const n = shot.shells.length; // shells spawned during this step first move at step + 1
    for (let j = 0; j < shot.pending.length; ) {
      const p = shot.pending[j];
      if (p.at !== step) {
        j++;
        continue;
      }
      shot.pending.splice(j, 1);
      applyEffects(shot, { ...p.trig, step }, p.effects);
    }
    for (let i = 0; i < n; i++) {
      const s = shot.shells[i];
      if (!s.alive) continue;
      const hit = stepShell(s, shot.t, shot.tanks, windStep);
      const path = record ? tl.shells[i].points : null;
      if (hit === null) {
        if (path) path.push(floorPx(s.x), floorPx(s.y));
        continue;
      }
      if (!s.alive) shot.live--;
      if (hit.kind === "out") {
        if (path) path.push(hit.x, hit.y);
        emit(shot, { step, kind: "out", shell: i, x: hit.x, y: hit.y, lag: 0 });
        continue;
      }
      if (hit.kind !== "apex" && path) path.push(hit.x, hit.y);
      const stage = shot.stages[i];
      let effects = stage.effects;
      if (hit.kind !== "apex" && stage.on === "apex") { // an apex weapon that hit something before its apex
        if (!stage.early) {
          emit(shot, { step, kind: "dud", shell: i, x: hit.x, y: hit.y });
          continue;
        }
        effects = stage.early;
      }
      applyEffects(shot, {
        step, shell: i, x: hit.x, y: hit.y, fx: hit.fx, fy: hit.fy, vx: s.vx, vy: s.vy,
        speed: s.speed, gravityStep: s.gravityStep, tank: hit.kind === "tank" ? hit.tank : -1,
      }, effects);
    }
  }

  // 4. Dirt settles once, after the whole shot.
  tl.settle = settle(m.terrain, record);

  // 5. Damage to the opponent scores for the shooter; self-damage scores for the opponent.
  const opp = 1 - shooter;
  tl.points[shooter] += shot.received[opp];
  tl.points[opp] += shot.received[shooter];
  m.scores[0] += tl.points[0];
  m.scores[1] += tl.points[1];
  return tl;
}

/** The turn backstop: everything still flying is lost at `step` and armed delays are dropped (their `fuse` events keep an `at` beyond tl.steps: playback's cue). */
function abandon(shot: Shot, step: number): void {
  for (let i = 0; i < shot.shells.length; i++) {
    const s = shot.shells[i];
    if (!s.alive) continue;
    s.alive = false;
    emit(shot, { step, kind: "out", shell: i, x: floorPx(s.x), y: floorPx(s.y), lag: 0 });
  }
  shot.live = 0;
  shot.pending.length = 0;
}
```

- [ ] **Step 9: Append indices 8–13 to the roster** (design-verbatim): the `blast` helper, then the slice.

In `src/game/titles/arcfire/weapons/roster.ts`, replace

```ts
import type { WeaponDef } from "./types";
```

with

```ts
import type { Blast, WeaponDef } from "./types";

const blast = (radius: number, damage: number): Blast => ({ radius, damage });
```

In `src/game/titles/arcfire/weapons/roster.ts`, replace

```ts
];

/** Roster index by weapon id. */
```

with

```ts
  // --- Plan 2A: indices 8..31, in spec §4.2 display order. Numbers the spec leaves open are initial choices (spec §4.2).
  {
    id: "twinnova", name: "Twin Nova", tag: "BLAST", tier: 3, power: 80,
    launch: { kind: "shell" },
    stage: { on: "impact", effects: [{ blast: blast(50, 55) }, { delay: { steps: 30, then: [{ blast: blast(70, 60) }] } }] },
  },
  {
    id: "cascade", name: "Cascade", tag: "SPLIT", tier: 3, power: 80,
    launch: { kind: "shell" },
    stage: { on: "impact", effects: [{ blast: blast(20, 15) }, { split: { count: 3, spreadDeg: 50, speedPct: 40, from: "up",
      child: { on: "impact", effects: [{ blast: blast(18, 15) }, { split: { count: 3, spreadDeg: 50, speedPct: 40, from: "up",
        child: { on: "impact", effects: [{ blast: blast(14, 10) }] } } }] } } }] },
  },
  {
    id: "hydra", name: "Hydra", tag: "SPLIT", tier: 3, power: 80,
    launch: { kind: "shell" },
    stage: { on: "apex", effects: [{ split: { count: 5, spreadDeg: 40, speedPct: 100, from: "ahead",
      child: { on: "impact", effects: [{ blast: blast(26, 30) }] } } }], early: [{ blast: blast(26, 30) }] },
  },
  {
    id: "hailstorm", name: "Hailstorm", tag: "SPLIT", tier: 2, power: 55,
    launch: { kind: "shell" },
    stage: { on: "apex", effects: [{ split: { count: 9, spreadDeg: 30, speedPct: 50, from: "cone",
      child: { on: "impact", effects: [{ blast: blast(14, 12) }] } } }], early: [{ blast: blast(14, 12) }] },
  },
  {
    id: "shrapnel", name: "Shrapnel", tag: "SPLIT", tier: 2, power: 55,
    launch: { kind: "shell" },
    stage: { on: "impact", effects: [{ blast: blast(24, 20) }, { split: { count: 6, spreadDeg: 160, speedPct: 35, from: "up",
      child: { on: "impact", effects: [{ blast: blast(10, 8) }] } } }] },
  },
  {
    id: "barrage", name: "Barrage", tag: "SPLIT", tier: 2, power: 55,
    launch: { kind: "shell" },
    stage: { on: "apex", effects: [{ split: { count: 6, spreadDeg: 0, speedPct: 100, from: "ahead", gapPx: 30,
      child: { on: "impact", effects: [{ blast: blast(20, 18) }] } } }], early: [{ blast: blast(20, 18) }] },
  },
];

/** Roster index by weapon id. */
```

- [ ] **Step 10: Run the suite: only the corpus may fail, on its new keys**

Run: `npx vitest run src/game/titles/arcfire`
Expected: FAIL, exactly 1 test: `corpus.test.ts`. Its case list has 213 fresh ids against 123 pinned (`expected [ Array(213) ] to deeply equal [ … ]`). No existing case moved: a moved case would show under `moved cases` instead.

- [ ] **Step 11: Append the new corpus keys**

Run: `UPDATE_ARCFIRE_CORPUS=add npx vitest run src/game/titles/arcfire/corpus.test.ts`
Expected: PASS, and the fixture gains 90 keys (6 weapons × 15). `add` refuses to write if any existing key moved.

Run: `node -e "const c=require('./src/game/titles/arcfire/corpus.golden.json');console.log(c.digest,Object.keys(c.cases).length)"`
Expected, exactly: `88f0bd53 213`

Run: `git diff src/game/titles/arcfire/corpus.golden.json`
Expected: every change is an added line, except two: the `"digest"` line, and the last `defs` entry (`"railshot": "30e47b0c"`), which only gains a trailing comma. No existing case line changes.

- [ ] **Step 12: Run the Arcfire gate, types and the full suite**

Run: `npx vitest run src/game/titles/arcfire src/game/sim/purity.test.ts`
Expected: PASS: 17 files, 141 tests. The corpus gates `twinnova emits fuse` and `cascade emits split` are now live and pass.

Run: `npx tsc --noEmit`
Expected: exit 0.

Run: `npm test`
Expected: all pass.

- [ ] **Step 13: Run the cross-engine gate**

Run: `npm run test:e2e:cross-engine -- --grep-invert firefox`
Expected: exit 0, `2 passed`. Chromium and WebKit reproduce `5167b43d`, `389a1340` and `88f0bd53` (Firefox runs in CI). This is the first browser run of the delay, split and apex code.

- [ ] **Step 14: Commit**

```bash
git add src/game/titles/arcfire/ballistics.ts src/game/titles/arcfire/weapons/primitives.ts src/game/titles/arcfire/resolve.ts src/game/titles/arcfire/weapons/roster.ts src/game/titles/arcfire/ballistics.test.ts src/game/titles/arcfire/weapons/primitives.test.ts src/game/titles/arcfire/weapons/validate.test.ts src/game/titles/arcfire/weapons/roster.test.ts src/game/titles/arcfire/corpus.golden.json
git commit -m "feat(arcfire): delay, split and apex; Twin Nova, Cascade, Hydra, Hailstorm, Shrapnel, Barrage (8-13)" -m "Corpus + 90 keys -> 88f0bd53 (213 cases); no existing key moved. Pins unchanged (389a1340, 8d7dc831)." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 8: Bounce → Skipper, Pinball, Ricochet (indices 14–16)

**Files:**
- Modify: `src/game/titles/arcfire/ballistics.ts` (full replacement: + `surfaceNormal`, `reflect`, `endBounce`, terrain and wall bounces)
- Modify: `src/game/titles/arcfire/resolve.ts` (full replacement: + the bounce branch and `blastEach`)
- Modify: `src/game/titles/arcfire/weapons/roster.ts` (append indices 14–16)
- Modify (tests): `ballistics.test.ts`, `weapons/primitives.test.ts`, `weapons/roster.test.ts`
- Modify (fixture): `corpus.golden.json` (new keys only)

**Interfaces:**
- Consumes: Task 5's `Shell.bounces` / `wallBounces` / `restitutionPct` (armed by `addShell` from `Stage.bounce`), `BOUNCE_PROBE_R`, `blastAt`.
- Produces:
  - `Impact` gains `{ kind: "bounce"; x; y; wall: boolean }`. After a bounce the shell is alive at its last free sample, and the flight cap still counts the step.
  - The resolver emits `bounce` (a mid-path event) and detonates `Stage.bounce.blastEach` at the contact pixel in the same step, after the reflection.
  - `ROSTER_INDEX` gains `skipper` 14, `pinball` 15, `ricochet` 16.

**Rules** (owner decision **D5**; the design's §4.4):
- **The normal.** It is minus the sum of the offsets to the solid pixels in a radius-8 disc (`BOUNCE_PROBE_R = 8`, ≤ 197 `isSolid` probes). If that is zero or doesn't oppose the motion, the incoming direction is used instead, so it is never (0, 0).
- **The reflection** is `v − 2n(v·n)/(n·n)` in exact integers, then `restitutionPct` of both components.
- **Walls.** A side-wall exit with `wallBounces > 0` reflects about (±1, 0), and the event's x is clamped to the wall column. The world has no ceiling. Tanks never bounce a shell.

- [ ] **Step 1: Write the failing ballistics tests**

Append to the end of `src/game/titles/arcfire/ballistics.test.ts` (after one blank line):

```ts
describe("bounces", () => {
  /** A gravity-free shell at (x, y) px moving (vx, vy) px/s, with one terrain bounce at `pct`% restitution. */
  const bouncer = (x: number, y: number, vx: number, vy: number, pct = 100): Shell => {
    const s = shellAt(fromInt(x), fromInt(y), fromInt(vx), fromInt(vy), fromInt(200), 0);
    s.bounces = 1;
    s.restitutionPct = pct;
    return s;
  };
  it("reflects off flat ground exactly and ends the step at the last free sample", () => {
    const s = bouncer(600, 398, 100, 200);
    expect(stepShell(s, flat(400), [], 0)).toEqual({ kind: "bounce", x: 601, y: 400, wall: false });
    expect([s.vx, s.vy]).toEqual([fromInt(100), fromInt(-200)]);
    expect(floorPx(s.y)).toBe(399);
    expect([s.bounces, s.alive]).toEqual([0, true]);
  });
  it("keeps restitutionPct of both components", () => {
    const s = bouncer(600, 398, 100, 200, 55);
    stepShell(s, flat(400), [], 0);
    expect([s.vx, s.vy]).toEqual([fromInt(55), fromInt(-110)]);
  });
  it("sends a vertical drop onto a 45° rise away horizontally", () => {
    const t = makeTerrain();
    for (let x = 0; x < t.height.length; x++) t.height[x] = Math.max(0, Math.min(WORLD_H, 900 - x)); // rising to the right
    spansFromHeight(t);
    const s = bouncer(600, 290, 0, 200);
    let hit: Impact | null = null;
    while (hit === null) hit = stepShell(s, t, [], 0);
    expect(hit).toEqual({ kind: "bounce", x: 600, y: 300, wall: false });
    expect([s.vx, s.vy]).toEqual([fromInt(-200), 0]);
  });
  it("reflects off a side wall and flies on", () => {
    const s = shellAt(fromInt(5), fromInt(100), fromInt(-600), 0, fromInt(600), 0);
    s.wallBounces = 1;
    expect(stepShell(s, flat(400), [], 0)).toEqual({ kind: "bounce", x: 0, y: 100, wall: true });
    expect(s.vx).toBe(fromInt(600));
    expect(stepShell(s, flat(400), [], 0)).toBeNull();
  });
});
```

- [ ] **Step 2: Write the failing primitive tests.** These are the design's *(proto)* values. Skipper's final blast at (699, 422) is where the radius-8 normal shows: at radius 4 it was at x 713.

Append to the end of `src/game/titles/arcfire/weapons/primitives.test.ts` (after one blank line):

```ts
describe("bounce", () => {
  it("Pinball bounces exactly 6 times, then blasts", () => {
    const tl = fire(flatBattle(300, 1100), "pinball", 45, 40);
    const bounces = eventsOf(tl, "bounce");
    expect(bounces.map((b) => b.x)).toEqual([586, 775, 894, 971, 1019, 1048]);
    for (let i = 1; i < bounces.length; i++) expect(bounces[i].step).toBeGreaterThan(bounces[i - 1].step);
    expect(bounces.every((b) => !b.wall)).toBe(true);
    expect(eventsOf(tl, "blast").map((b) => [b.step, b.x, b.y, b.radius])).toEqual([[354, 1067, 400, 36]]);
  });
  it("Skipper blasts at each of its 3 bounces in the same step, then blasts where it lands", () => {
    const tl = fire(flatBattle(300, 1100), "skipper", 45, 40);
    const bounces = eventsOf(tl, "bounce");
    expect(bounces.map((b) => b.x)).toEqual([586, 675, 701]);
    const blasts = eventsOf(tl, "blast");
    expect(blasts.slice(0, 3).map((b) => [b.step, b.x, b.y, b.radius])).toEqual(bounces.map((b) => [b.step, b.x, b.y, 22]));
    expect(blasts.slice(3).map((b) => [b.x, b.y, b.radius])).toEqual([[699, 422, 26]]);
  });
  it("Ricochet reflects off the left wall back into the world; Pulse at the same aim is lost", () => {
    const tl = fire(flatBattle(100, 700), "ricochet", 150, 70);
    const bounces = eventsOf(tl, "bounce");
    expect(bounces.map((b) => [b.step, b.x, b.wall])).toEqual([[12, 0, true]]);
    expect(eventsOf(tl, "blast").map((b) => [b.step, b.x, b.y])).toEqual([[101, 609, 400]]);
    const pulse = fire(flatBattle(100, 700), "pulse", 150, 70);
    expect(pulse.events.map((e) => e.kind)).toEqual(["out"]);
  });
});
```

- [ ] **Step 3: Append this task's ids to `WIRE`**

In `src/game/titles/arcfire/weapons/roster.test.ts`, replace

```ts
const WIRE = [
  "pulse", "pulse2", "nova", "needle", "crater", "triad", "fan", "railshot",
  "twinnova", "cascade", "hydra", "hailstorm", "shrapnel", "barrage",
];
```

with

```ts
const WIRE = [
  "pulse", "pulse2", "nova", "needle", "crater", "triad", "fan", "railshot",
  "twinnova", "cascade", "hydra", "hailstorm", "shrapnel", "barrage", "skipper", "pinball",
  "ricochet",
];
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `npx vitest run src/game/titles/arcfire`
Expected: FAIL, exactly 8 tests:
- `ballistics.test.ts > bounces`:
  - `reflects off flat ground exactly …`: `expected { kind: 'terrain', x: 601, …(3) } to deeply equal …`
  - `keeps restitutionPct of both components`: `expected [ 6553600, 13107200 ] to deeply equal [ 3604480, -7208960 ]`
  - `sends a vertical drop onto a 45° rise away horizontally`: `expected { kind: 'terrain', x: 600, …(3) } to deeply equal …`
  - `reflects off a side wall and flies on`: `expected { kind: 'out', x: -1, y: 100 } to deeply equal { kind: 'bounce', x: +0, y: 100, …(1) }`
- `primitives.test.ts > bounce`: all 3 fail with `TypeError: Cannot read properties of undefined (reading 'launch')`.
- `roster.test.ts > pins the wire order so far …`: `expected [ 'pulse', 'pulse2', 'nova', …(11) ] to deeply equal [ 'pulse', 'pulse2', 'nova', …(14) ]`

- [ ] **Step 5: Replace** `src/game/titles/arcfire/ballistics.ts`. Compared with Task 7 it adds, from the design's final file verbatim: the `BOUNCE_PROBE_R` import, the bounce member of `Impact`, `surfaceNormal`, `reflect`, `endBounce`, and the two bounce branches in `stepShell`'s sweep.

```ts
// src/game/titles/arcfire/ballistics.ts
//
// Shell flight (spec §3.2): launch from the muzzle along an integer angle,
// then fixed 1/60 s steps of semi-implicit Euler in Q16.16. Each step's
// movement is swept in <= 1 px increments against the tank hitboxes and the
// terrain spans, so nothing tunnels through a thin wall or clips past a tank.
// Plan 2A adds the flight modifiers a Stage can ask for — stop at the apex,
// homing after the apex, bounces off the terrain or the side walls — and a
// shell spawned inside a tank's hitbox ignores that tank until it has left it.
// A shell with no modifiers takes exactly Plan 1's path (pixels are floored).
import type { Fx } from "@/game/sim/types";
import { fromInt, toInt, mul } from "@/game/sim/math/fixed";
import { cosDeg, sinDeg } from "./aimTable";
import { isSolid, type Terrain } from "./terrain";
import {
  WORLD_W, STEPS_PER_SEC, GRAVITY_STEP, V_UNIT, MAX_FLIGHT_STEPS, BARREL_LEN, TANK_HIT_R, BOUNCE_PROBE_R,
} from "./constants";
import { idiv, floorPx } from "./imath";

export interface Shell {
  x: Fx;
  y: Fx;
  vx: Fx; // px/s
  vy: Fx; // px/s, positive = falling
  gravityStep: Fx; // fall-speed gain per step (weapon-scaled gravity)
  steps: number; // steps flown so far (the per-shell flight cap counts these)
  alive: boolean;
  // --- Plan 2A
  speed: Fx; // nominal speed: the launch speed, or a child's split speed ("up"/"cone" splits scale it)
  apexed: boolean; // latched on the step a rising shell stops rising
  stopAtApex: boolean; // die with an "apex" result on the step `apexed` latches
  homeDeg: number; // > 0: once apexed, turn <= this many whole degrees per step toward (homeX, homeY)
  homeX: number;
  homeY: number;
  bounces: number; // terrain reflections left
  wallBounces: number; // side-wall reflections left
  restitutionPct: number; // speed kept per reflection
  ignore: number; // bitmask of tanks whose hitbox the shell spawned inside; a bit clears once a sample is outside
}

/** A tank hitbox centre in px; the radius is TANK_HIT_R. */
export interface HitCircle {
  x: number;
  y: number;
}

export type Impact =
  | { kind: "terrain"; x: number; y: number; fx: Fx; fy: Fx } // (x, y) = first solid px; (fx, fy) = last free position
  | { kind: "tank"; x: number; y: number; tank: number; fx: Fx; fy: Fx }
  | { kind: "apex"; x: number; y: number; fx: Fx; fy: Fx } // only for stopAtApex shells; the shell has not moved this step
  | { kind: "bounce"; x: number; y: number; wall: boolean } // reflected at (x, y); the shell is alive at its last free position
  | { kind: "out"; x: number; y: number }; // left the world sideways, or hit the per-shell flight cap

/** The muzzle point for a hitbox centre and an integer angle (any integer degrees), px. */
export function muzzle(cx: number, cy: number, angleDeg: number): { x: number; y: number } {
  return {
    x: cx + toInt(mul(fromInt(BARREL_LEN), cosDeg(angleDeg))),
    y: cy - toInt(mul(fromInt(BARREL_LEN), sinDeg(angleDeg))),
  };
}

/** A shell at Q16.16 position (x, y) with velocity (vx, vy), nominal speed `speed` and no flight modifiers. */
export function shellAt(x: Fx, y: Fx, vx: Fx, vy: Fx, speed: Fx, gravityStep: Fx): Shell {
  return {
    x, y, vx, vy, gravityStep, steps: 0, alive: true,
    speed, apexed: false, stopAtApex: false, homeDeg: 0, homeX: 0, homeY: 0,
    bounces: 0, wallBounces: 0, restitutionPct: 100, ignore: 0,
  };
}

/** A shell at (x, y) px flying at `speed` (Fx px/s) along an integer angle (any integer degrees). */
export function launchAt(x: number, y: number, angleDeg: number, speed: Fx, gravityStep: Fx): Shell {
  return shellAt(fromInt(x), fromInt(y), mul(speed, cosDeg(angleDeg)), 0 - mul(speed, sinDeg(angleDeg)), speed, gravityStep);
}

export function launchShell(
  x: number, y: number, angleDeg: number, power: number, speedPct = 100, gravityPct = 100
): Shell {
  return launchAt(x, y, angleDeg, idiv(power * V_UNIT * speedPct, 100), idiv(GRAVITY_STEP * gravityPct, 100));
}

/** Rotate a velocity by an integer angle in the aim sense (+ turns a rightward vector toward up). */
export function rotateVel(vx: Fx, vy: Fx, deg: number): [Fx, Fx] {
  const c = cosDeg(deg);
  const s = sinDeg(deg);
  return [mul(vx, c) + mul(vy, s), mul(vy, c) - mul(vx, s)];
}

/**
 * The outward surface direction at solid pixel (cx, cy): minus the sum of the
 * offsets of the solid pixels in a radius-BOUNCE_PROBE_R disc around it (their
 * centroid points into the ground). If that is zero or doesn't oppose the
 * motion, the way the shell came in, (fromX - cx, fromY - cy), is used
 * instead; it always opposes the motion, because the swept samples move
 * monotonically along the velocity. Never (0, 0). At BOUNCE_PROBE_R = 8 the
 * components are <= 330 (a half-disc's moment), from <= 197 isSolid probes.
 */
function surfaceNormal(s: Shell, t: Terrain, cx: number, cy: number, fromX: number, fromY: number): [number, number] {
  const r = BOUNCE_PROBE_R;
  let sx = 0;
  let sy = 0;
  for (let dy = 0 - r; dy <= r; dy++) {
    for (let dx = 0 - r; dx <= r; dx++) {
      if (dx * dx + dy * dy <= r * r && isSolid(t, cx + dx, cy + dy)) {
        sx += dx;
        sy += dy;
      }
    }
  }
  const nx = 0 - sx;
  const ny = 0 - sy;
  if ((nx !== 0 || ny !== 0) && s.vx * nx + s.vy * ny < 0) return [nx, ny];
  if (fromX !== cx || fromY !== cy) return [fromX - cx, fromY - cy];
  return [0, -1];
}

/** Mirror the velocity's component along normal (nx, ny) (any non-zero length) if it points into the surface, then keep restitutionPct of the speed. */
function reflect(s: Shell, nx: number, ny: number): void {
  const vn = s.vx * nx + s.vy * ny; // |v| < 2^31, |n| components <= 330: < 2^41
  if (vn < 0) {
    const nn = nx * nx + ny * ny; // >= 1
    s.vx -= idiv(2 * vn * nx, nn); // < 2^50
    s.vy -= idiv(2 * vn * ny, nn);
  }
  s.vx = idiv(s.vx * s.restitutionPct, 100);
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
 * Advance one physics step. Returns the first event along the swept path, or
 * null while the shell is still flying. windStep is the horizontal velocity
 * change per step (Fx). The order inside a step is part of the determinism
 * contract: wind, gravity, the apex latch (an apex stage ends the step here),
 * then the sweep, whose every sample checks the side edges, then the
 * tanks in index order, then the terrain.
 */
export function stepShell(s: Shell, t: Terrain, tanks: readonly HitCircle[], windStep: Fx): Impact | null {
  const rising = s.vy < 0;
  s.vx += windStep;
  s.vy += s.gravityStep;
  if (!s.apexed && rising && s.vy >= 0) {
    s.apexed = true;
    if (s.stopAtApex) {
      s.alive = false;
      return { kind: "apex", x: floorPx(s.x), y: floorPx(s.y), fx: s.x, fy: s.y };
    }
  }
  const nx = s.x + idiv(s.vx, STEPS_PER_SEC);
  const ny = s.y + idiv(s.vy, STEPS_PER_SEC);
  const n = Math.max(Math.abs(floorPx(nx) - floorPx(s.x)), Math.abs(floorPx(ny) - floorPx(s.y)), 1);
  const r2 = TANK_HIT_R * TANK_HIT_R;
  let fx = s.x; // the last free sample
  let fy = s.y;
  for (let i = 1; i <= n; i++) {
    const sx = s.x + idiv((nx - s.x) * i, n);
    const sy = s.y + idiv((ny - s.y) * i, n);
    const cx = floorPx(sx);
    const cy = floorPx(sy);
    if (cx < 0 || cx >= WORLD_W) {
      if (s.wallBounces > 0) {
        s.wallBounces--;
        reflect(s, cx < 0 ? 1 : -1, 0);
        return endBounce(s, fx, fy, { kind: "bounce", x: cx < 0 ? 0 : WORLD_W - 1, y: cy, wall: true });
      }
      s.alive = false;
      return { kind: "out", x: cx, y: cy };
    }
    for (let k = 0; k < tanks.length; k++) {
      const dx = cx - tanks[k].x;
      const dy = cy - tanks[k].y;
      const inside = dx * dx + dy * dy <= r2;
      if ((s.ignore >> k) & 1) {
        if (!inside) s.ignore &= ~(1 << k);
        continue;
      }
      if (inside) {
        s.alive = false;
        return { kind: "tank", x: cx, y: cy, tank: k, fx, fy };
      }
    }
    if (isSolid(t, cx, cy)) {
      if (s.bounces > 0) {
        s.bounces--;
        const [nX, nY] = surfaceNormal(s, t, cx, cy, floorPx(fx), floorPx(fy));
        reflect(s, nX, nY);
        return endBounce(s, fx, fy, { kind: "bounce", x: cx, y: cy, wall: false });
      }
      s.alive = false;
      return { kind: "terrain", x: cx, y: cy, fx, fy };
    }
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

- [ ] **Step 6: Replace** `src/game/titles/arcfire/resolve.ts`. It adds the `blastAt` import and the bounce branch: push the point, emit `bounce`, then detonate `blastEach`.

```ts
// src/game/titles/arcfire/resolve.ts
//
// resolveTurn (spec §1.3): one whole turn — the optional move, then the shot —
// resolved to completion. It MUTATES the MatchState it's given; callers that
// need the original (AI search, previews) resolve a cloneMatch() copy. The
// caller (match.ts applyTurn) validates the command first.
//
// The step loop and its ORDER are part of the determinism contract:
//   step s = 1, 2, ...:
//     1. delays due at s fire, in the order they were armed;
//     2. every shell that existed at the start of the step and is alive moves
//        once (stepShell), in creation order; a shell that triggers applies
//        its effects at once, in list order (so a later shell this step sees
//        their terrain); children it spawns are appended and first move at s + 1;
//   until no shell is alive and no delay is armed (or MAX_TURN_STEPS). Then
//   settle once, then score.
import { fromInt } from "@/game/sim/math/fixed";
import { ROSTER } from "./weapons/roster";
import { launchShell, muzzle, stepShell } from "./ballistics";
import { settle, spansFromHeight } from "./terrain";
import { hitCircles, moveTarget } from "./tanks";
import { idiv, floorPx } from "./imath";
import { STEPS_PER_SEC, MAX_TURN_STEPS } from "./constants";
import { addShell, applyEffects, blastAt, emit, fanOffset, type Shot } from "./weapons/primitives";
import type { MatchState } from "./state";
import type { Timeline } from "./timeline";
import type { WeaponDef } from "./weapons/types";

export interface TurnInput {
  move: -1 | 0 | 1;
  weapon: number; // roster index
  angle: number; // integer degrees 0..180
  power: number; // integer 0..100
}

export function resolveTurn(m: MatchState, input: TurnInput): Timeline {
  return resolveWeapon(m, ROSTER[input.weapon], input, true);
}

/** resolveTurn without building the Timeline's paths or events: the same state and points, faster (AI search, verification). */
export function resolveTurnPoints(m: MatchState, input: TurnInput): [number, number] {
  return resolveWeapon(m, ROSTER[input.weapon], input, false).points;
}

/**
 * resolveTurn with the weapon passed in: the seam unit tests use to fire
 * synthetic WeaponDefs (and 2B's probe shell). `input.weapon` is only
 * recorded. `record = false` leaves `shells`, `events` and `settle.falls` empty.
 */
export function resolveWeapon(m: MatchState, def: WeaponDef, input: TurnInput, record = true): Timeline {
  const shooter = m.shooter;
  const tl: Timeline = {
    shooter,
    move: null,
    wind: m.wind,
    weapon: input.weapon,
    steps: 0,
    shells: [],
    events: [],
    settle: { heights: m.terrain.height, falls: [] }, // replaced by the settle below
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

  // 2. Launch: shells fan out from the muzzle.
  spansFromHeight(m.terrain);
  const shot: Shot = {
    t: m.terrain, tanks: hitCircles(m), shooter, shells: [], stages: [], live: 0, pending: [], received: [0, 0],
    rec: record, tl,
  };
  const launch = def.launch;
  if (launch.kind === "shell" && def.stage) {
    const count = launch.count ?? 1;
    for (let i = 0; i < count; i++) {
      const angle = input.angle + fanOffset(i, count, launch.spreadDeg ?? 0); // never clamped: may leave 0..180 near the horizon
      const mz = muzzle(shot.tanks[shooter].x, shot.tanks[shooter].y, angle);
      const s = launchShell(mz.x, mz.y, angle, input.power, launch.speedPct ?? 100, launch.gravityPct ?? 100);
      addShell(shot, s, def.stage, angle, -1, 0);
    }
  }

  // 3. The step loop.
  const windStep = idiv(fromInt(m.wind), STEPS_PER_SEC);
  for (let step = 1; shot.live > 0 || shot.pending.length > 0; step++) {
    if (step > MAX_TURN_STEPS) {
      abandon(shot, MAX_TURN_STEPS);
      break;
    }
    tl.steps = step;
    const n = shot.shells.length; // shells spawned during this step first move at step + 1
    for (let j = 0; j < shot.pending.length; ) {
      const p = shot.pending[j];
      if (p.at !== step) {
        j++;
        continue;
      }
      shot.pending.splice(j, 1);
      applyEffects(shot, { ...p.trig, step }, p.effects);
    }
    for (let i = 0; i < n; i++) {
      const s = shot.shells[i];
      if (!s.alive) continue;
      const hit = stepShell(s, shot.t, shot.tanks, windStep);
      const path = record ? tl.shells[i].points : null;
      if (hit === null) {
        if (path) path.push(floorPx(s.x), floorPx(s.y));
        continue;
      }
      if (!s.alive) shot.live--;
      if (hit.kind === "bounce") {
        if (path) path.push(floorPx(s.x), floorPx(s.y));
        emit(shot, { step, kind: "bounce", shell: i, x: hit.x, y: hit.y, wall: hit.wall });
        const each = shot.stages[i].bounce?.blastEach;
        if (each) blastAt(shot, each, hit.x, hit.y, step, i, 0);
        continue;
      }
      if (hit.kind === "out") {
        if (path) path.push(hit.x, hit.y);
        emit(shot, { step, kind: "out", shell: i, x: hit.x, y: hit.y, lag: 0 });
        continue;
      }
      if (hit.kind !== "apex" && path) path.push(hit.x, hit.y);
      const stage = shot.stages[i];
      let effects = stage.effects;
      if (hit.kind !== "apex" && stage.on === "apex") { // an apex weapon that hit something before its apex
        if (!stage.early) {
          emit(shot, { step, kind: "dud", shell: i, x: hit.x, y: hit.y });
          continue;
        }
        effects = stage.early;
      }
      applyEffects(shot, {
        step, shell: i, x: hit.x, y: hit.y, fx: hit.fx, fy: hit.fy, vx: s.vx, vy: s.vy,
        speed: s.speed, gravityStep: s.gravityStep, tank: hit.kind === "tank" ? hit.tank : -1,
      }, effects);
    }
  }

  // 4. Dirt settles once, after the whole shot.
  tl.settle = settle(m.terrain, record);

  // 5. Damage to the opponent scores for the shooter; self-damage scores for the opponent.
  const opp = 1 - shooter;
  tl.points[shooter] += shot.received[opp];
  tl.points[opp] += shot.received[shooter];
  m.scores[0] += tl.points[0];
  m.scores[1] += tl.points[1];
  return tl;
}

/** The turn backstop: everything still flying is lost at `step` and armed delays are dropped (their `fuse` events keep an `at` beyond tl.steps: playback's cue). */
function abandon(shot: Shot, step: number): void {
  for (let i = 0; i < shot.shells.length; i++) {
    const s = shot.shells[i];
    if (!s.alive) continue;
    s.alive = false;
    emit(shot, { step, kind: "out", shell: i, x: floorPx(s.x), y: floorPx(s.y), lag: 0 });
  }
  shot.live = 0;
  shot.pending.length = 0;
}
```

- [ ] **Step 7: Append indices 14–16 to the roster** (design-verbatim):

In `src/game/titles/arcfire/weapons/roster.ts`, replace

```ts
];

/** Roster index by weapon id. */
```

with

```ts
  {
    id: "skipper", name: "Skipper", tag: "BOUNCE", tier: 2, power: 55,
    launch: { kind: "shell" },
    stage: { on: "impact", bounce: { times: 3, restitutionPct: 55, blastEach: blast(22, 20) }, effects: [{ blast: blast(26, 24) }] },
  },
  {
    id: "pinball", name: "Pinball", tag: "BOUNCE", tier: 2, power: 55,
    launch: { kind: "shell" },
    stage: { on: "impact", bounce: { times: 6, restitutionPct: 80 }, effects: [{ blast: blast(36, 55) }] },
  },
  {
    id: "ricochet", name: "Ricochet", tag: "BOUNCE", tier: 1, power: 30,
    launch: { kind: "shell" },
    stage: { on: "impact", bounce: { times: 2, restitutionPct: 100, walls: true }, effects: [{ blast: blast(30, 40) }] },
  },
];

/** Roster index by weapon id. */
```

- [ ] **Step 8: Run the suite: only the corpus may fail, on its new keys**

Run: `npx vitest run src/game/titles/arcfire`
Expected: FAIL, exactly 1 test: `corpus.test.ts`, whose case list has 258 fresh ids against 213 pinned (`expected [ Array(258) ] to deeply equal [ Array(213) ]`).

- [ ] **Step 9: Append the new corpus keys**

Run: `UPDATE_ARCFIRE_CORPUS=add npx vitest run src/game/titles/arcfire/corpus.test.ts`
Expected: PASS (+45 keys).

Run: `node -e "const c=require('./src/game/titles/arcfire/corpus.golden.json');console.log(c.digest,Object.keys(c.cases).length)"`
Expected, exactly: `673c1a97 258`

- [ ] **Step 10: Run the Arcfire gate, types and the full suite**

Run: `npx vitest run src/game/titles/arcfire src/game/sim/purity.test.ts`
Expected: PASS: 17 files, 148 tests. The corpus gates `skipper emits bounce:terrain` and `ricochet emits bounce:wall` are live and pass.

Run: `npx tsc --noEmit`
Expected: exit 0.

Run: `npm test`
Expected: all pass.

- [ ] **Step 11: Run the cross-engine gate**

Run: `npm run test:e2e:cross-engine -- --grep-invert firefox`
Expected: exit 0, `2 passed`. Chromium and WebKit reproduce `5167b43d`, `389a1340` and `673c1a97` (Firefox runs in CI). This is the first browser run of the bounce normal and the reflections.

- [ ] **Step 12: Commit**

```bash
git add src/game/titles/arcfire/ballistics.ts src/game/titles/arcfire/resolve.ts src/game/titles/arcfire/weapons/roster.ts src/game/titles/arcfire/ballistics.test.ts src/game/titles/arcfire/weapons/primitives.test.ts src/game/titles/arcfire/weapons/roster.test.ts src/game/titles/arcfire/corpus.golden.json
git commit -m "feat(arcfire): terrain and wall bounces (radius-8 normal, owner D5); Skipper, Pinball, Ricochet (14-16)" -m "Corpus + 45 keys -> 673c1a97 (258 cases); no existing key moved. Pins unchanged." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 9: The surface walker — roll, dig, burn → Tumbler, Juggernaut, Burrow, Auger, Inferno, Wildfire (indices 17–22)

**Files:**
- Modify: `src/game/titles/arcfire/weapons/primitives.ts` (full replacement: + `walk`, `downhill`, `roll`, `dig`, `burn`)
- Modify: `src/game/titles/arcfire/weapons/roster.ts` (append indices 17–22)
- Modify (tests): `weapons/primitives.test.ts`, `weapons/validate.test.ts`, `weapons/roster.test.ts`
- Modify (fixture): `corpus.golden.json` (new keys only)

**Interfaces:**
- Consumes: Task 6's `groundBelow`, `carveCapsule`, `isSolid`; Task 5's `SHOW_PX_PER_STEP`, `showSteps`, `ROLL_PROBE`, `DIG_MAX_PITCH`; Task 4's `cosDeg`/`sinDeg`.
- Produces:
  - `applyEffects` handles `roll`, `dig` and `burn`.
  - The events `roll { path, dur }`, `dig { x0, y0, x1, y1, width, dur }` and `burn { x, y, flows, dur }`. The blasts, damage and exits they cause carry `lag`, the display steps until the animation reaches them.
  - `ROSTER_INDEX` gains `tumbler` 17, `juggernaut` 18, `burrow` 19, `auger` 20, `inferno` 21, `wildfire` 22.

**Rules** (the design's §4.6; owner decisions **D4** and D6):
- **Roll.** A direct tank hit blasts at once. Otherwise the shell drops from its last free pixel to the ground and walks downhill (comparing `groundBelow` 6 px either side; on level ground, the travel direction).
  - The walker takes a column only if the next column's pixel at its height is empty, then drops to that column's ground. It never climbs.
  - It stops at the first rise, on entering a hitbox, at `maxDistance`, or at a world edge. It blasts at the stop column's ground pixel; rolling off the world is an `out` and no blast.
- **Dig (D4).** It tunnels along the travel direction at impact, **pitch-clamped**.
  - The clamp condition is `c > 0 && c·cos 30° > |a|·sin 30°`: one exact table comparison, with no arctangent. A heading that meets it becomes exactly 30° below level in the same horizontal sense, toward the opponent when `vx` is 0.
  - It samples a DDA from the impact pixel. It stops at the world edge or the floor (exclusive) or at a hitbox (inclusive), and carves a `width/2` capsule.
  - `each` blasts fire every `blastEvery` px strictly before the end, and `then` fires at the end. A direct tank hit digs nothing.
- **Burn.** It ignites on the ground below the last free pixel. The pool walks `pool/2` each way, then the flow walks `flow` px downhill, or both ways for `split`.
  - Each tank a run stops at, or whose hitbox contains the ignition point, takes `damage` once per burn effect.
  - Fire changes no terrain.

- [ ] **Step 1: Write the failing primitive tests.** Values are the design's, including Revision 2's clamped tunnels. The slopes are built exactly as described; Inferno's is the design's corrected construction (power 37, ignition x 470, lag 55).

Append to the end of `src/game/titles/arcfire/weapons/primitives.test.ts` (after one blank line):

```ts
describe("roll", () => {
  /** Tanks at 200 / 900; the ground falls from 300 to 420 over x 300..539 (1 px every 2 columns). */
  const slope = (): MatchState =>
    setHeights(flatBattle(200, 900), (x) => (x < 300 ? 300 : x < 540 ? 300 + Math.floor((x - 300) / 2) : 420));
  it("Tumbler rolls downhill along the surface and blasts where it stops", () => {
    const tl = fire(slope(), "tumbler", 70, 30);
    const [r] = eventsOf(tl, "roll");
    const xs = r.path.filter((_, i) => i % 2 === 0);
    const ys = r.path.filter((_, i) => i % 2 === 1);
    for (let i = 1; i < xs.length; i++) {
      expect(xs[i]).toBe(xs[i - 1] + 1); // one column at a time, downhill
      expect(ys[i]).toBeGreaterThanOrEqual(ys[i - 1]); // never climbs
    }
    expect(xs.length).toBeLessThanOrEqual(161); // maxDistance 160
    expect([xs[0], xs[xs.length - 1], r.dur]).toEqual([307, 467, 54]);
    const blasts = eventsOf(tl, "blast");
    expect(blasts.map((b) => [b.x, b.y - 1, b.lag])).toEqual([[xs[xs.length - 1], ys[ys.length - 1], r.dur]]); // at the stop column's ground pixel
  });
  it("a direct hit doesn't roll", () => {
    const tl = fire(flatBattle(), "tumbler", 90, 0);
    expect(eventsOf(tl, "roll")).toEqual([]);
    expect(tl.points).toEqual([0, 40]);
  });
  it("a roll off the world is lost: an out, and no blast", () => {
    const tl = fireDef(flatBattle(), synth({ on: "impact", effects: [{ roll: { maxDistance: 1200, then: { radius: 30, damage: 40 } } }] }), 60, 60);
    expect(eventsOf(tl, "out").map((o) => o.x)).toEqual([1200]);
    expect(eventsOf(tl, "blast")).toEqual([]);
  });
});

describe("dig", () => {
  it("Burrow's steep fall tunnels at the 30° clamp, and blasts at the tunnel's end", () => {
    const tl = fire(flatBattle(), "burrow", 60, 50);
    const [d] = eventsOf(tl, "dig");
    expect([d.x0, d.y0, d.x1, d.y1, d.width, d.dur]).toEqual([663, 400, 740, 445, 14, 23]);
    const len = Math.hypot(d.x1 - d.x0, d.y1 - d.y0);
    expect(len >= 88 && len <= 91).toBe(true);
    expect(eventsOf(tl, "blast").map((b) => [b.x, b.y, b.lag])).toEqual([[740, 445, 23]]);
  });
  it("keeps a heading shallower than 30°: a level shot into a cliff tunnels level", () => {
    const m = setHeights(flatBattle(), (x) => (x >= 450 ? 200 : 400));
    const [d] = eventsOf(fire(m, "burrow", 0, 100), "dig");
    expect([d.x0, d.y0, d.x1, d.y1]).toEqual([450, 393, 539, 400]);
  });
  it("with no horizontal travel it digs 30° below level toward the opponent", () => {
    const def = synth({ on: "apex", effects: [{ dig: { length: 90, width: 14 } }] });
    const [d0] = eventsOf(fireDef(flatBattle(), def, 90, 50), "dig");
    expect([d0.x0, d0.y0, d0.x1, d0.y1]).toEqual([300, 173, 377, 218]);
    const m1 = flatBattle();
    m1.shooter = 1;
    const [d1] = eventsOf(fireDef(m1, def, 90, 50), "dig");
    expect([d1.x0, d1.y0, d1.x1, d1.y1]).toEqual([700, 173, 623, 218]);
  });
  it("Auger blasts every 40 px along its clamped tunnel, then at the end", () => {
    const tl = fire(flatBattle(), "auger", 30, 60);
    const blasts = eventsOf(tl, "blast");
    expect(blasts.map((b) => [b.x, b.y, b.lag])).toEqual([[871, 419, 10], [906, 440, 20], [940, 459, 30], [975, 480, 40]]);
    expect(blasts.every((b) => b.y < WORLD_H)).toBe(true);
  });
  it("a direct hit digs nothing: a zero-length tunnel and one blast", () => {
    const tl = fire(flatBattle(), "burrow", 90, 0);
    const [d] = eventsOf(tl, "dig");
    expect([d.x1, d.y1]).toEqual([d.x0, d.y0]);
    expect(eventsOf(tl, "blast").length).toBe(1);
  });
});

describe("burn", () => {
  it("Wildfire runs both ways from its ignition and burns the enemy exactly once", () => {
    const m = flatBattle();
    const before = Array.from(m.terrain.height);
    const tl = fire(m, "wildfire", 60, 52);
    const [b] = eventsOf(tl, "burn");
    expect(b.x).toBe(687);
    expect(b.flows.map((f) => [f[0], f[f.length - 2]])).toEqual([[687, 547], [687, 692]]); // the right-hand flow stops at the tank
    expect(eventsOf(tl, "damage").map((d) => [d.target, d.amount, d.lag])).toEqual([[1, 45, 2]]);
    expect(Array.from(m.terrain.height)).toEqual(before); // fire changes no terrain
  });
  it("Inferno ignites uphill of the enemy and its flow runs down into it: 70, once", () => {
    // tanks 200 / 700; flat at 300 up to x 399, then falling 120 px over x 400..700, then flat at 420
    const m = setHeights(flatBattle(200, 700), (x) => (x < 400 ? 300 : x <= 700 ? 300 + Math.floor(((x - 400) * 120) / 300) : 420));
    const before = Array.from(m.terrain.height);
    const tl = fire(m, "inferno", 45, 37);
    expect(eventsOf(tl, "burn")[0].x).toBe(470);
    expect(eventsOf(tl, "damage").map((d) => [d.target, d.amount, d.lag])).toEqual([[1, 70, 55]]);
    expect(Array.from(m.terrain.height)).toEqual(before);
  });
});
```

- [ ] **Step 2: Stage the roll, dig and burn totality cases**

Append to the end of `src/game/titles/arcfire/weapons/validate.test.ts` (after one blank line):

```ts
describe("totality: roll, dig and burn", () => {
  it("a zero roll, an all-zero dig and an all-zero burn", () => {
    const Z: Blast = { radius: 0, damage: 0 };
    expectTotal(impact([{ roll: { maxDistance: 0, then: Z } }]));
    expectTotal(impact([{ dig: { length: 0, width: 0, blastEvery: 0, each: Z, then: Z } }]));
    expectTotal(impact([{ burn: { flow: 0, pool: 0, damage: 0 } }]));
  });
});
```

- [ ] **Step 3: Append this task's ids to `WIRE`**

In `src/game/titles/arcfire/weapons/roster.test.ts`, replace

```ts
const WIRE = [
  "pulse", "pulse2", "nova", "needle", "crater", "triad", "fan", "railshot",
  "twinnova", "cascade", "hydra", "hailstorm", "shrapnel", "barrage", "skipper", "pinball",
  "ricochet",
];
```

with

```ts
const WIRE = [
  "pulse", "pulse2", "nova", "needle", "crater", "triad", "fan", "railshot",
  "twinnova", "cascade", "hydra", "hailstorm", "shrapnel", "barrage", "skipper", "pinball",
  "ricochet", "tumbler", "juggernaut", "burrow", "auger", "inferno", "wildfire",
];
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `npx vitest run src/game/titles/arcfire`
Expected: FAIL, exactly 11 tests:
- In `primitives.test.ts`, 8 tests that fire the new weapons fail with `TypeError: Cannot read properties of undefined (reading 'launch')`, and 2 synthetic ones fail too:
  - `a roll off the world is lost …`: `expected [] to deeply equal [ 1200 ]`
  - `with no horizontal travel it digs 30° below level …`: `TypeError: Cannot read properties of undefined (reading 'x0')`
- `roster.test.ts > pins the wire order so far …`: `expected [ 'pulse', 'pulse2', 'nova', …(14) ] to deeply equal [ 'pulse', 'pulse2', 'nova', …(20) ]`

The new totality block passes already: an effect with no branch does nothing.

- [ ] **Step 5: Replace** `src/game/titles/arcfire/weapons/primitives.ts`. Compared with Task 7 it adds, from the design's final file verbatim:
  - `WalkEnd`, `walk`, `downhill`, `roll`, `dig` (with the 30° pitch clamp) and `burn`;
  - their `applyEffects` branches;
  - their imports: `toInt`, `isqrt`, `isSolid`, `carveCapsule`, `groundBelow`, `WORLD_W`, `WORLD_H`, `ROLL_PROBE`, `DIG_MAX_PITCH`, `SHOW_PX_PER_STEP`, `showSteps`, `Burn`, `Dig` and `Roll`.

```ts
// src/game/titles/arcfire/weapons/primitives.ts
//
// The effect implementations (spec §4.1): the only weapon code outside the
// shell flight in ballistics.ts. Every effect is applied INSTANTLY at its
// trigger step, in closed form or one bounded pass over the terrain; only
// shells and delays take simulated time. Integer px / Q16.16 throughout; no
// weapon draws from the match RNG. The order effects run in is part of the
// determinism contract (see resolve.ts).
import type { Fx } from "@/game/sim/types";
import { fromInt, toInt, mul } from "@/game/sim/math/fixed";
import { cosDeg, sinDeg } from "../aimTable";
import { idiv, isqrt, floorPx } from "../imath";
import { isSolid, carveCircle, carveCapsule, groundBelow, type Terrain } from "../terrain";
import { rotateVel, shellAt, type HitCircle, type Shell } from "../ballistics";
import { blastDamage } from "../damage";
import { WORLD_W, WORLD_H, TANK_HIT_R, ROLL_PROBE, MAX_SHELLS, DIG_MAX_PITCH } from "../constants";
import { SHOW_PX_PER_STEP, showSteps, type Timeline, type TimelineEvent } from "../timeline";
import type { Blast, Burn, Dig, Effect, Roll, Split, Stage } from "./types";

/** Everything one shot's effects can touch. Built by resolveWeapon; lives for one turn. */
export interface Shot {
  t: Terrain;
  tanks: readonly HitCircle[]; // hitboxes, fixed for the whole shot (tanks ride the settle afterwards)
  shooter: number;
  shells: Shell[]; // every shell of the turn, by creation order (= Timeline.shells index)
  stages: Stage[]; // stages[i] = what shells[i] does on its trigger
  live: number; // shells still alive
  pending: Pending[]; // armed delays, in arming order
  received: number[]; // damage each tank took this turn
  rec: boolean; // build the Timeline's paths and events (false: the quiet AI path)
  tl: Timeline;
}

/** Where and how a stage fired. */
export interface Trigger {
  step: number;
  shell: number; // index of the shell that triggered
  x: number; // the trigger px: first solid (or tank) px on impact; the shell's px at the apex
  y: number;
  fx: Fx; // the last free position: children spawn here; roll and burn drop from here
  fy: Fx;
  vx: Fx; // velocity at the trigger: dig direction, the roll/burn tie-break, "ahead"/"cone" splits
  vy: Fx;
  speed: Fx; // the shell's nominal speed: the base of "up"/"cone" splits
  gravityStep: Fx; // inherited by children
  tank: number; // the tank struck, or -1
}

export interface Pending {
  at: number; // the step it fires on
  trig: Trigger;
  effects: readonly Effect[];
}

export function emit(shot: Shot, ev: TimelineEvent): void {
  if (shot.rec) shot.tl.events.push(ev);
}

/** Apply a list of effects at a trigger, completely and in array order (a delay only arms its list). */
export function applyEffects(shot: Shot, trig: Trigger, effects: readonly Effect[]): void {
  for (const e of effects) {
    if ("blast" in e) blastAt(shot, e.blast, trig.x, trig.y, trig.step, trig.shell, 0);
    else if ("split" in e) split(shot, trig, e.split);
    else if ("roll" in e) roll(shot, trig, e.roll);
    else if ("dig" in e) dig(shot, trig, e.dig);
    else if ("burn" in e) burn(shot, trig, e.burn);
    else if ("delay" in e) {
      const at = trig.step + (e.delay.steps > 1 ? e.delay.steps : 1);
      shot.pending.push({ at, trig, effects: e.delay.then });
      emit(shot, { step: trig.step, kind: "fuse", shell: trig.shell, x: trig.x, y: trig.y, at });
    }
  }
}

/** Damage to tank p: it scores for whoever didn't take it (resolve.ts). */
function hurt(shot: Shot, p: number, amount: number, step: number, lag: number): void {
  if (amount <= 0) return;
  shot.received[p] += amount;
  emit(shot, { step, kind: "damage", target: p, amount, lag });
}

/** Plan 1's blast: carve a disc, then damage both tanks by distance (tank order 0, 1). */
export function blastAt(shot: Shot, b: Blast, x: number, y: number, step: number, shell: number, lag: number): void {
  carveCircle(shot.t, x, y, b.radius);
  emit(shot, { step, kind: "blast", shell, x, y, radius: b.radius, lag });
  for (let p = 0; p < 2; p++) hurt(shot, p, blastDamage(b, x, y, shot.tanks[p].x, shot.tanks[p].y), step, lag);
}

/** Bitmask of the tanks whose hitbox contains px (x, y). */
function tankMask(shot: Shot, x: number, y: number): number {
  let m = 0;
  for (let k = 0; k < 2; k++) {
    const dx = x - shot.tanks[k].x;
    const dy = y - shot.tanks[k].y;
    if (dx * dx + dy * dy <= TANK_HIT_R * TANK_HIT_R) m |= 1 << k;
  }
  return m;
}

/** The first tank whose hitbox contains (x, y), or -1. */
function tankAt(shot: Shot, x: number, y: number): number {
  const m = tankMask(shot, x, y);
  return m === 0 ? -1 : (m & 1) !== 0 ? 0 : 1;
}

/** Add a shell to the turn and arm its stage's flight modifiers. Returns its index, or -1 past MAX_SHELLS (dropped). */
export function addShell(shot: Shot, s: Shell, stage: Stage, angle: number, parent: number, step: number): number {
  if (shot.shells.length >= MAX_SHELLS) return -1;
  s.stopAtApex = stage.on === "apex";
  if (stage.homing) {
    const target = shot.tanks[1 - shot.shooter];
    s.homeDeg = stage.homing.degPerStep;
    s.homeX = target.x;
    s.homeY = target.y;
  }
  if (stage.bounce) {
    if (stage.bounce.walls) s.wallBounces = stage.bounce.times;
    else s.bounces = stage.bounce.times;
    s.restitutionPct = stage.bounce.restitutionPct;
  }
  s.ignore = tankMask(shot, floorPx(s.x), floorPx(s.y)); // only a line split can spawn inside a hitbox
  shot.shells.push(s);
  shot.stages.push(stage);
  shot.live++;
  if (shot.rec) shot.tl.shells.push({ angle, parent, start: step, points: [floorPx(s.x), floorPx(s.y)] });
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
    let vx: Fx;
    let vy: Fx;
    if (sp.from === "up") {
      vx = mul(speed, cosDeg(90 + off));
      vy = 0 - mul(speed, sinDeg(90 + off));
    } else if (sp.from === "cone") {
      vx = trig.vx + mul(speed, cosDeg(270 + off));
      vy = trig.vy - mul(speed, sinDeg(270 + off));
    } else {
      const [rx, ry] = rotateVel(trig.vx, trig.vy, off);
      vx = idiv(rx * sp.speedPct, 100);
      vy = idiv(ry * sp.speedPct, 100);
    }
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
function downhill(t: Terrain, x: number, g: number, vx: Fx): number {
  const l = x - ROLL_PROBE >= 0 ? groundBelow(t, x - ROLL_PROBE, g - ROLL_PROBE) : g;
  const r = x + ROLL_PROBE < WORLD_W ? groundBelow(t, x + ROLL_PROBE, g - ROLL_PROBE) : g;
  if (r > l) return 1;
  if (l > r) return -1;
  return vx < 0 ? -1 : 1;
}

function roll(shot: Shot, trig: Trigger, r: Roll): void {
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
  }
  blastAt(shot, r.then, end.x, end.g, trig.step, trig.shell, dur);
}

function dig(shot: Shot, trig: Trigger, d: Dig): void {
  // Along the travel direction, but never steeper than DIG_MAX_PITCH below level: a steeper
  // heading (or none) takes exactly that pitch, keeping the horizontal sense of travel
  // (toward the opponent when there is none). Upward and shallower headings are kept.
  let a = toInt(trig.vx); // px/s, |a| < 2^15: every product here stays < 2^33
  let c = toInt(trig.vy); // px/s, + = down
  if (c > 0 ? c * cosDeg(DIG_MAX_PITCH) > (a < 0 ? 0 - a : a) * sinDeg(DIG_MAX_PITCH) : a === 0 && c === 0) {
    const sense = trig.vx > 0 ? 1 : trig.vx < 0 ? -1 : shot.shooter === 0 ? 1 : -1;
    a = sense * cosDeg(DIG_MAX_PITCH); // (a, c) becomes that pitch's Q16.16 unit vector: only its direction matters
    c = sinDeg(DIG_MAX_PITCH);
  }
  const len = isqrt(a * a + c * c); // >= 1: (a, c) is never (0, 0) here
  const x0 = trig.x;
  const y0 = trig.y;
  const dx = idiv(a * d.length, len);
  const dy = idiv(c * d.length, len);
  const n = Math.max(Math.abs(dx), Math.abs(dy), 1);
  let stop = n; // the last sample the tunnel reaches
  for (let i = 0; i <= n; i++) {
    const sx = x0 + idiv(dx * i, n);
    const sy = y0 + idiv(dy * i, n);
    // i = 0 is the trigger px, inside the world; the floor (WORLD_H) is bedrock
    if (i > 0 && (sx < 0 || sx >= WORLD_W || sy >= WORLD_H)) { stop = i - 1; break; }
    if (tankAt(shot, sx, sy) >= 0) { stop = i; break; }
  }
  const ex = x0 + idiv(dx * stop, n);
  const ey = y0 + idiv(dy * stop, n);
  const reached = idiv(stop * d.length, n); // px along the tunnel
  carveCapsule(shot.t, x0, y0, ex, ey, idiv(d.width, 2));
  const dur = showSteps(reached, SHOW_PX_PER_STEP.dig);
  emit(shot, { step: trig.step, kind: "dig", shell: trig.shell, x0, y0, x1: ex, y1: ey, width: d.width, dur });
  if (d.each && d.blastEvery && d.blastEvery > 0) {
    for (let k = 1; k * d.blastEvery < d.length; k++) {
      const i = idiv(k * d.blastEvery * n, d.length); // the sample k × blastEvery px along
      if (i >= stop) break;
      blastAt(shot, d.each, x0 + idiv(dx * i, n), y0 + idiv(dy * i, n), trig.step, trig.shell,
        showSteps(k * d.blastEvery, SHOW_PX_PER_STEP.dig));
    }
  }
  if (d.then) blastAt(shot, d.then, ex, ey, trig.step, trig.shell, dur);
}

function burn(shot: Shot, trig: Trigger, b: Burn): void {
  const x = floorPx(trig.fx);
  const g = groundBelow(shot.t, x, floorPx(trig.fy));
  const touched = [-1, -1]; // px along a run where each tank was first touched (-1 = never)
  const start = tankAt(shot, x, g - 1);
  if (start >= 0) touched[start] = 0;
  const half = idiv(b.pool, 2);
  const runs: number[] = []; // [dir, max px] pairs: the pool both ways, then the flow(s)
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
}
```

- [ ] **Step 6: Append indices 17–22 to the roster** (design-verbatim):

In `src/game/titles/arcfire/weapons/roster.ts`, replace

```ts
];

/** Roster index by weapon id. */
```

with

```ts
  {
    id: "tumbler", name: "Tumbler", tag: "ROLL", tier: 1, power: 30,
    launch: { kind: "shell" },
    stage: { on: "impact", effects: [{ roll: { maxDistance: 160, then: blast(30, 40) } }] },
  },
  {
    id: "juggernaut", name: "Juggernaut", tag: "ROLL", tier: 3, power: 80,
    launch: { kind: "shell" },
    stage: { on: "impact", effects: [{ roll: { maxDistance: 300, then: blast(60, 85) } }] },
  },
  {
    id: "burrow", name: "Burrow", tag: "DIG", tier: 2, power: 55,
    launch: { kind: "shell" },
    stage: { on: "impact", effects: [{ dig: { length: 90, width: 14, then: blast(34, 55) } }] },
  },
  {
    id: "auger", name: "Auger", tag: "DIG", tier: 2, power: 55,
    launch: { kind: "shell" },
    stage: { on: "impact", effects: [{ dig: { length: 160, width: 14, blastEvery: 40, each: blast(18, 16), then: blast(18, 16) } }] },
  },
  {
    id: "inferno", name: "Inferno", tag: "FIRE", tier: 3, power: 80,
    launch: { kind: "shell" },
    stage: { on: "impact", effects: [{ burn: { flow: 220, pool: 30, damage: 70 } }] },
  },
  {
    id: "wildfire", name: "Wildfire", tag: "FIRE", tier: 2, power: 55,
    launch: { kind: "shell" },
    stage: { on: "impact", effects: [{ burn: { flow: 140, pool: 0, damage: 45, split: true } }] },
  },
];

/** Roster index by weapon id. */
```

- [ ] **Step 7: Run the suite: only the corpus may fail, on its new keys**

Run: `npx vitest run src/game/titles/arcfire`
Expected: FAIL, exactly 1 test: `corpus.test.ts`, whose case list has 348 fresh ids against 258 pinned.

- [ ] **Step 8: Append the new corpus keys**

Run: `UPDATE_ARCFIRE_CORPUS=add npx vitest run src/game/titles/arcfire/corpus.test.ts`
Expected: PASS (+90 keys).

Run: `node -e "const c=require('./src/game/titles/arcfire/corpus.golden.json');console.log(c.digest,Object.keys(c.cases).length)"`
Expected, exactly: `0d68b775 348`

- [ ] **Step 9: Run the Arcfire gate, types and the full suite**

Run: `npx vitest run src/game/titles/arcfire src/game/sim/purity.test.ts`
Expected: PASS: 17 files, 159 tests. The corpus gates `tumbler emits roll`, `burrow emits dig` and `inferno emits burn` are live and pass.

Run: `npx tsc --noEmit`
Expected: exit 0.

Run: `npm test`
Expected: all pass.

- [ ] **Step 10: Run the cross-engine gate**

Run: `npm run test:e2e:cross-engine -- --grep-invert firefox`
Expected: exit 0, `2 passed`. Chromium and WebKit reproduce `5167b43d`, `389a1340` and `0d68b775` (Firefox runs in CI). This is the first browser run of the surface walker and `carveCapsule`.

- [ ] **Step 11: Commit**

```bash
git add src/game/titles/arcfire/weapons/primitives.ts src/game/titles/arcfire/weapons/roster.ts src/game/titles/arcfire/weapons/primitives.test.ts src/game/titles/arcfire/weapons/validate.test.ts src/game/titles/arcfire/weapons/roster.test.ts src/game/titles/arcfire/corpus.golden.json
git commit -m "feat(arcfire): roll, dig (30-degree pitch clamp, owner D4) and burn; Tumbler, Juggernaut, Burrow, Auger, Inferno, Wildfire (17-22)" -m "Corpus + 90 keys -> 0d68b775 (348 cases); no existing key moved. Pins unchanged." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 10: Build → Rampart, Bastion, Leveler (indices 23–25)

**Files:**
- Modify: `src/game/titles/arcfire/weapons/primitives.ts` (full replacement: + `build`)
- Modify: `src/game/titles/arcfire/weapons/roster.ts` (append indices 23–25)
- Modify (tests): `weapons/primitives.test.ts`, `weapons/validate.test.ts`, `weapons/roster.test.ts`
- Modify (fixture): `corpus.golden.json` (new keys only)

**Interfaces:**
- Consumes: Task 6's `addInterval`, `removeInterval`, `surfaceTop`, `groundBelow`; Plan 1's `hitCircles` (in the test).
- Produces:
  - `applyEffects` handles `build`.
  - The `build { shape, x, y, size, width }` event. `size` is the ball/level radius or the wall height; `width` is the number of columns spanned, the first at `x − ⌊width/2⌋`.
  - `ROSTER_INDEX` gains `rampart` 23, `bastion` 24, `leveler` 25.

**Rules** (the design's §4.6; owner decision D6 / O10):
- **ball:** a disc at the trigger pixel, one `addInterval` per column. The airborne half settles into a mound.
- **wall:** each of the `width` columns rises by exactly `height` on its own surface.
- **level:** every column within ±radius becomes solid exactly from the impact y down.
- **No burying, by construction.** A tank has no y of its own: dirt added in its column is compacted beneath it by the settle and lifts it. During the shot, hitboxes are checked before terrain.

- [ ] **Step 1: Write the failing primitive tests.** They include the no-burying test and the footprint `size`/`width` check.

In `src/game/titles/arcfire/weapons/primitives.test.ts`, insert directly after

```ts
import { isSolid } from "../terrain";
```

these lines:

```ts
import { hitCircles } from "../tanks";
```

Append to the end of `src/game/titles/arcfire/weapons/primitives.test.ts` (after one blank line):

```ts
describe("build", () => {
  it("Rampart raises exactly 36 contiguous columns by 80, following the ground", () => {
    const m = flatBattle(300, 1000);
    const tl = fire(m, "rampart", 60, 50);
    const [b] = eventsOf(tl, "build");
    expect([b.shape, b.x, b.size, b.width]).toEqual(["wall", 663, 80, 36]);
    const raised: number[] = [];
    for (let x = 0; x < m.terrain.height.length; x++) if (m.terrain.height[x] !== 400) raised.push(x);
    expect(raised).toEqual(Array.from({ length: 36 }, (_, i) => b.x - 18 + i)); // 645..680: x - floor(width / 2) onward
    expect(raised.every((x) => m.terrain.height[x] === 320)).toBe(true);
  });
  it("Bastion adds a dirt ball that settles into a symmetric mound at most 48 high", () => {
    const m = flatBattle(300, 1000);
    const tl = fire(m, "bastion", 60, 50);
    const [b] = eventsOf(tl, "build");
    expect([b.shape, b.x, b.size, b.width]).toEqual(["ball", 663, 48, 97]);
    const h = m.terrain.height;
    expect([h[663], h[663 + 17], h[663 + 40]]).toEqual([352, 356, 374]);
    for (let d = 1; d <= 60; d++) expect(h[663 - d]).toBe(h[663 + d]);
    for (let x = 0; x < h.length; x++) expect(400 - h[x]).toBeLessThanOrEqual(48);
  });
  it("Leveler flattens every column within 80 px to the impact height, and nothing beyond", () => {
    const m = setHeights(flatBattle(200, 1000), (x) => Math.min(480, 250 + Math.floor(x / 4))); // a 1-in-4 slope
    const before = Array.from(m.terrain.height);
    const tl = fire(m, "leveler", 60, 60);
    const [b] = eventsOf(tl, "build");
    expect([b.shape, b.size, b.width]).toEqual(["level", 80, 161]);
    for (let x = 0; x < before.length; x++) {
      expect(m.terrain.height[x]).toBe(Math.abs(x - b.x) <= 80 ? b.y : before[x]);
    }
  });
  it("never buries a tank: a ball dropped on it compacts beneath it and lifts it", () => {
    let found = 0;
    for (let power = 40; power <= 80 && found === 0; power++) {
      const m = flatBattle();
      const [b] = eventsOf(fire(m, "bastion", 45, power), "build");
      if (Math.abs(b.x - 700) > 8) continue;
      found = power;
      expect(m.terrain.height[700]).toBe(328);
      const enemy = hitCircles(m)[1];
      expect(enemy.y).toBe(m.terrain.height[700] - TANK_HIT_DY); // riding on top of its column
      expect(isSolid(m.terrain, enemy.x, enemy.y)).toBe(false);
      expect(m.terrain.spanCount[700]).toBe(1);
    }
    expect(found).toBe(50);
  });
  it("Rampart built against a tank lifts its column by exactly 80", () => {
    let found = 0;
    for (let power = 40; power <= 80 && found === 0; power++) {
      const m = flatBattle();
      const [b] = eventsOf(fire(m, "rampart", 45, power), "build");
      if (Math.abs(b.x - 700) > 10) continue;
      found = power;
      expect(m.terrain.height[700]).toBe(320);
    }
    expect(found).toBe(49);
  });
});
```

- [ ] **Step 2: Stage the wall totality case**

Append to the end of `src/game/titles/arcfire/weapons/validate.test.ts` (after one blank line):

```ts
describe("totality: build", () => {
  it("a 0 × 0 wall", () => {
    expectTotal(impact([{ build: { shape: "wall", width: 0, height: 0 } }]));
  });
});
```

- [ ] **Step 3: Append this task's ids to `WIRE`**

In `src/game/titles/arcfire/weapons/roster.test.ts`, replace

```ts
const WIRE = [
  "pulse", "pulse2", "nova", "needle", "crater", "triad", "fan", "railshot",
  "twinnova", "cascade", "hydra", "hailstorm", "shrapnel", "barrage", "skipper", "pinball",
  "ricochet", "tumbler", "juggernaut", "burrow", "auger", "inferno", "wildfire",
];
```

with

```ts
const WIRE = [
  "pulse", "pulse2", "nova", "needle", "crater", "triad", "fan", "railshot",
  "twinnova", "cascade", "hydra", "hailstorm", "shrapnel", "barrage", "skipper", "pinball",
  "ricochet", "tumbler", "juggernaut", "burrow", "auger", "inferno", "wildfire", "rampart",
  "bastion", "leveler",
];
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `npx vitest run src/game/titles/arcfire`
Expected: FAIL, exactly 6 tests:
- all 5 `primitives.test.ts > build` tests: `TypeError: Cannot read properties of undefined (reading 'launch')`
- `roster.test.ts > pins the wire order so far …`: `expected [ 'pulse', 'pulse2', 'nova', …(20) ] to deeply equal [ 'pulse', 'pulse2', 'nova', …(23) ]`

The wall totality block already passes: an effect with no branch does nothing.

- [ ] **Step 5: Replace** `src/game/titles/arcfire/weapons/primitives.ts`. Compared with Task 9 it adds, from the design's final file verbatim: `build`, its `applyEffects` branch, and the `removeInterval`, `addInterval`, `surfaceTop` and `Build` imports.

```ts
// src/game/titles/arcfire/weapons/primitives.ts
//
// The effect implementations (spec §4.1): the only weapon code outside the
// shell flight in ballistics.ts. Every effect is applied INSTANTLY at its
// trigger step, in closed form or one bounded pass over the terrain; only
// shells and delays take simulated time. Integer px / Q16.16 throughout; no
// weapon draws from the match RNG. The order effects run in is part of the
// determinism contract (see resolve.ts).
import type { Fx } from "@/game/sim/types";
import { fromInt, toInt, mul } from "@/game/sim/math/fixed";
import { cosDeg, sinDeg } from "../aimTable";
import { idiv, isqrt, floorPx } from "../imath";
import {
  isSolid, carveCircle, carveCapsule, removeInterval, addInterval, groundBelow, surfaceTop, type Terrain,
} from "../terrain";
import { rotateVel, shellAt, type HitCircle, type Shell } from "../ballistics";
import { blastDamage } from "../damage";
import { WORLD_W, WORLD_H, TANK_HIT_R, ROLL_PROBE, MAX_SHELLS, DIG_MAX_PITCH } from "../constants";
import { SHOW_PX_PER_STEP, showSteps, type Timeline, type TimelineEvent } from "../timeline";
import type { Blast, Build, Burn, Dig, Effect, Roll, Split, Stage } from "./types";

/** Everything one shot's effects can touch. Built by resolveWeapon; lives for one turn. */
export interface Shot {
  t: Terrain;
  tanks: readonly HitCircle[]; // hitboxes, fixed for the whole shot (tanks ride the settle afterwards)
  shooter: number;
  shells: Shell[]; // every shell of the turn, by creation order (= Timeline.shells index)
  stages: Stage[]; // stages[i] = what shells[i] does on its trigger
  live: number; // shells still alive
  pending: Pending[]; // armed delays, in arming order
  received: number[]; // damage each tank took this turn
  rec: boolean; // build the Timeline's paths and events (false: the quiet AI path)
  tl: Timeline;
}

/** Where and how a stage fired. */
export interface Trigger {
  step: number;
  shell: number; // index of the shell that triggered
  x: number; // the trigger px: first solid (or tank) px on impact; the shell's px at the apex
  y: number;
  fx: Fx; // the last free position: children spawn here; roll and burn drop from here
  fy: Fx;
  vx: Fx; // velocity at the trigger: dig direction, the roll/burn tie-break, "ahead"/"cone" splits
  vy: Fx;
  speed: Fx; // the shell's nominal speed: the base of "up"/"cone" splits
  gravityStep: Fx; // inherited by children
  tank: number; // the tank struck, or -1
}

export interface Pending {
  at: number; // the step it fires on
  trig: Trigger;
  effects: readonly Effect[];
}

export function emit(shot: Shot, ev: TimelineEvent): void {
  if (shot.rec) shot.tl.events.push(ev);
}

/** Apply a list of effects at a trigger, completely and in array order (a delay only arms its list). */
export function applyEffects(shot: Shot, trig: Trigger, effects: readonly Effect[]): void {
  for (const e of effects) {
    if ("blast" in e) blastAt(shot, e.blast, trig.x, trig.y, trig.step, trig.shell, 0);
    else if ("split" in e) split(shot, trig, e.split);
    else if ("roll" in e) roll(shot, trig, e.roll);
    else if ("dig" in e) dig(shot, trig, e.dig);
    else if ("burn" in e) burn(shot, trig, e.burn);
    else if ("build" in e) build(shot, trig, e.build);
    else if ("delay" in e) {
      const at = trig.step + (e.delay.steps > 1 ? e.delay.steps : 1);
      shot.pending.push({ at, trig, effects: e.delay.then });
      emit(shot, { step: trig.step, kind: "fuse", shell: trig.shell, x: trig.x, y: trig.y, at });
    }
  }
}

/** Damage to tank p: it scores for whoever didn't take it (resolve.ts). */
function hurt(shot: Shot, p: number, amount: number, step: number, lag: number): void {
  if (amount <= 0) return;
  shot.received[p] += amount;
  emit(shot, { step, kind: "damage", target: p, amount, lag });
}

/** Plan 1's blast: carve a disc, then damage both tanks by distance (tank order 0, 1). */
export function blastAt(shot: Shot, b: Blast, x: number, y: number, step: number, shell: number, lag: number): void {
  carveCircle(shot.t, x, y, b.radius);
  emit(shot, { step, kind: "blast", shell, x, y, radius: b.radius, lag });
  for (let p = 0; p < 2; p++) hurt(shot, p, blastDamage(b, x, y, shot.tanks[p].x, shot.tanks[p].y), step, lag);
}

/** Bitmask of the tanks whose hitbox contains px (x, y). */
function tankMask(shot: Shot, x: number, y: number): number {
  let m = 0;
  for (let k = 0; k < 2; k++) {
    const dx = x - shot.tanks[k].x;
    const dy = y - shot.tanks[k].y;
    if (dx * dx + dy * dy <= TANK_HIT_R * TANK_HIT_R) m |= 1 << k;
  }
  return m;
}

/** The first tank whose hitbox contains (x, y), or -1. */
function tankAt(shot: Shot, x: number, y: number): number {
  const m = tankMask(shot, x, y);
  return m === 0 ? -1 : (m & 1) !== 0 ? 0 : 1;
}

/** Add a shell to the turn and arm its stage's flight modifiers. Returns its index, or -1 past MAX_SHELLS (dropped). */
export function addShell(shot: Shot, s: Shell, stage: Stage, angle: number, parent: number, step: number): number {
  if (shot.shells.length >= MAX_SHELLS) return -1;
  s.stopAtApex = stage.on === "apex";
  if (stage.homing) {
    const target = shot.tanks[1 - shot.shooter];
    s.homeDeg = stage.homing.degPerStep;
    s.homeX = target.x;
    s.homeY = target.y;
  }
  if (stage.bounce) {
    if (stage.bounce.walls) s.wallBounces = stage.bounce.times;
    else s.bounces = stage.bounce.times;
    s.restitutionPct = stage.bounce.restitutionPct;
  }
  s.ignore = tankMask(shot, floorPx(s.x), floorPx(s.y)); // only a line split can spawn inside a hitbox
  shot.shells.push(s);
  shot.stages.push(stage);
  shot.live++;
  if (shot.rec) shot.tl.shells.push({ angle, parent, start: step, points: [floorPx(s.x), floorPx(s.y)] });
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
    let vx: Fx;
    let vy: Fx;
    if (sp.from === "up") {
      vx = mul(speed, cosDeg(90 + off));
      vy = 0 - mul(speed, sinDeg(90 + off));
    } else if (sp.from === "cone") {
      vx = trig.vx + mul(speed, cosDeg(270 + off));
      vy = trig.vy - mul(speed, sinDeg(270 + off));
    } else {
      const [rx, ry] = rotateVel(trig.vx, trig.vy, off);
      vx = idiv(rx * sp.speedPct, 100);
      vy = idiv(ry * sp.speedPct, 100);
    }
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
function downhill(t: Terrain, x: number, g: number, vx: Fx): number {
  const l = x - ROLL_PROBE >= 0 ? groundBelow(t, x - ROLL_PROBE, g - ROLL_PROBE) : g;
  const r = x + ROLL_PROBE < WORLD_W ? groundBelow(t, x + ROLL_PROBE, g - ROLL_PROBE) : g;
  if (r > l) return 1;
  if (l > r) return -1;
  return vx < 0 ? -1 : 1;
}

function roll(shot: Shot, trig: Trigger, r: Roll): void {
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
  }
  blastAt(shot, r.then, end.x, end.g, trig.step, trig.shell, dur);
}

function dig(shot: Shot, trig: Trigger, d: Dig): void {
  // Along the travel direction, but never steeper than DIG_MAX_PITCH below level: a steeper
  // heading (or none) takes exactly that pitch, keeping the horizontal sense of travel
  // (toward the opponent when there is none). Upward and shallower headings are kept.
  let a = toInt(trig.vx); // px/s, |a| < 2^15: every product here stays < 2^33
  let c = toInt(trig.vy); // px/s, + = down
  if (c > 0 ? c * cosDeg(DIG_MAX_PITCH) > (a < 0 ? 0 - a : a) * sinDeg(DIG_MAX_PITCH) : a === 0 && c === 0) {
    const sense = trig.vx > 0 ? 1 : trig.vx < 0 ? -1 : shot.shooter === 0 ? 1 : -1;
    a = sense * cosDeg(DIG_MAX_PITCH); // (a, c) becomes that pitch's Q16.16 unit vector: only its direction matters
    c = sinDeg(DIG_MAX_PITCH);
  }
  const len = isqrt(a * a + c * c); // >= 1: (a, c) is never (0, 0) here
  const x0 = trig.x;
  const y0 = trig.y;
  const dx = idiv(a * d.length, len);
  const dy = idiv(c * d.length, len);
  const n = Math.max(Math.abs(dx), Math.abs(dy), 1);
  let stop = n; // the last sample the tunnel reaches
  for (let i = 0; i <= n; i++) {
    const sx = x0 + idiv(dx * i, n);
    const sy = y0 + idiv(dy * i, n);
    // i = 0 is the trigger px, inside the world; the floor (WORLD_H) is bedrock
    if (i > 0 && (sx < 0 || sx >= WORLD_W || sy >= WORLD_H)) { stop = i - 1; break; }
    if (tankAt(shot, sx, sy) >= 0) { stop = i; break; }
  }
  const ex = x0 + idiv(dx * stop, n);
  const ey = y0 + idiv(dy * stop, n);
  const reached = idiv(stop * d.length, n); // px along the tunnel
  carveCapsule(shot.t, x0, y0, ex, ey, idiv(d.width, 2));
  const dur = showSteps(reached, SHOW_PX_PER_STEP.dig);
  emit(shot, { step: trig.step, kind: "dig", shell: trig.shell, x0, y0, x1: ex, y1: ey, width: d.width, dur });
  if (d.each && d.blastEvery && d.blastEvery > 0) {
    for (let k = 1; k * d.blastEvery < d.length; k++) {
      const i = idiv(k * d.blastEvery * n, d.length); // the sample k × blastEvery px along
      if (i >= stop) break;
      blastAt(shot, d.each, x0 + idiv(dx * i, n), y0 + idiv(dy * i, n), trig.step, trig.shell,
        showSteps(k * d.blastEvery, SHOW_PX_PER_STEP.dig));
    }
  }
  if (d.then) blastAt(shot, d.then, ex, ey, trig.step, trig.shell, dur);
}

function burn(shot: Shot, trig: Trigger, b: Burn): void {
  const x = floorPx(trig.fx);
  const g = groundBelow(shot.t, x, floorPx(trig.fy));
  const touched = [-1, -1]; // px along a run where each tank was first touched (-1 = never)
  const start = tankAt(shot, x, g - 1);
  if (start >= 0) touched[start] = 0;
  const half = idiv(b.pool, 2);
  const runs: number[] = []; // [dir, max px] pairs: the pool both ways, then the flow(s)
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
}

function build(shot: Shot, trig: Trigger, b: Build): void {
  const t = shot.t;
  const x = trig.x;
  const y = trig.y;
  if (b.shape === "ball") {
    const r = b.radius;
    for (let cx = Math.max(0, x - r); cx <= Math.min(WORLD_W - 1, x + r); cx++) {
      const h = isqrt(r * r - (cx - x) * (cx - x));
      addInterval(t, cx, y - h, y + h + 1);
    }
  } else if (b.shape === "wall") {
    const left = x - idiv(b.width, 2);
    for (let cx = Math.max(0, left); cx < Math.min(WORLD_W, left + b.width); cx++) {
      const top = surfaceTop(t, cx);
      addInterval(t, cx, top - b.height, top);
    }
  } else {
    for (let cx = Math.max(0, x - b.radius); cx <= Math.min(WORLD_W - 1, x + b.radius); cx++) {
      removeInterval(t, cx, 0, y);
      addInterval(t, cx, y, groundBelow(t, cx, y));
    }
  }
  emit(shot, { step: trig.step, kind: "build", shell: trig.shell, shape: b.shape, x, y,
    size: b.shape === "wall" ? b.height : b.radius, width: b.shape === "wall" ? b.width : 2 * b.radius + 1 });
}
```

- [ ] **Step 6: Append indices 23–25 to the roster** (design-verbatim):

In `src/game/titles/arcfire/weapons/roster.ts`, replace

```ts
];

/** Roster index by weapon id. */
```

with

```ts
  {
    id: "rampart", name: "Rampart", tag: "DIRT", tier: 1, power: 25,
    launch: { kind: "shell" },
    stage: { on: "impact", effects: [{ build: { shape: "wall", width: 36, height: 80 } }] },
  },
  {
    id: "bastion", name: "Bastion", tag: "DIRT", tier: 1, power: 25,
    launch: { kind: "shell" },
    stage: { on: "impact", effects: [{ build: { shape: "ball", radius: 48 } }] },
  },
  {
    id: "leveler", name: "Leveler", tag: "DIRT", tier: 1, power: 25,
    launch: { kind: "shell" },
    stage: { on: "impact", effects: [{ build: { shape: "level", radius: 80 } }] },
  },
];

/** Roster index by weapon id. */
```

- [ ] **Step 7: Run the suite: only the corpus may fail, on its new keys**

Run: `npx vitest run src/game/titles/arcfire`
Expected: FAIL, exactly 1 test: `corpus.test.ts`, whose case list has 393 fresh ids against 348 pinned.

- [ ] **Step 8: Append the new corpus keys**

Run: `UPDATE_ARCFIRE_CORPUS=add npx vitest run src/game/titles/arcfire/corpus.test.ts`
Expected: PASS (+45 keys).

Run: `node -e "const c=require('./src/game/titles/arcfire/corpus.golden.json');console.log(c.digest,Object.keys(c.cases).length)"`
Expected, exactly: `085791c6 393`

- [ ] **Step 9: Run the Arcfire gate, types and the full suite**

Run: `npx vitest run src/game/titles/arcfire src/game/sim/purity.test.ts`
Expected: PASS: 17 files, 165 tests. The corpus gates `rampart emits build:wall`, `bastion emits build:ball` and `leveler emits build:level` are live and pass.

Run: `npx tsc --noEmit`
Expected: exit 0.

Run: `npm test`
Expected: all pass.

- [ ] **Step 10: Run the cross-engine gate**

Run: `npm run test:e2e:cross-engine -- --grep-invert firefox`
Expected: exit 0, `2 passed`. Chromium and WebKit reproduce `5167b43d`, `389a1340` and `085791c6` (Firefox runs in CI). This is the first browser run of the builds and `addInterval`.

- [ ] **Step 11: Commit**

```bash
git add src/game/titles/arcfire/weapons/primitives.ts src/game/titles/arcfire/weapons/roster.ts src/game/titles/arcfire/weapons/primitives.test.ts src/game/titles/arcfire/weapons/validate.test.ts src/game/titles/arcfire/weapons/roster.test.ts src/game/titles/arcfire/corpus.golden.json
git commit -m "feat(arcfire): build (wall, ball, level; never buries a tank); Rampart, Bastion, Leveler (23-25)" -m "Corpus + 45 keys -> 085791c6 (393 cases); no existing key moved. Pins unchanged." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 11: Beams on the beam dial → Lancer, Prism (indices 26–27)

**Files:**
- Modify: `src/game/titles/arcfire/weapons/primitives.ts` (full replacement: + `beamDir`, `fireBeams`)
- Modify: `src/game/titles/arcfire/resolve.ts` (full replacement: the design's final file, with the beam branch)
- Modify: `src/game/titles/arcfire/weapons/roster.ts` (append indices 26–27)
- Modify (tests): `weapons/primitives.test.ts`, `weapons/validate.test.ts`, `weapons/roster.test.ts`
- Modify (fixture): `corpus.golden.json` (new keys only)

**Interfaces:**
- Consumes: Task 6's `carveCapsule`; Task 5's `BeamLaunch`, `fanOffset`; Task 4's any-angle `muzzle(cx, cy, angleDeg)` and `cosDeg`/`sinDeg`. `beamDir` returns −90..270 (−94..274 with Prism's spread), outside the shell range 0..180, which Plan 1's `muzzle` (clamped through `aimCos`/`aimSin`) could not take.
- Produces:
  - `beamDir(shooter: number, angle: number): number`, exported from `weapons/primitives.ts`. It is `angle − 90` for player 0 and `angle + 90` for player 1, in aim degrees (0 = right, 90 = up, 270 = down). Plan 3's HUD and 2B's AI call it.
  - `fireBeams(shot: Shot, launch: BeamLaunch, angle: number): void`, run by `resolveWeapon` before the loop, at step 1. A beam turn has `tl.steps === 1` and no shells.
  - The `beam { beam, x0, y0, x1, y1, width }` event, from the muzzle to the end, along `beamDir`.
  - `ROSTER_INDEX` gains `lancer` 26, `prism` 27.

**Rules** (owner decision **D1**; the design's §4.6):
- **Aim.** Beam `b` flies along `beamDir(shooter, aim + fanOffset(b))`: Prism's beams are −4, 0 and +4 on the dial. It is a straight line `length` px long (1,200 for both weapons) from that direction's muzzle, and it ignores power, gravity and wind.
- **Samples** form a DDA from the muzzle that stops at the side edges and the floor; there is no ceiling.
- **Hits.** A tank is hit when a sample lies within `TANK_HIT_R + width/2` of its hitbox centre; each tank takes damage at most once per beam. The beam carves a `width/2` capsule.
- **No self-hit, in any direction.** The muzzle is ≥ √433 ≈ 20.8 px from its own hitbox centre, and the reach is ≤ 20, because the validator caps the width at 12.

- [ ] **Step 1: Write the failing primitive tests** (an import line, then the block). They cover the dial and its mirror identity, level at 90 with power ignored, aiming down from a plateau (angles 67–71 exactly), a mirror-exact board, straight down to the floor, Prism's spread, and no self-hit at any angle for either shooter.

In `src/game/titles/arcfire/weapons/primitives.test.ts`, insert directly after

```ts
import { ROSTER, ROSTER_INDEX } from "./roster";
```

these lines:

```ts
import { beamDir } from "./primitives";
```

Append to the end of `src/game/titles/arcfire/weapons/primitives.test.ts` (after one blank line):

```ts
describe("beam", () => {
  it("reads the command angle on the beam dial: 90 is level at the opponent, and the mirror is 180 - angle", () => {
    expect([0, 90, 180].map((a) => beamDir(0, a))).toEqual([-90, 0, 90]);
    expect([0, 90, 180].map((a) => beamDir(1, a))).toEqual([90, 180, 270]);
    for (let a = 0; a <= 180; a++) expect((((beamDir(1, 180 - a) + beamDir(0, a)) % 360) + 360) % 360).toBe(180);
  });
  it("Lancer at 90 runs level at the opponent through a mound, whatever the power", () => {
    const mound = (): MatchState => setHeights(flatBattle(300, 900), (x) => (x >= 550 && x < 650 ? 340 : 400));
    const a = mound();
    const b = mound();
    const ta = fire(a, "lancer", 90, 0);
    const tb = fire(b, "lancer", 90, 100);
    expect([ta.points, tb.points]).toEqual([[60, 0], [60, 0]]);
    expect(Array.from(b.terrain.height)).toEqual(Array.from(a.terrain.height));
    expect(a.terrain.height[600]).toBe(349); // the mound (340) is cut through
    expect(eventsOf(ta, "beam")).toEqual([{ step: 1, kind: "beam", beam: 0, x0: 322, y0: 388, x1: 1199, y1: 388, width: 8 }]);
    expect([ta.shells.length, ta.steps]).toEqual([0, 1]);
  });
  /** Player 0 on a plateau at 250 (columns 0..399), the enemy below on flat ground at 400: tanks 300 / 700. */
  const plateau = (): MatchState => setHeights(flatBattle(300, 700), (x) => (x < 400 ? 250 : 400));
  it("aims below level: from a plateau Lancer hits the enemy at exactly the command angles 67..71", () => {
    const hits: number[] = [];
    for (let a = 0; a <= 180; a++) if (fire(plateau(), "lancer", a, 50).points[0] > 0) hits.push(a);
    expect(hits).toEqual([67, 68, 69, 70, 71]); // 19°..23° below level
  });
  it("is mirror-exact: the mirrored board at 180 - angle gives the swapped points and the mirrored terrain", () => {
    for (const [id, a] of [["lancer", 69], ["lancer", 150], ["prism", 69], ["prism", 20]] as [string, number][]) {
      const m = plateau();
      const tl = fire(m, id, a, 50);
      const w = setHeights(flatBattle(499, 899), (x) => (x >= 800 ? 250 : 400)); // x -> 1199 - x
      w.shooter = 1;
      const tw = fire(w, id, 180 - a, 50);
      expect(tw.points, `${id} ${a}`).toEqual([tl.points[1], tl.points[0]]);
      expect(Array.from(w.terrain.height), `${id} ${a}`).toEqual(Array.from(m.terrain.height).reverse());
    }
  });
  it("fired straight down it cuts to the floor and scores nothing", () => {
    const m = flatBattle();
    const tl = fire(m, "lancer", 0, 50);
    expect(eventsOf(tl, "beam").map((b) => [b.x0, b.y0, b.x1, b.y1])).toEqual([[300, 410, 300, 499]]);
    expect(tl.points).toEqual([0, 0]);
    expect(m.terrain.height[300]).toBe(494);
  });
  it("Prism fans 3 beams 4° apart on the dial; at 90 only the level one hits", () => {
    const tl = fire(flatBattle(300, 800), "prism", 90, 50);
    const beams = eventsOf(tl, "beam");
    expect(beams.map((b) => b.beam)).toEqual([0, 1, 2]);
    expect([beams[0].x0, beams[0].y0, beams[0].x1, beams[0].y1]).toEqual([321, 389, 1199, 449]); // 4° below level
    expect(tl.points).toEqual([35, 0]);
  });
  it("never hits its own tank, at any command angle, for either shooter", () => {
    for (const id of ["lancer", "prism"]) {
      for (const shooter of [0, 1]) {
        for (let a = 0; a <= 180; a++) {
          const m = flatBattle(100, 1100);
          m.shooter = shooter;
          expect(fire(m, id, a, 50).points[1 - shooter], `${id} p${shooter} ${a}`).toBe(0);
        }
      }
    }
  });
});
```

- [ ] **Step 2: Stage the beam totality case**

Append to the end of `src/game/titles/arcfire/weapons/validate.test.ts` (after one blank line):

```ts
describe("totality: beam", () => {
  it("an all-zero beam launch, with no beams and with one", () => {
    expectTotal(weapon({ launch: { kind: "beam", count: 0, spreadDeg: 0, length: 0, width: 0, damage: 0 }, stage: undefined }));
    expectTotal(weapon({ launch: { kind: "beam", count: 1, spreadDeg: 0, length: 0, width: 0, damage: 0 }, stage: undefined }));
  });
});
```

- [ ] **Step 3: Append this task's ids to `WIRE`**

In `src/game/titles/arcfire/weapons/roster.test.ts`, replace

```ts
const WIRE = [
  "pulse", "pulse2", "nova", "needle", "crater", "triad", "fan", "railshot",
  "twinnova", "cascade", "hydra", "hailstorm", "shrapnel", "barrage", "skipper", "pinball",
  "ricochet", "tumbler", "juggernaut", "burrow", "auger", "inferno", "wildfire", "rampart",
  "bastion", "leveler",
];
```

with

```ts
const WIRE = [
  "pulse", "pulse2", "nova", "needle", "crater", "triad", "fan", "railshot",
  "twinnova", "cascade", "hydra", "hailstorm", "shrapnel", "barrage", "skipper", "pinball",
  "ricochet", "tumbler", "juggernaut", "burrow", "auger", "inferno", "wildfire", "rampart",
  "bastion", "leveler", "lancer", "prism",
];
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `npx vitest run src/game/titles/arcfire`
Expected: FAIL, exactly 8 tests:
- `primitives.test.ts > beam > reads the command angle on the beam dial …`: `TypeError: beamDir is not a function`
- the other 6 `beam` tests: `TypeError: Cannot read properties of undefined (reading 'launch')`
- `roster.test.ts > pins the wire order so far …`: `expected [ 'pulse', 'pulse2', 'nova', …(23) ] to deeply equal [ 'pulse', 'pulse2', 'nova', …(25) ]`

The beam totality block already passes: until this task a beam launch fires nothing.

- [ ] **Step 5: Replace** `src/game/titles/arcfire/weapons/primitives.ts`. Compared with Task 10 it adds, from the design's final file verbatim: `beamDir`, `fireBeams`, and the `muzzle` and `BeamLaunch` imports.

```ts
// src/game/titles/arcfire/weapons/primitives.ts
//
// The effect implementations (spec §4.1): the only weapon code outside the
// shell flight in ballistics.ts. Every effect is applied INSTANTLY at its
// trigger step, in closed form or one bounded pass over the terrain; only
// shells and delays take simulated time. Integer px / Q16.16 throughout; no
// weapon draws from the match RNG. The order effects run in is part of the
// determinism contract (see resolve.ts).
import type { Fx } from "@/game/sim/types";
import { fromInt, toInt, mul } from "@/game/sim/math/fixed";
import { cosDeg, sinDeg } from "../aimTable";
import { idiv, isqrt, floorPx } from "../imath";
import {
  isSolid, carveCircle, carveCapsule, removeInterval, addInterval, groundBelow, surfaceTop, type Terrain,
} from "../terrain";
import { muzzle, rotateVel, shellAt, type HitCircle, type Shell } from "../ballistics";
import { blastDamage } from "../damage";
import { WORLD_W, WORLD_H, TANK_HIT_R, ROLL_PROBE, MAX_SHELLS, DIG_MAX_PITCH } from "../constants";
import { SHOW_PX_PER_STEP, showSteps, type Timeline, type TimelineEvent } from "../timeline";
import type { Blast, BeamLaunch, Build, Burn, Dig, Effect, Roll, Split, Stage } from "./types";

/** Everything one shot's effects can touch. Built by resolveWeapon; lives for one turn. */
export interface Shot {
  t: Terrain;
  tanks: readonly HitCircle[]; // hitboxes, fixed for the whole shot (tanks ride the settle afterwards)
  shooter: number;
  shells: Shell[]; // every shell of the turn, by creation order (= Timeline.shells index)
  stages: Stage[]; // stages[i] = what shells[i] does on its trigger
  live: number; // shells still alive
  pending: Pending[]; // armed delays, in arming order
  received: number[]; // damage each tank took this turn
  rec: boolean; // build the Timeline's paths and events (false: the quiet AI path)
  tl: Timeline;
}

/** Where and how a stage fired. */
export interface Trigger {
  step: number;
  shell: number; // index of the shell that triggered
  x: number; // the trigger px: first solid (or tank) px on impact; the shell's px at the apex
  y: number;
  fx: Fx; // the last free position: children spawn here; roll and burn drop from here
  fy: Fx;
  vx: Fx; // velocity at the trigger: dig direction, the roll/burn tie-break, "ahead"/"cone" splits
  vy: Fx;
  speed: Fx; // the shell's nominal speed: the base of "up"/"cone" splits
  gravityStep: Fx; // inherited by children
  tank: number; // the tank struck, or -1
}

export interface Pending {
  at: number; // the step it fires on
  trig: Trigger;
  effects: readonly Effect[];
}

export function emit(shot: Shot, ev: TimelineEvent): void {
  if (shot.rec) shot.tl.events.push(ev);
}

/** Apply a list of effects at a trigger, completely and in array order (a delay only arms its list). */
export function applyEffects(shot: Shot, trig: Trigger, effects: readonly Effect[]): void {
  for (const e of effects) {
    if ("blast" in e) blastAt(shot, e.blast, trig.x, trig.y, trig.step, trig.shell, 0);
    else if ("split" in e) split(shot, trig, e.split);
    else if ("roll" in e) roll(shot, trig, e.roll);
    else if ("dig" in e) dig(shot, trig, e.dig);
    else if ("burn" in e) burn(shot, trig, e.burn);
    else if ("build" in e) build(shot, trig, e.build);
    else if ("delay" in e) {
      const at = trig.step + (e.delay.steps > 1 ? e.delay.steps : 1);
      shot.pending.push({ at, trig, effects: e.delay.then });
      emit(shot, { step: trig.step, kind: "fuse", shell: trig.shell, x: trig.x, y: trig.y, at });
    }
  }
}

/** Damage to tank p: it scores for whoever didn't take it (resolve.ts). */
function hurt(shot: Shot, p: number, amount: number, step: number, lag: number): void {
  if (amount <= 0) return;
  shot.received[p] += amount;
  emit(shot, { step, kind: "damage", target: p, amount, lag });
}

/** Plan 1's blast: carve a disc, then damage both tanks by distance (tank order 0, 1). */
export function blastAt(shot: Shot, b: Blast, x: number, y: number, step: number, shell: number, lag: number): void {
  carveCircle(shot.t, x, y, b.radius);
  emit(shot, { step, kind: "blast", shell, x, y, radius: b.radius, lag });
  for (let p = 0; p < 2; p++) hurt(shot, p, blastDamage(b, x, y, shot.tanks[p].x, shot.tanks[p].y), step, lag);
}

/** Bitmask of the tanks whose hitbox contains px (x, y). */
function tankMask(shot: Shot, x: number, y: number): number {
  let m = 0;
  for (let k = 0; k < 2; k++) {
    const dx = x - shot.tanks[k].x;
    const dy = y - shot.tanks[k].y;
    if (dx * dx + dy * dy <= TANK_HIT_R * TANK_HIT_R) m |= 1 << k;
  }
  return m;
}

/** The first tank whose hitbox contains (x, y), or -1. */
function tankAt(shot: Shot, x: number, y: number): number {
  const m = tankMask(shot, x, y);
  return m === 0 ? -1 : (m & 1) !== 0 ? 0 : 1;
}

/** Add a shell to the turn and arm its stage's flight modifiers. Returns its index, or -1 past MAX_SHELLS (dropped). */
export function addShell(shot: Shot, s: Shell, stage: Stage, angle: number, parent: number, step: number): number {
  if (shot.shells.length >= MAX_SHELLS) return -1;
  s.stopAtApex = stage.on === "apex";
  if (stage.homing) {
    const target = shot.tanks[1 - shot.shooter];
    s.homeDeg = stage.homing.degPerStep;
    s.homeX = target.x;
    s.homeY = target.y;
  }
  if (stage.bounce) {
    if (stage.bounce.walls) s.wallBounces = stage.bounce.times;
    else s.bounces = stage.bounce.times;
    s.restitutionPct = stage.bounce.restitutionPct;
  }
  s.ignore = tankMask(shot, floorPx(s.x), floorPx(s.y)); // only a line split can spawn inside a hitbox
  shot.shells.push(s);
  shot.stages.push(stage);
  shot.live++;
  if (shot.rec) shot.tl.shells.push({ angle, parent, start: step, points: [floorPx(s.x), floorPx(s.y)] });
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
    let vx: Fx;
    let vy: Fx;
    if (sp.from === "up") {
      vx = mul(speed, cosDeg(90 + off));
      vy = 0 - mul(speed, sinDeg(90 + off));
    } else if (sp.from === "cone") {
      vx = trig.vx + mul(speed, cosDeg(270 + off));
      vy = trig.vy - mul(speed, sinDeg(270 + off));
    } else {
      const [rx, ry] = rotateVel(trig.vx, trig.vy, off);
      vx = idiv(rx * sp.speedPct, 100);
      vy = idiv(ry * sp.speedPct, 100);
    }
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
function downhill(t: Terrain, x: number, g: number, vx: Fx): number {
  const l = x - ROLL_PROBE >= 0 ? groundBelow(t, x - ROLL_PROBE, g - ROLL_PROBE) : g;
  const r = x + ROLL_PROBE < WORLD_W ? groundBelow(t, x + ROLL_PROBE, g - ROLL_PROBE) : g;
  if (r > l) return 1;
  if (l > r) return -1;
  return vx < 0 ? -1 : 1;
}

function roll(shot: Shot, trig: Trigger, r: Roll): void {
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
  }
  blastAt(shot, r.then, end.x, end.g, trig.step, trig.shell, dur);
}

function dig(shot: Shot, trig: Trigger, d: Dig): void {
  // Along the travel direction, but never steeper than DIG_MAX_PITCH below level: a steeper
  // heading (or none) takes exactly that pitch, keeping the horizontal sense of travel
  // (toward the opponent when there is none). Upward and shallower headings are kept.
  let a = toInt(trig.vx); // px/s, |a| < 2^15: every product here stays < 2^33
  let c = toInt(trig.vy); // px/s, + = down
  if (c > 0 ? c * cosDeg(DIG_MAX_PITCH) > (a < 0 ? 0 - a : a) * sinDeg(DIG_MAX_PITCH) : a === 0 && c === 0) {
    const sense = trig.vx > 0 ? 1 : trig.vx < 0 ? -1 : shot.shooter === 0 ? 1 : -1;
    a = sense * cosDeg(DIG_MAX_PITCH); // (a, c) becomes that pitch's Q16.16 unit vector: only its direction matters
    c = sinDeg(DIG_MAX_PITCH);
  }
  const len = isqrt(a * a + c * c); // >= 1: (a, c) is never (0, 0) here
  const x0 = trig.x;
  const y0 = trig.y;
  const dx = idiv(a * d.length, len);
  const dy = idiv(c * d.length, len);
  const n = Math.max(Math.abs(dx), Math.abs(dy), 1);
  let stop = n; // the last sample the tunnel reaches
  for (let i = 0; i <= n; i++) {
    const sx = x0 + idiv(dx * i, n);
    const sy = y0 + idiv(dy * i, n);
    // i = 0 is the trigger px, inside the world; the floor (WORLD_H) is bedrock
    if (i > 0 && (sx < 0 || sx >= WORLD_W || sy >= WORLD_H)) { stop = i - 1; break; }
    if (tankAt(shot, sx, sy) >= 0) { stop = i; break; }
  }
  const ex = x0 + idiv(dx * stop, n);
  const ey = y0 + idiv(dy * stop, n);
  const reached = idiv(stop * d.length, n); // px along the tunnel
  carveCapsule(shot.t, x0, y0, ex, ey, idiv(d.width, 2));
  const dur = showSteps(reached, SHOW_PX_PER_STEP.dig);
  emit(shot, { step: trig.step, kind: "dig", shell: trig.shell, x0, y0, x1: ex, y1: ey, width: d.width, dur });
  if (d.each && d.blastEvery && d.blastEvery > 0) {
    for (let k = 1; k * d.blastEvery < d.length; k++) {
      const i = idiv(k * d.blastEvery * n, d.length); // the sample k × blastEvery px along
      if (i >= stop) break;
      blastAt(shot, d.each, x0 + idiv(dx * i, n), y0 + idiv(dy * i, n), trig.step, trig.shell,
        showSteps(k * d.blastEvery, SHOW_PX_PER_STEP.dig));
    }
  }
  if (d.then) blastAt(shot, d.then, ex, ey, trig.step, trig.shell, dur);
}

function burn(shot: Shot, trig: Trigger, b: Burn): void {
  const x = floorPx(trig.fx);
  const g = groundBelow(shot.t, x, floorPx(trig.fy));
  const touched = [-1, -1]; // px along a run where each tank was first touched (-1 = never)
  const start = tankAt(shot, x, g - 1);
  if (start >= 0) touched[start] = 0;
  const half = idiv(b.pool, 2);
  const runs: number[] = []; // [dir, max px] pairs: the pool both ways, then the flow(s)
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
}

function build(shot: Shot, trig: Trigger, b: Build): void {
  const t = shot.t;
  const x = trig.x;
  const y = trig.y;
  if (b.shape === "ball") {
    const r = b.radius;
    for (let cx = Math.max(0, x - r); cx <= Math.min(WORLD_W - 1, x + r); cx++) {
      const h = isqrt(r * r - (cx - x) * (cx - x));
      addInterval(t, cx, y - h, y + h + 1);
    }
  } else if (b.shape === "wall") {
    const left = x - idiv(b.width, 2);
    for (let cx = Math.max(0, left); cx < Math.min(WORLD_W, left + b.width); cx++) {
      const top = surfaceTop(t, cx);
      addInterval(t, cx, top - b.height, top);
    }
  } else {
    for (let cx = Math.max(0, x - b.radius); cx <= Math.min(WORLD_W - 1, x + b.radius); cx++) {
      removeInterval(t, cx, 0, y);
      addInterval(t, cx, y, groundBelow(t, cx, y));
    }
  }
  emit(shot, { step: trig.step, kind: "build", shell: trig.shell, shape: b.shape, x, y,
    size: b.shape === "wall" ? b.height : b.radius, width: b.shape === "wall" ? b.width : 2 * b.radius + 1 });
}

/**
 * The direction (aim sense: 0 = right, 90 = up, 270 = down) of a beam fired
 * at command angle `angle` by `shooter`. A beam reads the angle on the shell
 * dial turned a quarter turn toward the shooter's facing (player 0 faces
 * right and player 1 left; tanks never cross): clockwise for player 0,
 * anticlockwise for player 1. So 90 is level at the opponent's side, the
 * shooter's usual half of the dial (0..90 for player 0, 90..180 for player 1)
 * runs from straight down to level, the other half from level to straight up,
 * and the mirror of a beam command is 180 - angle, as for a shell. The wire
 * angle stays an integer in 0..180; the HUD and the AI call this function.
 */
export const beamDir = (shooter: number, angle: number): number => (shooter === 0 ? angle - 90 : angle + 90);

/** Fire a beam launch at command angle `angle` (step 1): straight lines that carve and pass through terrain and tanks. */
export function fireBeams(shot: Shot, launch: BeamLaunch, angle: number): void {
  const count = launch.count ?? 1;
  const reach = TANK_HIT_R + idiv(launch.width, 2);
  const from = shot.tanks[shot.shooter];
  for (let b = 0; b < count; b++) {
    const a = beamDir(shot.shooter, angle + fanOffset(b, count, launch.spreadDeg ?? 0));
    const mz = muzzle(from.x, from.y, a);
    const dx = toInt(mul(fromInt(launch.length), cosDeg(a)));
    const dy = 0 - toInt(mul(fromInt(launch.length), sinDeg(a)));
    const n = Math.max(Math.abs(dx), Math.abs(dy), 1);
    let hit = 0; // tank bitmask
    let last = 0;
    for (let i = 0; i <= n; i++) {
      const sx = mz.x + idiv(dx * i, n);
      const sy = mz.y + idiv(dy * i, n);
      if (sx < 0 || sx >= WORLD_W || sy >= WORLD_H) break; // the side edges; the floor is bedrock
      last = i;
      for (let p = 0; p < 2; p++) {
        const ex = sx - shot.tanks[p].x;
        const ey = sy - shot.tanks[p].y;
        if (ex * ex + ey * ey <= reach * reach) hit |= 1 << p;
      }
    }
    const x1 = mz.x + idiv(dx * last, n);
    const y1 = mz.y + idiv(dy * last, n);
    carveCapsule(shot.t, mz.x, mz.y, x1, y1, idiv(launch.width, 2));
    emit(shot, { step: 1, kind: "beam", beam: b, x0: mz.x, y0: mz.y, x1, y1, width: launch.width });
    for (let p = 0; p < 2; p++) if ((hit >> p) & 1) hurt(shot, p, launch.damage, 1, 0);
  }
}
```

- [ ] **Step 6: Replace** `src/game/titles/arcfire/resolve.ts` with the design's final file (design-verbatim). It adds `fireBeams` at launch, which sets `tl.steps = 1`, and the beam-dial notes in the header and on `TurnInput.angle`.

```ts
// src/game/titles/arcfire/resolve.ts
//
// resolveTurn (spec §1.3): one whole turn — the optional move, then the shot —
// resolved to completion. It MUTATES the MatchState it's given; callers that
// need the original (AI search, previews) resolve a cloneMatch() copy. The
// caller (match.ts applyTurn) validates the command first.
//
// The step loop and its ORDER are part of the determinism contract:
//   step s = 1, 2, ...:
//     1. delays due at s fire, in the order they were armed;
//     2. every shell that existed at the start of the step and is alive moves
//        once (stepShell), in creation order; a shell that triggers applies
//        its effects at once, in list order (so a later shell this step sees
//        their terrain); children it spawns are appended and first move at s + 1;
//   until no shell is alive and no delay is armed (or MAX_TURN_STEPS). Then
//   settle once, then score. Beams resolve before the loop, at step 1.
import { fromInt } from "@/game/sim/math/fixed";
import { ROSTER } from "./weapons/roster";
import { launchShell, muzzle, stepShell } from "./ballistics";
import { settle, spansFromHeight } from "./terrain";
import { hitCircles, moveTarget } from "./tanks";
import { idiv, floorPx } from "./imath";
import { STEPS_PER_SEC, MAX_TURN_STEPS } from "./constants";
import { addShell, applyEffects, blastAt, emit, fanOffset, fireBeams, type Shot } from "./weapons/primitives";
import type { MatchState } from "./state";
import type { Timeline } from "./timeline";
import type { WeaponDef } from "./weapons/types";

export interface TurnInput {
  move: -1 | 0 | 1;
  weapon: number; // roster index
  angle: number; // integer degrees 0..180 (a beam reads it on the beam dial: weapons/primitives.ts beamDir)
  power: number; // integer 0..100
}

export function resolveTurn(m: MatchState, input: TurnInput): Timeline {
  return resolveWeapon(m, ROSTER[input.weapon], input, true);
}

/** resolveTurn without building the Timeline's paths or events: the same state and points, faster (AI search, verification). */
export function resolveTurnPoints(m: MatchState, input: TurnInput): [number, number] {
  return resolveWeapon(m, ROSTER[input.weapon], input, false).points;
}

/**
 * resolveTurn with the weapon passed in: the seam unit tests use to fire
 * synthetic WeaponDefs (and 2B's probe shell). `input.weapon` is only
 * recorded. `record = false` leaves `shells`, `events` and `settle.falls` empty.
 */
export function resolveWeapon(m: MatchState, def: WeaponDef, input: TurnInput, record = true): Timeline {
  const shooter = m.shooter;
  const tl: Timeline = {
    shooter,
    move: null,
    wind: m.wind,
    weapon: input.weapon,
    steps: 0,
    shells: [],
    events: [],
    settle: { heights: m.terrain.height, falls: [] }, // replaced by the settle below
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

  // 2. Launch: beams resolve at once (step 1); shells fan out from the muzzle.
  spansFromHeight(m.terrain);
  const shot: Shot = {
    t: m.terrain, tanks: hitCircles(m), shooter, shells: [], stages: [], live: 0, pending: [], received: [0, 0],
    rec: record, tl,
  };
  const launch = def.launch;
  if (launch.kind === "beam") {
    fireBeams(shot, launch, input.angle);
    tl.steps = 1;
  } else if (def.stage) {
    const count = launch.count ?? 1;
    for (let i = 0; i < count; i++) {
      const angle = input.angle + fanOffset(i, count, launch.spreadDeg ?? 0); // never clamped: may leave 0..180 near the horizon
      const mz = muzzle(shot.tanks[shooter].x, shot.tanks[shooter].y, angle);
      const s = launchShell(mz.x, mz.y, angle, input.power, launch.speedPct ?? 100, launch.gravityPct ?? 100);
      addShell(shot, s, def.stage, angle, -1, 0);
    }
  }

  // 3. The step loop.
  const windStep = idiv(fromInt(m.wind), STEPS_PER_SEC);
  for (let step = 1; shot.live > 0 || shot.pending.length > 0; step++) {
    if (step > MAX_TURN_STEPS) {
      abandon(shot, MAX_TURN_STEPS);
      break;
    }
    tl.steps = step;
    const n = shot.shells.length; // shells spawned during this step first move at step + 1
    for (let j = 0; j < shot.pending.length; ) {
      const p = shot.pending[j];
      if (p.at !== step) {
        j++;
        continue;
      }
      shot.pending.splice(j, 1);
      applyEffects(shot, { ...p.trig, step }, p.effects);
    }
    for (let i = 0; i < n; i++) {
      const s = shot.shells[i];
      if (!s.alive) continue;
      const hit = stepShell(s, shot.t, shot.tanks, windStep);
      const path = record ? tl.shells[i].points : null;
      if (hit === null) {
        if (path) path.push(floorPx(s.x), floorPx(s.y));
        continue;
      }
      if (!s.alive) shot.live--;
      if (hit.kind === "bounce") {
        if (path) path.push(floorPx(s.x), floorPx(s.y));
        emit(shot, { step, kind: "bounce", shell: i, x: hit.x, y: hit.y, wall: hit.wall });
        const each = shot.stages[i].bounce?.blastEach;
        if (each) blastAt(shot, each, hit.x, hit.y, step, i, 0);
        continue;
      }
      if (hit.kind === "out") {
        if (path) path.push(hit.x, hit.y);
        emit(shot, { step, kind: "out", shell: i, x: hit.x, y: hit.y, lag: 0 });
        continue;
      }
      if (hit.kind !== "apex" && path) path.push(hit.x, hit.y);
      const stage = shot.stages[i];
      let effects = stage.effects;
      if (hit.kind !== "apex" && stage.on === "apex") { // an apex weapon that hit something before its apex
        if (!stage.early) {
          emit(shot, { step, kind: "dud", shell: i, x: hit.x, y: hit.y });
          continue;
        }
        effects = stage.early;
      }
      applyEffects(shot, {
        step, shell: i, x: hit.x, y: hit.y, fx: hit.fx, fy: hit.fy, vx: s.vx, vy: s.vy,
        speed: s.speed, gravityStep: s.gravityStep, tank: hit.kind === "tank" ? hit.tank : -1,
      }, effects);
    }
  }

  // 4. Dirt settles once, after the whole shot.
  tl.settle = settle(m.terrain, record);

  // 5. Damage to the opponent scores for the shooter; self-damage scores for the opponent.
  const opp = 1 - shooter;
  tl.points[shooter] += shot.received[opp];
  tl.points[opp] += shot.received[shooter];
  m.scores[0] += tl.points[0];
  m.scores[1] += tl.points[1];
  return tl;
}

/** The turn backstop: everything still flying is lost at `step` and armed delays are dropped (their `fuse` events keep an `at` beyond tl.steps: playback's cue). */
function abandon(shot: Shot, step: number): void {
  for (let i = 0; i < shot.shells.length; i++) {
    const s = shot.shells[i];
    if (!s.alive) continue;
    s.alive = false;
    emit(shot, { step, kind: "out", shell: i, x: floorPx(s.x), y: floorPx(s.y), lag: 0 });
  }
  shot.live = 0;
  shot.pending.length = 0;
}
```

- [ ] **Step 7: Append indices 26–27 to the roster** (design-verbatim; both beams are 1,200 px):

In `src/game/titles/arcfire/weapons/roster.ts`, replace

```ts
];

/** Roster index by weapon id. */
```

with

```ts
  {
    id: "lancer", name: "Lancer", tag: "BEAM", tier: 2, power: 55,
    launch: { kind: "beam", length: 1200, width: 8, damage: 60 },
  },
  {
    id: "prism", name: "Prism", tag: "BEAM", tier: 3, power: 80,
    launch: { kind: "beam", count: 3, spreadDeg: 8, length: 1200, width: 6, damage: 35 },
  },
];

/** Roster index by weapon id. */
```

- [ ] **Step 8: Run the suite: only the corpus may fail, on its new keys**

Run: `npx vitest run src/game/titles/arcfire`
Expected: FAIL, exactly 1 test: `corpus.test.ts`, whose case list has 423 fresh ids against 393 pinned.

- [ ] **Step 9: Append the new corpus keys and check the beam pins**

Run: `UPDATE_ARCFIRE_CORPUS=add npx vitest run src/game/titles/arcfire/corpus.test.ts`
Expected: PASS (+30 keys). The corpus gates `lancer emits beam` and `a beam scored` switch on here. They are met on the hills by Lancer fired level (90/0 and 90/100).

Run: `node -e "const c=require('./src/game/titles/arcfire/corpus.golden.json');console.log(c.digest,Object.keys(c.cases).length,c.defs.lancer,c.defs.prism,JSON.stringify(c.cases['lancer|hills|p0|w0|m0|90/0'].points))"`
Expected, exactly: `cc40894a 423 26421a9a 540c4e8a [60,0]`

- [ ] **Step 10: Run the Arcfire gate, types and the full suite**

Run: `npx vitest run src/game/titles/arcfire src/game/sim/purity.test.ts`
Expected: PASS: 17 files, 173 tests.

Run: `npx tsc --noEmit`
Expected: exit 0.

Run: `npm test`
Expected: all pass.

- [ ] **Step 11: Run the cross-engine gate**

Run: `npm run test:e2e:cross-engine -- --grep-invert firefox`
Expected: exit 0, `2 passed`. Chromium and WebKit reproduce `5167b43d`, `389a1340` and `cc40894a` (Firefox runs in CI). This is the first browser run of the beams on the beam dial.

- [ ] **Step 12: Commit**

```bash
git add src/game/titles/arcfire/weapons/primitives.ts src/game/titles/arcfire/resolve.ts src/game/titles/arcfire/weapons/roster.ts src/game/titles/arcfire/weapons/primitives.test.ts src/game/titles/arcfire/weapons/validate.test.ts src/game/titles/arcfire/weapons/roster.test.ts src/game/titles/arcfire/corpus.golden.json
git commit -m "feat(arcfire): beams on the beam dial (beamDir, owner D1; 1200 px); Lancer, Prism (26-27)" -m "Corpus + 30 keys -> cc40894a (423 cases); definition digests lancer 26421a9a, prism 540c4e8a; no existing key moved. Pins unchanged." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 12: Homing → Seeker, Swarm (indices 28–29)

**Files:**
- Modify: `src/game/titles/arcfire/ballistics.ts` (full replacement: the design's final file, with `steer`)
- Modify: `src/game/titles/arcfire/weapons/roster.ts` (append indices 28–29)
- Modify (tests): `ballistics.test.ts`, `weapons/primitives.test.ts`, `weapons/roster.test.ts`
- Modify (fixture): `corpus.golden.json` (new keys only)

**Interfaces:**
- Consumes: Task 7's `rotateVel` and the apex latch; Task 5's `Shell.homeDeg` / `homeX` / `homeY`, armed by `addShell` from `Stage.homing` with the enemy's hitbox centre at shot start.
- Produces: `stepShell` turns an apexed homing shell by `k = min(homeDeg, ⌊angle to target⌋)` whole degrees before the sweep, so it never overshoots and never wobbles. `ROSTER_INDEX` gains `seeker` 28, `swarm` 29.

**Rules** (owner decision **D2**; the design's D8, §4.4):
- Homing starts on the apex step; a shell that never rises never steers.
- `⌊angle⌋` is found with no arctangent: while `|cross|·cos k < dot·sin k`, decrement `k`, comparing against the baked table.
- Products are formed in 1/256-px/s units and stay below 2^52 for validator-legal data.
- Dead astern, the turn is anticlockwise. Gravity keeps acting, so a homing shell arcs in.
- There is no lock radius and no turn budget.

- [ ] **Step 1: Write the failing homing property test.** Host trig is fine in a test file.

In `src/game/titles/arcfire/ballistics.test.ts`, replace

```ts
import { launchShell, stepShell, muzzle, shellAt, rotateVel, type HitCircle, type Impact, type Shell } from "./ballistics";
```

with

```ts
import { launchShell, launchAt, stepShell, muzzle, shellAt, rotateVel, type HitCircle, type Impact, type Shell } from "./ballistics";
import { makeRng, nextRange } from "@/game/sim/math/rng";
```

Append to the end of `src/game/titles/arcfire/ballistics.test.ts` (after one blank line):

```ts
describe("homing", () => {
  it("turns at most N whole degrees per step toward the target, and never past it (2,000 seeded cases)", () => {
    const rng = makeRng(2026);
    const world = flat(WORLD_H);
    const heading = (vx: number, vy: number): number => Math.atan2(-vy, vx); // aim sense: y is down
    const wrap = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));
    const DEG = Math.PI / 180;
    let checked = 0;
    let turned = 0;
    for (let k = 0; k < 2000; k++) {
      const s = launchAt(200 + nextRange(rng, 800), 100 + nextRange(rng, 300), nextRange(rng, 360), fromInt(60 + nextRange(rng, 1200)), 0);
      s.apexed = true;
      s.homeDeg = 1 + nextRange(rng, 3);
      s.homeX = 100 + nextRange(rng, 1000);
      s.homeY = 50 + nextRange(rng, 400);
      const dx = s.homeX - floorPx(s.x);
      const dy = s.homeY - floorPx(s.y);
      if (dx === 0 && dy === 0) continue;
      const target = Math.atan2(-dy, dx); // seen from where the shell steers (before it moves)
      const h0 = heading(s.vx, s.vy);
      const before = wrap(target - h0);
      if (Math.abs(before) > Math.PI - 1e-9) continue; // dead astern: either way is a legal turn
      stepShell(s, world, [], 0);
      const h1 = heading(s.vx, s.vy);
      const turn = Math.abs(wrap(h1 - h0));
      expect(turn).toBeLessThanOrEqual(s.homeDeg * DEG + 0.001 * DEG);
      if (turn > 0.5 * DEG) turned++;
      const after = wrap(target - h1);
      expect(Math.sign(after) === Math.sign(before) || Math.abs(after) < 0.001 * DEG).toBe(true);
      checked++;
    }
    expect(checked).toBeGreaterThan(1900);
    expect(turned).toBeGreaterThan(1800); // it does steer: only targets within 1° of the heading take no turn
  });
});
```

- [ ] **Step 2: Write the failing primitive tests**

Append to the end of `src/game/titles/arcfire/weapons/primitives.test.ts` (after one blank line):

```ts
describe("homing", () => {
  it("Seeker steers onto the enemy where Pulse, at the same aim, misses", () => {
    expect(fire(flatBattle(), "pulse", 45, 45).points).toEqual([0, 0]);
    expect(fire(flatBattle(), "seeker", 45, 45).points).toEqual([50, 0]);
  });
  it("Seeker fired level never apexes, so it flies exactly Pulse's path", () => {
    const seeker = fire(flatBattle(), "seeker", 0, 60);
    const pulse = fire(flatBattle(), "pulse", 0, 60);
    expect(seeker.shells[0].points).toEqual(pulse.shells[0].points);
  });
});
```

- [ ] **Step 3: Append this task's ids to `WIRE`**

In `src/game/titles/arcfire/weapons/roster.test.ts`, replace

```ts
const WIRE = [
  "pulse", "pulse2", "nova", "needle", "crater", "triad", "fan", "railshot",
  "twinnova", "cascade", "hydra", "hailstorm", "shrapnel", "barrage", "skipper", "pinball",
  "ricochet", "tumbler", "juggernaut", "burrow", "auger", "inferno", "wildfire", "rampart",
  "bastion", "leveler", "lancer", "prism",
];
```

with

```ts
const WIRE = [
  "pulse", "pulse2", "nova", "needle", "crater", "triad", "fan", "railshot",
  "twinnova", "cascade", "hydra", "hailstorm", "shrapnel", "barrage", "skipper", "pinball",
  "ricochet", "tumbler", "juggernaut", "burrow", "auger", "inferno", "wildfire", "rampart",
  "bastion", "leveler", "lancer", "prism", "seeker", "swarm",
];
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `npx vitest run src/game/titles/arcfire`
Expected: FAIL, exactly 4 tests:
- `ballistics.test.ts > homing > turns at most N whole degrees per step …`: `expected 0 to be greater than 1800`. Nothing steers yet, so the bound checks pass vacuously and the `turned` count catches it.
- both `primitives.test.ts > homing` tests: `TypeError: Cannot read properties of undefined (reading 'launch')`
- `roster.test.ts > pins the wire order so far …`: `expected [ 'pulse', 'pulse2', 'nova', …(25) ] to deeply equal [ 'pulse', 'pulse2', 'nova', …(27) ]`

- [ ] **Step 5: Replace** `src/game/titles/arcfire/ballistics.ts` with the design's final file (design-verbatim). Compared with Task 8 it adds `steer` and its call, `if (s.homeDeg > 0 && s.apexed) steer(s);`, between the apex latch and the sweep.

```ts
// src/game/titles/arcfire/ballistics.ts
//
// Shell flight (spec §3.2): launch from the muzzle along an integer angle,
// then fixed 1/60 s steps of semi-implicit Euler in Q16.16. Each step's
// movement is swept in <= 1 px increments against the tank hitboxes and the
// terrain spans, so nothing tunnels through a thin wall or clips past a tank.
// Plan 2A adds the flight modifiers a Stage can ask for — stop at the apex,
// homing after the apex, bounces off the terrain or the side walls — and a
// shell spawned inside a tank's hitbox ignores that tank until it has left it.
// A shell with no modifiers takes exactly Plan 1's path (pixels are floored).
import type { Fx } from "@/game/sim/types";
import { fromInt, toInt, mul } from "@/game/sim/math/fixed";
import { cosDeg, sinDeg } from "./aimTable";
import { isSolid, type Terrain } from "./terrain";
import {
  WORLD_W, STEPS_PER_SEC, GRAVITY_STEP, V_UNIT, MAX_FLIGHT_STEPS, BARREL_LEN, TANK_HIT_R, BOUNCE_PROBE_R,
} from "./constants";
import { idiv, floorPx } from "./imath";

export interface Shell {
  x: Fx;
  y: Fx;
  vx: Fx; // px/s
  vy: Fx; // px/s, positive = falling
  gravityStep: Fx; // fall-speed gain per step (weapon-scaled gravity)
  steps: number; // steps flown so far (the per-shell flight cap counts these)
  alive: boolean;
  // --- Plan 2A
  speed: Fx; // nominal speed: the launch speed, or a child's split speed ("up"/"cone" splits scale it)
  apexed: boolean; // latched on the step a rising shell stops rising
  stopAtApex: boolean; // die with an "apex" result on the step `apexed` latches
  homeDeg: number; // > 0: once apexed, turn <= this many whole degrees per step toward (homeX, homeY)
  homeX: number;
  homeY: number;
  bounces: number; // terrain reflections left
  wallBounces: number; // side-wall reflections left
  restitutionPct: number; // speed kept per reflection
  ignore: number; // bitmask of tanks whose hitbox the shell spawned inside; a bit clears once a sample is outside
}

/** A tank hitbox centre in px; the radius is TANK_HIT_R. */
export interface HitCircle {
  x: number;
  y: number;
}

export type Impact =
  | { kind: "terrain"; x: number; y: number; fx: Fx; fy: Fx } // (x, y) = first solid px; (fx, fy) = last free position
  | { kind: "tank"; x: number; y: number; tank: number; fx: Fx; fy: Fx }
  | { kind: "apex"; x: number; y: number; fx: Fx; fy: Fx } // only for stopAtApex shells; the shell has not moved this step
  | { kind: "bounce"; x: number; y: number; wall: boolean } // reflected at (x, y); the shell is alive at its last free position
  | { kind: "out"; x: number; y: number }; // left the world sideways, or hit the per-shell flight cap

/** The muzzle point for a hitbox centre and an integer angle (any integer degrees), px. */
export function muzzle(cx: number, cy: number, angleDeg: number): { x: number; y: number } {
  return {
    x: cx + toInt(mul(fromInt(BARREL_LEN), cosDeg(angleDeg))),
    y: cy - toInt(mul(fromInt(BARREL_LEN), sinDeg(angleDeg))),
  };
}

/** A shell at Q16.16 position (x, y) with velocity (vx, vy), nominal speed `speed` and no flight modifiers. */
export function shellAt(x: Fx, y: Fx, vx: Fx, vy: Fx, speed: Fx, gravityStep: Fx): Shell {
  return {
    x, y, vx, vy, gravityStep, steps: 0, alive: true,
    speed, apexed: false, stopAtApex: false, homeDeg: 0, homeX: 0, homeY: 0,
    bounces: 0, wallBounces: 0, restitutionPct: 100, ignore: 0,
  };
}

/** A shell at (x, y) px flying at `speed` (Fx px/s) along an integer angle (any integer degrees). */
export function launchAt(x: number, y: number, angleDeg: number, speed: Fx, gravityStep: Fx): Shell {
  return shellAt(fromInt(x), fromInt(y), mul(speed, cosDeg(angleDeg)), 0 - mul(speed, sinDeg(angleDeg)), speed, gravityStep);
}

export function launchShell(
  x: number, y: number, angleDeg: number, power: number, speedPct = 100, gravityPct = 100
): Shell {
  return launchAt(x, y, angleDeg, idiv(power * V_UNIT * speedPct, 100), idiv(GRAVITY_STEP * gravityPct, 100));
}

/** Rotate a velocity by an integer angle in the aim sense (+ turns a rightward vector toward up). */
export function rotateVel(vx: Fx, vy: Fx, deg: number): [Fx, Fx] {
  const c = cosDeg(deg);
  const s = sinDeg(deg);
  return [mul(vx, c) + mul(vy, s), mul(vy, c) - mul(vx, s)];
}

/**
 * Turn the shell toward (homeX, homeY) by k = min(homeDeg, the whole degrees
 * between its heading and the target) — never past the target, so there is no
 * overshoot and no wobble. No arctangent: with dot > 0 the angle is < k exactly
 * when |cross| * cos k < dot * sin k, compared with the baked table. At
 * 90 degrees or more (dot <= 0) the full homeDeg turn is taken.
 */
function steer(s: Shell): void {
  const dx = s.homeX - floorPx(s.x);
  const dy = s.homeY - floorPx(s.y);
  const vx = idiv(s.vx, 256); // 1/256-px/s units: every product below stays < 2^52 for validator-legal data (see the magnitude notes)
  const vy = idiv(s.vy, 256);
  const cross = vx * dy - vy * dx; // < 0: the target is anticlockwise of the heading (aim sense)
  const dot = vx * dx + vy * dy;
  if (cross === 0 && dot >= 0) return; // dead on, at the target, or too slow to have a heading
  let k = s.homeDeg;
  if (dot > 0) {
    const ac = cross < 0 ? 0 - cross : cross;
    while (k > 0 && ac * cosDeg(k) < dot * sinDeg(k)) k--;
  }
  if (k === 0) return;
  const [rx, ry] = rotateVel(s.vx, s.vy, cross <= 0 ? k : 0 - k); // dead astern (cross 0, dot < 0) turns anticlockwise
  s.vx = rx;
  s.vy = ry;
}

/**
 * The outward surface direction at solid pixel (cx, cy): minus the sum of the
 * offsets of the solid pixels in a radius-BOUNCE_PROBE_R disc around it (their
 * centroid points into the ground). If that is zero or doesn't oppose the
 * motion, the way the shell came in, (fromX - cx, fromY - cy), is used
 * instead; it always opposes the motion, because the swept samples move
 * monotonically along the velocity. Never (0, 0). At BOUNCE_PROBE_R = 8 the
 * components are <= 330 (a half-disc's moment), from <= 197 isSolid probes.
 */
function surfaceNormal(s: Shell, t: Terrain, cx: number, cy: number, fromX: number, fromY: number): [number, number] {
  const r = BOUNCE_PROBE_R;
  let sx = 0;
  let sy = 0;
  for (let dy = 0 - r; dy <= r; dy++) {
    for (let dx = 0 - r; dx <= r; dx++) {
      if (dx * dx + dy * dy <= r * r && isSolid(t, cx + dx, cy + dy)) {
        sx += dx;
        sy += dy;
      }
    }
  }
  const nx = 0 - sx;
  const ny = 0 - sy;
  if ((nx !== 0 || ny !== 0) && s.vx * nx + s.vy * ny < 0) return [nx, ny];
  if (fromX !== cx || fromY !== cy) return [fromX - cx, fromY - cy];
  return [0, -1];
}

/** Mirror the velocity's component along normal (nx, ny) (any non-zero length) if it points into the surface, then keep restitutionPct of the speed. */
function reflect(s: Shell, nx: number, ny: number): void {
  const vn = s.vx * nx + s.vy * ny; // |v| < 2^31, |n| components <= 330: < 2^41
  if (vn < 0) {
    const nn = nx * nx + ny * ny; // >= 1
    s.vx -= idiv(2 * vn * nx, nn); // < 2^50
    s.vy -= idiv(2 * vn * ny, nn);
  }
  s.vx = idiv(s.vx * s.restitutionPct, 100);
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
 * Advance one physics step. Returns the first event along the swept path, or
 * null while the shell is still flying. windStep is the horizontal velocity
 * change per step (Fx). The order inside a step is part of the determinism
 * contract: wind, gravity, the apex latch (an apex stage ends the step here),
 * homing, then the sweep, whose every sample checks the side edges, then the
 * tanks in index order, then the terrain.
 */
export function stepShell(s: Shell, t: Terrain, tanks: readonly HitCircle[], windStep: Fx): Impact | null {
  const rising = s.vy < 0;
  s.vx += windStep;
  s.vy += s.gravityStep;
  if (!s.apexed && rising && s.vy >= 0) {
    s.apexed = true;
    if (s.stopAtApex) {
      s.alive = false;
      return { kind: "apex", x: floorPx(s.x), y: floorPx(s.y), fx: s.x, fy: s.y };
    }
  }
  if (s.homeDeg > 0 && s.apexed) steer(s);
  const nx = s.x + idiv(s.vx, STEPS_PER_SEC);
  const ny = s.y + idiv(s.vy, STEPS_PER_SEC);
  const n = Math.max(Math.abs(floorPx(nx) - floorPx(s.x)), Math.abs(floorPx(ny) - floorPx(s.y)), 1);
  const r2 = TANK_HIT_R * TANK_HIT_R;
  let fx = s.x; // the last free sample
  let fy = s.y;
  for (let i = 1; i <= n; i++) {
    const sx = s.x + idiv((nx - s.x) * i, n);
    const sy = s.y + idiv((ny - s.y) * i, n);
    const cx = floorPx(sx);
    const cy = floorPx(sy);
    if (cx < 0 || cx >= WORLD_W) {
      if (s.wallBounces > 0) {
        s.wallBounces--;
        reflect(s, cx < 0 ? 1 : -1, 0);
        return endBounce(s, fx, fy, { kind: "bounce", x: cx < 0 ? 0 : WORLD_W - 1, y: cy, wall: true });
      }
      s.alive = false;
      return { kind: "out", x: cx, y: cy };
    }
    for (let k = 0; k < tanks.length; k++) {
      const dx = cx - tanks[k].x;
      const dy = cy - tanks[k].y;
      const inside = dx * dx + dy * dy <= r2;
      if ((s.ignore >> k) & 1) {
        if (!inside) s.ignore &= ~(1 << k);
        continue;
      }
      if (inside) {
        s.alive = false;
        return { kind: "tank", x: cx, y: cy, tank: k, fx, fy };
      }
    }
    if (isSolid(t, cx, cy)) {
      if (s.bounces > 0) {
        s.bounces--;
        const [nX, nY] = surfaceNormal(s, t, cx, cy, floorPx(fx), floorPx(fy));
        reflect(s, nX, nY);
        return endBounce(s, fx, fy, { kind: "bounce", x: cx, y: cy, wall: false });
      }
      s.alive = false;
      return { kind: "terrain", x: cx, y: cy, fx, fy };
    }
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

- [ ] **Step 6: Append indices 28–29 to the roster** (design-verbatim):

In `src/game/titles/arcfire/weapons/roster.ts`, replace

```ts
];

/** Roster index by weapon id. */
```

with

```ts
  {
    id: "seeker", name: "Seeker", tag: "HOMING", tier: 2, power: 55,
    launch: { kind: "shell" },
    stage: { on: "impact", homing: { degPerStep: 2 }, effects: [{ blast: blast(32, 50) }] },
  },
  {
    id: "swarm", name: "Swarm", tag: "HOMING", tier: 3, power: 80,
    launch: { kind: "shell", count: 5, spreadDeg: 14 },
    stage: { on: "impact", homing: { degPerStep: 1 }, effects: [{ blast: blast(16, 20) }] },
  },
];

/** Roster index by weapon id. */
```

- [ ] **Step 7: Run the suite: only the corpus may fail, on its new keys**

Run: `npx vitest run src/game/titles/arcfire`
Expected: FAIL, exactly 1 test: `corpus.test.ts`, whose case list has 453 fresh ids against 423 pinned.

- [ ] **Step 8: Append the new corpus keys**

Run: `UPDATE_ARCFIRE_CORPUS=add npx vitest run src/game/titles/arcfire/corpus.test.ts`
Expected: PASS (+30 keys).

Run: `node -e "const c=require('./src/game/titles/arcfire/corpus.golden.json');console.log(c.digest,Object.keys(c.cases).length)"`
Expected, exactly: `e0aad681 453`

- [ ] **Step 9: Run the Arcfire gate, types and the full suite**

Run: `npx vitest run src/game/titles/arcfire src/game/sim/purity.test.ts`
Expected: PASS: 17 files, 176 tests.

Run: `npx tsc --noEmit`
Expected: exit 0.

Run: `npm test`
Expected: all pass.

- [ ] **Step 10: Run the cross-engine gate**

Run: `npm run test:e2e:cross-engine -- --grep-invert firefox`
Expected: exit 0, `2 passed`. Chromium and WebKit reproduce `5167b43d`, `389a1340` and `e0aad681` (Firefox runs in CI). This is the first browser run of the homing steer.

- [ ] **Step 11: Commit**

```bash
git add src/game/titles/arcfire/ballistics.ts src/game/titles/arcfire/weapons/roster.ts src/game/titles/arcfire/ballistics.test.ts src/game/titles/arcfire/weapons/primitives.test.ts src/game/titles/arcfire/weapons/roster.test.ts src/game/titles/arcfire/corpus.golden.json
git commit -m "feat(arcfire): homing after the apex (spec numbers, owner D2); Seeker, Swarm (28-29)" -m "Corpus + 30 keys -> e0aad681 (453 cases); no existing key moved. Pins unchanged." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 13: Quake + roster completion → Quake, Aftershock (indices 30–31); `STANDARD_SETTINGS` / `SHORT_SETTINGS`

**Files:**
- Modify: `src/game/titles/arcfire/weapons/primitives.ts` (full replacement: the design's final file, with `quake`)
- Modify: `src/game/titles/arcfire/weapons/roster.ts` (append indices 30–31: the roster is complete)
- Modify: `src/game/titles/arcfire/state.ts` (add `STANDARD_SETTINGS` and `SHORT_SETTINGS`; the file becomes design-verbatim)
- Modify (tests): `weapons/roster.test.ts` (full replacement: the design's final version), `weapons/primitives.test.ts`, `weapons/validate.test.ts`
- Modify (fixture): `corpus.golden.json` (new keys only; the corpus is complete)

**Interfaces:**
- Consumes: Task 6's `removeInterval` and `surfaceTop`; Task 5's `showSteps`; Task 2's `rosterSize`.
- Produces:
  - `applyEffects` handles `quake`, and its delay branch is now the final `else`.
  - The `quake { x, y, reach, furrow, dur }` event.
  - From `state.ts`: `STANDARD_SETTINGS = { weaponsEach: 10, poolSize: 24, wind: false, guaranteeTags: ["BLAST", "SPLIT", "DIRT"], rosterSize: 32 }` (frozen) and `SHORT_SETTINGS = { ...STANDARD_SETTINGS, weaponsEach: 5, poolSize: 12 }` (frozen). `rosterSize` is a literal 32, **not** `ROSTER.length`, so an append is a deliberate settings and `simVersion` change.
  - `ROSTER_INDEX` gains `quake` 30, `aftershock` 31. `ROSTER.length` is 32.

**Rules** (owner decision **D3**; the design's §4.6):
- **Damage, to the opponent only:** `⌊damage · (reach − d) / reach⌋` for `d < reach`, where `d = max(0, |tank.x − x| − 14)` is the horizontal distance to the hitbox edge. The reach is horizontal, so it is unblockable and crosses chasms.
- **The shooter's own tank is exempt** from the shockwave. Aftershock's separate blast is an ordinary blast, so on its own tank Aftershock gives the opponent 50, not 85.
- **Furrow:** every column within ±(reach − 1) loses `⌊furrow · (reach − |dx|) / reach⌋` px off its top, the shooter's included.

- [ ] **Step 1: Replace the roster test** `src/game/titles/arcfire/weapons/roster.test.ts` with the design's final version (design-verbatim).
  - The exact 32-id wire pin replaces the `WIRE` prefix pin, and it adds 12-tag coverage.
  - It adds the settings blocks: the frozen values, the tripwire `STANDARD_SETTINGS.rosterSize === ROSTER.length`, the structural tag-guarantee test, and 500 seeds of legal pools in which every weapon can be drawn.

```ts
import { describe, it, expect } from "vitest";
import { ROSTER, ROSTER_INDEX } from "./roster";
import { weaponErrors, maxShells, maxTurnSteps } from "./validate";
import { SUDDEN_DEATH_WEAPON, MAX_TURN_STEPS, MAX_SHELLS } from "../constants";
import { STANDARD_SETTINGS, SHORT_SETTINGS } from "../state";
import { createMatch, applyPick } from "../match";
import type { Tag } from "./types";

const TAGS: Tag[] = ["BLAST", "VOLLEY", "SPLIT", "BOUNCE", "ROLL", "DIG", "FIRE", "DIRT", "BEAM", "HOMING", "QUAKE", "SPECIAL"];

describe("ROSTER", () => {
  it("has unique ids that index back to themselves", () => {
    const ids = ROSTER.map((w) => w.id);
    expect(new Set(ids).size).toBe(ids.length);
    ROSTER.forEach((w, i) => expect(ROSTER_INDEX[w.id]).toBe(i));
  });
  it("keeps Pulse at the sudden-death index", () => {
    expect(ROSTER[SUDDEN_DEATH_WEAPON].id).toBe("pulse");
  });
  it("pins the wire order (append-only): Plan 1's eight, then Plan 2A's twenty-four", () => {
    expect(ROSTER.map((w) => w.id)).toEqual([
      "pulse", "pulse2", "nova", "needle", "crater", "triad", "fan", "railshot",
      "twinnova", "cascade", "hydra", "hailstorm", "shrapnel", "barrage", "skipper", "pinball",
      "ricochet", "tumbler", "juggernaut", "burrow", "auger", "inferno", "wildfire", "rampart",
      "bastion", "leveler", "lancer", "prism", "seeker", "swarm", "quake", "aftershock",
    ]);
  });
  it("every weapon is valid and within the static cost bounds", () => {
    for (const w of ROSTER) {
      expect(weaponErrors(w), w.id).toEqual([]);
      expect(maxShells(w)).toBeLessThanOrEqual(MAX_SHELLS);
      expect(maxTurnSteps(w)).toBeLessThan(MAX_TURN_STEPS);
    }
    expect(Math.max(...ROSTER.map(maxShells))).toBe(13); // Cascade
    expect(Math.max(...ROSTER.map(maxTurnSteps))).toBe(3600); // Cascade: three generations of 1,200 steps
  });
  it("covers all 12 tags", () => {
    expect(new Set(ROSTER.map((w) => w.tag))).toEqual(new Set(TAGS));
  });
});

describe("STANDARD_SETTINGS / SHORT_SETTINGS", () => {
  it("are frozen with the spec values", () => {
    expect(STANDARD_SETTINGS).toEqual({ weaponsEach: 10, poolSize: 24, wind: false, guaranteeTags: ["BLAST", "SPLIT", "DIRT"], rosterSize: 32 });
    expect(SHORT_SETTINGS).toEqual({ ...STANDARD_SETTINGS, weaponsEach: 5, poolSize: 12 });
    expect(Object.isFrozen(STANDARD_SETTINGS) && Object.isFrozen(SHORT_SETTINGS) && Object.isFrozen(STANDARD_SETTINGS.guaranteeTags)).toBe(true);
  });
  it("tripwire: STANDARD covers the whole roster (an append must bump it deliberately, with simVersion)", () => {
    expect(STANDARD_SETTINGS.rosterSize).toBe(ROSTER.length);
  });
  it("guarantees the tags by construction: one distinct tag per free slot, each with a weapon in the drawable prefix", () => {
    // drawPool takes one weapon per guaranteed tag BEFORE the shuffle; a weapon has one tag, so
    // distinct tags never compete for a candidate, and it only stops early when the pool is full.
    for (const s of [STANDARD_SETTINGS, SHORT_SETTINGS]) {
      expect(new Set(s.guaranteeTags).size).toBe(s.guaranteeTags.length);
      expect(s.guaranteeTags.length).toBeLessThanOrEqual(s.poolSize);
      for (const tag of s.guaranteeTags) expect(ROSTER.slice(0, s.rosterSize).some((w) => w.tag === tag), tag).toBe(true);
    }
  });
  it("always draws a legal pool with the guaranteed tags, and every weapon can be drawn", () => {
    for (const s of [STANDARD_SETTINGS, SHORT_SETTINGS]) {
      const seen = new Set<number>();
      for (let seed = 0; seed < 500; seed++) {
        const m = createMatch(seed, s);
        expect(m.pool.length).toBe(s.poolSize);
        expect(new Set(m.pool).size).toBe(s.poolSize);
        for (const i of m.pool) {
          expect(i).toBeLessThan(s.rosterSize);
          seen.add(i);
        }
        for (const tag of s.guaranteeTags) expect(m.pool.some((i) => ROSTER[i].tag === tag)).toBe(true);
        if (seed < 20) {
          while (m.phase === "draft") expect(applyPick(m, m.poolOwner.findIndex((o) => o === -1)).ok).toBe(true);
          expect(m.hands[0].length + m.hands[1].length).toBe(2 * s.weaponsEach);
        }
      }
      if (s === STANDARD_SETTINGS) expect(seen.size).toBe(32);
    }
  });
});
```

- [ ] **Step 2: Write the failing quake tests**

Append to the end of `src/game/titles/arcfire/weapons/primitives.test.ts` (after one blank line):

```ts
describe("quake", () => {
  it("Quake's shockwave hurts the enemy by the horizontal distance to its hitbox edge", () => {
    const tl = fire(flatBattle(), "quake", 60, 50);
    const [q] = eventsOf(tl, "quake");
    expect([q.x, q.reach, q.furrow]).toEqual([663, 260, 6]);
    const d = Math.max(0, Math.abs(700 - q.x) - 14); // 23
    expect(eventsOf(tl, "damage").map((e) => [e.target, e.amount])).toEqual([[1, Math.floor((55 * (260 - d)) / 260)]]);
    expect(tl.points).toEqual([50, 0]);
  });
  it("furrows the surface: 6 px at the source, tapering to nothing at the reach", () => {
    const m = flatBattle();
    fire(m, "quake", 60, 50);
    expect([0, 100, 200, 259, 260].map((dx) => m.terrain.height[663 + dx])).toEqual([406, 403, 401, 400, 400]);
  });
  it("reaches across a chasm: the reach is horizontal", () => {
    const m = setHeights(flatBattle(), (x) => (x >= 675 && x <= 681 ? 499 : 400));
    const tl = fire(m, "quake", 60, 50);
    expect(eventsOf(tl, "quake")[0].x).toBe(663);
    expect(tl.points).toEqual([50, 0]);
  });
  it("never hurts the shooter: Quake on its own tank scores nothing, while Aftershock's blast still does", () => {
    const q = fire(flatBattle(), "quake", 90, 0);
    expect([eventsOf(q, "quake").length, eventsOf(q, "damage").length]).toEqual([1, 0]);
    expect(q.points).toEqual([0, 0]);
    const a = fire(flatBattle(), "aftershock", 90, 0);
    expect(eventsOf(a, "damage").map((e) => [e.target, e.amount])).toEqual([[0, 50]]); // the blast, not the shockwave
    expect(a.points).toEqual([0, 50]);
  });
});
```

- [ ] **Step 3: Stage the last totality case**

Append to the end of `src/game/titles/arcfire/weapons/validate.test.ts` (after one blank line):

```ts
describe("totality: quake", () => {
  it("a zero-reach quake", () => {
    expectTotal(impact([{ quake: { reach: 0, damage: 0, furrow: 0 } }]));
  });
});
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `npx vitest run src/game/titles/arcfire`
Expected: FAIL, exactly 10 tests:
- the 4 `primitives.test.ts > quake` tests: `TypeError: Cannot read properties of undefined (reading 'launch')`
- `roster.test.ts`, 6 tests:
  - `pins the wire order (append-only) …`: `expected [ 'pulse', 'pulse2', 'nova', …(27) ] to deeply equal [ 'pulse', 'pulse2', 'nova', …(29) ]`
  - `covers all 12 tags`
  - `are frozen with the spec values`: `expected undefined to deeply equal { weaponsEach: 10, poolSize: 24, …(3) }`
  - the tripwire and the structural test: `TypeError: Cannot read properties of undefined (reading 'rosterSize')` / `(reading 'guaranteeTags')`
  - `always draws a legal pool …`: `TypeError: Cannot read properties of undefined (reading 'poolSize')`

The zero-reach totality case already passes: an effect with no branch does nothing.

- [ ] **Step 5: Replace** `src/game/titles/arcfire/weapons/primitives.ts` with the design's final file (design-verbatim). Compared with Task 11 it adds `quake`, the `quake` branch of `applyEffects` (whose delay branch becomes the final `else`), and the `Quake` import.

```ts
// src/game/titles/arcfire/weapons/primitives.ts
//
// The effect implementations (spec §4.1): the only weapon code outside the
// shell flight in ballistics.ts. Every effect is applied INSTANTLY at its
// trigger step, in closed form or one bounded pass over the terrain; only
// shells and delays take simulated time. Integer px / Q16.16 throughout; no
// weapon draws from the match RNG. The order effects run in is part of the
// determinism contract (see resolve.ts).
import type { Fx } from "@/game/sim/types";
import { fromInt, toInt, mul } from "@/game/sim/math/fixed";
import { cosDeg, sinDeg } from "../aimTable";
import { idiv, isqrt, floorPx } from "../imath";
import {
  isSolid, carveCircle, carveCapsule, removeInterval, addInterval, groundBelow, surfaceTop, type Terrain,
} from "../terrain";
import { muzzle, rotateVel, shellAt, type HitCircle, type Shell } from "../ballistics";
import { blastDamage } from "../damage";
import { WORLD_W, WORLD_H, TANK_HIT_R, ROLL_PROBE, MAX_SHELLS, DIG_MAX_PITCH } from "../constants";
import { SHOW_PX_PER_STEP, showSteps, type Timeline, type TimelineEvent } from "../timeline";
import type { Blast, BeamLaunch, Build, Burn, Dig, Effect, Quake, Roll, Split, Stage } from "./types";

/** Everything one shot's effects can touch. Built by resolveWeapon; lives for one turn. */
export interface Shot {
  t: Terrain;
  tanks: readonly HitCircle[]; // hitboxes, fixed for the whole shot (tanks ride the settle afterwards)
  shooter: number;
  shells: Shell[]; // every shell of the turn, by creation order (= Timeline.shells index)
  stages: Stage[]; // stages[i] = what shells[i] does on its trigger
  live: number; // shells still alive
  pending: Pending[]; // armed delays, in arming order
  received: number[]; // damage each tank took this turn
  rec: boolean; // build the Timeline's paths and events (false: the quiet AI path)
  tl: Timeline;
}

/** Where and how a stage fired. */
export interface Trigger {
  step: number;
  shell: number; // index of the shell that triggered
  x: number; // the trigger px: first solid (or tank) px on impact; the shell's px at the apex
  y: number;
  fx: Fx; // the last free position: children spawn here; roll and burn drop from here
  fy: Fx;
  vx: Fx; // velocity at the trigger: dig direction, the roll/burn tie-break, "ahead"/"cone" splits
  vy: Fx;
  speed: Fx; // the shell's nominal speed: the base of "up"/"cone" splits
  gravityStep: Fx; // inherited by children
  tank: number; // the tank struck, or -1
}

export interface Pending {
  at: number; // the step it fires on
  trig: Trigger;
  effects: readonly Effect[];
}

export function emit(shot: Shot, ev: TimelineEvent): void {
  if (shot.rec) shot.tl.events.push(ev);
}

/** Apply a list of effects at a trigger, completely and in array order (a delay only arms its list). */
export function applyEffects(shot: Shot, trig: Trigger, effects: readonly Effect[]): void {
  for (const e of effects) {
    if ("blast" in e) blastAt(shot, e.blast, trig.x, trig.y, trig.step, trig.shell, 0);
    else if ("split" in e) split(shot, trig, e.split);
    else if ("roll" in e) roll(shot, trig, e.roll);
    else if ("dig" in e) dig(shot, trig, e.dig);
    else if ("burn" in e) burn(shot, trig, e.burn);
    else if ("build" in e) build(shot, trig, e.build);
    else if ("quake" in e) quake(shot, trig, e.quake);
    else {
      const at = trig.step + (e.delay.steps > 1 ? e.delay.steps : 1);
      shot.pending.push({ at, trig, effects: e.delay.then });
      emit(shot, { step: trig.step, kind: "fuse", shell: trig.shell, x: trig.x, y: trig.y, at });
    }
  }
}

/** Damage to tank p: it scores for whoever didn't take it (resolve.ts). */
function hurt(shot: Shot, p: number, amount: number, step: number, lag: number): void {
  if (amount <= 0) return;
  shot.received[p] += amount;
  emit(shot, { step, kind: "damage", target: p, amount, lag });
}

/** Plan 1's blast: carve a disc, then damage both tanks by distance (tank order 0, 1). */
export function blastAt(shot: Shot, b: Blast, x: number, y: number, step: number, shell: number, lag: number): void {
  carveCircle(shot.t, x, y, b.radius);
  emit(shot, { step, kind: "blast", shell, x, y, radius: b.radius, lag });
  for (let p = 0; p < 2; p++) hurt(shot, p, blastDamage(b, x, y, shot.tanks[p].x, shot.tanks[p].y), step, lag);
}

/** Bitmask of the tanks whose hitbox contains px (x, y). */
function tankMask(shot: Shot, x: number, y: number): number {
  let m = 0;
  for (let k = 0; k < 2; k++) {
    const dx = x - shot.tanks[k].x;
    const dy = y - shot.tanks[k].y;
    if (dx * dx + dy * dy <= TANK_HIT_R * TANK_HIT_R) m |= 1 << k;
  }
  return m;
}

/** The first tank whose hitbox contains (x, y), or -1. */
function tankAt(shot: Shot, x: number, y: number): number {
  const m = tankMask(shot, x, y);
  return m === 0 ? -1 : (m & 1) !== 0 ? 0 : 1;
}

/** Add a shell to the turn and arm its stage's flight modifiers. Returns its index, or -1 past MAX_SHELLS (dropped). */
export function addShell(shot: Shot, s: Shell, stage: Stage, angle: number, parent: number, step: number): number {
  if (shot.shells.length >= MAX_SHELLS) return -1;
  s.stopAtApex = stage.on === "apex";
  if (stage.homing) {
    const target = shot.tanks[1 - shot.shooter];
    s.homeDeg = stage.homing.degPerStep;
    s.homeX = target.x;
    s.homeY = target.y;
  }
  if (stage.bounce) {
    if (stage.bounce.walls) s.wallBounces = stage.bounce.times;
    else s.bounces = stage.bounce.times;
    s.restitutionPct = stage.bounce.restitutionPct;
  }
  s.ignore = tankMask(shot, floorPx(s.x), floorPx(s.y)); // only a line split can spawn inside a hitbox
  shot.shells.push(s);
  shot.stages.push(stage);
  shot.live++;
  if (shot.rec) shot.tl.shells.push({ angle, parent, start: step, points: [floorPx(s.x), floorPx(s.y)] });
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
    let vx: Fx;
    let vy: Fx;
    if (sp.from === "up") {
      vx = mul(speed, cosDeg(90 + off));
      vy = 0 - mul(speed, sinDeg(90 + off));
    } else if (sp.from === "cone") {
      vx = trig.vx + mul(speed, cosDeg(270 + off));
      vy = trig.vy - mul(speed, sinDeg(270 + off));
    } else {
      const [rx, ry] = rotateVel(trig.vx, trig.vy, off);
      vx = idiv(rx * sp.speedPct, 100);
      vy = idiv(ry * sp.speedPct, 100);
    }
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
function downhill(t: Terrain, x: number, g: number, vx: Fx): number {
  const l = x - ROLL_PROBE >= 0 ? groundBelow(t, x - ROLL_PROBE, g - ROLL_PROBE) : g;
  const r = x + ROLL_PROBE < WORLD_W ? groundBelow(t, x + ROLL_PROBE, g - ROLL_PROBE) : g;
  if (r > l) return 1;
  if (l > r) return -1;
  return vx < 0 ? -1 : 1;
}

function roll(shot: Shot, trig: Trigger, r: Roll): void {
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
  }
  blastAt(shot, r.then, end.x, end.g, trig.step, trig.shell, dur);
}

function dig(shot: Shot, trig: Trigger, d: Dig): void {
  // Along the travel direction, but never steeper than DIG_MAX_PITCH below level: a steeper
  // heading (or none) takes exactly that pitch, keeping the horizontal sense of travel
  // (toward the opponent when there is none). Upward and shallower headings are kept.
  let a = toInt(trig.vx); // px/s, |a| < 2^15: every product here stays < 2^33
  let c = toInt(trig.vy); // px/s, + = down
  if (c > 0 ? c * cosDeg(DIG_MAX_PITCH) > (a < 0 ? 0 - a : a) * sinDeg(DIG_MAX_PITCH) : a === 0 && c === 0) {
    const sense = trig.vx > 0 ? 1 : trig.vx < 0 ? -1 : shot.shooter === 0 ? 1 : -1;
    a = sense * cosDeg(DIG_MAX_PITCH); // (a, c) becomes that pitch's Q16.16 unit vector: only its direction matters
    c = sinDeg(DIG_MAX_PITCH);
  }
  const len = isqrt(a * a + c * c); // >= 1: (a, c) is never (0, 0) here
  const x0 = trig.x;
  const y0 = trig.y;
  const dx = idiv(a * d.length, len);
  const dy = idiv(c * d.length, len);
  const n = Math.max(Math.abs(dx), Math.abs(dy), 1);
  let stop = n; // the last sample the tunnel reaches
  for (let i = 0; i <= n; i++) {
    const sx = x0 + idiv(dx * i, n);
    const sy = y0 + idiv(dy * i, n);
    // i = 0 is the trigger px, inside the world; the floor (WORLD_H) is bedrock
    if (i > 0 && (sx < 0 || sx >= WORLD_W || sy >= WORLD_H)) { stop = i - 1; break; }
    if (tankAt(shot, sx, sy) >= 0) { stop = i; break; }
  }
  const ex = x0 + idiv(dx * stop, n);
  const ey = y0 + idiv(dy * stop, n);
  const reached = idiv(stop * d.length, n); // px along the tunnel
  carveCapsule(shot.t, x0, y0, ex, ey, idiv(d.width, 2));
  const dur = showSteps(reached, SHOW_PX_PER_STEP.dig);
  emit(shot, { step: trig.step, kind: "dig", shell: trig.shell, x0, y0, x1: ex, y1: ey, width: d.width, dur });
  if (d.each && d.blastEvery && d.blastEvery > 0) {
    for (let k = 1; k * d.blastEvery < d.length; k++) {
      const i = idiv(k * d.blastEvery * n, d.length); // the sample k × blastEvery px along
      if (i >= stop) break;
      blastAt(shot, d.each, x0 + idiv(dx * i, n), y0 + idiv(dy * i, n), trig.step, trig.shell,
        showSteps(k * d.blastEvery, SHOW_PX_PER_STEP.dig));
    }
  }
  if (d.then) blastAt(shot, d.then, ex, ey, trig.step, trig.shell, dur);
}

function burn(shot: Shot, trig: Trigger, b: Burn): void {
  const x = floorPx(trig.fx);
  const g = groundBelow(shot.t, x, floorPx(trig.fy));
  const touched = [-1, -1]; // px along a run where each tank was first touched (-1 = never)
  const start = tankAt(shot, x, g - 1);
  if (start >= 0) touched[start] = 0;
  const half = idiv(b.pool, 2);
  const runs: number[] = []; // [dir, max px] pairs: the pool both ways, then the flow(s)
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
}

function build(shot: Shot, trig: Trigger, b: Build): void {
  const t = shot.t;
  const x = trig.x;
  const y = trig.y;
  if (b.shape === "ball") {
    const r = b.radius;
    for (let cx = Math.max(0, x - r); cx <= Math.min(WORLD_W - 1, x + r); cx++) {
      const h = isqrt(r * r - (cx - x) * (cx - x));
      addInterval(t, cx, y - h, y + h + 1);
    }
  } else if (b.shape === "wall") {
    const left = x - idiv(b.width, 2);
    for (let cx = Math.max(0, left); cx < Math.min(WORLD_W, left + b.width); cx++) {
      const top = surfaceTop(t, cx);
      addInterval(t, cx, top - b.height, top);
    }
  } else {
    for (let cx = Math.max(0, x - b.radius); cx <= Math.min(WORLD_W - 1, x + b.radius); cx++) {
      removeInterval(t, cx, 0, y);
      addInterval(t, cx, y, groundBelow(t, cx, y));
    }
  }
  emit(shot, { step: trig.step, kind: "build", shell: trig.shell, shape: b.shape, x, y,
    size: b.shape === "wall" ? b.height : b.radius, width: b.shape === "wall" ? b.width : 2 * b.radius + 1 });
}

function quake(shot: Shot, trig: Trigger, q: Quake): void {
  if (q.reach <= 0) return; // divisor guard (the roster validator requires reach >= 1)
  const x = trig.x;
  for (let cx = Math.max(0, x - q.reach + 1); cx <= Math.min(WORLD_W - 1, x + q.reach - 1); cx++) {
    const depth = idiv(q.furrow * (q.reach - Math.abs(cx - x)), q.reach); // furrow px at the source, 0 at ±reach
    const top = surfaceTop(shot.t, cx);
    if (depth > 0 && top < WORLD_H) removeInterval(shot.t, cx, top, top + depth);
  }
  emit(shot, { step: trig.step, kind: "quake", shell: trig.shell, x, y: trig.y, reach: q.reach, furrow: q.furrow,
    dur: showSteps(q.reach, SHOW_PX_PER_STEP.quake) });
  // The shockwave hurts only the opponent: the shooter's own tank is exempt (its blasts are not).
  const p = 1 - shot.shooter;
  const gap = Math.abs(shot.tanks[p].x - x) - TANK_HIT_R; // horizontal distance to the hitbox edge, like a blast's
  const d = gap > 0 ? gap : 0;
  if (d < q.reach) hurt(shot, p, idiv(q.damage * (q.reach - d), q.reach), trig.step, showSteps(d, SHOW_PX_PER_STEP.quake));
}

/**
 * The direction (aim sense: 0 = right, 90 = up, 270 = down) of a beam fired
 * at command angle `angle` by `shooter`. A beam reads the angle on the shell
 * dial turned a quarter turn toward the shooter's facing (player 0 faces
 * right and player 1 left; tanks never cross): clockwise for player 0,
 * anticlockwise for player 1. So 90 is level at the opponent's side, the
 * shooter's usual half of the dial (0..90 for player 0, 90..180 for player 1)
 * runs from straight down to level, the other half from level to straight up,
 * and the mirror of a beam command is 180 - angle, as for a shell. The wire
 * angle stays an integer in 0..180; the HUD and the AI call this function.
 */
export const beamDir = (shooter: number, angle: number): number => (shooter === 0 ? angle - 90 : angle + 90);

/** Fire a beam launch at command angle `angle` (step 1): straight lines that carve and pass through terrain and tanks. */
export function fireBeams(shot: Shot, launch: BeamLaunch, angle: number): void {
  const count = launch.count ?? 1;
  const reach = TANK_HIT_R + idiv(launch.width, 2);
  const from = shot.tanks[shot.shooter];
  for (let b = 0; b < count; b++) {
    const a = beamDir(shot.shooter, angle + fanOffset(b, count, launch.spreadDeg ?? 0));
    const mz = muzzle(from.x, from.y, a);
    const dx = toInt(mul(fromInt(launch.length), cosDeg(a)));
    const dy = 0 - toInt(mul(fromInt(launch.length), sinDeg(a)));
    const n = Math.max(Math.abs(dx), Math.abs(dy), 1);
    let hit = 0; // tank bitmask
    let last = 0;
    for (let i = 0; i <= n; i++) {
      const sx = mz.x + idiv(dx * i, n);
      const sy = mz.y + idiv(dy * i, n);
      if (sx < 0 || sx >= WORLD_W || sy >= WORLD_H) break; // the side edges; the floor is bedrock
      last = i;
      for (let p = 0; p < 2; p++) {
        const ex = sx - shot.tanks[p].x;
        const ey = sy - shot.tanks[p].y;
        if (ex * ex + ey * ey <= reach * reach) hit |= 1 << p;
      }
    }
    const x1 = mz.x + idiv(dx * last, n);
    const y1 = mz.y + idiv(dy * last, n);
    carveCapsule(shot.t, mz.x, mz.y, x1, y1, idiv(launch.width, 2));
    emit(shot, { step: 1, kind: "beam", beam: b, x0: mz.x, y0: mz.y, x1, y1, width: launch.width });
    for (let p = 0; p < 2; p++) if ((hit >> p) & 1) hurt(shot, p, launch.damage, 1, 0);
  }
}
```

- [ ] **Step 6: Complete the roster** (design-verbatim; the block ends with the closing `];` of `ROSTER`):

In `src/game/titles/arcfire/weapons/roster.ts`, replace

```ts
];

/** Roster index by weapon id. */
```

with

```ts
  {
    id: "quake", name: "Quake", tag: "QUAKE", tier: 2, power: 55,
    launch: { kind: "shell" },
    stage: { on: "impact", effects: [{ quake: { reach: 260, damage: 55, furrow: 6 } }] },
  },
  {
    id: "aftershock", name: "Aftershock", tag: "QUAKE", tier: 3, power: 80,
    launch: { kind: "shell" },
    stage: { on: "impact", effects: [{ blast: blast(40, 50) }, { quake: { reach: 200, damage: 35, furrow: 4 } }] },
  },
];

/** Roster index by weapon id. */
```

- [ ] **Step 7: Add the standard settings** to `src/game/titles/arcfire/state.ts`. After this the file is byte-identical to the design's `state.ts`:

In `src/game/titles/arcfire/state.ts`, insert directly after

```ts
  rosterSize: number; // the pool is drawn from ROSTER[0, rosterSize): pins a match to a roster prefix, so appends never move it
}
```

these lines:

```ts

/** The daily challenge and default free play (spec §2): 10 weapons each from a 24-weapon pool. */
export const STANDARD_SETTINGS: MatchSettings = Object.freeze({
  weaponsEach: 10,
  poolSize: 24,
  wind: false,
  guaranteeTags: Object.freeze(["BLAST", "SPLIT", "DIRT"] as Tag[]),
  rosterSize: 32, // a literal, NOT ROSTER.length: a roster append must be a deliberate settings + simVersion change
});

/** Short free play: 5 each from a pool of 12. */
export const SHORT_SETTINGS: MatchSettings = Object.freeze({ ...STANDARD_SETTINGS, weaponsEach: 5, poolSize: 12 });
```

- [ ] **Step 8: Run the suite: only the corpus may fail, on its new keys**

Run: `npx vitest run src/game/titles/arcfire`
Expected: FAIL, exactly 1 test: `corpus.test.ts`, whose case list has 483 fresh ids against 453 pinned.

- [ ] **Step 9: Complete the corpus — the Revision 2 transcription check**

Run: `UPDATE_ARCFIRE_CORPUS=add npx vitest run src/game/titles/arcfire/corpus.test.ts`
Expected: PASS (+30 keys). The `quake emits quake` gate is live; every gate in the corpus test is now on.

Run: `node -e "const c=require('./src/game/titles/arcfire/corpus.golden.json');console.log(c.digest,Object.keys(c.cases).length,Object.keys(c.defs).length)"`
Expected, exactly: `a7100140 483 32`

If the digest differs, **stop**: some weapon file differs from the design. The corpus test names no moved case here, because every key is new. Compare the per-task digests in the pin ledger to find the first task whose weapons differ.

- [ ] **Step 10: Run the Arcfire gate, types and the full suite**

Run: `npx vitest run src/game/titles/arcfire src/game/sim/purity.test.ts`
Expected: PASS: 17 files, 186 tests.

Run: `npx tsc --noEmit`
Expected: exit 0.

Run: `npm test`
Expected: all pass.

- [ ] **Step 11: Run the cross-engine gate**

Run: `npm run test:e2e:cross-engine -- --grep-invert firefox`
Expected: exit 0, `2 passed`. Chromium and WebKit reproduce `5167b43d`, `389a1340` and `a7100140` (Firefox runs in CI).

- [ ] **Step 12: Commit**

```bash
git add src/game/titles/arcfire/weapons/primitives.ts src/game/titles/arcfire/weapons/roster.ts src/game/titles/arcfire/state.ts src/game/titles/arcfire/weapons/roster.test.ts src/game/titles/arcfire/weapons/primitives.test.ts src/game/titles/arcfire/weapons/validate.test.ts src/game/titles/arcfire/corpus.golden.json
git commit -m "feat(arcfire): quake (never hurts the shooter, owner D3); Quake, Aftershock (30-31); STANDARD_SETTINGS / SHORT_SETTINGS; the 32-weapon roster" -m "Corpus complete: a7100140 (483 cases, 32 definition digests); no existing key moved. Pins unchanged (389a1340, 8d7dc831)." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

# Part C — Pins, performance and hand-off (Task 14)

### Task 14: The full-roster golden, the bundled perf test, the cross-engine gate, the final checks

**Files:**
- Modify: `src/game/titles/arcfire/determinism.test.ts` (one import edit + the appended full-roster golden, design-verbatim)
- Create: `src/game/titles/arcfire/determinism.full.golden.json` (generated by the test, never hand-written)
- Create: `src/game/test/arcfire/perf.entry.ts` (design-verbatim)
- Create: `src/game/titles/arcfire/perf.test.ts` (design-verbatim)
- Modify: `e2e/cross-engine-determinism.spec.ts` (the full-roster golden joins `PINS`)
- `docs/superpowers/specs/2026-09-22-arcfire-design.md` is unchanged: the Pre-flight commit already synced it (Step 13 confirms).
- `src/game/test/cross-engine/harness.entry.ts` is unchanged: `runArcfireGolden` already replays any `ArcfireReplay`, so it serves both goldens.

**Interfaces:**
- Consumes: the whole roster; `createMatch`, `applyPick`, `applyTurn`, `cloneMatch`, `replayMatch`; `CORPUS_SEED` / `CORPUS_SETTINGS`; esbuild.
- Produces:
  - The full-roster golden: seed `20260927` and daily-challenge settings with a **literal** `rosterSize: 32`, so a later append can never move it. It pins `3f614265`, scores `[359, 448]`, winner 1, 40 commands (20 picks, 20 shots), with all 12 tags fired.
  - `measure(now: () => number): number[]` (`perf.entry.ts`): each roster weapon's mean `resolveTurn` in ms, bundled.
  - The perf table in the commit body, for 2B's hand-off. The 2B hand-off itself is already in the spec's §9.1 (Pre-flight).

**Why bundle the perf test:** timing the sim inside Vitest inflates it 4–5×, most likely from the module runner's per-call live-binding lookups. Production (the Next bundle, the worker, the server verifier) runs bundled code, so the test bundles the sim with esbuild and runs it as one module. The design measured Pulse at 0.141 ms unbundled against 0.027 ms bundled; this plan's dry run, bundled on the dev machine (Node 24), measured roughly 0.03 ms for Pulse and 0.12 ms for Prism, the slowest. Treat these as approximate.

**What the perf figures measure, and what they don't:**
- The grid is shooter 0 at angles 20–160 × powers 40–100. Every angle above 90 fires away from the opponent, and many of those shots leave the world within a few dozen steps. The per-weapon means therefore understate the toward-the-opponent workload that 2B's AI will run.
- CI runs Node 22 (`.github/workflows/ci.yml`) on slower shared runners, so the headroom under the 0.5 ms ceiling there is smaller than the ~4× the test's comment quotes for the dev machine (a plan review estimated about 3×).
- 2B takes its timing baseline from a Node 22 run of the table (CI, or a local Node 22), not from these dev figures, and re-measures on an aim grid pointed at the opponent (for example angles 20–80 for shooter 0, or both shooters mirrored).

- [ ] **Step 1: Write the full-roster golden test.** First import `cloneMatch`:

In `src/game/titles/arcfire/determinism.test.ts`, replace

```ts
import type { MatchSettings } from "./state";
```

with

```ts
import { cloneMatch, type MatchSettings } from "./state";
```

Then append the design's block (design-verbatim). Every other name it uses is already imported by Plan 1's file:

Append to the end of `src/game/titles/arcfire/determinism.test.ts` (after one blank line):

```ts
// The full-roster golden: the daily-challenge shape (10 each from 24, BLAST/SPLIT/DIRT
// guaranteed) drawn from all 32 weapons. The settings are a LITERAL, frozen with
// rosterSize 32, so a later roster append can't move this pin either.
const FULL_FIXTURE = join("src/game/titles/arcfire/determinism.full.golden.json");
const FULL_SEED = 20260927;
const FULL_SETTINGS: MatchSettings = { weaponsEach: 10, poolSize: 24, wind: false, guaranteeTags: ["BLAST", "SPLIT", "DIRT"], rosterSize: 32 };

/** Draft the highest free slot; each turn fire the lowest weapon in hand at the best point of a coarse grid (resolved on clones). */
function buildFullReplay(): ArcfireReplay {
  const m = createMatch(FULL_SEED, FULL_SETTINGS);
  const commands: ArcfireCommand[] = [];
  while (m.phase === "draft") {
    let w = m.poolOwner.length - 1;
    while (m.poolOwner[w] !== -1) w--;
    if (!applyPick(m, w).ok) throw new Error("full-golden strategy made an illegal pick");
    commands.push({ k: "pick", w });
  }
  for (let turn = 0; m.phase !== "over"; turn++) {
    const p = m.shooter;
    const w = m.phase === "suddenDeath" ? SUDDEN_DEATH_WEAPON : m.hands[p][0];
    const move: -1 | 0 | 1 = turn === 2 ? (p === 0 ? 1 : -1) : 0;
    let best = -Infinity;
    let angle = 0;
    let power = 0;
    for (let a = 25; a <= 70; a += 5) {
      for (let pw = 40; pw <= 100; pw += 10) {
        const c = cloneMatch(m);
        const aim = p === 0 ? a : 180 - a;
        if (!applyTurn(c, { move, w, angle: aim, power: pw }).ok) throw new Error("full-golden probe was illegal");
        const v = c.scores[p] - m.scores[p] - (c.scores[1 - p] - m.scores[1 - p]);
        if (v > best) {
          best = v;
          angle = aim;
          power = pw;
        }
      }
    }
    if (!applyTurn(m, { move, w, angle, power }).ok) throw new Error(`full-golden strategy made an illegal turn at ${turn}`);
    commands.push({ k: "turn", move, w, angle, power });
  }
  return { seed: FULL_SEED, settings: FULL_SETTINGS, commands };
}

describe("arcfire full-roster golden", () => {
  it("replays the generated full-roster log to its pinned hash", () => {
    const replay = buildFullReplay();
    const result = replayMatch(replay);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Not inert: decisive, both sides scored, a tank moved, and every one of the 12 tags was fired.
    expect(result.state.phase).toBe("over");
    expect([0, 1]).toContain(result.state.winner);
    expect(result.state.scores[0]).toBeGreaterThan(0);
    expect(result.state.scores[1]).toBeGreaterThan(0);
    expect(replay.commands.some((c) => c.k === "turn" && c.move !== 0)).toBe(true);
    expect(new Set(replay.commands.flatMap((c) => (c.k === "turn" ? [ROSTER[c.w].tag] : [])))).toEqual(new Set(ROSTER.map((w) => w.tag)));
    if (process.env.UPDATE_ARCFIRE_GOLDEN === "1") {
      const fixture = { replay, hash: result.hash, scores: Array.from(result.state.scores), winner: result.state.winner };
      writeFileSync(FULL_FIXTURE, JSON.stringify(fixture, null, 2) + "\n");
    }
    expect(existsSync(FULL_FIXTURE), "create it once with UPDATE_ARCFIRE_GOLDEN=1").toBe(true);
    const golden = JSON.parse(readFileSync(FULL_FIXTURE, "utf8"));
    expect(replay).toEqual(golden.replay);
    expect(result.hash).toBe(golden.hash);
    expect(Array.from(result.state.scores)).toEqual(golden.scores);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/game/titles/arcfire/determinism.test.ts`
Expected: FAIL, exactly 1 test: `arcfire full-roster golden > replays the generated full-roster log to its pinned hash`, with `create it once with UPDATE_ARCFIRE_GOLDEN=1: expected false to be true`. Its inertness checks pass first: decisive, both sides scored, a move, and all 12 tags fired. The Plan 1 golden passes.

- [ ] **Step 3: Generate the fixture once**

Run: `UPDATE_ARCFIRE_GOLDEN=1 npx vitest run src/game/titles/arcfire/determinism.test.ts`
Expected: PASS (2 tests). `determinism.full.golden.json` is written, and `determinism.golden.json` is rewritten byte-identical.

Run: `git status --short src/game/titles/arcfire`
Expected: exactly `?? src/game/titles/arcfire/determinism.full.golden.json` for the fixtures (plus the modified test file). `determinism.golden.json` is **not** listed: `389a1340` did not move.

- [ ] **Step 4: Transcription check — the Revision 2 full-roster golden**

Run: `node -e "const g=require('./src/game/titles/arcfire/determinism.full.golden.json');console.log(g.hash,JSON.stringify(g.scores),g.winner,g.replay.commands.length)"`
Expected, exactly: `3f614265 [359,448] 1 40`

If anything differs, **stop and do not commit.** The Arcfire code differs from this plan somewhere, since the corpus alone cannot see a whole match. Delete the fixture, find the divergence, and redo Step 3.

- [ ] **Step 5: Run it again without the variable**

Run: `npx vitest run src/game/titles/arcfire/determinism.test.ts`
Expected: PASS (2 tests; about 0.4 s for the full golden).

- [ ] **Step 6: Create the bundled perf entry** `src/game/test/arcfire/perf.entry.ts` (design-verbatim):

```ts
// src/game/test/arcfire/perf.entry.ts
//
// Bundled by perf.test.ts with esbuild and run as ONE module, the way the
// worker and the server verifier run the sim. (Run through vitest's module
// runner, the same code measured 4-5x slower than bundled — most likely its
// per-call live-binding lookups across modules — which would make a timing budget
// meaningless.) Returns, per roster weapon, the mean ms of one resolveTurn: the
// best of three timed passes after a warm-up pass. A busy CI neighbour can only
// slow a pass down, so the minimum is the least noisy estimate.
import { createMatch } from "@/game/titles/arcfire/match";
import { cloneMatch, type MatchState } from "@/game/titles/arcfire/state";
import { resolveTurn } from "@/game/titles/arcfire/resolve";
import { ROSTER } from "@/game/titles/arcfire/weapons/roster";
import { CORPUS_SEED, CORPUS_SETTINGS } from "./corpus";

export function measure(now: () => number): number[] {
  const base = createMatch(CORPUS_SEED, CORPUS_SETTINGS);
  base.phase = "battle";
  base.shooter = 0;
  const aims: [number, number][] = [];
  for (let a = 20; a <= 160; a += 10) for (let p = 40; p <= 100; p += 15) aims.push([a, p]);
  const out: number[] = ROSTER.map(() => Infinity);
  for (let pass = 0; pass < 4; pass++) { // pass 0 warms the JIT; passes 1-3 keep each weapon's best mean
    for (let w = 0; w < ROSTER.length; w++) {
      const clones: MatchState[] = aims.map(() => cloneMatch(base));
      const t0 = now();
      for (let i = 0; i < aims.length; i++) resolveTurn(clones[i], { move: 0, weapon: w, angle: aims[i][0], power: aims[i][1] });
      const ms = (now() - t0) / aims.length;
      if (pass > 0 && ms < out[w]) out[w] = ms;
    }
  }
  return out;
}
```

- [ ] **Step 7: Create the perf test** `src/game/titles/arcfire/perf.test.ts` (design-verbatim):

```ts
// src/game/titles/arcfire/perf.test.ts
//
// Spec §5: a single-shell resolveTurn averages <= 0.2 ms in Node. The sim is
// bundled with esbuild and run as one module (perf.entry.ts explains why);
// every weapon must also stay <= 0.5 ms (about 4x the slowest measured,
// Prism's three 1,200 px beams, for CI noise). Each figure is a best of
// three after a warm-up, so a shared runner has to slow all three passes to
// fail it. The table is printed for the plan's hand-off notes.
import { it, expect } from "vitest";
import { resolve } from "node:path";
import { build } from "esbuild";
import { ROSTER } from "./weapons/roster";

it("resolveTurn stays inside the spec §5 budget", async () => {
  const out = await build({
    entryPoints: [resolve("src/game/test/arcfire/perf.entry.ts")],
    bundle: true, format: "cjs", platform: "node", write: false, tsconfig: "tsconfig.json",
  });
  const mod: { exports: { measure?: (now: () => number) => number[] } } = { exports: {} };
  new Function("module", "exports", out.outputFiles[0].text)(mod, mod.exports);
  const ms = mod.exports.measure!(() => Number(process.hrtime.bigint()) / 1e6);
  console.log(ROSTER.map((w, i) => `${w.id.padEnd(11)} ${ms[i].toFixed(4)} ms`).join("\n"));
  expect(ms[0]).toBeLessThanOrEqual(0.2); // Pulse
  for (const v of ms) expect(v).toBeLessThanOrEqual(0.5);
}, 60000);
```

- [ ] **Step 8: Run it**

Run: `npx vitest run src/game/titles/arcfire/perf.test.ts --reporter=verbose`
Expected:
- PASS, printing 32 lines, one per roster weapon in index order, each `<id padded to 11> <ms to 4 places> ms` (for example `pulse       0.0263 ms`).
- Pulse must be ≤ 0.2 ms, the spec §5 budget, and every weapon ≤ 0.5 ms.
- The dry run measured roughly 0.03 ms for Pulse and 0.12 ms for the slowest, Prism (three 1,200 px beams), on the dev machine (Node 24); about 0.9 s in total. Your figures will differ; only the two ceilings are checked.
- Keep the 32 printed lines: Step 12's commit carries them for 2B's hand-off. They are dev-machine figures on a grid that partly aims away from the opponent (see "What the perf figures measure" above), so 2B's baseline comes from a Node 22 run.

If a busy machine fails it, re-run once. A real regression slows all three timed passes.

- [ ] **Step 9: Add the full-roster golden to the cross-engine gate** (three edits to `e2e/cross-engine-determinism.spec.ts`):

In `e2e/cross-engine-determinism.spec.ts`, replace

```ts
// TD's golden, Arcfire's golden and the Arcfire corpus digest. Catches the
```

with

```ts
// TD's golden, Arcfire's two goldens and the Arcfire corpus digest. Catches the
```

In `e2e/cross-engine-determinism.spec.ts`, insert directly after

```ts
const arcfireGolden = readJson<{ replay: unknown; hash: string }>("src/game/titles/arcfire/determinism.golden.json");
```

these lines:

```ts
const arcfireFullGolden = readJson<{ replay: unknown; hash: string }>("src/game/titles/arcfire/determinism.full.golden.json");
```

In `e2e/cross-engine-determinism.spec.ts`, insert directly after

```ts
    run: (page) => page.evaluate((replay) => window.runArcfireGolden(replay as never), arcfireGolden.replay),
  },
```

these lines:

```ts
  {
    label: "Arcfire full-roster golden",
    expected: arcfireFullGolden.hash,
    run: (page) => page.evaluate((replay) => window.runArcfireGolden(replay as never), arcfireFullGolden.replay),
  },
```

- [ ] **Step 10: Run the cross-engine gate**

Run: `npm run test:e2e:cross-engine -- --grep-invert firefox`
Expected: exit 0, `2 passed`.
- The Chromium and WebKit tests pass: each reproduces all four pins, the Circle TD golden `5167b43d`, the Arcfire golden `389a1340`, the full-roster golden `3f614265` and the corpus digest `a7100140`.
- Firefox is left out locally (`spawn UNKNOWN` on this machine); CI's `browser-smokes` job runs it.
- Any failure or mismatch is real: stop.

- [ ] **Step 11: Run the final code verification**

Run: `npm test`
Expected: all pass: 58 test files passed and 1 skipped; 441 tests passed and 10 skipped.

Run: `npx vitest run src/game/titles/arcfire src/game/sim/purity.test.ts`
Expected: PASS: 18 files, 188 tests.

Run: `npx tsc --noEmit`
Expected: exit 0.

Run: `git status --short src/game/test/determinism.golden.json`
Expected: no output. The Circle TD golden `5167b43d` is untouched.

Run: `npm run build`
Expected: the Next.js build succeeds. 2A changes no app code, so this is a regression check. Never use `next dev`.

- [ ] **Step 12: Commit the code**

```bash
git add src/game/titles/arcfire/determinism.test.ts src/game/titles/arcfire/determinism.full.golden.json src/game/test/arcfire/perf.entry.ts src/game/titles/arcfire/perf.test.ts e2e/cross-engine-determinism.spec.ts
git status --short
```

Expected: only those five paths are staged. `test-results/` and `.next/` are gitignored. The only other line allowed is ` M docs/superpowers/plans/2026-09-23-arcfire-plan-2a.md`, if you tick this plan's checkboxes (not staged).

Commit. The third `-m` is the perf table: replace the `<…>` placeholder with the 32 lines Step 8 printed, pasted verbatim inside the quotes (one quoted argument, so it is still one command). If the worktree guard refuses a multi-line argument, join the 32 lines with `; ` instead.

```bash
git commit -m "test(arcfire): full-roster golden 3f614265 [359, 448], bundled perf test, cross-engine full pin" -m "Full-roster golden: seed 20260927, daily-challenge settings with rosterSize 32 (a literal), winner 1, 40 commands, all 12 tags fired. Chromium and WebKit reproduce 5167b43d, 389a1340, 3f614265 and a7100140 (Firefox in CI)." -m "Perf, bundled, best of three, mean ms per resolveTurn (dev machine; the grid partly aims away from the opponent, so 2B re-baselines on Node 22): <the 32 lines printed by Step 8>" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 13: Confirm the spec needs no further sync**

The spec was synced to the validated design and D1–D6 before execution, and the Pre-flight commit holds that sync (§1.1 layout, §2 draft settings, §3.1 terrain edits, §3.2 floor, volleys and caps, §3.3 exact damage, §3.4 `hashMatch` and the Timeline, §4.1 the implemented types and rules, §4.2 roster indices and values, §8 testing, §9 the 2A/2B split and §9.1 the closed carry-forwards and the 2B hand-off). Every pin reproduced, so the code matches it, and no step edits it.

Run: `git log --oneline -1 -- docs/superpowers/specs/2026-09-22-arcfire-design.md`
Expected: the Pre-flight commit, `docs(arcfire): Plan 2A — weapons; sync spec to the validated design and owner decisions`.

Run: `git status --short`
Expected: no output. The one line allowed is ` M docs/superpowers/plans/2026-09-23-arcfire-plan-2a.md`, if you ticked this plan's checkboxes.

If any task had to depart from the spec (it cannot without moving a pin), stop and report it to the controller rather than editing the spec here.

---

## Plan 2A done — hand-off checks

- `git log --oneline 2f9e6ba..HEAD` shows 16 commits: the Pre-flight docs commit (this plan and the synced spec), then 15 task commits, 2 for Task 2 and 1 for each other task. Nothing is pushed.
- The pins, all in Node; the goldens and the corpus also in Chromium and WebKit (Firefox in CI):
  - Circle TD golden `5167b43d`: unchanged;
  - Arcfire golden `389a1340`, scores `[31, 83]`;
  - windless `8d7dc831`, scores `[36, 24]`;
  - corpus `a7100140`, 483 cases, 32 definition digests;
  - full-roster golden `3f614265`, scores `[359, 448]`.
- Every sim file equals the design addendum's final blocks. `ARCFIRE_SIM_VERSION` is still 1.
- **Handed to Plan 2B** (recorded in the spec's §9.1):
  - `resolveTurnPoints(m, input)` returns the same state and points with no Timeline. `resolveWeapon(m, def, input, record)` fires any definition: the AI's probe shell and the draft preview.
  - Weapons consume no RNG (tested). A candidate's outcome is a pure function of the state and the command.
  - Beams ignore power and read the angle on the beam dial: `beamDir(shooter, angle)` is exported from `weapons/primitives.ts`, 90 is level at the opponent for both players, and a mirrored aim grid covers beams unchanged (beams are mirror-exact, tested). From spawn, 2–3 of Lancer's 181 angles hit on every blind-grid board.
  - Shells are **not** exactly side-symmetric: pixels are floored (`floorPx`), and floored cells don't map onto themselves under `x → 1199 − x`, so shells mirror only to within a pixel. For shells a mirrored aim grid is an approximation; evaluate both sides where it matters.
  - Homing is at the spec numbers; the harness's first run is where a lock radius or turn budget would be judged.
  - The static cost bounds are `maxShells(def)` ≤ 13 and `maxTurnSteps(def)` ≤ 3,600 for the roster.
  - Timing: bundle the sim before timing it (`perf.test.ts` shows how), including the < 5 s daily-verification test, and add `copyMatchInto(dst, src)`, which can skip `spans`.
  - The perf table in Task 14's commit body is from the dev machine (Node 24) on a grid that partly aims away from the opponent, so it understates the AI's toward-the-opponent workload. CI runs Node 22: take the 2B baseline from a Node 22 run, on a grid aimed at the opponent.
  - Gate the quiet path's remaining allocations (K12) before the AI's inner loop multiplies them: the walk paths, `split`'s `children`, the per-trigger objects, `settle`'s heights copy and `carveCapsule`'s `half` table. The parity test proves such a change inert.
  - The balance harness rewrites the `power` placeholders (T1 30, T2 55, T3 80, DIRT 25) and judges each weapon against its tier band.
- **Picked up by Plan 3:** the HUD's beam needle along `beamDir` with the elevation readout (`angle − 90` for player 0, `90 − angle` for player 1); playing the Timeline back at `step + lag`, animating over `dur`; the pre-settle heightfield; negative-y drawing for very tall builds (K5).
