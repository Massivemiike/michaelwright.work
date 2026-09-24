# Arcfire — Design Spec (Sub-project 1: the core game)

**Status:** Approved design (brainstorm 2026-09-22). **Slug:** `arcfire` · **Route:** `/games/arcfire`
**Genre:** turn-based artillery, 1v1, in the Scorched Earth / Pocket Tanks lineage. The mechanics are genre conventions; the name, weapon set, art, and code are all original. "Pocket Tanks" is Blitwise's live commercial product, so nothing of theirs (name, weapon names, art) is used.

## Goal

Ship an original, polished WebGPU artillery game on the michaelwright.work arcade, next to Circle TD, playable **vs AI** (three difficulties) and **local pass-and-play**, with a **replay-verified daily-challenge leaderboard** on the existing Supabase database. It runs on desktop and on phones in landscape.

## Scope

**In (sub-project 1):** deterministic sim (terrain, ballistics, tanks, draft, scoring), a 32-weapon roster built from data-driven primitives, a search-based AI with three tiers, both renderers (WebGPU + Canvas2D fallback), the Deck+ HUD, the draft screen, the full match flow, sound, resume, the daily-challenge leaderboard, and the engine generalization needed to host a second title.

**Out, with the design kept ready for them:**
- **Sub-project 2 — online PvP.** Lobby/invites, turn relay, and disconnect handling. The command log in this spec *is* the future wire format; turns are lockstep-ready; there is no hidden information; a per-turn state hash is exposed for desync detection.
- **Sub-project 3 — PvP rankings (Elo).** Needs online play.
- Textured/illustrated art, music, and weapons beyond the 32.

## Decisions log (from the brainstorm)

| Topic | Decision |
|---|---|
| Online PvP | Fast-follow: sub-project 2, right after this one |
| Format | Pocket Tanks-style: 1v1, weapon draft, damage = points, highest total wins, limited moves |
| Devices | Desktop + mobile, landscape; touch drag-to-aim + fine-tuners; mouse + keyboard |
| Weapon roster | Big: 32 weapons at launch, composed from primitives |
| Terrain | Column terrain with collapsing dirt (the persistent state is a heightfield) |
| Sim | Deterministic fixed-point on the CPU; WebGPU is for presentation only |
| Battle layout | "Deck+": layout A's labeled command deck plus layout C's best parts; no layout switcher |
| Tanks | Belt-driven. Default **Vanguard**; players may pick **Scout** (with glowing links) or **Wedge** |
| Leaderboard | Same Supabase DB; daily challenge vs Veteran AI; ranked by margin of victory; wins only |
| Name | **Arcfire** (trademark check before launch) |

Design mockups (reference, not normative): `docs/superpowers/specs/2026-09-22-arcfire-mockups/` — `deck-plus.html` (battle screen), `tank-designs.html` (the three tanks), `draft-screen.html` (draft + flow).

---

## 1 · Architecture

### 1.1 Layout in the repo

```
src/game/titles/arcfire/          sim + rules + AI + roster (pure, purity-guarded)
  constants.ts   world size, physics, rules numbers (the one tuning surface)
  terrain.ts     heightfield + in-shot span columns, carve/add/settle
  ballistics.ts  launch + fixed-step integration + swept collision
  weapons/       types.ts (the data model), primitives.ts (effect implementations),
                 validate.ts (static rules + cost bounds), roster.ts (32 WeaponDefs, data only)
  resolve.ts     resolveTurn(state, input) -> timeline (mutates state)
  match.ts       createMatch, applyPick, applyTurn: validation + turn advance
                 (draft -> turns -> sudden death -> over)
  ai/            search.ts, evaluate.ts, draftPick.ts (pure, fixed-point)
  state.ts, replay.ts, hash.ts, title.ts (TitleDef binding)
src/game/runtime/render/arcfire/  presentation (outside the purity guard)
  webgpu/ canvas2d/ tankPrimitives.ts terrainMesh.ts effects.ts
src/game/runtime/audio/           procedural WebAudio SFX
src/app/games/arcfire/            page.tsx + GameClient.tsx (ssr:false dynamic import) + HUD components
src/data/games.data.ts            + arcfire catalog entry
```

### 1.2 Engine generalization (a targeted, behavior-preserving refactor)

Today `src/game/sim/` is labeled generic but is Circle-TD-shaped: `replay.ts` imports Circle TD content, `Command` is `start|place|upgrade|sell`, `state.ts` is creeps/towers, `verify.ts` returns `wave`/`maxTowerLevel`, `engine.ts`'s `RenderSnapshot` is creeps/towers, and `runtime/render/transform.ts` imports Circle TD's `STAGE_W/H`. The refactor:

1. **Move the Circle TD specifics into `src/game/titles/circle-td/`:** `SimState`/`Creeps`/`Towers`, its `Command` + `applyCommand` + replay loop, `hashState`, and `RenderSnapshot`. `src/game/sim/` keeps only `math/*`, `types.ts` (`Fx`), the FNV-1a primitives (`hash.ts`), `title.ts`, `registry.ts`, and a generic `verify.ts`. Circle TD's `SIM_VERSION` now lives in `src/game/titles/circle-td/version.ts`.
2. **Generic title contract** (`sim/title.ts`):
   ```ts
   export interface ReplayInput<Cmd> { seed: number; mode: "daily" | "free"; commands: readonly Cmd[] }
   export interface ReplayOutcome { score: number; stat: number; hash: string }
   export type ReplayRejection = "invalid_command_shape" | "invalid_command" | "not_a_win" | "too_long";
   export interface ReplayLimits { maxTicks: number }
   export interface TitleDef<Cmd = unknown> {
     readonly slug: string;
     readonly simVersion: number;
     replay(input: ReplayInput<Cmd>, limits: ReplayLimits): ReplayOutcome | { rejected: ReplayRejection };
   }
   ```
   Circle TD's binding rejects any command that is not a non-null object or whose tick is not an integer in `[0, limits.maxTicks)` (`invalid_command_shape`), then wraps its existing loop (`score` = score, `stat` = wave). Arcfire's returns `score` = margin, `stat` = the human's points.
3. **Generic `verifyScore`** keeps the version/mode/limits/seed-acceptance checks and delegates the run to `title.replay`, using `title.simVersion` instead of the global `SIM_VERSION`.
4. **`computeFit(pxW, pxH, stageW, stageH)`** takes stage dimensions; each title passes its own.
5. **Regression gate:** Circle TD's determinism golden `5167b43d` is byte-for-byte unchanged, and its behavior (replay/verify/route results, in-browser rendering and hit-testing) is unchanged. Its existing tests were edited only for import paths, the new `verifyScore` contract (`stat` instead of `wave`, no `expectedSimVersion`), and `computeFit`'s stage arguments; every other test change adds a test or an assertion. The refactor lands first, alone, and is verified before any Arcfire code.

### 1.3 The turn contract

`resolveTurn(m, { move, weapon, angle, power }) -> Timeline` is **deterministic** and touches nothing but the `MatchState` it is given. It resolves one whole turn to completion, in place: the optional move, the shot, the settle, and the scoring. It does **no** validation and **no** turn bookkeeping (`weapon` is a roster index).

`applyTurn(m, cmd)` is the checked entry point. It validates the command (phase, integer angle 0–180 and power 0–100, a legal move, and a weapon in the shooter's hand, or Pulse in sudden death), calls `resolveTurn`, removes a battle weapon from the hand, and advances `shotsFired`, the shooter, the phase, and the wind. On an illegal command it returns `invalid_command` and changes nothing. `applyPick(m, poolIndex)` does the same for draft picks.

`replayMatch({ seed, settings, commands })` re-runs a command log from `createMatch` through `applyPick`/`applyTurn` and returns the final state and its `hashMatch`. An illegal command rejects the whole log as `invalid_command` at its index, and so does a malformed log (not an array, a non-object entry, an unknown `k`); `replayMatch` never throws on one. It accepts an unfinished log (resume, §6.5), so a verifier must also require `phase === "over"`. Plan 1's `replayMatch` replays 2-player logs; regenerating the AI's commands arrives with the AI in Plan 2.

`cloneMatch` is the deep copy that AI search and previews resolve against, so the original state is never touched. `createMatch` stores a frozen copy of its settings, which clones share.

`resolveTurn` serves:
- **gameplay**: the renderer plays the `timeline` back at display rate, fully decoupled from the sim;
- **AI search**: the AI calls it on candidate commands;
- **verification**: the server replays the command log;
- **online play later**: both clients call it on the same command.

A match is `seed + mode + settings + ordered commands`. That is the replay format, the leaderboard submission, the local resume blob, and the future online wire format. A vs-AI log holds **only the human's** commands (the AI's picks and shots are regenerated deterministically during replay); a 2-player log holds both players' commands in turn order.

### 1.4 Threads

The sim and AI run in a **Web Worker** (the main thread owns rendering, the HUD, and input), so AI "thinking" never janks the UI on phones. The worker and the server run identical code.

---

## 2 · Rules

- **World:** 1200 × 500 stage px (2.4:1), letterboxed to fit. Margins beyond the world show dimmed, non-playable decorative terrain. Nothing playable is ever cropped.
- **Match:** 1v1. A seeded coin flip decides who **picks first**; the other player **shoots first**.
- **Draft:** a seeded pool of **24** distinct weapons drawn from the 32-weapon roster, with at least one of each of BLAST, SPLIT, and DIRT. Players alternate picks until each holds **10**. (Free play can choose **5** each, with a pool of 12.)
  - These are `STANDARD_SETTINGS` (10 each, pool 24) and `SHORT_SETTINGS` (5 each, pool 12), frozen in `state.ts`. Both guarantee BLAST, SPLIT and DIRT, and both have wind off (free play's toggle turns it on).
  - The pool is drawn from the roster prefix `ROSTER[0, rosterSize)`. `MatchSettings.rosterSize` is validated by `createMatch` (an integer in [`poolSize`, `ROSTER.length`]) and folded into `hashMatch`. Both standard settings carry the literal 32, so a roster append never moves a pinned match; growing the roster is a deliberate settings and `simVersion` change.
- **Turn:** an optional **move** (4 per player per match; ±36 px horizontally, with y following the surface; tank centres stay at least 24 px inside the world edges (`TANK_EDGE_MARGIN`) and can't come closer than 64 px to the other tank), then choose one of your remaining weapons, set **angle** (integer degrees 0–180; 0 = right, 90 = straight up; a beam weapon reads the same angle on the **beam dial**, where 90 is level at the opponent, §4.1) and **power** (integer 0–100), and fire. The **ghost trail** of your previous shot stays visible; there is no trajectory preview.
- **Scoring:** damage dealt to the opponent = points. **Self-damage is awarded to the opponent.** Once all weapons are fired, the higher total wins. **Tie:** sudden death, one Pulse shot each; if still tied, it's a draw.
- **Wind:** off by default. The free-play toggle adds seeded per-turn wind (−40…+40 px/s² horizontal), shown as an arrow and value in the HUD.
- **Tanks:** rest on the surface at their x. They ride settling dirt down; there is no fall damage and no burying (dirt settles beneath tanks, never over them).

---

## 3 · Sim model

All state is integer or Q16.16 fixed-point (`src/game/sim/math/fixed.ts`), randomness comes only from the seeded `mulberry32` (`math/rng.ts`), and aim angles use a **baked** table of Q16.16 cos/sin integer literals for whole degrees 0–180 (`titles/arcfire/aimTable.ts`). Arcfire does not use `math/trig.ts`: that table is built from floating-point sine at load, and engines aren't required to round it identically, so one off-by-one entry could make a browser and the verifier fly different trajectories. There are no floats, no `Math.*` beyond what the purity guard allows, and no host globals.

### 3.1 Terrain

- **Persistent state = heightfield:** `height: Int32Array(1200)`, the surface y per 1-px column (y-down; 500 is the floor).
- **During a shot**, each column may hold several solid **spans** (tunnels, floating dirt): `spans[x] = [top0, bot0, top1, bot1, …]`, capped at 8 per column. Carve (circle, capsule) and add (ball, wall, level) edit spans directly, and projectiles collide with spans exactly. A carve that would make a 9th span drops the top one (Plan 1's rule); an add never loses dirt: a 9th piece is merged into the span below it (or above it, with none below).
- **Settle** runs once, after the whole shot resolves: in every column, floating spans fall and merge onto the span below or the floor, collapsing back to one span, i.e. the heightfield. The timeline records the post-settle heightfield plus each falling span so the renderer can animate the pour; Plan 3 adds the pre-settle heightfield (§3.4).
- **Generation:** seeded rolling hills, integer-only:
  - 9 control points (one every 150 px) drawn from the match RNG in [160, 380];
  - linear interpolation between them;
  - three radius-24 box-blur passes;
  - a clamp to [120, 420];
  - tank spawn columns flattened ±24 px.

  No trig is involved, so every engine produces the same hills.

### 3.2 Ballistics

- **Launch:** `v0 = power × V_UNIT` along the aim angle, where `V_UNIT = 6.84 px/s` per power point (power 100 at 45° ranges ~1.3 × world width). `G = 300 px/s²` downward; wind adds horizontal acceleration.
- **Integration:** a fixed physics step of **1/60 s**, semi-implicit Euler in Q16.16. Each step's movement is swept at ≤ 1 px increments (integer DDA) against terrain spans and tank hitboxes, so nothing tunnels. Pixels are **floored** (`floorPx`): column c is [c, c + 1), so the left world edge is exactly x = 0 and a step crossing it never drops a sample.
- **Volleys:** shell i of a volley flies at `aim + fanOffset(i)`, from −spread/2 to +spread/2, each from its own muzzle, and is **never clamped**: the fan stays symmetric about the aim, and an edge shell may leave below the horizon (Fan aimed at 2° fires at −4°, −1°, 2°, 5° and 8°). Directions outside 0..180 (volley edges, the beam dial, homing turns, the dig clamp) come from the same baked table by exact symmetry (`cosDeg`/`sinDeg`), with no new literals.
- **Bounds:** leaving the left or right world edge = lost (except Ricochet, which reflects). There is no ceiling.
- **Flight caps:** each shell flies at most **1200 of its own steps** (20 s), counted from its launch or spawn with bounce steps included, so a split child gets a full flight; a shell that reaches the cap is lost (`out`). A turn also has two backstops, **4,800 steps** and **64 shells**: at the step backstop everything still flying is lost and armed delays are dropped, and spawns beyond 64 are dropped. Only invalid data can reach them: `weapons/validate.ts` bounds every weapon statically, and the roster's maximum is 3,600 steps and 13 shells (Cascade), which a test enforces.
- **Tank hitbox:** a circle of radius 14 px centered 12 px above the tank's surface point.

### 3.3 Damage

For a blast with radius `R` and damage `D`, where `dx`, `dy` run from the tank's hitbox centre to the blast centre (`damage.ts`):
- `s = √(dx² + dy²)` is the true (real) centre distance, and `d = max(0, s − 14)` is the distance to the hitbox edge (14 is the hitbox radius, `TANK_HIT_R`; 0 if overlapping);
- for `d < R`: linear `⌊D·(R − d) / R⌋`, or quadratic (where specified) `⌊D·(R² − d²) / R²⌋`;
- 0 otherwise.

**Exact distance (decided in Plan 2A).** `s` is irrational in general, so each formula splits into an integer part plus one `isqrt` term, and flooring that term first is exact (`damage.ts` has the proof):
- linear: `D·(R − d) = D·(R + 14) − D·s`, and `⌈D·s⌉` comes from `isqrt(D²·(dx² + dy²))`;
- quadratic: `D·(R² − d²) = D·(R² − s² − 196) + 28·D·s`, and `⌊28·D·s⌋ = isqrt(784·D²·(dx² + dy²))`.

The calculation stays integer-only and engine-exact (every product < 2^53 for validator-legal data), and it equals a BigInt reference for every roster blast over its whole reach. The reach boundary (`s < R + 14`) is Plan 1's. It is never above Plan 1's floored-distance formula, which overstated damage by up to 17 points (Needle), so adopting it only ever lowers a score. A blast with `R ≤ 0` or `D ≤ 0` deals nothing (a divisor guard; the validator rejects such data).

A turn's points are the damage its shot dealt to the opponent. Self-damage from any sub-munition is credited to the opponent (a quake's shockwave never damages its own shooter, §4.1).

### 3.4 State, hashing, timeline

- `MatchState` = the frozen match settings (`weaponsEach`, `poolSize`, `wind`, `guaranteeTags` and, from Plan 2A, `rosterSize`), phase, turn index, whose turn, heightfield, tank x (and derived y), moves left, remaining weapons per player, pool/draft state, scores, wind, RNG state, and the sudden-death flag.
  - `settings.rosterSize` is the only field Plan 2A adds. Weapons add no other state: every effect resolves inside its turn (no lingering fire, no stored timers, no weapon RNG), so a shot leaves only terrain and scores behind, and `hashMatch` and `cloneMatch` stay complete by construction.
- **`hashMatch`:** FNV-1a over every integer field in a canonical order, `settings.rosterSize` included (folded right after `guaranteeTags.length`). It's computed per turn (future desync detection) and at match end (verification and golden tests).
- **Timeline** (presentation only, never hashed; `timeline.ts`, built by `resolve.ts`). The Plan 2A shape:
  - `shooter`, `move {fromX, toX} | null`, `wind`, `weapon` (roster index), and `steps`, the sim steps the shot took (1 for beams);
  - `shells[{angle, parent, start, points}]`, one per shell in creation order:
    - muzzle shells have `parent` −1, `start` 0 and their launch `angle`, which may lie outside 0..180 at a volley's edge;
    - a split child names its `parent`, carries its fan offset as `angle`, and starts at step `start`;
    - `points` is a flat px array `[x0, y0, x1, y1, …]`: point k is at step `start + k`, and the path ends at the shell's terminal event (a `bounce` is mid-path);
  - `events`, in application order (so sorted by step). Plan 1's three kinds gain `lag`: `blast{step, shell, x, y, radius, lag}`, `damage{step, target, amount, lag}`, `out{step, shell, x, y, lag}`. Plan 2A adds one kind per primitive:
    - `bounce{step, shell, x, y, wall}`, `split{step, shell, x, y, children}`, `dud{step, shell, x, y}` (an apex weapon hit something early and has no `early` effects), `fuse{step, shell, x, y, at}` (a delay armed here fires at step `at`);
    - `roll{step, shell, path, dur}`, `dig{step, shell, x0, y0, x1, y1, width, dur}`, `burn{step, shell, x, y, flows, dur}`, `quake{step, shell, x, y, reach, furrow, dur}`;
    - `build{step, shell, shape, x, y, size, width}` (`size` = the ball or level radius or the wall height; `width` = the columns spanned, the first at `x − ⌊width/2⌋`);
    - `beam{step, beam, x0, y0, x1, y1, width}`, all at step 1, from the muzzle along `beamDir` (it may point down);
  - roll, dig, burn and quake resolve instantly in the sim. Their events carry `dur`, the display steps their animation takes at fixed presentation rates, and the blasts, damage and exits they cause carry `lag`, so playback shows an event at `step + lag`. The rates are never simulated or hashed. A `fuse` whose `at` is later than `steps` never fired: the turn backstop dropped it;
  - `settle {heights, falls}`: the post-settle heightfield plus each falling span `{x, top, bottom, fall}`;
  - `points [p0, p1]`: the points this turn awarded to player 0 and player 1.

  Plan 3 adds the pre-settle heightfield and the launch/move events the renderer needs. The Timeline stays presentation-only and unhashed, so these additions don't move a golden.
- **The quiet path:** `resolveTurnPoints(m, input)` resolves the same turn to the same state and points without building the Timeline's paths, events or settle falls; AI search and verification use it. `resolveWeapon(m, def, input, record)` fires any `WeaponDef`, roster entry or not (unit tests, the AI's probe shell, the draft preview). A parity test pins the quiet path to `resolveTurn`, and another pins that no weapon touches the match RNG.

---

## 4 · Weapon system

### 4.1 Primitives (the only weapon code)

```ts
type Launch  = { kind: "shell"; count?: number; spreadDeg?: number; speedPct?: number; gravityPct?: number }
             | { kind: "beam"; count?: number; spreadDeg?: number; length: number; width: number; damage: number };
type Blast   = { radius: number; damage: number; falloff?: "linear" | "quadratic" };
type Split   = { count: number; spreadDeg: number; speedPct: number; from: "up" | "ahead" | "cone"; gapPx?: number; child: Stage };
type Build   = { shape: "ball"; radius: number } | { shape: "wall"; width: number; height: number } | { shape: "level"; radius: number };
type DelayableEffect =
  | { blast: Blast }
  | { roll: { maxDistance: number; then: Blast } }                   // downhill (travel direction on level ground); never climbs
  | { dig: { length: number; width: number; blastEvery?: number; each?: Blast; then?: Blast } } // along travel, never steeper than 30° below level
  | { burn: { flow: number; pool: number; damage: number; split?: boolean } } // flows downhill along the surface
  | { build: Build }
  | { quake: { reach: number; damage: number; furrow: number } };     // horizontal reach; never hurts the shooter
type Effect  = DelayableEffect | { split: Split } | { delay: { steps: number; then: DelayableEffect[] } };
interface Bounce { times: number; restitutionPct: number; blastEach?: Blast; walls?: boolean }
interface Stage { on: "impact" | "apex"; effects: Effect[]; early?: Effect[]; homing?: { degPerStep: number }; bounce?: Bounce }
interface WeaponDef { id: string; name: string; tag: Tag; tier: 1 | 2 | 3; power: number; launch: Launch; stage?: Stage }
```

`tag` ∈ BLAST, VOLLEY, SPLIT, BOUNCE, ROLL, DIG, FIRE, DIRT, BEAM, HOMING, QUAKE, SPECIAL. `power` is a draft score in 1–100, written by the balance harness and used by the draft AI. Adding a weapon means adding a `WeaponDef` plus an SVG glyph for the HUD.

Plan 2A implements this model in `weapons/types.ts`, `weapons/primitives.ts` and `ballistics.ts`. Against the first sketch:
- `bounce` is a `Stage` flight modifier, not an `Effect`: Ricochet reflects in flight, before any impact. `homing` and `bounce` are valid only on impact stages.
- `Split` gains `from` and `gapPx` (the Hailstorm cone and the Barrage line), and `Stage` gains `early` (valid only on apex stages).
- `build` is a discriminated union, so no required size can be missing.
- A delay schedules only `DelayableEffect`s, so it can never create a shell or another delay; every armed delay fires once and adds nothing that waits.
- `stage` is required for a shell launch; a beam has none.

**The rules.**
- **Time and order.** Only shells and delay timers take simulated time. Blast, split, roll, dig, burn, build, quake and beam apply **instantly** at their trigger step, in closed form or one bounded pass. Beams resolve before the first step, at step 1. Then, each step:
  - the delays due fire first, in arming order;
  - then every shell that existed at the start of the step moves once, in creation order;
  - a trigger applies its effects completely, in list order, and its terrain edits are visible at once;
  - children first move on the next step.

  This order is part of the determinism contract.
- **Triggers.** An `impact` stage fires at the first terrain or tank contact that a bounce doesn't consume. An `apex` stage fires on the first step a *rising* shell stops rising (`vy < 0` before the step's gravity, `vy ≥ 0` after it), so a shell launched level or downward never apexes. An apex-stage shell that hits something before its apex applies `early` instead, or is a `dud` without it. Effects see the trigger pixel (the first solid or hitbox pixel on impact), the last free position (children spawn, and roll and burn drop, from there), the velocity, and the tank struck.
- **Spawns.** A spawn point is never tested. A child whose first sample is solid impacts there on its first step, and one spawned off the world is lost. A shell spawned inside a tank's hitbox ignores that tank until a sample leaves it.
- **Blast** is Plan 1's: carve a disc, then damage tank 0 and then tank 1 (§3.3).
- **Split.** Child `i` is offset by the volley rule (`fanOffset`) and spawns at the parent's last free position:
  - `up` (Cascade, Shrapnel): a fan about straight up at the parent's nominal speed × `speedPct`;
  - `ahead` (Hydra, Barrage): the parent's current velocity, rotated by the offset and scaled by `speedPct`;
  - `cone` (Hailstorm): the parent's current velocity **plus** a fan about straight down at nominal speed × `speedPct`, a burst carried by the parent's motion.

  `gapPx` shifts child `i` sideways by `(2i − (count − 1))·gapPx/2`, a horizontal line centred on the parent. Children inherit gravity and feel wind. A nearly flat Barrage (aim within about 5° of the horizon) apexes near the muzzle, and its rear children can fly into the shooter; that is accepted, and a test pins it.
- **Delay** applies its effects at the arming trigger's geometry, `max(1, steps)` steps later, before any shell moves that step. Twin Nova's second blast lands 30 steps after the first, in the same turn.
- **Bounce** reflects a shell off the surface normal and keeps `restitutionPct` of **both** velocity components; the step ends at the last free sample.
  - The normal is minus the centroid of the solid pixels in a **radius-8 disc** (`BOUNCE_PROBE_R`, owner decision 2026-09-23), in exact integers: ≤ 197 probes, no square root. It is exact on flat ground and at 45°, and within 2.3° of the ideal heading on slopes of 1:10 and steeper.
  - `blastEach` detonates at each contact after the reflection.
  - A tank contact always triggers the stage.
  - With `walls: true` (Ricochet) only the side walls reflect.
- **Homing** (owner decision 2026-09-23: the §4.2 numbers, Seeker ≤ 2°/step and Swarm ≤ 1°/step) turns a shell ≤ `degPerStep` whole degrees per step toward the enemy's hitbox centre (fixed at shot start), from its apex on. A shell that never rises never steers, and gravity keeps acting, so a homing shell arcs in.
  - A turn never passes the target, so there is no overshoot or wobble.
  - There is no arctangent: it turns `k = min(degPerStep, ⌊angle to the target⌋)` whole degrees, finding `⌊angle⌋` by comparing tangents with the baked table (`|cross|·cos k < dot·sin k`).
  - There is no lock radius and no turn budget. Plan 2B's balance harness and the owner's playtest tune it. The table can't turn less than 1°/step, so any softening would be a new rule (a lock radius or a turn budget), not a smaller number.
- **Roll** drops to the ground below the last free pixel, then walks **downhill** (the travel direction on level ground). It never climbs: it stops at the first 1 px rise, on entering a tank's hitbox, or at `maxDistance`, and blasts there. A direct tank hit blasts at once, and rolling off a world edge is lost, with no blast.
- **Dig** (owner decision 2026-09-23) tunnels from the impact pixel along the shell's travel direction at impact, **pitch-clamped**:
  - a heading steeper than **30° below level** (`DIG_MAX_PITCH`) is replaced by exactly 30° below level in the same horizontal sense, or toward the opponent when the shell has no horizontal travel;
  - upward and shallower headings are kept;
  - the test is one exact comparison against the baked table, `c·cos 30° > |a|·sin 30°` for a falling heading `(a, c)`, with no arctangent.

  The tunnel ends early at a side edge, at the floor, or inside a tank's hitbox. It carves a capsule of radius `width/2`, blasts `each` every `blastEvery` px before its end, and blasts `then` at its end. A direct tank hit digs nothing and fires only `then`. The clamp keeps a falling shell from tunnelling straight down, but a tunnel blast still reaches a tank only from an impact above that tank's ground (a slope or a ledge) or by tunnelling into its hitbox. On a blind aim grid (20 seeded boards × both shooters), Burrow hits 2.7% of shots for 1.23 points per shot (1.9% and 0.96 unclamped) and Auger 3.3% for 0.46 (2.1% and 0.30), against Pulse's 3.2% and 0.93. The balance harness judges the rest.
- **Burn** walks the same way as a roll, from the ground below the last free pixel: the pool `pool/2` each way, then the flow `flow` px downhill, or both ways with `split`. Each tank whose hitbox a run reaches takes `damage` **once per burn effect**. Fire changes no terrain and never lingers.
- **Build** acts at the trigger pixel:
  - `ball` adds a disc of dirt;
  - `wall` raises each of its `width` columns by `height` on that column's own surface;
  - `level` makes every column within ±`radius` solid exactly from the impact y down.

  Dirt added in a tank's column settles beneath it and lifts it, so a build never buries a tank.
- **Quake** (owner decision 2026-09-23):
  - **Reach.** The shockwave's reach is **horizontal**: `d = max(0, |tank.x − x| − 14)`, the horizontal distance from the trigger column x to the hitbox edge. For `d < reach` it deals `⌊damage·(reach − d)/reach⌋`. It is unblockable and crosses chasms.
  - **The shooter is exempt.** The shockwave damages **only the opponent**; the shooter's own tank is exempt from it, both for Quake and for Aftershock's shockwave. Aftershock's separate impact blast follows the normal blast rules, so it can still hurt the shooter, credited to the opponent (§3.3).
  - **Furrow.** Every column within ±(`reach` − 1), the shooter's included, loses `⌊furrow·(reach − |dx|)/reach⌋` px off its top, and tanks ride it down.
- **Beams** (owner decision 2026-09-23) read the command angle on the **beam dial**: the shell dial turned a quarter turn toward the shooter's facing. Player 0 always stands left of player 1 and tanks never cross, so the facing follows the player index. `beamDir(shooter, angle)`, exported from `weapons/primitives.ts`, is `angle − 90` for player 0 and `angle + 90` for player 1, in aim degrees (0 = right, 90 = up, 270 = down):

  | command angle | player 0 (faces right) | player 1 (faces left) |
  |---|---|---|
  | 0 | straight down | straight up |
  | 45 | 45° below level, toward the opponent | 45° above level, toward the opponent |
  | 90 | **level at the opponent** | **level at the opponent** |
  | 135 | 45° above level, toward the opponent | 45° below level, toward the opponent |
  | 180 | straight up | straight down |

  - **The dial.** The wire angle stays an integer 0..180, and `applyTurn` validates it as before. Each player's usual shell half of the dial (0..90 for player 0, 90..180 for player 1) aims a beam from straight down to level, and the other half from level to straight up. Turning the dial turns a beam the same way it turns a shell, and the mirror of a command is `180 − angle` for shells and beams alike. Beams are mirror-exact (tested): on a mirrored board, the mirrored beam command gives the mirrored outcome. Shells mirror only to within a pixel (`floorPx`: floored cells don't map onto themselves under `x → 1199 − x`), so for shells a mirrored aim grid is an approximation.
  - **HUD and AI.** Plan 3's HUD draws a beam weapon's aim needle along `beamDir(shooter, angle)`, not along the shell angle. It shows the elevation toward the opponent: `angle − 90` for player 0, `90 − angle` for player 1 (negative = below level). Plan 2B's AI calls the same function. Beams ignore power, so the AI's grid can drop that axis.
  - **Flight.** Beam `b` flies along `beamDir(shooter, angle + fanOffset(b))`: a straight line, `length` px long, from that direction's muzzle. It ignores power, gravity and wind, and passes through terrain and tanks. It stops at the side edges and at the floor; there is no ceiling.
  - **Effect.** It carves a capsule of radius `width/2` along its length. Each tank whose hitbox it passes within `width/2` of takes `damage` once.
  - **No self-hit.** Width ≤ 12 and the muzzle stands ≥ 20.8 px from the hitbox centre in every direction, so a beam can never touch its own tank, whatever its direction.
- **Weapons consume no RNG**, so a candidate shot's outcome depends only on the state and the command.
- **The validator.** `weapons/validate.ts` checks every definition statically: integer ranges that keep every product below 2^53 and every data-fed divisor ≥ 1, stage nesting ≤ 4 (which also stops a cyclic definition), where `early`, `homing` and `bounce` may appear, and the static bounds `maxShells(def)` and `maxTurnSteps(def)` (§3.2). The roster test requires every entry to pass. Each data-fed divisor also has a runtime guard, so degenerate definitions (zeros, count 0, a cyclic stage) resolve without throwing.

### 4.2 Roster (32; initial parameters, which the balance harness tunes)

The `#` column is display order. A weapon's **roster index**, which turn commands use on the wire, is append-only: never reorder or delete an entry.
- Plan 1's roster indices are `0 pulse, 1 pulse2, 2 nova, 3 needle, 4 crater, 5 triad, 6 fan, 7 railshot`.
- Plan 2A appends the other 24 in this table's display order: `8 twinnova, 9 cascade, 10 hydra, 11 hailstorm, 12 shrapnel, 13 barrage, 14 skipper, 15 pinball, 16 ricochet, 17 tumbler, 18 juggernaut, 19 burrow, 20 auger, 21 inferno, 22 wildfire, 23 rampart, 24 bastion, 25 leveler, 26 lancer, 27 prism, 28 seeker, 29 swarm, 30 quake, 31 aftershock`. So #6 Twin Nova is index 8, and #9–#31 are indices 9–31.
- Where the first draft of this table left a number open, the row shows Plan 2A's initial choice. Every `power` is a placeholder until the balance harness writes it; the appended weapons start at 30 (tier 1), 55 (tier 2), 80 (tier 3) and 25 (DIRT).

| # | Name | Tag | Tier | Behavior (radius px / damage) |
|---|---|---|---|---|
| 1 | Pulse | BLAST | 1 | impact blast 28 / 40 |
| 2 | Pulse II | BLAST | 2 | impact blast 40 / 60 |
| 3 | Nova | BLAST | 3 | impact blast 72 / 100, deep crater |
| 4 | Needle | BLAST | 2 | speed 115%; blast 10 / 110, quadratic falloff (rewards precision) |
| 5 | Crater | BLAST | 1 | blast 90 / 25; terrain shaping |
| 6 | Twin Nova | BLAST | 3 | blast 50 / 55, then after 30 steps 70 / 60 at the same point |
| 7 | Triad | VOLLEY | 1 | 3 shells, 6° spread; each 24 / 24 |
| 8 | Fan | VOLLEY | 2 | 5 shells, 12° spread; each 20 / 18 |
| 9 | Cascade | SPLIT | 3 | impact 20 / 15 → 3 children (50°, 40% speed), each 18 / 15 → 3 grandchildren (50°, 40%), each 14 / 10 |
| 10 | Hydra | SPLIT | 3 | at apex, 5 heavies (40°, 100% of the apex speed); each 26 / 30; early (a hit before the apex): one 26 / 30 blast |
| 11 | Hailstorm | SPLIT | 2 | at apex, 9 small shells falling in a 30° cone (50% speed, carried by the parent's motion); each 14 / 12; early: one 14 / 12 blast |
| 12 | Shrapnel | SPLIT | 2 | impact 24 / 20 → 6 low fragments (160°, 35% speed); each 10 / 8 |
| 13 | Barrage | SPLIT | 2 | at apex, 6 shells dropping in a line 30 px apart (100%, with the parent's velocity, centred on it); each 20 / 18; early: one 20 / 18 blast |
| 14 | Skipper | BOUNCE | 2 | 3 bounces (55%), blast each 22 / 20; final 26 / 24 |
| 15 | Pinball | BOUNCE | 2 | 6 bounces (80%); final 36 / 55 |
| 16 | Ricochet | BOUNCE | 1 | reflects off the world's side walls (2×, 100%); blast 30 / 40 |
| 17 | Tumbler | ROLL | 1 | rolls ≤ 160 px; blast 30 / 40 |
| 18 | Juggernaut | ROLL | 3 | rolls ≤ 300 px; blast 60 / 85 |
| 19 | Burrow | DIG | 2 | tunnels 90 px (width 14) along travel, never steeper than 30° below level; blast 34 / 55 |
| 20 | Auger | DIG | 2 | tunnels 160 px (width 14) along travel, never steeper than 30° below level, blasting every 40 px and at the end, each 18 / 16 |
| 21 | Inferno | FIRE | 3 | napalm pool 30 px + flow ≤ 220 px downhill; 70 to any tank it touches |
| 22 | Wildfire | FIRE | 2 | two flows in opposite directions ≤ 140 px (no pool); 45 to any tank they touch, once |
| 23 | Rampart | DIRT | 1 | builds a wall 36 × 80 px |
| 24 | Bastion | DIRT | 1 | builds a dirt ball, radius 48 |
| 25 | Leveler | DIRT | 1 | flattens radius 80 to the impact height |
| 26 | Lancer | BEAM | 2 | beam **1200** × 8 on the beam dial (§4.1: 90 = level at the opponent; can aim down); 60 to an intersected tank; carves a line; ignores power and gravity |
| 27 | Prism | BEAM | 3 | 3 beams (8° spread) **1200** × 6 on the beam dial; 35 each |
| 28 | Seeker | HOMING | 2 | after apex, steers ≤ 2°/step toward the enemy (no lock radius, no turn budget); blast 32 / 50 |
| 29 | Swarm | HOMING | 3 | 5 shells (14°), after apex ≤ 1°/step each; each 16 / 20 |
| 30 | Quake | QUAKE | 2 | shockwave ±260 px, measured horizontally to the hitbox edge (unblockable; crosses chasms); 55 at distance 0, linear falloff; 6 px furrow; never hurts the shooter |
| 31 | Aftershock | QUAKE | 3 | blast 40 / 50 + shockwave ±200 px, 35; 4 px furrow; the shockwave never hurts the shooter (the blast can) |
| 32 | Railshot | SPECIAL | 2 | speed 180%, gravity 40%; blast 18 / 75 |

### 4.3 Balance harness

Behind `BALANCE_SWEEP=1` (the same pattern as Circle TD's balance sweep), deterministic **Ace-vs-Ace** matches run across 400 seeds. Per weapon, the harness records mean points per shot, variance, pick rate, and win-rate contribution. It **fails** if any weapon's mean falls outside its tier band (T1: 15–40, T2: 30–60, T3: 50–90 points/shot) or if any weapon's win-rate contribution exceeds +12%. It writes each weapon's `power` score back into the roster. DIRT weapons are judged by win-rate contribution only.

---

## 5 · AI opponent

- **Pure and fixed-point, under the purity guard.** The server must reproduce every decision bit-for-bit, so all evaluation is integer math, noise comes from the match RNG, and ties break by candidate order.
- **Search:** (1) a coarse **probe** with a single cheap shell over an angle × power grid finds aims that land near the enemy; (2) around the best probe aims, each remaining weapon is fully resolved with `resolveTurn`; (3) while moves remain, the best shot is re-evaluated from the left and right positions.
- **Evaluation:** `points to the enemy − points gifted by self-damage`, plus tier heuristics. Ace saves tier-3 weapons unless their expected value beats the best alternative by ≥ 20%, and uses DIRT when the enemy's best reply would score ≥ 60.
- **Tiers** (budgets are **fixed sim counts**, never wall-clock; noise is applied to the chosen angle/power as a seeded sum of 3 uniform integers):

| Tier | Probe grid | Refine | Budget (sims/turn) | Aim noise | Moves | Weapon choice |
|---|---|---|---|---|---|---|
| Rookie | 5° × 10 power | none | 300 | ±6° / ±8 | never | random among the top 4 |
| Veteran | 2° × 4 power | ±2° × ±4 | 1,500 | ±2° / ±3 | when the best shot is < 25 points | best by evaluation |
| Ace | 1° × 2 power | ±1° × ±2 | 4,000 | ±1° / ±1 | always considered | evaluation + sequencing heuristics |

- **Draft AI:** picks by roster `power`. Rookie picks randomly among the top 8 available, Veteran among the top 3, and Ace takes the best.
- **Performance target:** single-shell `resolveTurn` averages ≤ 0.2 ms in Node, and verifying a full daily-challenge match (10 Veteran turns + 10 draft picks) completes in < 5 s on CI hardware, which is enforced by a test.

---

## 6 · Presentation & UX

### 6.1 Battle screen: "Deck+" (one layout; `deck-plus.html`)

- **Battlefield** (~70% of the height): the rendered world, letterboxed. It carries floating **score pills** (you in red, opponent in blue), the **turn pill** (`TURN 7 / 20`), your previous shot's **ghost trail**, and the **drag-to-aim** vector (drag from your tank: direction = angle, length = power) with an `angle · power` bubble.
- **Command deck** (~30%, DOM, design tokens):
  - Row 1: the **weapon carousel** (your 10 drafted weapons; used ones dimmed and struck through; tap to select) and a **weapon info** block (name + one-line description).
  - Row 2: labeled **ANGLE ±** and **POWER ±**, **MOVE ◀ pips ▶**, a "or drag from your tank to aim" hint, and a big **FIRE**.
- Drag and ± are two views of the same value; either one updates the other.
- **Pass-and-play:** a turn banner ("Player 2's turn") appears between turns.

### 6.2 Tanks (`tank-designs.html`)

- Three **belt-driven** designs. Each has a continuous track looping a toothed drive sprocket, road wheels, and an idler; a hull; a turret; and a gun.
  - **Vanguard (default):** a long, low track with four road wheels plus return rollers, a sloped hull, a wide turret, and a long gun with a muzzle brake.
  - **Scout:** a tall, rounded track with three big wheels, a dome turret, and an antenna, with **glowing track links**.
  - **Wedge:** a six-sided track with glowing links, a faceted hull, a hex turret, and a twin-rail gun.
- Each player **picks a tank** before the match. The choice is cosmetic, render-only, and remembered per device. Tank color is the side color: red for player 1, blue for player 2/AI.
- **Animation:** track links travel and wheels spin when a tank moves; tanks tilt to the surface normal; the barrel follows the aim.
- **Implementation:** `tankPrimitives(variant, pose, animPhase) → Primitive[]` is a pure function (rounded rects, circles, lines, link segments placed along the track path) that **both** renderers draw, so the backends can't drift. No atlas is needed.

### 6.3 Renderers (both backends, as in Circle TD)

- **WebGPU:** the terrain heightfield uploads as an `r32float` 1200×1 texture, read with `textureLoad` (no filtering needed). A terrain shader draws the fill, strata bands, and a **glowing surface edge** into the emissive/bloom target. Tanks, projectiles, and effects are instanced primitives through the shared sprite/SDF pipeline and bloom chain. Effects include the blast flash, shockwave ring, debris particles, the dirt-pour animation, flowing fire, the beam glow, trails, and screen shake.
- **Canvas2D:** the same scene drawn with the same `tankPrimitives` and effect data.
- `createRenderer` probes with a silent fallback, and `?renderer=canvas2d` forces the fallback. WGSL keeps `textureSample`/`fwidth` in uniform control flow (the `f6f3787` lesson).

### 6.4 Match flow (`draft-screen.html`)

1. **Mode:** Today's Challenge (ranked, vs Veteran) · Free play vs AI (Rookie / Veteran / Ace) · Local 2-player.
2. **Tank + settings:** each player picks a tank. Free play can also set wind on/off and 5 or 10 weapons each. The Challenge locks its settings (wind off, 10 weapons, Veteran).
3. **Draft:** a 6×4 pool grid (glyph, name, tag; taken cards dim with the owner's color dot); trays on top (opponent) and bottom (you); a **detail panel** with a description, DAMAGE/RADIUS/TRICKY bars, a **live looping preview** (the real `resolveTurn` on a mini terrain), and PICK. On phones the panel becomes a bottom sheet.
4. **Battle:** Deck+.
5. **Results:** final scores, a per-shot breakdown, an **instant replay of the best shot** (deterministic re-resolve), then initials + submit for Challenge wins, plus Rematch.

### 6.5 Around the edges

- **Resume:** the in-progress match (`seed, mode, settings, commands`, a few hundred bytes) auto-saves to `localStorage` (`arcfire:match:v<simVersion>`), with every access in try/catch. On load it re-simulates to the current turn and offers "Resume". A mismatched `simVersion` discards the save.
- **Sound:** procedural WebAudio: fire thump, flight whistle, impact boom + noise, dirt pour, fire crackle. Audio is enabled by the first user gesture, with a mute toggle remembered per device. No music.
- **Controls:** mouse or touch drag-to-aim; keys: ←/→ angle, ↑/↓ power (Shift = ×5), A/D move, Q/E weapon, Space fire.
- **Mobile:** landscape only. In portrait, a "rotate your device" overlay pauses the game. Touch targets are ≥ 44 px, and the carousel scrolls horizontally on small phones.
- **Accessibility:** follows `prefers-reduced-motion` (plus a setting) to disable screen shake and reduce particles; HUD controls get ARIA labels and visible focus; sides are told apart by label + tank design as well as color.

---

## 7 · Leaderboard (same Supabase project)

- **Board:** **Today's Challenge.** Everyone gets the same daily seed (terrain, draft pool, coin flip) against the **Veteran** AI with locked settings. **Score = margin of victory** (your points − AI points); **only wins post** (`not_a_win` is rejected), which satisfies `score >= 0`. The `wave` column holds your raw points as the secondary stat and tiebreaker. Both daily and all-time boards are shown, as in Circle TD.
- **Submission:** `{ gameSlug:"arcfire", simVersion, seed, mode:"daily", initials, commands }`. The commands contain **only the human's** actions:
  ```ts
  type ArcfireCommand =
    | { k: "pick"; w: number }                                                  // pool index 0..23
    | { k: "turn"; move: -1 | 0 | 1; w: number; angle: number; power: number }; // w = roster index
  ```
  There are ≤ 21 commands. The server replays the match and **regenerates every AI pick and shot**; any invalid human command rejects the run (`invalid_command`). Only the server-computed margin and points are stored.
- **Route changes** (`src/app/api/games/scores/route.ts`): `scoreSubmissionSchema` becomes a zod **discriminated union on `gameSlug`** (Circle TD's schema unchanged; an Arcfire command schema added). The verifier already checks each title's own `title.simVersion` (Plan 1 removed the global `expectedSimVersion`). The daily seed comes from a new `dailySeedFor(slug, now)` in `src/lib/dailySeed.ts`: Circle TD keeps its existing `dailySeed(now)` (existing rows are keyed by it), and Arcfire uses `hashToSeed("arcfire:" + utcDateString(now))`. Ranks and boards are already filtered by `game_slug`. Plan 4 must also:
  - use `title.simVersion` (not Circle TD's imported `SIM_VERSION`) for the inserted row's `sim_version` and the rank/board filters;
  - compute `replay_hash` with a per-title command-log digest (e.g. an optional `TitleDef.hashCommands`), because today it uses Circle TD's `hashCommands`;
  - have the Arcfire `TitleDef` binding derive `MatchSettings` from the mode, never from the submission;
  - validate command shape in the zod schema;
  - require `phase === "over"` before scoring.
- **Config:** `LEADERBOARD_PUBLIC` becomes a per-slug map (both `false` until each game's launch gate passes), and `LEADERBOARD_SIM_VERSION` becomes a per-slug mirror with a sync test per title.
- **Migration `0002_arcfire_leaderboard.sql`** (run manually in the Supabase SQL editor, like 0001): add a per-slug daily rank index `(game_slug, sim_version, daily_date, score desc, created_at)` for mode='daily', plus a column comment documenting `wave` as the title-defined secondary stat. No other schema change.
- **Games index:** add an `arcfire` entry to `src/data/games.data.ts`; the daily preview becomes per-slug and shows only when that slug's board is public.
- **Launch gate for the Arcfire board:** the balance sweep passes, the cross-engine determinism gate is green, and an owner playtest freezes `simVersion`. Then flip `LEADERBOARD_PUBLIC.arcfire`.

---

## 8 · Testing & verification

- **Determinism:** an Arcfire golden-hash test over scripted matches (vs-AI and 2P) plus cross-engine runs, so Chrome, Firefox, and Node agree bit-for-bit. Plan 2A adds:
  - **the per-weapon corpus** (`src/game/test/arcfire/corpus.ts`, `corpus.golden.json`): 15 fixed single-turn cases per roster weapon (aims, wind, shooter and a move) on two fixed boards, plus three specials (the left edge, a sudden-death draw, a sudden-death win). It covers wind off and on, both shooters, a move, extreme aims (volley shells at −7° and 187°), the flight cap, and every event kind the roster can emit. Each case is keyed by weapon id and fingerprinted by `hashBoard` (heights, tank x, moves left) plus its points, never by settings, pool, hands, RNG or Timeline, and each weapon's definition digest is pinned, so a roster append only adds keys and a failing key names its weapon;
  - **the full-roster golden** (`determinism.full.golden.json`): a whole match with the daily-challenge settings and a literal `rosterSize: 32`, generated by a fixed search strategy, which must be decisive, score on both sides, include a move and fire all 12 tags;
  - a single table of pins that drives every engine in `e2e/cross-engine-determinism.spec.ts`: Circle TD's golden, both Arcfire goldens and the corpus digest.

  Golden moves are **staged**, one cause per commit, each with an inertness check. The `rosterSize` plumbing moves nothing and its fold moves only the hash. Exact damage moves points only, and only down. Floored pixels and unclamped volleys move no golden, only a declared set of corpus cases. The loop refactor moves nothing, and each weapon task only adds corpus keys (a corpus update that would move an existing key refuses to write).
- **Sim unit tests (TDD):** terrain carve/add/settle (spans ↔ heightfield); ballistics (range, swept collision, bounds, flight cap); each primitive, through its roster weapons, plus synthetic definitions fired with `resolveWeapon` for the cases no roster weapon reaches; the draft (pool guarantees, alternation, first-pick rule); moves; scoring incl. self-damage and sudden death. Plan 2A also tests:
  - the weapon validator (every roster entry passes, seeded mistakes are named, a cyclic definition is reported) and a totality test (degenerate definitions resolve without throwing, to integer state);
  - the quiet path's parity with `resolveTurn`, and that no weapon touches the match RNG;
  - homing (never more than `degPerStep`, never past the target);
  - beams (the dial and its mirror identity, mirror-exact boards, no self-hit at any of the 181 angles for either shooter);
  - the quake's shooter exemption;
  - that `STANDARD_SETTINGS` and `SHORT_SETTINGS` always satisfy the tag guarantees with the real roster, by construction and over seeds 0..499, plus a tripwire that a 33rd weapon forces a settings decision.
- **Performance** (Plan 2A):
  - `perf.test.ts` bundles the sim with esbuild and runs it as one module before timing it, because vitest's module runner inflates timings about 4–5×. It requires Pulse's mean `resolveTurn` ≤ 0.2 ms (§5) and every weapon's ≤ 0.5 ms, each a best of three passes after a warm-up.
  - The corpus test also asserts, with no clock, that each case stays within its weapon's static step and shell bounds (§3.2).
- **AI:** the same seed must yield the same decisions; tiers must separate (Ace beats Rookie ≥ 85% and Veteran ≥ 60% over 200 seeds); a recorded vs-AI match replayed from **human commands alone** must reproduce the final hash (the leaderboard's core guarantee); and the < 5 s verification budget is enforced (on the bundled sim, like the perf test).
- **Guards:** the purity guard's `ROOTS` adds `src/game/titles/arcfire`; lazy-boundary stays green (no `@/game` in `src/lib`/`src/components`/`src/data`); the bundle-budget check passes (Arcfire only behind `ssr:false`); Circle TD's golden `5167b43d` is unchanged.
- **Balance harness** (§4.3), behind `BALANCE_SWEEP=1`.
- **Route:** tests accept a verified Arcfire win and reject a tampered log, a loss, a wrong seed, a sim-version mismatch, and a duplicate; rate limiting still applies; Circle TD's route tests stay unchanged and green.
- **In-browser (controller-owned):** WebGPU and `?renderer=canvas2d` on a desktop viewport and a phone-landscape viewport, covering the draft, battle (all 12 tags), results, resume, mute, and reduced motion. Dev loop is `next build && next start` (never `next dev`).

---

## 9 · Delivery shape

This is too large for a single plan. It's expected to split into sequential plans, as Circle TD's did:

1. **Plan 1 — engine generalization + Arcfire sim core:** the §1.2 refactor (landed and verified alone first), then terrain, ballistics, the match state machine, the draft, scoring, hashing, and goldens.
2. **Plan 2 — weapons + AI:** primitives, the 32-weapon roster, AI tiers, the worker, and the balance harness. It is split in two:
   - **Plan 2A — weapons** (`docs/superpowers/plans/2026-09-23-arcfire-plan-2a.md`): every §4.1 primitive, the 24 appended weapons (roster indices 8–31) with their Timeline events, the quiet path, the weapon validator, the §9.1 Plan 2 carry-forwards, the staged golden re-pin, the per-weapon corpus, the full-roster golden and the bundled perf test. It adds no AI, worker, renderer or UI.
   - **Plan 2B — AI:** the AI tiers, the draft AI, the Web Worker, vs-AI replay (regenerating the AI's picks and shots, §1.3) with its < 5 s verification test, and the balance harness, which writes the `power` scores.
3. **Plan 3 — presentation:** both renderers, tanks, effects, the Deck+ HUD, the draft screen, flow screens, audio, resume, and mobile.
4. **Plan 4 — leaderboard:** route generalization, migration 0002, the daily challenge, and board UI + index integration.

### 9.1 Carried forward from Plan 1

- **Plan 2 — every item is resolved by Plan 2A:**
  - Volley behavior near 0°/180° → **never clamped** (§3.2). The fan stays symmetric about the aim, and edge shells may leave below the horizon (at 180°/100 on the corpus hills, Fan gives the opponent 2 points). Shifting the fan inward is rejected: the centre shell would no longer follow the aim, and one aim would have two fans.
  - `stepShell`'s toward-zero pixel rounding → **floored** (`floorPx`), so the left edge is exactly x = 0 (§3.2). It moves neither Arcfire golden, only two corpus cases.
  - `STANDARD_SETTINGS` / `SHORT_SETTINGS` → **added**, with `rosterSize: 32` (§2). Tests prove the real 32-weapon roster satisfies the tag guarantees **by construction**: the pool takes one weapon per guaranteed tag before its shuffle, the tags are distinct, there are no more of them than `poolSize`, and each has a weapon in the roster prefix. They also sample seeds 0..499, and a tripwire checks `STANDARD_SETTINGS.rosterSize === ROSTER.length`.
  - The cross-engine corpus fixture → **the per-weapon corpus** (§8). It covers wind off and on, both shooters, a move, extreme aims, the flight cap, the left edge, sudden death (a draw and a win) and every primitive, and Chromium and WebKit reproduce it (Firefox in CI).
  - A golden pin that survives roster appends → **`MatchSettings.rosterSize`**, folded into `hashMatch` (§2, §3.4), plus the per-weapon corpus with definition digests and the full-roster golden with a literal `rosterSize: 32` (§8).
  - `idiv` divisors fed by weapon data → **guarded** twice: a runtime guard at every site (fan offsets only when count > 1, blast radius and damage, the dig heading and spacing, the quake reach, the bounce normal, every DDA), and ranges in `weapons/validate.ts`. A totality test resolves degenerate definitions without throwing (§4.1).
  - Exact-distance damage → **adopted** (§3.3), in its own staged re-pin (§8).
- **Plan 2B** (the rest of the original Plan 2, plus Plan 2A's hand-off):
  - The AI tiers, the draft AI, the worker, vs-AI replay in `replayMatch`, and the < 5 s verification test (§9).
  - Entry points. `resolveTurnPoints(m, input)` gives the same state and points as `resolveTurn` with no Timeline. `resolveWeapon(m, def, input, record)` fires any definition, such as the AI's probe shell or the draft preview.
  - Weapons consume no RNG, so a candidate's outcome is a pure function of the state and the command. Beams ignore power and read the angle on the beam dial (`beamDir`, §4.1), and they are mirror-exact, so a mirrored aim grid covers them unchanged.
  - Shell outcomes are **not** exactly side-symmetric: pixels are floored (§3.2), so a mirrored shell shot mirrors only to within a pixel. For shells a mirrored aim grid is an approximation.
  - Static cost bounds for the roster: `maxShells(def)` ≤ 13 and `maxTurnSteps(def)` ≤ 3,600.
  - Timing. Bundle the sim before timing it (`perf.test.ts` shows how), including the < 5 s test. Add a `copyMatchInto(dst, src)` that skips `spans`, which every resolve rebuilds from `height`.
    - Plan 2A's perf figures understate the AI's workload: `perf.test.ts`'s grid (shooter 0, angles 20–160) partly fires away from the opponent, and those shots leave the world early. They were also measured on the dev machine; CI runs Node 22, so 2B takes its baseline from a Node 22 run on a grid aimed at the opponent.
  - Before the AI's inner loop multiplies them, gate the quiet path's remaining allocations: the walk paths, `split`'s `children`, the per-trigger objects, `settle`'s heights copy and `carveCapsule`'s radius table. The parity test proves such a change inert.
  - The balance harness rewrites the `power` placeholders. It is the first judge of homing at the spec numbers (where a lock radius or turn budget would be considered), of Burrow and Auger under the dig clamp, and of top-attack and direct-hit stacking, which can exceed the tier-3 band (§4.3).
- **Plan 3:**
  - Extend the Timeline (pre-settle heightfield, launch/move events; §3.4).
  - Play it back at `step + lag`, animating roll, dig, burn and quake over `dur`.
  - Draw a beam weapon's aim needle along `beamDir`, with the elevation readout (§4.1).
  - Draw negative y: repeated builds can raise a column toward y = 0, so a hitbox can extend above the world top.
- **Plan 4:**
  - the §7 route items above;
  - harden `src/game/sim/boundary.test.ts`, which only matches the literal `@/game/titles/` alias, to also resolve relative imports;
  - range-validate `MatchSettings` at the binding.
- **Housekeeping:**
  - pre-existing jsdom "HTMLCanvasElement getContext()" test noise;
  - the duplicated per-engine loops in `e2e/cross-engine-determinism.spec.ts`: resolved by Plan 2A, where one table of pins drives every engine;
  - Firefox cross-engine is verified in CI only (it can't launch locally).

---

## 10 · Open items (non-blocking for planning)

- A trademark / name-availability check on "Arcfire" before public launch.
- The initial numbers in §2–§5 are starting points; the balance harness and the owner's playtest set the shipped values (and freeze `simVersion`).
