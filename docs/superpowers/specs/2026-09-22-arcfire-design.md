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
                 (draft -> turns -> sudden death -> over); toAct (whose command is awaited)
  ai/            the AI (§5; pure, integer, no weapon ids): tiers.ts (the tier table,
                 the one AI tuning surface), noise.ts, model.ts (probe models from
                 WeaponDef data), probe.ts, search.ts (one weapon), plan.ts (the
                 RNG-free turn plan), policy.ts (aiPick, aiTurn: the only RNG draws)
  vsai.ts        vs-AI matches: stepAi, advanceAi, replayVsAi, resumeVsAi (§1.3, §6.5)
  verify.ts      scoreVsAi, isArcfireCommand, DAILY_TIER: what Plan 4's binding wraps (§7)
  balance.allow.json  the balance harness's acknowledged failures (§4.3)
  state.ts (+ copyMatchInto), replay.ts (+ applyCommand), hash.ts, title.ts (TitleDef binding)
src/game/runtime/arcfire/         the Web Worker (§1.4; outside the purity guard, decides nothing)
  protocol.ts host.ts worker.ts client.ts
src/game/runtime/render/arcfire/  presentation (outside the purity guard)
  webgpu/ canvas2d/ tankPrimitives.ts terrainMesh.ts effects.ts
src/game/test/arcfire/            test support: the corpora, the vs-AI goldens' scripted
                                  human, the bundled entries, the balance sweep (§8)
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

`toAct(m)` names whose command the match waits for: the picker in the draft, the shooter after it, −1 when over. `applyCommand(m, entry)` (`replay.ts`) is the one way to apply a log entry: it applies a `pick` or a `turn` for whoever is to act through `applyPick`/`applyTurn`, and **never throws** on any JSON value (plain data properties): a malformed or illegal entry is `{ ok: false }` and changes nothing. `replayMatch`, `replayVsAi`, `resumeVsAi` and the worker host all apply entries through it.

`replayMatch({ seed, settings, commands })` re-runs a **2-player** command log from `createMatch` through `applyCommand` and returns the final state and its `hashMatch`. An illegal command rejects the whole log as `invalid_command` at its index, and so does a malformed log (not an array, a non-object entry, an unknown `k`); `replayMatch` never throws on any JSON value (plain data properties). The settings, unlike the commands, are trusted input (the verifier supplies them): `createMatch` throws a `RangeError` on settings it rejects (§2) instead of returning a result. It accepts an unfinished log, so a verifier must also require `phase === "over"`. vs-AI logs replay through `replayVsAi` instead (below), and a resume (§6.5) applies a saved log's valid prefix entry by entry: `resumeVsAi` for a vs-AI match, the worker's own loop for pass-and-play.

**vs-AI matches** (`vsai.ts`, Plan 2B):
- **Seats.** The human is always **player 0** (left, red) and the AI **player 1** (right, blue): owner decision B5 of 2026-09-24, taking the default of ⚑ O16 in the Plan 2B design addendum (`2026-09-24-arcfire-plan2b-ai-design.md` §13.1, which numbers the owner items ⚑ O1–O19). The seeded coin flip still decides who picks first, and the other seat shoots first (§2).
- **The interleaving rule.** The AI acts whenever it is its move: once right after `createMatch`, and again after every human command, until the human is to act or the match is over. `stepAi(m, tier)` makes one AI action (`aiPick` or `aiTurn`, §5, applied with `applyPick`/`applyTurn`) and `advanceAi` loops it. Between two human commands the AI makes 0, 1 or 2 actions: when the human picked first, the AI makes the last pick and then fires the opening shot.
- **Where AI turns happen.** Live, in the Web Worker's host (§1.4); on replay, inside `replayVsAi`, on the server and in tests alike. Both call the same `stepAi`, so the worker can't make a replay diverge.
- **A vs-AI match** is `seed + settings + tier + the human's commands`: at most `2 × weaponsEach + 1` commands (21 for the daily: 10 picks, 10 shots, 1 sudden-death shot).
- **`replayVsAi({ seed, settings, tier, commands })`** replays the human's commands alone and **regenerates every AI pick and shot**. The settings and the tier are trusted input. It never throws on any JSON `commands` value (plain data properties): a non-array or a malformed or illegal entry, or a command sent when it is not the human's move or after the match is over, is `invalid_command` at its index, and more than `2 × weaponsEach + 1` commands is `too_long`, before any AI work. It returns `{ ok: true, state, hash, finished, humanPoints, aiPoints, margin, humanWon }`, and like `replayMatch` it accepts an unfinished log, so a verifier also requires `finished`. The AI's commands are legal by construction; an illegal one is a bug and **throws** (the route's generic 500, never a verdict on the player).
- **The verifier result** is `scoreVsAi` (`verify.ts`, §7), which wraps `replayVsAi`.

`cloneMatch` is the deep copy that previews resolve against, so the original state is never touched. `createMatch` stores a frozen copy of its settings, which clones share. The AI resets one reused scratch match per candidate with `copyMatchInto(dst, src)` instead: it copies every hashed field plus the hands and the pool, allocates nothing, shares no array with `src`, and skips the in-shot spans, which every resolve rebuilds from `height` (0.2 µs against `cloneMatch`'s 33 µs).

`resolveTurn` serves:
- **gameplay**: the renderer plays the `timeline` back at display rate, fully decoupled from the sim;
- **AI search**: the AI resolves every candidate command with its quiet path, `resolveTurnPoints` (§3.4);
- **verification**: the server replays the command log;
- **online play later**: both clients call it on the same command.

A match is `seed + mode + settings + ordered commands` (plus the tier, vs AI). That is the replay format, the leaderboard submission and the future online wire format. A vs-AI **replay and submission** hold **only the human's** commands (the AI's picks and shots are regenerated deterministically during replay); a 2-player log holds both players' commands in turn order. The **local resume blob** of a vs-AI match holds **both** seats' commands and is re-applied without a search (owner decision 2026-09-24, B3; §6.5).

### 1.4 Threads

The sim and AI run in a **Web Worker** (the main thread owns rendering, the HUD, input and `localStorage`), so AI "thinking" never janks the UI on phones. The worker and the server run identical code.

Plan 2B builds it in `src/game/runtime/arcfire/`, outside the purity roots (it may use `self`) but deciding nothing: every AI action is `stepAi` on the match (§1.3), so the host's final hash equals `replayVsAi`'s (tested).
- **`host.ts`** (`createArcfireHost(post)`) is the whole brain, as a pure module with no `self`, clock or DOM, so Node tests drive it directly. It owns one match and its log. It applies every local `pick`/`turn` request through `applyCommand` (so a malformed request is `rejected`, never an error), runs `stepAi` whenever it is the AI's move, and posts each applied action. **The human's event is posted before the AI starts**, so the AI's search overlaps the human shot's playback on the main thread. A `start` builds its match before it replaces the current one: a log that is present but not an array (`null` included), a seed that is not an integer, an opponent that is not a tier or `"local"`, or settings that `createMatch` rejects is `rejected{bad_log}`; a throw while it re-applies the save is a bug, posted as `error`; either way the current match and opponent stay as they were.
- **`worker.ts`** binds `self.onmessage` to the host and `post` to `self.postMessage` with its transfer list.
- **`client.ts`** (`ArcfireWorkerClient`: `start`, `pick`, `turn`, `preview`, `on`, `dispose`) is the main thread's only handle. It owns the request ids and the listeners; `dispose()` terminates the worker, which is also how the UI abandons an AI that is still thinking. Every listener gets every event even when one throws, `dispose()` is idempotent, and every request after it throws (§9.1, Plan 3). It creates the worker with `new Worker(new URL("./worker.ts", import.meta.url), { type: "module" })`.
- **The protocol** (`protocol.ts`, type-only; every message is structured-clone safe):
  - requests: `start { seed, settings, opponent, log? }` (`opponent` = a tier, or `"local"` for pass-and-play, where both seats send commands and the AI never acts; `log` = a resume blob's full log, §6.5), `pick { poolIndex }`, `turn { cmd }`, and `preview { weapon, angle, power }` (the draft panel's looping preview, resolved on a fixed flat board, never touching the match);
  - events: `state` (after a start or resume: the snapshot, `log` = the resume blob's log, `humanLog` = the daily submission, `droppedFrom`), `picked`, `shot` (with its Timeline, and the AI's `AiStats` for an AI shot), `thinking` (an AI turn's search starts), `rejected { invalid_command | not_your_move | no_match | bad_log }`, `preview` (a Timeline) and `error` (a bug-report path: the AI's commands are legal by construction, so only a thrown bug reaches it, such as one while a `start` re-applies a save; the client also emits one, with `id` −1, when the worker itself fails, e.g. to load);
  - every request carries an `id` that each event it causes echoes, in order; `seq` is an applied action's index in the match log, so the UI can queue and play actions in order; a snapshot's and a Timeline's heights are fresh copies the host transfers.
- **The bundle boundary.** Nothing in Plan 2B imports `client.ts`, so the lazy boundary, the bundle budget and `npm run build`'s output are unchanged. The worker bundle has no input under `src/app`, `src/components` or `node_modules`, no `require(` or `node:`, and stays < 64 KiB (40.2 KiB measured), which a test enforces. Plan 3's first task verifies the `new Worker(new URL(…))` pattern inside `npm run build`; the fallback is emitting the esbuild worker bundle into `public/`.

---

## 2 · Rules

- **World:** 1200 × 500 stage px (2.4:1), letterboxed to fit. Margins beyond the world show dimmed, non-playable decorative terrain. Nothing playable is ever cropped.
- **Match:** 1v1. A seeded coin flip decides who **picks first**; the other player **shoots first**.
- **Draft:** a seeded pool of **24** distinct weapons drawn from the 32-weapon roster, with at least one of each of BLAST, SPLIT, and DIRT. Players alternate picks until each holds **10**. (Free play can choose **5** each, with a pool of 12.)
  - These are `STANDARD_SETTINGS` (10 each, pool 24) and `SHORT_SETTINGS` (5 each, pool 12), frozen in `state.ts`. Both guarantee BLAST, SPLIT and DIRT, and both have wind off (free play's toggle turns it on).
  - The pool is drawn from the roster prefix `ROSTER[0, rosterSize)`. `MatchSettings.rosterSize` is validated by `createMatch` (an integer in [`poolSize`, `ROSTER.length`]) and folded into `hashMatch`. Both standard settings carry the literal 32, so a roster append never moves a pinned match; growing the roster is a deliberate settings and `simVersion` change.
  - `createMatch` also requires `weaponsEach` to be an integer ≥ 1 and `poolSize` an integer ≥ 2 × `weaponsEach`, and throws a `RangeError` on settings it rejects. Settings are trusted input: Plan 4's binding supplies `STANDARD_SETTINGS`, and full range validation stays in Plan 4 (§7, §9.1).
- **Turn:** an optional **move** (4 per player per match; ±36 px horizontally, with y following the surface; tank centres stay at least 24 px inside the world edges (`TANK_EDGE_MARGIN`) and can't come closer than 64 px to the other tank), then choose one of your remaining weapons, set **angle** (integer degrees 0–180; 0 = right, 90 = straight up; a beam weapon reads the same angle on the **beam dial**, where 90 is level at the opponent, §4.1) and **power** (integer 0–100), and fire. The **ghost trail** of your previous shot stays visible; there is no trajectory preview.
- **Scoring:** damage dealt to the opponent = points. **Self-damage is awarded to the opponent.** Once all weapons are fired, the higher total wins. **Tie:** sudden death, one Pulse shot each; if still tied, it's a draw.
- **Wind:** off by default. The free-play toggle adds seeded per-turn wind (−40…+40 px/s² horizontal), shown as an arrow and value in the HUD.
- **Tanks:** rest on the surface at their x. They ride settling dirt down; there is no fall damage and no burying (dirt settles beneath tanks, never over them).

---

## 3 · Sim model

All state is integer or Q16.16 fixed-point (`src/game/sim/math/fixed.ts`), randomness comes only from the seeded `mulberry32` (`math/rng.ts`), and aim angles use a **baked** table of Q16.16 cos/sin integer literals for whole degrees 0–180 (`titles/arcfire/aimTable.ts`). Arcfire does not use `math/trig.ts`: that table is built from floating-point sine at load, and engines aren't required to round it identically, so one off-by-one entry could make a browser and the verifier fly different trajectories. There are no floats, no `Math.*` beyond what the purity guard allows, and no host globals.

### 3.1 Terrain

- **Persistent state = heightfield:** `height: Int32Array(1200)`, the surface y per 1-px column (y-down; 500 is the floor).
- **During a shot**, each column may hold several solid **spans** (tunnels, floating dirt): `spans[x] = [top0, bot0, top1, bot1, …]`, capped at 8 per column. Carve (circle, capsule) and add (ball, wall, level) edit spans directly, and projectiles collide with spans exactly. A carve that would make a 9th span drops the top one (Plan 1's rule); an add never loses dirt: when it would make a 9th span, it closes the gap to the span below (or above, with none below) with dirt, so it can add up to that gap on top of its own piece.
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
- **Bounds:** leaving the left or right world edge = lost (except Ricochet, which reflects a shell whose last free sample is inside the world, §4.1). There is no ceiling.
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
- **The quiet path:** `resolveTurnPoints(m, input)` resolves the same turn to the same state and points without building the Timeline's paths, events or settle falls. In the game only the AI's search uses it (`valueOf`, for every candidate and threat estimate, and `afterShot`, §5). Verification regenerates each AI decision through that same search, but applies every turn, the AI's and the human's, through `applyTurn` / `resolveTurn`. `resolveWeapon(m, def, input, record)` fires any `WeaponDef`, roster entry or not (unit tests and synthetic definitions; the AI's probe flies the sim's own `muzzle` / `launchShell` / `stepShell` directly, and the draft preview is `resolveTurn` on a flat board, §9.1). A parity test pins the quiet path to `resolveTurn`, and another pins that no weapon touches the match RNG.

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

`tag` ∈ BLAST, VOLLEY, SPLIT, BOUNCE, ROLL, DIG, FIRE, DIRT, BEAM, HOMING, QUAKE, SPECIAL. `power` is a draft score in 1–100, written by the balance harness and used by the draft AI. Adding a weapon means adding a `WeaponDef` plus its HUD metadata (a one-line description and an SVG glyph). That metadata lives in a separate map keyed by weapon id, outside `WeaponDef`: the corpus pins each weapon's definition digest, which hashes every `WeaponDef` key except `power` (§8), so a presentation field inside `WeaponDef` would move pins. For the same reason, renaming a weapon's `name` needs a declared corpus re-pin.

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
- **Spawns.** A spawn point is never tested. A child whose first sample is solid impacts there on its first step, and one spawned off the world is out at its first sample unless that sample is back inside the world. That holds for a wall bouncer too: a side wall reflects only a shell whose last free sample is inside the world. A shell spawned inside a tank's hitbox ignores that tank until a sample leaves it.
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
  - With `walls: true` (Ricochet) only the side walls reflect, and only a shell whose last free sample is inside the world. A wall bouncer spawned past a side wall (a `gapPx` child) goes `out` at its first sample instead (Spawns).
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
- **Burn** walks the same way as a roll, from the ground below the last free pixel: the pool `pool/2` each way, then the flow `flow` px downhill, or both ways with `split`. Each tank whose hitbox a run reaches takes `damage` **once per burn effect**. A burn that strikes a tank directly touches that tank, which takes the burn damage once, at lag 0, whichever way the runs go. This follows the owner defaults O8 (touch = the hitbox circle, which the shell itself struck) and O11 (direct hits) of the Plan 2A design addendum (`2026-09-23-arcfire-plan2a-weapons-design.md`, §10.1). Fire changes no terrain and never lingers.
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
- **The validator.** `weapons/validate.ts` checks every definition statically: integer ranges that keep every product below 2^53 and every data-fed divisor ≥ 1, stage nesting ≤ 4, where `early`, `homing` and `bounce` may appear, and the static bounds `maxShells(def)` and `maxTurnSteps(def)` (§3.2). It also enforces the structure:
  - a split's `from: "ahead"` or `"cone"` only in an apex stage's `effects` (at an impact the heading points into the ground, and an `early` list counts as an impact);
  - effect lists are non-empty, with exactly one known key per effect, and a delay schedules no split or delay;
  - a dig's `blastEvery` and `each` come together;
  - a stage cycle is found directly: each reference back to a stage already on the current path is reported once, as a `cyclic stage` error, and not descended into;
  - `weaponErrors` never throws: an absent or null nested object is reported as `<path>: missing`.

  The roster test requires every entry to pass. Each data-fed divisor also has a runtime guard, so degenerate definitions (zeros, count 0, a cyclic stage) resolve without throwing.

### 4.2 Roster (32; initial parameters, which the balance harness tunes)

The `#` column is display order. A weapon's **roster index**, which turn commands use on the wire, is append-only: never reorder or delete an entry.
- Plan 1's roster indices are `0 pulse, 1 pulse2, 2 nova, 3 needle, 4 crater, 5 triad, 6 fan, 7 railshot`.
- Plan 2A appends the other 24 in this table's display order: `8 twinnova, 9 cascade, 10 hydra, 11 hailstorm, 12 shrapnel, 13 barrage, 14 skipper, 15 pinball, 16 ricochet, 17 tumbler, 18 juggernaut, 19 burrow, 20 auger, 21 inferno, 22 wildfire, 23 rampart, 24 bastion, 25 leveler, 26 lancer, 27 prism, 28 seeker, 29 swarm, 30 quake, 31 aftershock`. So #6 Twin Nova is index 8, and #9–#31 are indices 9–31.
- Where the first draft of this table left a number open, the row shows Plan 2A's initial choice. Every `power` is a placeholder until the balance harness writes it; the appended weapons start at 30 (tier 1), 55 (tier 2), 80 (tier 3) and 25 (DIRT).
- The Name column is each `WeaponDef.name`, which the definition digest covers, so a rename needs a declared corpus re-pin. The HUD's description and glyph live outside `WeaponDef`, in a map keyed by weapon id (§4.1), so adding them moves no pin.

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

Behind `BALANCE_SWEEP=1` (the same pattern as Circle TD's balance sweep), deterministic **Ace-vs-Ace** matches run across seeds 1..400 with `STANDARD_SETTINGS` (so the literal `rosterSize: 32` and a 24-weapon pool). Plan 2B builds it (`src/game/test/arcfire/`: `aiMatch.ts`, `sweep.ts`, `balance.ts`, `arcfire.sweep.test.ts`); the owner decisions of 2026-09-24 (B5: ⚑ O7–O10 of the Plan 2B design addendum, `2026-09-24-arcfire-plan2b-ai-design.md` §13.1) set the method.
- **A seeded random draft** (⚑ O7): every pick, for both seats, is `nextRange(m.rng, free slots)`, one match-RNG draw. The Ace's own draft ranks by `power`, which is what the harness computes (circular), and would put each weapon in the same kind of hand every time and never field the weakest; a random draft holds every weapon in varied hands, so its win-rate contribution is a clean marginal effect.
- **The metric** (⚑ O8), per weapon, over battle shots only (sudden death is always Pulse and is excluded): **mean net points per shot** (points dealt minus points gifted by self-damage: the AI's own value, §5) and its sd; points gifted per shot; hit rate (dealt > 0); **win-rate contribution** = (the holders' wins + ½ draws) / holdings − ½, with a 95% half-width of `1.96·√(0.25 / holdings)`; the mean battle turn it was fired on; for DIRT, the defensive uses and the mean estimated reply cut; and the pick rate the Ace's power draft would give it with the proposed powers.
- **The verdict:** a damaging weapon **fails** when its mean net points per shot fall outside its tier band (T1: 15–40, T2: 30–60, T3: 50–90); **any** weapon fails when its win-rate contribution exceeds +12%. DIRT weapons are judged by win-rate contribution only, and a weapon never fired gets no band verdict. Each failure carries a **suggestion**: "damage × (band middle / mean)" when the hit rate is ≥ 80% (points then scale about linearly with damage), "structural: hit X%, Y points on a hit" below that, and "reduce damage or spread" for a win-rate failure.
- **Tier separation** (§8) and a per-tier **decision-cost table** (sims and probe flights, exact; wall time, informational) come from the same sweep, and every AI turn of every sweep match is checked legal and within its tier's sim budget: the weekly sweep is also a 20,004-decision property test.
- **Gating by an allow-list** (⚑ O10). `balance.allow.json` (`src/game/titles/arcfire/`) maps an acknowledged weapon id to its reason. A failing weapon on the list reports `ACK` and doesn't fail the job; any other failure does; a listed weapon that now passes reports `STALE ACK` (remove it). Plan 2B seeds the list with the first run's 9 failures (§9.1). The **launch gate** (§7) needs the list empty.
- **Never a merge blocker.** The sweep never runs in `npm test` or `ci.yml`; `.github/workflows/balance-sweep.yml` runs it weekly and on `workflow_dispatch`, as 4 shards (`ARCFIRE_SWEEP_SHARD=k/4`) and a merge job (`ARCFIRE_SWEEP_MERGE=<dir>`, which refuses a seed found in two shard files or in none: each group must hold exactly its full run's seeds, 1..400 or 1..200, so a lost shard fails the merge instead of being judged on the rest). A shard job's upload fails when the shard wrote no file (`if-no-files-found: error`). The report goes to stderr, the job summary and `test-results/arcfire-balance/report.md`.
- **Runtime.** The whole weekly sweep (400 harness matches plus 3 × 200 separation matches) is about 2,900 CPU-seconds, played as one job queue, slowest matches first. Measured on the dev machine (Node 24): about a minute on 64 threads; one quarter shard 164 s on 4 threads and 315 s on 2 (a private repository's 2-vCPU runner roughly doubles a shard, still inside the 30-minute job timeout; 8 shards is the lever). `ARCFIRE_SWEEP_THREADS` caps the threads. A malformed knob fails the run before any match, naming the variable: `ARCFIRE_SWEEP_THREADS` must be an integer ≥ 1 and `ARCFIRE_SWEEP_SHARD` must be `k/n` with 1 ≤ k ≤ n (either may be unset or empty). A job that throws, a worker that fails, or a worker that exits while it holds a job fails the run, and the first failure stops every worker. The records, and so every verdict and count, are identical for any thread count or shard split.
- **`power`** (⚑ O9). A damaging weapon's power is `clamp(round(mean net points per shot), 1, 100)`; a DIRT weapon's win-rate contribution is converted to points by the least-squares line (net points per shot against contribution) through the damaging weapons, then clamped. The harness writes it back into `weapons/roster.ts` **only** with `ARCFIRE_BALANCE_WRITE=1`, in a local run (a full run or a merge, never a CI shard), by an anchored rewrite of exactly one literal per id that refuses and writes nothing otherwise. **No write-back happens until the tuning pass** (§9.1): Plan 2B keeps the §4.2 placeholders. `defDigest` excludes `power` (a test pins that), so a write-back moves no Plan 1 or 2A pin, only the AI corpus's draft section and the vs-AI goldens (§8, a declared re-pin), and after launch it is a `simVersion` bump (§5). `balance.test.ts`'s write-back test reads the live powers from `ROSTER`, never literals, so a write-back leaves it green.

---

## 5 · AI opponent

Plan 2B builds the AI in `titles/arcfire/ai/` (§1.1), from the Plan 2B design addendum (`2026-09-24-arcfire-plan2b-ai-design.md`). The owner's decisions of 2026-09-24 on its open questions (B1–B5, covering the addendum's ⚑ O1–O19) are binding. The numbers below are the addendum's measurements on its prototype (bundled Node 24 on the dev machine unless noted); the plan's dry run reproduced its pins, its tier separation and its harness table exactly.

- **Pure and fixed-point, under the purity guard.** The server must reproduce every decision bit-for-bit, so all evaluation is integer math, noise comes from the match RNG, ties break by candidate order, every `sort` has a total comparator, and no `Map` is iterated for a decision. The AI knows weapons only through their `WeaponDef` data (`model.ts`, no weapon ids), so an appended weapon needs no AI code: every weapon the validator accepts gets a probe that ends (step 2) and budgets that count full resolves. The search (`planTurn(m, tier)` in `plan.ts`, over `search.ts`) draws nothing from the RNG and never writes the match, so hints and analysis may call it freely; only `policy.ts` draws.
- **A "sim" is one full weapon resolve:** `copyMatchInto` a scratch copy, then `resolveTurnPoints` (§3.4). Budgets count sims, never wall-clock. Probe flights are a separate count, fixed by the grid and the hand.
- **Evaluation.** A candidate's **value** is `points[me] − points[foe]` of one full resolve of the real state, which is exactly `points to the enemy − points gifted by self-damage`. A move is part of the candidate: the resolve performs it first. Terrain, settle, homing, bounces, rolls, fire, quakes, beams and splits are the real sim's; the AI never models a weapon's effect itself. The tier heuristics sit on top of the value, never inside it.

**The search** (`planWith`), for the shooter:
1. **Hand.** In sudden death the hand is `[Pulse]`; otherwise the shooter's. `dealsDamage` splits it into offence and inert (the three DIRT weapons: nothing in their stage tree can hurt). Inert weapons are worth 0 as attacks and aim at their probe landing nearest the enemy.
2. **Probe.** Each weapon's **probe model** (`probeModelOf`: the launch's speed and gravity scales; the first stage's homing, terrain bounces, wall bounces and stop at the apex; and, for an apex split, its centre child under the `ahead`/`cone` velocity rule) is flown **by the sim's own** `muzzle`/`launchShell`/`stepShell` over a scratch copy of the board, effect-free. There is no second integrator, and nothing reads a Timeline.
   - The apex split is followed **once**: a child that is itself an apex stage lands where it stops, which is where the sim's child acts. So every probe flight ends within two flight caps, whatever the definition. (Re-spawning at every apex, as the design first did, restarts the flight cap each time, so a legal weapon, an `up` split at 100% into an apex child, looped forever.)
   - It flies the tier's grid from the side being searched: shells over **facing** degrees 0..90 (command angle f for player 0, 180 − f for player 1) at powers `powerStep`..100; a wall bouncer (Ricochet) over the facing half, 0..180, so bank shots are searched; a beam over the whole dial 0..180 along `beamDir` (§4.1) at one power, `BEAM_POWER` = 50, since beams ignore power.
   - An aim's **landing metric** is the squared distance from its first contact pixel (Plan 1's blast centre) to the enemy's hitbox centre, 0 for a hit on the enemy; for a beam, from the nearest in-world sample of any beam of the fan. Leaving a side edge, reaching the flight cap or hitting the shooter's own tank is `FAR` and sorts last.
   - The roster flies 12 models, and weapons with equal models share one grid per decision and side. The probe only **orders** aims: every value the AI acts on is a full resolve, so a probe that differs from the weapon costs search quality, never correctness. It is exact where tested: a plain probe lands on Pulse's blast pixel on every Rookie-grid aim of 8 boards, and a beam probe reaches the enemy exactly when Lancer damages it, on all 181 dial angles. A synthetic apex-in-apex weapon (the loop above) lands where the sim's child blasts, on every Rookie-grid aim of the same 8 boards.
3. **Refine centres.** Each angle row's power that lands nearest the enemy; the rows sorted by (squared distance, cell index), skipping any row closer than `⌈(2·refineA + 1) / angleStep⌉` rows to one already taken. So the boxes never overlap and spread along the whole firing-solution curve (direct shots and lobs). Rookie has no box, so every cell is its own centre, in (distance, cell) order.
4. **Refine.** Every cell of each centre's box (±`refineA` degrees × ±`refineP` power at step 1; beams the angle only), in (angle offset, power offset) order, is fully resolved at most once per weapon, skipping cells off the wire ranges, until the weapon's **share** is spent (a box may end partly resolved). Rookie and Veteran answer with the best exact aim (the first of equals); the Ace with its best expected value under its own noise (below).
5. **Moves** (⚑ O4): Rookie never; Veteran only while its best stationary value is below 25 points; the Ace always. The best stationary weapon ("the best shot") is searched again from each legal side (left, then right), **re-probed from the moved tank**, with `moveEach` sims a side. A moved candidate is kept only if it beats staying by ≥ 8 points.
6. **Choice**, then the Ace's tier-3 saving and DIRT rule (below).

**Budgets are caps** (owner decision 2026-09-24, B5: ⚑ O18). `tierBudget = stay + 2 × moveEach + dirt` = **300 / 1,500 / 4,000** sims, pinned by a test, and every turn of the weekly sweep asserts `sims ≤ tierBudget`.
- The stationary budget is spent as **fixed per-weapon shares**: each offensive weapon in hand gets `⌊stay / max(10, hand size)⌋` sims, which is a hard cap (Rookie 30; Veteran 120, two full 45-cell boxes plus 30 cells; Ace 300, twenty 15-cell boxes).
- A full hand spends the whole stationary budget; a late-match hand spends less (Rookie in sudden death: 30). Over the sweep's 20,004 decisions the means are Rookie 144 of 300, Veteran 651 of 1,500 (maximum 1,200) and Ace 2,123 of 4,000 (maximum 3,700).
- The Ace keeps the full 4,000 (owner decision 2026-09-24, B4: ⚑ O15). An Ace at half its stationary budget measured strength-neutral (it won 55.0% against the full one over 160 seeds), so the number is a cap and a fidelity choice, not a strength need.

**Aim noise** (⚑ O3) is the literal "seeded sum of 3 uniform integers", applied to the chosen angle and power, then clamped to 0..180 and 0..100. Part `i` (0..2) is uniform on `[−aᵢ, aᵢ]` with `aᵢ = ⌊(bound + i) / 3⌋`, so the parts sum to the bound and every value in −bound..bound is reachable. Every noise draws exactly 3 values (a part of 0 still draws `nextRange(rng, 1)`).

| Bound | Parts | Distribution (integer weights) | P(exact) |
|---|---|---|---|
| ±1 (Ace, both axes) | 0, 0, 1 | uniform −1..1 (of 3) | 33% |
| ±2 (Veteran angle) | 0, 1, 1 | 1 2 3 2 1 (of 9) | 33% |
| ±3 (Veteran power) | 1, 1, 1 | 1 3 6 7 6 3 1 (of 27) | 26% |
| ±6 (Rookie angle) | 2, 2, 2 | a bell over −6..6 (of 125) | 15% |
| ±8 (Rookie power) | 2, 3, 3 | a bell over −8..8 (of 245) | 12% |

**The noise-aware Ace** (⚑ O1). The Ace ranks aims by their exact **expected value under its own noise**: `EV × 9 = Σ k_a[i] · k_p[j] · value(clamp(a + i − 1), clamp(p + j − 1))`, with the uniform ±1 kernels and the clamps the command will get, all in integers. It is computed over the resolved aims whose whole 3 × 3 support was resolved (the centre column of each 3 × 5 box has it). The best exact aim's missing support is completed only if its share still has the sims, which is almost never, and it wins if its EV is higher.
- It is the one strength lever: a point-evaluating Ace wins only **19.4%** against it (−13.4 net points a shot), because it picks knife-edge aims (Needle's 10 px blast, a lob grazing a crest) that ±1 noise misses 2 times in 3.
- It also shapes feel: the Ace aims for the middle of a hit plateau, so its misses are near misses.
- Rookie and Veteran rank by the value at the exact aim ("best by evaluation"). A noise-aware Veteran would be one flag (`noiseAware`).

**The tier heuristics** (⚑ O4–O6), kept for fidelity and feel. Each is strength-neutral: an Ace without its move search, its tier-3 saving or its DIRT rule won 52.2%, 53.1% and 53.8% against the full Ace over 160 seeds (±7.7 points).
- **Tier-3 saving** (Ace): a tier-3 pick is fired only if `ev > alt` and `5·ev ≥ 6·alt` (≥ 20% better), where `alt` is the best non-tier-3 candidate with ev > 0; otherwise `alt` is fired. Ties and all-zero turns never burn a tier-3 weapon. Every weapon is fired eventually, so this only orders shots.
- **DIRT** (Ace, battle, DIRT in hand, ⚑ O5): `r0` estimates the enemy's best reply **after the Ace's planned shot** (each damaging enemy weapon at its 2 nearest probe aims on Rookie's grid, fully resolved as the enemy: an optimistic estimate). If `r0 ≥ 60`, or no offensive weapon is left, each of the first two DIRT weapons is resolved at its aim landing nearest 90 px in front of the tank and at its aim landing nearest the midpoint between the tanks, and the reply is estimated again on each. The option with the lowest reply is fired if it cuts `r0` by ≥ 20; when only DIRT is left, the least bad option is forced. It spends at most `dirt` = 300 sims.
- **A Veteran holding only DIRT** fires its best-ranked DIRT weapon at its landing nearest the enemy.

**Weapon choice.** Rookie: uniform among its top 4 by value, zero-value weapons and DIRT (valued 0) included (⚑ O17). Veteran: the best. Ace: the best, then tier-3 saving, then DIRT. Weapons rank by `ev` descending, then tier ascending (an equal shot spends the cheaper weapon), then roster index; a paying move goes first, so it wins an ev tie.

**Tiers** (`TIERS` in `ai/tiers.ts`, the AI's one tuning surface):

| Tier | Probe grid (shell flights per model) | Refine box | Budget cap (sims/turn) | Share per weapon | Aim noise | Moves | Weapon choice | Draft |
|---|---|---|---|---|---|---|---|---|
| Rookie | 5° × 10 power (19 × 10 = 190) | none | **300**: stay 300 | 30 | ±6° / ±8 | never | uniform among the top 4 | uniform among the top 8 |
| Veteran | 2° × 4 power (46 × 25 = 1,150) | ±2° × ±4 at step 1 (45 cells) | **1,500**: stay 1,200 + 2 × 150 moves | 120 | ±2° / ±3 | while the best stationary value is < 25 | the best by exact value | uniform among the top 3 |
| Ace | 1° × 2 power (91 × 50 = 4,550) | ±1° × ±2 at step 1 (15 cells) | **4,000**: stay 3,000 + 2 × 350 moves + 300 DIRT | 300 | ±1° / ±1 | always considered | the best by noise-aware EV + tier-3 saving + DIRT | the best |

A wall bouncer's grid doubles (the facing half); a beam sweeps the dial at one power (37 / 91 / 181 angles).

- **The daily opponent** is the spec Veteran (`DAILY_TIER = "veteran"`; owner decision 2026-09-24, B1: ⚑ O2): ±2° / ±3 with exact-aim evaluation. Loosening it (for example to ±3° / ±5) is a pre-launch playtest decision, one line in `TIERS.veteran` plus a declared AI re-pin (§8, §9.1), not part of Plan 2B. That re-pin may move the vs-AI goldens' seeds (a looser Veteran can turn the loss golden into a win), and the loosened Veteran must keep the weekly tier separation green. Measured over 60 seeds, a noise-free scripted "grid human" (the best of a 5° × 5 grid over its hand) beat the spec Veteran 25 times, a ±3° / ±5 Veteran 41, Rookie 55 and the Ace 3.
- **Draft AI** (`aiPick`): the available pool slots sorted by (roster `power` descending, pool index ascending), then `nextRange(rng, min(draftTop, n))`: Rookie among the top 8, Veteran among the top 3, Ace the first (still one draw). It reads only `power` and the pool (no hand composition or denial), so **`power` is an AI input**: a change moves the AI's drafts (§4.3, §8).
- **RNG** (normative: `hashMatch` folds `rng.state`):
  - an AI pick draws **exactly 1** value, before `applyPick`;
  - an AI turn draws **exactly 7**, after its search and before `applyTurn`: 1 `nextRange(rng, choices.length)` among the plan's choices (up to 4 for Rookie, otherwise 1), then 3 for the angle noise, then 3 for the power noise;
  - a human command draws nothing, and the search draws nothing (every resolve runs on a scratch copy, and weapons consume no RNG); `beginTurn`'s wind draw is unchanged.

  The counts never depend on the tier, so a resume can skip an AI entry's draws without searching (§6.5). The command is legal by construction: clamped to the wire ranges, a weapon from the hand (Pulse in sudden death), and a move only from a side `moveTarget` accepted on this state.
- **Measured tier separation** (200 seeds per pairing, `STANDARD_SETTINGS`, each tier drafting with its own draft AI, seats swapped on odd seeds; the weekly sweep enforces it, §8):

  | Pairing | Win rate of the first | Required | Net points a shot (hit rate) | Moves per 200 matches |
  |---|---|---|---|---|
  | Ace vs Rookie | **99.5%**, mean margin +371 | ≥ 85% | Ace 54.7 (92%), Rookie 17.6 (42%) | Ace 82 |
  | Ace vs Veteran | **93.5%**, +221 | ≥ 60% | Ace 52.4 (91%), Veteran 30.3 (63%) | Ace 80, Veteran 26 |
  | Veteran vs Rookie | **85.5%**, +144 | ≥ 70% | Veteran 33.8 (64%), Rookie 19.5 (45%) | Veteran 13 |

  Free play (`SHORT_SETTINGS` with wind, 100 seeds): Ace–Veteran 90%, Veteran–Rookie 86%, Ace–Rookie 100%. These are one-off design measurements that nothing enforces: the weekly sweep checks tier separation on `STANDARD_SETTINGS` only, windless (§8), and the tuning pass adds a free-play block (§9.1).
- **Performance targets:** single-shell `resolveTurn` averages ≤ 0.2 ms in Node, and verifying a full daily-challenge match (10 Veteran turns + 10 AI picks, and the human's 20 commands) completes in < 5 s on CI hardware, which is enforced by a test (§8). No other budget is enforced by the clock; the sim budgets are enforced by counting. Measured (bundled Node 24 on the dev machine; the Node 22 CI baseline is recorded after the first CI run, §9.1):
  - Pulse's `resolveTurn`: 0.021 ms, ≈ 9× inside.
  - A daily verification, cold in a fresh process: 414 ms mean and 530 ms max over 12 logs (the test's cold run 507–526 ms; Chromium 660 ms, WebKit 507 ms). The worst-case bound, 11 × the sweep's worst Veteran decision (128 ms), is ≈ 1.4 s, 3.5× inside.
  - Per decision (the mean on the AI corpus's 8 plain states, 4 openings with full hands and 4 after 9 shots; the sweep's worst decision re-timed alone): Rookie 8 ms (37 ms), Veteran 36 ms (128 ms), Ace 273–317 ms (605–650 ms). `ai.perf.test.ts` prints the openings' mean and maximum apart, since full hands are the heaviest decisions. In Chromium the Ace averages 211 ms; at 4× CPU throttling (a mid-range phone proxy) 1.34 s, with the sweep's heaviest Ace openings at 1.65–2.18 s (2.58–3.39 s at 6×).
  - The speed comes from three pin-neutral engine edits: `copyMatchInto` (§1.3); gating the quiet path's allocations (the Plan 2A hand-off's K12, §9.1); and an **exact quick-reject** in `stepShell`, which skips a step's per-sample sweep when the pixel box between its end points lies inside the world, above every covered column's top span and clear of both hitbox squares. A reference property test proves it equal to the per-sample sweep, and the AI's decisions are bit-identical with it compiled out; an Ace turn fell from 457 to 153 ms.
  - The Ace's think time is hidden behind the human shot's playback: the worker searches while it plays (§1.4), and Plan 3 shows at least 700 ms of visible aiming before any AI shot (B4, ⚑ O14; §6.4). The owner playtests the heaviest openings on a real mid-range phone.
- **The AI is a verification input.** After launch, any change to `ai/**`, `TIERS`, the noise, the probe models or a weapon's `power` changes the regenerated AI decisions of every vs-AI replay: it needs an `ARCFIRE_SIM_VERSION` bump, which partitions the boards, and the AI pins (§8) make it loud.

---

## 6 · Presentation & UX

### 6.1 Battle screen: "Deck+" (one layout; `deck-plus.html`)

- **Battlefield** (~70% of the height): the rendered world, letterboxed. It carries floating **score pills** (you in red, opponent in blue), the **turn pill** (`TURN 7 / 20`), your previous shot's **ghost trail**, and the **drag-to-aim** vector (drag from your tank: direction = angle, length = power) with an `angle · power` bubble.
  - **Beams.** For a beam weapon, the drag direction θ (aim degrees, taken within ±180° of the shooter's facing: −180..180 for player 0, 0..360 for player 1) maps through the inverse of `beamDir` (§4.1). The command angle is θ + 90 for player 0 and θ − 90 for player 1, clamped to 0..180, so only the opponent-facing half-plane can be dragged. The drag length is ignored, because beams ignore power, and the bubble shows the elevation (§4.1) instead of the power.
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

1. **Mode:** Today's Challenge (ranked, vs Veteran) · Free play vs AI (Rookie / Veteran / Ace) · Local 2-player. Against the AI the human is always player 0 (left, red) and the AI player 1 (right, blue); the coin flip still decides who picks first (§1.3).
2. **Tank + settings:** each player picks a tank. Free play can also set wind on/off and 5 or 10 weapons each. The Challenge locks its settings (wind off, 10 weapons, Veteran).
3. **Draft:** a 6×4 pool grid (glyph, name, tag; taken cards dim with the owner's color dot); trays on top (opponent) and bottom (you); a **detail panel** with a description, DAMAGE/RADIUS/TRICKY bars, a **live looping preview** (the real `resolveTurn` on a fixed flat board, drawn small: the worker's `preview` request, §1.4), and PICK. On phones the panel becomes a bottom sheet.
4. **Battle:** Deck+. Against the AI:
   - The worker posts the human's shot before the AI starts searching, so the AI thinks during the human shot's playback. The UI queues events by `seq` and plays the AI's shot once the human's has finished, showing "aiming…" only if the AI's event has not arrived by then.
   - **The visible-aim minimum** (owner decision 2026-09-24, B4: ⚑ O14): every AI shot shows at least **700 ms** of visible aiming (the AI's turret sweeping to its angle) before it fires, so Rookie's 10 ms decisions don't feel robotic. It is presentation only and never reaches the worker or the sim.
5. **Results:** final scores, a per-shot breakdown, an **instant replay of the best shot** (deterministic re-resolve), then initials + submit for Challenge wins, plus Rematch.

### 6.5 Around the edges

- **Resume:** the in-progress match auto-saves to `localStorage` (`arcfire:match:v<simVersion>`) after every worker event, with every access in try/catch. On load it re-simulates to the current turn and offers "Resume". A mismatched `simVersion` discards the save.
  - **The blob** is `{ v, seed, settings, mode, opponent, log }`, a few hundred bytes. `log` holds **both seats' commands in order**, the AI's included: the worker's `state.log` plus each `picked`/`shot` event in `seq` order (§1.4). A pass-and-play blob is a plain 2-player log.
  - **Resuming runs no search** (owner decision 2026-09-24, B3: ⚑ O19). The worker's `start` with the saved log calls `resumeVsAi`, which re-applies every entry with `applyCommand`. At each AI entry it first advances the RNG by that decision's fixed draws (1 for a pick, 7 for a turn, §5), then applies the recorded command. The state is bit-identical to `replayVsAi` of the human sub-log whenever the AI entries came from this code at this `simVersion`, in 1.4–1.7 ms, against about 0.7 s to regenerate a Veteran log (an Ace log would take about 2 s on a desktop, and 13–21 s at 4–6× CPU throttling).
  - **Tested:** `resumeVsAi` equals `replayVsAi` on every prefix of a short Rookie match (`vsai.test.ts`) and on the full log of both vs-AI goldens (`ai.corpus.test.ts`, bundled); the host resumes the win golden mid-draft, mid-battle and finished (`host.test.ts`), and a real Worker resumes it after 25 entries (the cross-engine smoke). The design's prototype measured all 41 prefixes of each golden.
  - A damaged blob is `bad_log` (discard the save and start fresh; the current match is untouched): a log that is present but not an array (`null` included), a seed that is not an integer, an unknown opponent, or settings `createMatch` rejects. `resumeVsAi` and the pass-and-play loop never throw on any JSON log value (plain data properties): the first malformed or illegal entry and everything after it are dropped (`droppedFrom`), so a damaged save resumes at its last good command. So a throw while the save is re-applied is a bug, not damage: the worker posts `error`, the current match is untouched, and the save is kept for the bug report (§9.1). If the log ends on the AI's move, the AI continues from there.
  - **This deviates from the earlier rule** that the resume blob is the human-only command format (§1.3). The **submission stays human-only**: the daily challenge submits `humanLog` (the worker's `state.humanLog` plus the human's own events), and the server regenerates every AI decision from it (§7), so a tampered blob can only change the tamperer's local game.
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
  There are ≤ 21 commands (`2 × weaponsEach + 1`: 10 picks, 10 shots and a sudden-death shot). The server replays the match and **regenerates every AI pick and shot**; any invalid human command rejects the run (`invalid_command`). Only the server-computed margin and points are stored.
- **The verifier contract** (Plan 2B's `verify.ts`, what Plan 4's binding wraps): `scoreVsAi(seed, commands, settings = STANDARD_SETTINGS, tier = DAILY_TIER)`, with `DAILY_TIER = "veteran"`.
  - **Input:** the seed and the **human's commands only**; the settings and the tier are trusted (the binding derives them from the mode). Every AI pick and shot is **regenerated** by `replayVsAi` (§1.3), in the live match's order.
  - **Output:** a `ReplayOutcome` with `score` = the **margin** (human points − AI points), `stat` = the **human's points** (the `wave` column), and `hash` = `hashMatch` of the final state. The vs-AI win golden gives `{ score: 85, stat: 254, hash: "be9db94d" }` (§8).
  - **Rejections, cheapest first:** `invalid_command_shape` (not an array); `too_long` (more than `2 × weaponsEach + 1` commands, before any AI work); `invalid_command_shape` (an entry that fails `isArcfireCommand`, this section's command type); `invalid_command` (an illegal command at any index, including one sent when it is not the human's move or after the match is over); `not_a_win` (unfinished, lost or drawn).
  - It **never throws** on any JSON `commands` value (plain data properties), which is why Plan 4's binding passes the zod-parsed commands (§9.1). An illegal AI command is a bug and throws, which the route's generic error handling answers with a 500 and stores nothing, never a verdict on the player.
  - The run is bounded by `too_long`, the fixed sim budgets (at most 11 Veteran turns × 1,500 sims) and the fixed probe grids (every probe flight ends within two flight caps, §5), so `limits.maxTicks` does not apply.
- **Route changes** (`src/app/api/games/scores/route.ts`): `scoreSubmissionSchema` becomes a zod **discriminated union on `gameSlug`** (Circle TD's schema unchanged; an Arcfire command schema added). The verifier already checks each title's own `title.simVersion` (Plan 1 removed the global `expectedSimVersion`). The daily seed comes from a new `dailySeedFor(slug, now)` in `src/lib/dailySeed.ts`: Circle TD keeps its existing `dailySeed(now)` (existing rows are keyed by it), and Arcfire uses `hashToSeed("arcfire:" + utcDateString(now))`. Ranks and boards are already filtered by `game_slug`. Plan 4 must also:
  - use `title.simVersion` (not Circle TD's imported `SIM_VERSION`) for the inserted row's `sim_version` and the rank/board filters;
  - compute `replay_hash` with a per-title command-log digest (e.g. an optional `TitleDef.hashCommands`) over the human's commands, because today it uses Circle TD's `hashCommands`;
  - have the Arcfire `TitleDef` binding wrap `scoreVsAi(input.seed, input.commands, STANDARD_SETTINGS, DAILY_TIER)`, deriving the `MatchSettings` and the tier from the mode, never from the submission. Settings are trusted input to `replayVsAi`: `createMatch` checks only `weaponsEach`, `poolSize` and `rosterSize` (integers, and the pool and roster bounds) and throws a `RangeError` otherwise (§2), so full range validation belongs to the binding;
  - refuse a non-daily Arcfire submission in the generic `verifyScore` before `replay`, since Arcfire has only the daily board, rather than mapping it to a replay rejection;
  - validate command shape in the zod schema, mirroring `isArcfireCommand`;
  - score only a finished match: `scoreVsAi` already requires `phase === "over"` (an unfinished log is `not_a_win`).
- **Config:** `LEADERBOARD_PUBLIC` becomes a per-slug map (both `false` until each game's launch gate passes), and `LEADERBOARD_SIM_VERSION` becomes a per-slug mirror with a sync test per title.
- **Migration `0002_arcfire_leaderboard.sql`** (run manually in the Supabase SQL editor, like 0001): add a per-slug daily rank index `(game_slug, sim_version, daily_date, score desc, created_at)` for mode='daily', plus a column comment documenting `wave` as the title-defined secondary stat. No other schema change.
- **Games index:** add an `arcfire` entry to `src/data/games.data.ts`; the daily preview becomes per-slug and shows only when that slug's board is public.
- **Launch gate for the Arcfire board:** the weekly balance sweep passes **with an empty allow-list** (§4.3), the cross-engine determinism gate is green in all three engines, and an owner playtest (which also settles the daily Veteran's noise, §5) freezes `simVersion`. Then flip `LEADERBOARD_PUBLIC.arcfire`. After launch, any change to the AI or a `power` is a `simVersion` bump (§5).

---

## 8 · Testing & verification

- **Determinism:** an Arcfire golden-hash test over scripted matches (vs-AI and 2P) plus cross-engine runs, so Chrome, Firefox, and Node agree bit-for-bit. Plan 2A adds:
  - **the per-weapon corpus** (`src/game/test/arcfire/corpus.ts`, `corpus.golden.json`): 15 fixed single-turn cases per roster weapon (aims, wind, shooter and a move) on two fixed boards, plus three specials (the left edge, a sudden-death draw, a sudden-death win). It covers wind off and on, both shooters, a move, extreme aims (volley shells at −7° and 187°), the flight cap, and every event kind the roster can emit. Each case is keyed by weapon id and fingerprinted by `hashBoard` (heights, tank x, moves left) plus its points, never by settings, pool, hands, RNG or Timeline, and each weapon's definition digest is pinned, so a roster append only adds keys and a failing key names its weapon;
  - **the full-roster golden** (`determinism.full.golden.json`): a whole match with the daily-challenge settings and a literal `rosterSize: 32`, generated by a fixed search strategy, which must be decisive, score on both sides, include a move and fire all 12 tags;
  - a single table of pins that drives every engine in `e2e/cross-engine-determinism.spec.ts`: Circle TD's golden, both Arcfire goldens and the corpus digest.

  Golden moves are **staged**, one cause per commit, each with an inertness check. The `rosterSize` plumbing moves nothing and its fold moves only the hash. Exact damage moves points only, and only down. Floored pixels and unclamped volleys move no golden, only a declared set of corpus cases. The loop refactor moves nothing, and each weapon task only adds corpus keys (a corpus update that would move an existing key refuses to write).

  Re-pins are declared and loud. Each update command writes what moved to stderr, which every Vitest reporter shows:
  - `UPDATE_ARCFIRE_GOLDEN=plan1` (`determinism.golden.json`) or `=full` (`determinism.full.golden.json`) re-pins only that golden, and `=1` re-pins both (never Plan 2B's vs-AI goldens, below). A golden that is not named keeps failing on a moved hash. Each re-pin logs `golden <name>: <old hash> -> <new hash> (scores <old> -> <new>)`.
  - `UPDATE_ARCFIRE_CORPUS=1` prints the moved cases and definition digests, and requires `ARCFIRE_CORPUS_EXPECT_MOVED=<n>`, the count of both that the re-pin declares: unless exactly n moved, it fails and writes nothing.
  - `UPDATE_ARCFIRE_CORPUS=add` writes new keys only, and refuses to write if any existing case or definition digest moved.

  Plan 2B adds the **AI pins**, and moves none of the above (`defDigest` excludes `power`, which `corpus.test.ts` now asserts for every roster entry):
  - **the AI corpus** (`src/game/test/arcfire/aiCorpus.ts`, `ai.corpus.golden.json`): fixed AI decisions in two sections, each with its own digest.
    - `turn|<tier>|<state>`, 45 cases, digest **`55df93ca`**: each tier's turn on fixed states (`corpusState` in `test/arcfire/fixtures.ts`: a real `STANDARD_SETTINGS` match drafted by the lowest free slot, never by `power`, then fixed shots, with no AI in it), plus specials that edit a hand, the wind or the phase. A case's fingerprint is `[w, move, angle, power, sims, probes, ev, rng.state]`: the command after noise, the sim and probe counts, the chosen ev and the RNG state after the 7 draws. The section never reads `power`.
    - `draft|<tier>|s<seed>`, 12 cases, digest **`c0d402d4`**: each tier's first six picks on a seed's pool and the RNG state after them. It reads `power`, so a `power` write-back moves this section.
    - **Coverage gates** keep the case list from going inert: some case moved, saved a tier-3 weapon, built DIRT by the rule, chose a beam, played sudden death and faced wind.
  - **the vs-AI goldens** (`determinism.vsai.golden.json`): a human win and a human loss against Veteran with `STANDARD_SETTINGS`, played live by a scripted human (`test/arcfire/vsaiGolden.ts`, verbatim code), then replayed from **the human's commands alone**, which must reproduce both the live hash (the leaderboard's core guarantee) and the pinned one.
    - Win: seed 20260934, 20 human commands, **`be9db94d`**, scores [254, 169]; `scoreVsAi` gives `{ score: 85, stat: 254, hash: "be9db94d" }`.
    - Loss: seed 20260928, **`2097c8fc`**, scores [234, 329]; `scoreVsAi` gives `not_a_win`.
    - The AI drafts by `power`, so a `power` write-back moves them too, and so does a change to `TIERS.veteran` (B1, §5).
    - A re-pin that flips a golden's outcome must move its seed: the checks require a finished human win and a finished human loss, both sides scoring, a human move and 6 AI tags, so `UPDATE_ARCFIRE_GOLDEN=vsai` fails and writes nothing until they hold. Edit the case's `seed` in `determinism.vsai.golden.json` to the next seed up and re-run `=vsai` until it passes; the commit declares each `seed old -> new`.
  - Both run on the bundled sim (`ai.entry.ts`, in `ai.corpus.test.ts`), always on. The cross-engine `PINS` table gains the two AI digests and both vs-AI goldens, and each engine also runs a **real-Worker smoke**: the bundled `worker.ts` plays the win golden to `be9db94d`, then a fresh Worker resumes it from the first 25 entries of its full log and finishes on the same hash.

  2B's update commands, one cause each, declared and loud like 2A's:
  - `UPDATE_ARCFIRE_AI=add` writes new case ids only, and refuses if any pinned case moved.
  - `UPDATE_ARCFIRE_AI=draft` re-pins the draft section only (a `power` write-back), and refuses if a turn case moved.
  - `UPDATE_ARCFIRE_AI=1` re-pins both sections, and requires `ARCFIRE_AI_EXPECT_MOVED=<n>`, the declared count of moved cases.
  - `UPDATE_ARCFIRE_GOLDEN=vsai` re-pins the vs-AI goldens, and **only `=vsai` does**: `=plan1`, `=full` and `=1` never touch them, so each command moves one cause's pins. It keeps each golden's seed (moving a seed is the manual step above).
  - The fixtures are created once, with `UPDATE_ARCFIRE_AI=1 ARCFIRE_AI_EXPECT_MOVED=0 UPDATE_ARCFIRE_GOLDEN=vsai`.
- **Sim unit tests (TDD):** terrain carve/add/settle (spans ↔ heightfield); ballistics (range, swept collision, bounds, flight cap); each primitive, through its roster weapons, plus synthetic definitions fired with `resolveWeapon` for the cases no roster weapon reaches; the draft (pool guarantees, alternation, first-pick rule); moves; scoring incl. self-damage and sudden death. Plan 2A also tests:
  - the weapon validator (every roster entry passes, seeded mistakes are named, a cyclic definition is reported, malformed input is reported and never thrown) and a totality test (degenerate definitions resolve without throwing, to integer state);
  - the quiet path's parity with `resolveTurn`, and that no weapon touches the match RNG;
  - homing (never more than `degPerStep`, never past the target);
  - beams (the dial and its mirror identity, mirror-exact boards, no self-hit at any of the 181 angles for either shooter);
  - the quake's shooter exemption;
  - that `STANDARD_SETTINGS` and `SHORT_SETTINGS` always satisfy the tag guarantees with the real roster, by construction and over seeds 0..499, plus a tripwire that a 33rd weapon forces a settings decision.

  Plan 2B's engine changes are pin-neutral, and it tests them (one new test file per task):
  - `copyMatchInto`: completeness, every `MatchState` key compared by value after the copy onto a destination whose every field first holds a sentinel no real match holds (so a field it misses fails, and a self-check fails on a new field until it gets a sentinel), `settings` shared, plus `hashMatch`, and parity (the quiet path on a reused scratch equals `resolveTurn` on a clone: points, hash and live spans, over 5 boards × 32 weapons × 8 aims);
  - the quick-reject: a reference property test (20,000 random shells on randomly edited terrain, with bounces, wall bounces, homing, ignore bits and flight caps; every step equal to the per-sample sweep), mutation-checked by dropping its hitbox test;
  - the Plan 2A carry-overs (§9.1): a self-containing delay list and a 10,000-deep delay chain each give exactly one validator report; a 4-stage ring with 40 back-references per stage walks each stage's effect list once and gives exactly 40 reports, and an over-deep path through a shared stage is still reported (all counts, never wall-clock); the homing-null guard; `maxTurnSteps` bounds; no −0 Timeline angle in the whole 2A corpus; the backstop's `out` events; the bounce at the flight cap.
- **Performance** (Plan 2A):
  - `perf.test.ts` bundles the sim with esbuild and runs it as one module before timing it, because vitest's module runner inflates timings about 4–5×. It requires Pulse's mean `resolveTurn` ≤ 0.2 ms (§5) and every weapon's ≤ 0.5 ms, each a best of three passes after a warm-up.
  - The corpus test also asserts, with no clock, that each case stays within its weapon's static step and shell bounds (§3.2).
- **AI** (Plan 2B). Everything that runs AI decisions in bulk, or is timed, runs on an esbuild bundle (`ai.entry.ts`, `sweep.entry.ts`); every unbundled test that searches or plays carries an explicit 30–120 s timeout, and no always-on unbundled test asserts on wall-clock time.
  - **Units:** the tier data (budgets 300 / 1,500 / 4,000, the noise kernels and their exactly 3 draws, the 12 probe models, DIRT exactly harmless); the probe's exactness and its termination on an apex-in-apex weapon (§5); the search (`planTurn` leaves the match and its RNG alone and plans the same on a clone; `sims ≤ tierBudget`; Hailstorm is aimable; the choice rules; a shot's value is the points it scores minus the points its self-damage gifts, both live, from either seat; the DIRT-only paths: an Ace holding only DIRT builds it by the forced rule, `forcedDirt`, and a Veteran fires it at its grid's least-metric cell, `inertOnly`); the policy (exactly 7 draws a turn and 1 a pick, clones decide alike, the command is legal, the draft's top N).
  - **vs-AI flow** (`vsai.test.ts`): the interleaving, including the AI's last pick followed by its opening shot; human-only replay equal to the live match; `resumeVsAi` equal to `replayVsAi` on every prefix of a short Rookie match (both goldens' full logs are resumed in `ai.corpus.test.ts`); a damaged log's resume (an illegal AI pick, then an illegal AI turn, is dropped at its index, `droppedFrom`, and the RNG draws it advanced are restored); a vs-AI match into sudden death (a tie-seeking human, `SHORT_SETTINGS` Rookie seed 18: its replay, every resume prefix, its score and the length cap); rejections at the right index; a 300-log fuzz that never throws. `verify.test.ts` checks the command shapes and that every cheap rejection comes before any AI work.
  - **The AI pins** (above): the same seed yields the same decisions, in Node and in every engine, and a vs-AI match replayed from **human commands alone** reproduces the final hash (the leaderboard's core guarantee). The AI corpus test also checks every turn decision against the rules its stats report (the budget, the DIRT threat and cut, the move gain, the tier-3 save), so a declared re-pin re-baselines the fingerprints, never the rules.
  - **The verification budget** (`ai.perf.test.ts`, on the bundled sim like `perf.test.ts`): the **first, cold** replay of the win golden after the bundle loads, which is the verifier's real case, must take < 5 s (× `ARCFIRE_PERF_MARGIN`, a multiplier to raise if CI ever flakes, never the literal; measured 507–526 ms). It also prints the best of three warm replays and each tier's decision times on the corpus's 8 plain states, with the 4 full-hand openings apart, and a loose Ace tripwire (mean ≤ 1,500 ms) for pathological regressions. Its first CI run's printout is the Node 22 baseline (§9.1).
  - **The worker:** `host.test.ts` drives the host in Node (it plays the win golden to its hash and resumes it mid-draft, mid-battle and finished; every rejection: `no_match`, `not_your_move`, `invalid_command` including malformed requests in battle, and `bad_log` for a bad log (a `null` one included), a seed that is not an integer, bad settings or an unknown opponent, which leaves the match untouched; a damaged save's `droppedFrom` on both the vs-AI and the pass-and-play branch; pass-and-play; the client round trip); `host.error.test.ts` makes re-applying a save throw on each branch and gets `error`, with the current match and opponent untouched; `client.test.ts` checks the client's robustness (every listener gets every event when one throws, and the error is reported; a load failure's plain `Event` becomes an `error` event with a message; `dispose()` terminates once, and every request after it throws); `worker.bundle.test.ts` checks the worker bundle's inputs and size (§1.4); and the cross-engine real-Worker smoke fails at once on a `rejected` or `error` event, naming it, instead of waiting for the timeout.
  - **Tier separation** runs in the weekly sweep, not in `npm test`: 200 seeds per pairing, `STANDARD_SETTINGS` (windless), power drafts, seats swapped on odd seeds. It requires Ace ≥ 85% against Rookie, Ace ≥ 60% against Veteran and Veteran ≥ 70% against Rookie (measured 99.5 / 93.5 / 85.5%, §5). These are AI-correctness properties on those settings: the weekly sweep enforces them every run and never allow-lists them. Free play's separation (`SHORT_SETTINGS`, wind) is not enforced (§5; the tuning pass adds it, §9.1). Every AI turn of every sweep match is also checked legal and within its tier's budget; always on, the AI corpus checks its decisions' rules (above) and the search test checks `sims ≤ tierBudget`, but no always-on test checks a win rate.
- **Guards:** the purity guard's `ROOTS` adds `src/game/titles/arcfire`, which covers `ai/**`, `vsai.ts` and `verify.ts`, comments included (the AI's prose avoids every banned word); `src/game/runtime/arcfire/**` and `src/game/test/**` are outside the roots. Lazy-boundary stays green (no `@/game` in `src/lib`/`src/components`/`src/data`); the bundle-budget check passes (Arcfire only behind `ssr:false`; nothing in 2B imports `client.ts`); Circle TD's golden `5167b43d` is unchanged, and no file under `src/game/sim` or `src/game/titles/circle-td` changes in 2B.
- **Balance harness** (§4.3), behind `BALANCE_SWEEP=1`: weekly and on `workflow_dispatch`, gated by `balance.allow.json`, never in `npm test` and never a merge blocker. `balance.test.ts` (always on) pins its pure half on hand-built records: aggregation, verdicts, suggestions, powers (DIRT on the least-squares line), the pick rate, the allow-list states (FAIL / ACK / STALE ACK), a report row, the cost table, and the roster write-back on the real `roster.ts` text (one line per id, idempotent, and its refusals), read against the live powers, so a real write-back keeps it green. `sweep.test.ts` (always on, no AI match) pins the runner: a malformed `ARCFIRE_SWEEP_THREADS` or `ARCFIRE_SWEEP_SHARD` throws, naming the variable; a thread count that is not an integer ≥ 1, a worker that exits mid-job and a failed job each reject the run, and the first failure stops every worker. The harness's knobs: `ARCFIRE_SWEEP_SHARD=k/n`, `ARCFIRE_SWEEP_MERGE=<dir>`, `ARCFIRE_SWEEP_THREADS=<n>` and `ARCFIRE_BALANCE_WRITE=1` (local only, after the tuning pass). Locally: `BALANCE_SWEEP=1 npx vitest run src/game/test/arcfire/arcfire.sweep.test.ts`.
- **Route:** tests accept a verified Arcfire win and reject a tampered log, a loss, a wrong seed, a sim-version mismatch, and a duplicate; rate limiting still applies; Circle TD's route tests stay unchanged and green.
- **In-browser (controller-owned):** WebGPU and `?renderer=canvas2d` on a desktop viewport and a phone-landscape viewport, covering the draft, battle (all 12 tags), results, resume, mute, and reduced motion. Dev loop is `next build && next start` (never `next dev`).

---

## 9 · Delivery shape

This is too large for a single plan. It's expected to split into sequential plans, as Circle TD's did:

1. **Plan 1 — engine generalization + Arcfire sim core:** the §1.2 refactor (landed and verified alone first), then terrain, ballistics, the match state machine, the draft, scoring, hashing, and goldens.
2. **Plan 2 — weapons + AI:** primitives, the 32-weapon roster, AI tiers, the worker, and the balance harness. It is split in two:
   - **Plan 2A — weapons** (`docs/superpowers/plans/2026-09-23-arcfire-plan-2a.md`): every §4.1 primitive, the 24 appended weapons (roster indices 8–31) with their Timeline events, the quiet path, the weapon validator, the §9.1 Plan 2 carry-forwards, the staged golden re-pin, the per-weapon corpus, the full-roster golden and the bundled perf test. It adds no AI, worker, renderer or UI.
   - **Plan 2B — AI** (`docs/superpowers/plans/2026-09-24-arcfire-plan-2b.md`; design addendum `docs/superpowers/specs/2026-09-24-arcfire-plan2b-ai-design.md`; owner decisions B1–B5 of 2026-09-24): the pin-neutral engine work (`copyMatchInto`, `toAct`, `applyCommand`, the quiet-path gating and the exact quick-reject), the §9.1 Plan 2A carry-overs, the three AI tiers and the draft AI (§5), vs-AI matches with human-only replay (`replayVsAi`, §1.3), the search-free resume (`resumeVsAi`, §6.5) and the verifier-facing `scoreVsAi` (§7), the AI pins and the < 5 s verification test (§8), the Web Worker host, protocol and client (§1.4), the cross-engine rows and a real-Worker smoke, and the balance harness with the tier-separation sweep, its allow-list and its first run (§4.3). It adds no renderer, HUD, UI, audio or resume UI (Plan 3), and no route, migration, daily seed or board UI (Plan 4). It writes no `power`: the owner's tuning pass follows it (§9.1).
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
- **Plan 2B** (the rest of the original Plan 2, plus Plan 2A's hand-off): **every item is resolved by Plan 2B or moved**, and no existing pin moves:
  - The AI tiers, the draft AI, the worker, vs-AI replay and the < 5 s verification test → **built** (§5, §1.4, §8). vs-AI replay is **`replayVsAi`** in `vsai.ts`, not `replayMatch`, which stays the 2-player replay (§1.3). The < 5 s test is `ai.perf.test.ts`, which asserts the cold first replay.
  - Entry points → **used**. The AI values every candidate with `resolveTurnPoints` on a `copyMatchInto` scratch. The probe does **not** fire a synthetic shell through `resolveWeapon`: it flies each weapon's own probe model with the sim's own flight code, exact by construction (§5). The draft preview is the worker's `preview` request, `resolveTurn` on a fixed flat board (§1.4).
  - Weapons consume no RNG → **relied on**: the search resolves on scratch copies and draws nothing, so `planTurn` is pure and each decision's draws are fixed (§5). The AI aims beams on the dial through `beamDir` at one power (`BEAM_POWER`).
  - Shell outcomes are not side-symmetric → **no mirroring**: the AI probes every aim from the shooter's own side (facing angle f is command f for player 0, 180 − f for player 1) and never mirrors a grid, so the pixel asymmetry costs nothing.
  - Static cost bounds (`maxShells` ≤ 13, `maxTurnSteps` ≤ 3,600) → **unchanged**, and now tested (`maxTurnSteps`: Twin Nova 1,230, Cascade 3,600, Lancer 1).
  - Timing → **done**. Every timed or bulk AI test runs on an esbuild bundle (`ai.entry.ts`, `sweep.entry.ts`), the < 5 s test included. `copyMatchInto` is in `state.ts` and skips the spans (§1.3). The AI's workload was measured on an opponent-facing grid: a quiet sim costs 16.8 µs for Pulse, 33.9 µs on average over the roster and 87.4 µs at most (Pinball), with the quick-reject (§5). **Moved:** the Node 22 baseline needs a CI run (below).
  - The quiet path's allocations (K12) → **gated**, and the parity test proves it inert: the walk paths, `split`'s `children`, `settle`'s heights copy and the capsule table. **A deliberate deviation:** the `Timeline` object, one `Trigger` per trigger, the `[p0, p1]` points array and `stepShell`'s `Impact` results stay allocated, since gating them would save about 0.3% of an Ace match (GC) and a shared points array would be a trap for callers.
  - The balance harness → **built; the `power` write-back is moved** to after the tuning pass (owner decision B5: ⚑ O9), so Plan 2B keeps the placeholders. Its first run is the judge the hand-off asked for:
    - homing at the spec numbers never misses (Seeker 50.0 net points a shot, sd 0; Swarm 93.0 at +15.9%) → **moved** to the tuning pass (owner decision B2: no homing change in 2B);
    - under the dig clamp, Burrow passes (44.5, tier 2) and Auger fails structurally (11.5) → the tuning pass;
    - top-attack and direct-hit stacking does exceed the tier-3 band: Nova (90.5), Twin Nova (104.3) and Swarm (93.0), all three also over +12% → the tuning pass.
  - Minors deferred by Plan 2A's final review → **resolved**, pin-neutral:
    - `fanOffset` returns `… | 0`, so a split child's angle is never −0 (none of the > 900 Timeline shell angles in the 2A corpus is);
    - `endStep` (count the step, apply the flight cap) is shared by the free-flight end and `endBounce`, and the bounce-at-the-cap test stays green;
    - the backstop's `out` events are pinned: a self-splitting hop fired straight up at power 100 reaches step 4,800 and gives exactly one `out`, at step 4,800 with lag 0.
  - Also fixed by Plan 2B: `weaponErrors` threw `RangeError` on a self-containing `delay.then` (a split or delay inside a delay list is now reported and not descended into), and multi-stage cycles cost k^L (a `(stage, depth)` memo bounds the stage bodies checked by stages × `MAX_STAGE_DEPTH`; a back-reference inside a skipped stage can go unreported, but each cycle still gets at least one cyclic or too-deep report, so the def is still rejected). The homing-null guard gained its test.
- **After Plan 2B, before launch: the owner's tuning pass** (⚑ O11). It changes weapon data only, with a declared re-pin of every pin it moves (the 2A corpus's cases and definition digests, the goldens, the AI pins):
  - **The 9 first-run failures** (the report is `docs/superpowers/2026-09-24-arcfire-balance-first-run.md`; all nine are ACKs in `balance.allow.json` until tuned):
    - round one, the damage scalings: Nova ×0.77 (90.5 net points a shot, +12.0%), Twin Nova ×0.67 (104.3, +17.3%) and Swarm ×0.75 (93.0, +15.9%), all three above the tier-3 band and over +12%; Shrapnel ×1.84 (24.4) and Skipper ×1.70 (26.5), below the tier-2 band;
    - round two, the structural fixes: Needle (78.6, above tier 2: 75% hits and 104.7 points on a hit, so a smaller damage, e.g. ×0.6), Railshot (27.6, below tier 2: 38% hits, so a larger radius), Prism (33.1, below tier 3: one beam of three reaches, so a narrower spread or more damage a beam) and Auger (11.5, below tier 2: 70% hits and 16.4 points on a hit, so a shorter tunnel or a shallower pitch). For a multi-shell or multi-beam weapon the harness's ≥ 80% hit rule (§4.3) can print a plain scaling where the fix is structural: the report suggests Prism "damage × 2.12", and the owner default (⚑ O11) is the structural fix above;
    - re-run the harness after each round, and remove each fixed weapon from the allow-list (a `STALE ACK` says when). Triad sits just inside tier 1 (39.7).
  - **Homing** (owner decision B2): after the two rounds, rule whether Swarm, and Seeker, which never misses, need a lock radius or a turn budget. That is a new rule (§4.1), not a smaller number.
  - **DIRT's value** (⚑ O13, accepted for launch): holding a DIRT weapon costs its holder 8–17% of win rate, and the first-run powers (Rampart 10, Bastion 20, Leveler 1) mean the AI will rarely draft one. Revisit after playtests.
  - **Then the `power` write-back** (⚑ O9), locally: `BALANCE_SWEEP=1 ARCFIRE_BALANCE_WRITE=1 npx vitest run src/game/test/arcfire/arcfire.sweep.test.ts`, then the two declared re-pins it prints, `UPDATE_ARCFIRE_AI=draft` and `UPDATE_ARCFIRE_GOLDEN=vsai`. No 2A pin moves. If a golden's outcome flips, `=vsai` refuses until its seed is moved (§8).
  - **The daily Veteran** (owner decision B1): the owner's playtest decides. If the owner can't win about one daily in three, widen `TIERS.veteran`'s noise (e.g. to ±3° / ±5) with a declared AI re-pin: `UPDATE_ARCFIRE_AI=1` with its moved count, then `UPDATE_ARCFIRE_GOLDEN=vsai`, moving a golden's seed if its outcome flips (§8). The weekly tier separation must stay green (Ace ≥ 60% against the looser Veteran, and it ≥ 70% against Rookie).
  - **Free-play tier separation** (not enforced by Plan 2B, §5). Add a free-play separation block to the weekly sweep: `SHORT_SETTINGS` with wind, 100 seeds per pairing, power drafts, seats swapped on odd seeds, with thresholds set with a margin below the measured 90 / 86 / 100% (Ace–Veteran, Veteran–Rookie, Ace–Rookie), and never allow-listed.
  - **The Node 22 baseline** (moved from Plan 2B, which never pushes): after the first CI run, record here the numbers `ai.perf.test.ts` prints (daily verification cold and warm; each tier's mean and maximum decision time on the 8 plain states, and on the 4 full-hand openings), replacing §5's Node 24 dev-machine figures, together with the first weekly sweep's cost table. Plan 2B's local cost table, mean / max over 20,004 decisions: Rookie 144 / 300 sims and 564 / 1,737 probe flights; Veteran 651 / 1,200 and 3,559 / 9,357; Ace 2,123 / 3,700 and 21,773 / 49,900.
  - **The launch gate** (§7): the weekly sweep green with an empty allow-list, the cross-engine gate green in all three engines, and the owner's playtest; then freeze `ARCFIRE_SIM_VERSION` (still 1 after Plan 2B) and flip `LEADERBOARD_PUBLIC.arcfire`.
- **Plan 3:**
  - **Drive the worker** through `ArcfireWorkerClient`, its only handle (§1.4): `start` / `pick` / `turn` / `preview` / `on` / `dispose`. The human's event arrives before the AI thinks; queue events by `seq`, play the AI's shot after the human's playback, and show "aiming…" only if the AI's event has not arrived by then.
    - Every listener runs for every event, even when an earlier one throws; the thrown error is reported without interrupting the other listeners (through `reportError` where the platform has it, which dispatches the global `error` event at once; otherwise it is rethrown from a timer), and never swallowed.
    - A worker failure, such as a load failure (a plain `Event` with no message), arrives as an `error` event with `id` −1 and the message "arcfire worker failed to load" when the event carries none.
    - `dispose()` is idempotent: it terminates the worker and drops the listeners once. After it, every request (`start`, `pick`, `turn`, `preview`) throws `Error("ArcfireWorkerClient: disposed")`, so a call site that can race a dispose wraps the call.
  - Show at least **700 ms of visible aiming** before any AI shot (owner decision B4: ⚑ O14; §6.4). It is presentation only, never in the worker.
  - Save the resume blob after every event and resume with `start(…, log)` (owner decision B3; §6.5). Submit the daily's `humanLog`.
  - Handle `rejected{invalid_command}` (the UI's local check drifted: re-sync from the last snapshot), `not_your_move`, `no_match`, `bad_log` (a damaged save: a log that is present but not an array, `null` included, a seed that is not an integer, an unknown opponent, or settings `createMatch` rejects; discard it and start fresh) and `error` (a bug-report path). A `start` answered by `error` alone threw while re-applying the save, a bug: the current match is untouched, and Plan 3 keeps the save (it goes with the bug report). Of the worker's answers, only `bad_log` discards a save.
  - The first task verifies `new Worker(new URL("./worker.ts", import.meta.url), { type: "module" })` inside `npm run build`. The fallback is the esbuild worker bundle emitted into `public/`.
  - Playtest the heaviest Ace openings on a real mid-range phone (owner decision B4: ⚑ O15; 1.65–2.18 s at 4× CPU throttling, §5). The levers, if needed: the dirty-range settle (speed only, no decision changes), or half the Ace's stationary budget or no Ace move search (both strength-neutral, but they change the Ace's decisions: a declared re-pin).
  - Optional: a "what would the Ace do" hint is a one-line host addition, since `planTurn` is RNG-free and cannot perturb the match.
  - Extend the Timeline (pre-settle heightfield, launch/move events; §3.4).
  - Play it back at `step + lag`, animating roll, dig, burn and quake over `dur`.
  - Draw a beam weapon's aim needle along `beamDir`, with the elevation readout (§4.1).
  - Drag-to-aim for a beam weapon goes through the inverse of `beamDir` (§6.1): the command angle is θ + 90 for player 0 and θ − 90 for player 1, clamped to 0..180, and the drag length is ignored.
  - Keep the HUD metadata (description, glyph) in a separate map keyed by weapon id, outside `WeaponDef` (§4.1): a presentation field inside `WeaponDef` would move the pinned definition digests.
  - Draw negative y: repeated builds can raise a column toward y = 0, so a hitbox can extend above the world top.
- **Plan 4:**
  - the §7 route items above, including the Arcfire `TitleDef` binding: `replay(input)` returns `scoreVsAi(input.seed, input.commands, STANDARD_SETTINGS, DAILY_TIER)` (Plan 2B's verifier contract, §7), passing the zod-parsed commands, never the raw request object (`scoreVsAi` never throws on any JSON value, with plain data properties; a getter that throws, or a Proxy, can make it throw), `verifyScore` refuses a non-daily Arcfire submission before `replay`, the zod command schema mirrors `isArcfireCommand`, and `replay_hash` digests the human's commands; `limits.maxTicks` does not apply;
  - harden `src/game/sim/boundary.test.ts`, which only matches the literal `@/game/titles/` alias, to also resolve relative imports;
  - range-validate `MatchSettings` at the binding (`createMatch` checks only `weaponsEach`, `poolSize` and `rosterSize`, §2).
- **Housekeeping:**
  - pre-existing jsdom "HTMLCanvasElement getContext()" test noise;
  - the duplicated per-engine loops in `e2e/cross-engine-determinism.spec.ts`: resolved by Plan 2A, where one table of pins drives every engine;
  - Firefox cross-engine is verified in CI only (it can't launch locally). Plan 2B's AI pins and real-Worker smoke have never run in Firefox: the first CI run of the 2B branch must show Firefox reproducing them before the branch merges.

---

## 10 · Open items (non-blocking for planning)

- A trademark / name-availability check on "Arcfire" before public launch.
- The initial numbers in §2–§5 are starting points; the balance harness and the owner's playtest set the shipped values (and freeze `simVersion`).
