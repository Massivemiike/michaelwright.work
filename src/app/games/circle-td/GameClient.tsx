"use client";

// src/app/games/circle-td/GameClient.tsx
//
// Owns the <canvas>, the Circle TD sim, the Canvas2D renderer, and the
// fixed-timestep loop (src/game/runtime/loop.ts) driving them. 'use client'
// because it touches <canvas>, ResizeObserver, requestAnimationFrame, and
// document visibility — none of which exist on the server (see
// node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md).
//
// This file was created in Task 5 (sim/loop/renderer mount) and is
// extended in place here in Task 6: pointer + keyboard input, wired to an
// InputModel (src/game/runtime/input/pointer.ts) that turns player intent
// into Commands run through applyCommand — the SAME path Plan 3's
// leaderboard replay verifier uses, so what the player does here and what
// gets verified later are identical by construction. Task 7 adds the DOM
// HUD (components/game/*) composed at the bottom of this file's JSX,
// reading a throttled RenderSnapshot (src/game/runtime/hud/snapshotStore.ts)
// and dispatching back into the SAME `inputModelRef`/`loopRef` this file
// already owns, via the stable wrapper objects declared in the component
// body (paletteInputModel/panelInputModel/loopControls) — no separate
// InputModel/GameLoop instance of its own. Task 8 is what actually routes
// to this component
// (dynamic, ssr:false, behind a click-to-play gate) and picks a real seed;
// until then this always free-plays a fixed seed so there's something
// deterministic to look at (Task 9's browser check) the moment it mounts.
//
// StrictMode note: React's dev-mode double-invoke runs this effect's
// setup → cleanup → setup for a single real mount. The `alive` flag
// (checked after the only `await` in setup(), per React's documented
// pattern for async effects) plus every ref being written only by the
// effect invocation that owns it keeps a discarded first pass from
// leaking a running loop, a live ResizeObserver, or a half-initialized
// renderer. reactCompiler is on, so the sim/renderer/loop/snapshots all
// live in refs, never React state — they change at 30-60Hz and must not
// drive a re-render.
import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import { makeSim, type CircleTdSim, type SimConfig } from "@/game/titles/circle-td";
import type { TowerHit } from "@/game/titles/circle-td/rules";
import { Canvas2DRenderer } from "@/game/runtime/render/canvas2d/Canvas2DRenderer";
import type { Renderer, HitEvent } from "@/game/runtime/render/Renderer";
import { makeRenderSnapshot, type RenderSnapshot } from "@/game/sim/engine";
import { makeLoop, type GameLoop } from "@/game/runtime/loop";
import { InputModel, tileAtWorld, towerIndexAtTile, DEFAULT_TOWER_TYPE } from "@/game/runtime/input/pointer";
import { createSnapshotStore } from "@/game/runtime/hud/snapshotStore";
import { toFloat } from "@/game/sim/math/fixed";
import { ALIVE_CAP_NORMAL, TILES, TOWERS, WAVE_INTERVAL_TICKS } from "@/game/titles/circle-td/content";
import { useNodeNetwork } from "@/components/context/NodeNetworkContext";
import Hud from "@/components/game/Hud";
import TowerPalette, { type TowerPaletteInputModel } from "@/components/game/TowerPalette";
import SelectedTowerPanel, { type SelectedTowerPanelInputModel } from "@/components/game/SelectedTowerPanel";
import SpeedControls, { type SpeedControlsLoop, type Speed } from "@/components/game/SpeedControls";
import GameOver from "@/components/game/GameOver";

// Free-play default until Task 8 derives a real daily seed and gates the
// mount behind a click. A fixed constant (not e.g. Date.now()) keeps this
// component's own behavior deterministic — the sim's own randomness comes
// from the seed, not from when the page happened to load.
const DEFAULT_SEED = 1;
const DEFAULT_MODE: SimConfig["mode"] = "free";

// Shared empty array for a frame with no new hits (the overwhelmingly
// common case) — avoids allocating a new-identity-but-still-empty list on
// every single render() call.
const NO_HITS: HitEvent[] = [];

// Final-review finding #6: maps the sim's tile-indexed TowerHits (rules.ts)
// into the renderer's world-space HitEvents (Renderer.ts) — the one place
// those two deliberately-differently-named types (see rules.ts's TowerHit
// comment) meet. Pure and DOM-free (module-scope constants only), so it's
// unit-testable with no canvas/React involved — see GameClient.test.tsx.
// `kind` carries the firing tower's type through so a future renderer can
// vary the flash by tower (e.g. a bigger burst for Splash) without this
// mapping needing to change.
export function mapTowerHitsToRenderHits(hits: readonly TowerHit[]): HitEvent[] {
  return hits.map((h) => ({
    x: toFloat(TILES[h.tile * 2]),
    y: toFloat(TILES[h.tile * 2 + 1]),
    kind: h.towerType,
  }));
}

// Task 7: a wave is "imminent" once we're within this many ticks of the
// next WAVE_INTERVAL_TICKS boundary — 90 ticks = 3s at loop.ts's 30Hz
// SIM_HZ. This threshold (and the whole "imminent dot" idea) is a
// judgment call, not sourced from the spec — the brief lists it as
// optional HUD chrome, not a gameplay-affecting figure.
const WAVE_IMMINENT_TICKS = 90;

export interface GameClientProps {
  seed?: number;
  mode?: SimConfig["mode"];
}

const containerStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  // Anchors the Task 7 HUD overlay below, which is absolutely positioned
  // against this container rather than the viewport.
  position: "relative",
};

const canvasStyle: CSSProperties = {
  display: "block",
  width: "100%",
  height: "100%",
  // Pointer input (Task 6) drives placement/selection directly off this
  // canvas — without this, mobile browsers intercept a drag/pinch as a
  // scroll/zoom gesture before pointer events ever reach the handlers
  // below.
  touchAction: "none",
};

// Task 7: the DOM HUD overlaid on top of the canvas. `pointerEvents: "none"`
// on the outer wrapper lets clicks/drags fall through to the canvas
// everywhere EXCEPT where an actual HUD panel re-enables
// `pointerEvents: "auto"` on itself (every component in components/game
// does this on its own root) — so the palette/panel/speed controls are
// clickable without the invisible rest of the overlay ever blocking a
// tower placement click.
const hudOverlayStyle: CSSProperties = { position: "absolute", inset: 0, pointerEvents: "none" };
const hudTopLeftStyle: CSSProperties = { position: "absolute", top: "1rem", left: "1rem" };
const hudTopRightStyle: CSSProperties = {
  position: "absolute",
  top: "1rem",
  right: "1rem",
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-end",
  gap: "0.75rem",
  // 70vw (not a fixed px cap alone) so this has more room to breathe at the
  // 360-414px widths the brief calls out before SpeedControls' own
  // flexWrap has to kick in.
  maxWidth: "min(320px, 70vw)",
};
const hudBottomStyle: CSSProperties = {
  position: "absolute",
  bottom: "1rem",
  left: "1rem",
  right: "1rem",
  display: "flex",
  justifyContent: "center",
};

export default function GameClient({ seed = DEFAULT_SEED, mode = DEFAULT_MODE }: GameClientProps) {
  // Task 8: suspends the site-wide background canvas (NodeNetworkCanvas)
  // for as long as this component is mounted — see the mount effect
  // below for where this is actually called, and NodeNetworkContext.tsx
  // for why `suspended` is a transient flag, never `settings.enabled`/
  // localStorage.
  const { setSuspended } = useNodeNetwork();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const simRef = useRef<CircleTdSim | null>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const loopRef = useRef<GameLoop | null>(null);
  // The two most recent snapshots, read by render()'s interpolation.
  // Seeded with the tick-0 snapshot twice so render() never has to
  // null-check before the first tick fires.
  const snapshotsRef = useRef<{ prev: RenderSnapshot; curr: RenderSnapshot } | null>(null);
  // Task 6: placement/selection state. inputModelRef is what Task 7's HUD
  // reads (selectedTowerType/selectedTile/inputLog) — a plain object in a
  // ref, not React state, since pointer/keyboard events mutate it far more
  // often than a render should be triggered. hoveredTileRef/pausedRef are
  // GameClient-local UI state that doesn't belong on the model itself
  // (hover is a rendering concern, not player intent; pause is the loop's
  // own concept — see loop.ts's setPaused).
  const inputModelRef = useRef<InputModel | null>(null);
  const hoveredTileRef = useRef<number>(-1);
  // Task 7: starts `true` (not `false`) — the pre-round BUILD PHASE now
  // starts the loop paused so the player can place towers at tick 0 before
  // wave 1 spawns; GO (SpeedControls) is what flips this. See setup()
  // below and the brief's "GO/pause model" section.
  const pausedRef = useRef<boolean>(true);

  // --- Task 7: HUD wiring ---
  //
  // `syncRef` is how the stable, always-safe-to-call wrapper objects below
  // (paletteInputModel/panelInputModel/loopControls, all created once via
  // useState so their identity never changes across renders) reach INTO
  // the current effect invocation's `syncUiState`/`syncRendererHighlight`
  // closures, which don't exist yet at component-body eval time and are
  // recreated every effect run. Defaults to no-ops so calling a wrapper
  // before setup() has run (or after unmount) is inert rather than a
  // null-deref.
  const syncRef = useRef<{ ui: () => void; highlight: () => void; snapshot: () => void }>({
    ui: () => {},
    highlight: () => {},
    snapshot: () => {},
  });

  // Throttled (~10Hz, see snapshotStore.ts) RenderSnapshot for the HUD's
  // numbers — reactCompiler is on and the sim/renderer/loop live in refs
  // specifically so they DON'T drive a re-render at 30-60Hz; this is the
  // one deliberate, rate-limited bridge from that ref world into React
  // state. Seeded with an all-zero placeholder (bank/score/wave all 0,
  // gameOver false) until the mount effect's first frame pushes the real
  // sim.snapshot() — same "brief 0-1 frame flash" already disclosed for
  // the canvas itself in Task 5.
  const [hudStore] = useState(() => createSnapshotStore(makeRenderSnapshot(0, 0)));
  const snapshot = useSyncExternalStore(hudStore.subscribe, hudStore.getSnapshot);

  // Mirrors InputModel's UI-only fields (armed palette type; selected
  // placed tower's tile/type/level) into React state, since InputModel
  // itself is a plain mutable object in a ref (mutated far more often, by
  // pointer/keyboard events, than a render should be triggered) — but
  // unlike the snapshot above, THESE change only on a user action, not
  // every frame, so mirroring them as ordinary (untraced) state is cheap
  // and doesn't need throttling. type/level come from sim.state.towers
  // directly (via towerIndexAtTile), not RenderSnapshot, because
  // RenderSnapshot has no per-tower tile field to map a selected TILE back
  // to a tower array index.
  const [uiState, setUiState] = useState<{
    towerType: number;
    tile: number;
    tileType: number;
    tileLevel: number;
  }>({ towerType: DEFAULT_TOWER_TYPE, tile: -1, tileType: -1, tileLevel: -1 });

  // paused/speed have no ground-truth getter on GameLoop (setPaused/
  // setSpeed are write-only — see loop.ts) — SpeedControls reports changes
  // up via onPauseChange/onSpeedChange, and THIS state is what GameClient
  // (and pausedRef, for the visibilitychange handler below) treats as the
  // current value.
  const [uiPaused, setUiPaused] = useState(true);
  const [uiSpeed, setUiSpeed] = useState<Speed>(1);

  // Stable (created once, never recreated) wrapper objects handed to the
  // HUD components as their `loop`/`inputModel` props. Each one forwards
  // to whatever's CURRENTLY in loopRef/inputModelRef (null until setup()
  // resolves, always safe via `?.`) and then resyncs the canvas highlight
  // + the uiState mirror above via syncRef — so a click/keypress in the
  // HUD has the exact same downstream effect as the equivalent canvas
  // pointer/keyboard interaction from Task 6.
  const [loopControls] = useState<SpeedControlsLoop>(() => ({
    setPaused: (p) => loopRef.current?.setPaused(p),
    setSpeed: (s) => loopRef.current?.setSpeed(s),
  }));
  const [paletteInputModel] = useState<TowerPaletteInputModel>(() => ({
    selectTower: (type) => {
      inputModelRef.current?.selectTower(type);
      syncRef.current.highlight();
      syncRef.current.ui();
    },
  }));
  // Final-review finding #1: upgrade/sell both mutate SimState (bank,
  // tower level/count) synchronously via applyCommand, regardless of
  // whether the loop is currently paused — but the CANVAS only redraws
  // from snapshotsRef, which tick() alone advances. During the pre-round
  // build phase (or any manual mid-game pause) tick() never runs, so
  // without an explicit re-snapshot here a sell/upgrade would change the
  // HUD's numbers (throttled snapshotStore.push reads live sim.state) while
  // the canvas kept showing the stale tower. `syncRef.current.snapshot()`
  // forces snapshotsRef.curr/prev to the freshly-mutated state immediately.
  const [panelInputModel] = useState<SelectedTowerPanelInputModel>(() => ({
    upgrade: (tile) => {
      inputModelRef.current?.upgrade(tile);
      syncRef.current.snapshot();
      syncRef.current.highlight();
      syncRef.current.ui();
    },
    sell: (tile) => {
      inputModelRef.current?.sell(tile);
      syncRef.current.snapshot();
      syncRef.current.highlight();
      syncRef.current.ui();
    },
  }));

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    // Task 8: two live canvases (this one's Canvas2D drawing plus the
    // background NodeNetworkCanvas's own rAF loop) would otherwise fight
    // for GPU and, since both listen on `window`, pointer events. This
    // is a transient, per-mount fact — never persisted, never touching
    // the visitor's saved background-effect preference.
    setSuspended(true);

    let alive = true;
    let resizeObserver: ResizeObserver | null = null;

    const sim = makeSim({ seed, mode });
    simRef.current = sim;
    const initialSnapshot = sim.snapshot();
    snapshotsRef.current = { prev: initialSnapshot, curr: initialSnapshot };

    // Own this effect invocation's InputModel via a local const (not just
    // the ref) so every handler below closes over the exact instance tied
    // to this `sim` — a discarded StrictMode first pass can never mutate
    // state a surviving second pass owns, same discipline as `sim`/
    // `renderer` already get.
    const inputModel = new InputModel({ getState: () => sim.state });
    inputModelRef.current = inputModel;
    hoveredTileRef.current = -1;
    // Task 7: BUILD PHASE starts paused; GO (SpeedControls) unpauses — see
    // setup() below, which calls loop.setPaused(true) right after start().
    pausedRef.current = true;

    // Typed as the Renderer interface, not the concrete class, even though
    // Canvas2D is the only backend today — Plan 3's WebGPU renderer drops
    // in here unchanged (see src/game/runtime/render/Renderer.ts). The
    // highlight/ghost calls below (final-review finding #7) go straight
    // through the shared interface now — no `instanceof Canvas2DRenderer`
    // narrowing, so a future backend gets them for free.
    const renderer: Renderer = new Canvas2DRenderer();

    // Final-review finding #6: TowerHits produced by tick()'s call(s) to
    // fireTowers, accumulated across however many sim ticks happen to run
    // in a single animation frame (loop.ts's `tick` can fire 0+ times
    // before the once-per-frame `render`) and drained by render() below —
    // exactly the same "buffer between 0+ producer calls and one consumer
    // call" shape hudStore.push already uses, just simpler since every hit
    // is unconditionally forwarded rather than throttled.
    let pendingHits: TowerHit[] = [];

    async function setup(): Promise<void> {
      try {
        // Non-null: narrowed above, but TS doesn't carry that narrowing of
        // a `const` into a hoisted function *declaration* like this one
        // (only into arrow-function closures) — canvas/container are
        // genuinely non-null here.
        await renderer.init(canvas!);
      } catch (err) {
        // A real <canvas> always yields a 2D context; this realistically
        // only fires in a hostile/stubbed environment (a canvas-blocking
        // privacy extension, or jsdom in tests). Log and bail rather than
        // leave an unhandled promise rejection — there's nothing to
        // recover into without a working canvas.
        console.error("GameClient: renderer failed to initialize", err);
        return;
      }

      // The effect that started this setup() may already have been torn
      // down (StrictMode's dev double-invoke, or a fast unmount) by the
      // time the await above resolves — discard this pass's renderer
      // instead of wiring up a loop/observer nothing will ever stop.
      if (!alive) {
        renderer.destroy();
        return;
      }
      rendererRef.current = renderer;

      const loop = makeLoop(
        {
          tick() {
            const snapshots = snapshotsRef.current;
            if (!snapshots) return;
            snapshots.prev = snapshots.curr;
            // Final-review finding #6: capture whatever TowerHits this
            // tick's fireTowers() call produced — previously discarded
            // entirely (`sim.tick();`), so a tower could kill a creep with
            // no on-screen indication at all. Buffered in pendingHits since
            // 0+ ticks can run before the next render() drains it.
            const hits = sim.tick();
            if (hits.length > 0) pendingHits.push(...hits);
            snapshots.curr = sim.snapshot();
          },
          render(alpha) {
            const snapshots = snapshotsRef.current;
            if (!snapshots) return;
            const renderHits = pendingHits.length > 0 ? mapTowerHitsToRenderHits(pendingHits) : NO_HITS;
            renderer.frame(snapshots.prev, snapshots.curr, alpha, renderHits);
            pendingHits = [];
            // Task 7: offer the HUD store a fresh snapshot every frame —
            // hudStore.push internally throttles this to ~10Hz (see
            // snapshotStore.ts) and only actually calls sim.snapshot()
            // (which allocates) when it accepts. Reading LIVE sim.state
            // here (not snapshots.curr, which only advances on a real
            // tick() call) is what lets the HUD reflect a bank change from
            // placing/upgrading/selling a tower immediately even while the
            // loop is paused during the pre-round build phase, when tick()
            // never runs at all.
            hudStore.push(() => sim.snapshot(), performance.now());
          },
        },
        {
          now: () => performance.now(),
          raf: (frameCb) => requestAnimationFrame(frameCb),
          caf: (id) => cancelAnimationFrame(id),
        }
      );
      loopRef.current = loop;

      resizeObserver = observeResize(container!, renderer);
      loop.start();
      // Task 7: pre-round BUILD PHASE — the loop starts paused so the
      // player can place towers at tick 0 (applyCommand mutates sim.state
      // synchronously regardless of pause state) before wave 1 spawns.
      // GO (SpeedControls, via loopControls.setPaused) is what flips this.
      loop.setPaused(true);
      // Reflect the default armed tower type (and any hover that already
      // happened before init() resolved) the moment the renderer exists,
      // rather than waiting for the next pointer event to paint it.
      syncRendererHighlight();
      syncUiState();
    }

    // --- Task 6: pointer + keyboard input ---
    //
    // Every handler below closes over this effect invocation's own `sim`/
    // `canvas`/`inputModel` consts, never the refs — the refs exist so
    // Task 7's HUD (a sibling component) and this component's own cleanup
    // can reach them, not so these handlers would re-fetch a value that
    // never changes within one mount. `rendererRef.current` IS read
    // through the ref (not a local), since the renderer doesn't exist yet
    // when these closures are created (it's still awaiting init() inside
    // setup()) — every use below tolerates it being null.

    // Maps a placed tower's tile to its index in the CURRENT snapshot's
    // tower arrays for setHighlightTower — safe because packSnapshot
    // (titles/circle-td/index.ts) never filters/reorders towers the way it
    // does creeps, so SimState.towers' index i is always RenderSnapshot's
    // tower index i too.
    //
    // Final-review finding #7: goes through the shared Renderer interface
    // directly now (setHighlight/setHighlightTower are part of it) — no
    // more `instanceof Canvas2DRenderer` narrowing.
    const syncRendererHighlight = (): void => {
      const r = rendererRef.current;
      if (!r) return;
      if (inputModel.selectedTile !== -1) {
        const idx = towerIndexAtTile(sim.state, inputModel.selectedTile);
        r.setHighlightTower(idx === -1 ? null : idx);
        r.setHighlight(-1, -1, true);
      } else {
        r.setHighlightTower(null);
        const type = inputModel.selectedTowerType;
        // Final-review finding #2: the ghost must dim when the armed type
        // costs more than the CURRENT bank, not just at mount — read live
        // sim.state.bank (not a throttled RenderSnapshot) so this tracks
        // every place/upgrade/sell instantly, same as the HUD's own
        // bank-driven affordability checks (TowerPalette's disabled state).
        const affordable = type >= 0 && type < TOWERS.length ? sim.state.bank >= TOWERS[type].cost : true;
        r.setHighlight(hoveredTileRef.current, type, affordable);
      }
    };

    // Final-review finding #1: forces snapshotsRef to a freshly-packed
    // snapshot of the CURRENT sim.state, immediately — the only way a
    // place/upgrade/sell shows up on the canvas while the loop is paused
    // (tick() is what normally advances snapshotsRef, and tick() never
    // runs while paused, which is exactly the pre-round build phase's
    // entire premise). Setting prev = curr too (not just curr) means this
    // frame draws the new state with no interpolation artifact, at the
    // cost of a one-frame "snap" instead of a smooth lerp for whatever
    // creep motion happened to be mid-flight — an acceptable trade for an
    // event that, during the build phase, happens while creeps aren't even
    // moving yet.
    const refreshSnapshot = (): void => {
      const snapshots = snapshotsRef.current;
      if (!snapshots) return;
      const fresh = sim.snapshot();
      snapshots.prev = fresh;
      snapshots.curr = fresh;
    };

    // Task 7: mirrors InputModel's UI-only fields into the `uiState` React
    // state the HUD renders from (see the component-body comment above).
    // type/level are looked up via towerIndexAtTile against LIVE sim.state
    // — the same lookup syncRendererHighlight uses above — since
    // RenderSnapshot has no tile-indexed field to invert "which tile is
    // selected" back into "which tower array slot is that."
    const syncUiState = (): void => {
      const tile = inputModel.selectedTile;
      let tileType = -1;
      let tileLevel = -1;
      if (tile !== -1) {
        const idx = towerIndexAtTile(sim.state, tile);
        if (idx !== -1) {
          tileType = sim.state.towers.type[idx];
          tileLevel = sim.state.towers.level[idx];
        }
      }
      setUiState({ towerType: inputModel.selectedTowerType, tile, tileType, tileLevel });
    };

    // Bridges the stable paletteInputModel/panelInputModel/loopControls
    // wrapper objects (created once via useState, in the component body)
    // into THIS effect invocation's sync functions — see the `syncRef`
    // declaration's comment above for why this indirection exists.
    syncRef.current = { ui: syncUiState, highlight: syncRendererHighlight, snapshot: refreshSnapshot };

    const tileFromPointerEvent = (e: PointerEvent): number => {
      const r = rendererRef.current;
      if (!r) return -1;
      const world = r.screenToWorld(e.clientX, e.clientY, canvas);
      return tileAtWorld(world.x, world.y);
    };

    const onPointerMove = (e: PointerEvent): void => {
      hoveredTileRef.current = tileFromPointerEvent(e);
      syncRendererHighlight();
    };

    const onPointerLeave = (): void => {
      hoveredTileRef.current = -1;
      syncRendererHighlight();
    };

    const onPointerDown = (e: PointerEvent): void => {
      const tile = tileFromPointerEvent(e);
      if (tile === -1) return;
      // A placed tower at this tile is selected (for upgrade/sell); an
      // empty tile attempts a placement of the currently armed type. Both
      // ultimately go through InputModel -> applyCommand — selection alone
      // is UI-only and never becomes a Command.
      if (towerIndexAtTile(sim.state, tile) !== -1) {
        inputModel.selectTile(tile);
      } else {
        // Final-review finding #1: place() mutates sim.state synchronously
        // regardless of pause state, but only a real tick() normally
        // refreshes snapshotsRef — refreshSnapshot() is what makes a
        // pre-round (or mid-game paused) placement actually appear on the
        // canvas instead of silently succeeding in SimState alone.
        inputModel.place(tile);
        refreshSnapshot();
      }
      syncRendererHighlight();
      syncUiState();
    };

    // Task 7: "1"-"5" (arm a tower), "U"/"S" (upgrade/sell the selected
    // tower), and " " (pause toggle) moved OUT of this canvas-level
    // listener and into the HUD components that now own those shortcuts
    // (TowerPalette, SelectedTowerPanel, SpeedControls respectively — each
    // attaches its own window keydown listener, calling through the
    // paletteInputModel/panelInputModel/loopControls wrappers declared in
    // the component body, which resync this effect's
    // syncRendererHighlight/syncUiState via `syncRef` after every
    // mutation). Handling the same key in two places would double-fire a
    // mutating action (e.g. two upgrades for one keypress) — Escape is the
    // only shortcut with no HUD-component owner, so it stays here.
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key.toLowerCase() === "escape") {
        inputModel.cancel();
        syncRendererHighlight();
        syncUiState();
      }
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerleave", onPointerLeave);
    // Keyboard on window, not the canvas: a <canvas> isn't focusable by
    // default (no tabindex), so keydown would never reach a canvas-scoped
    // listener without extra focus-management this MVP doesn't need.
    window.addEventListener("keydown", onKeyDown);

    function onVisibilityChange(): void {
      // Task 7: OR with pausedRef so refocusing a backgrounded tab doesn't
      // unconditionally unpause a run the player had manually paused
      // themselves before it was backgrounded — hidden always forces a
      // pause; becoming visible again only resumes if the player hadn't
      // already paused it.
      loopRef.current?.setPaused(document.hidden || pausedRef.current);
    }
    document.addEventListener("visibilitychange", onVisibilityChange);

    setup();

    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerleave", onPointerLeave);
      window.removeEventListener("keydown", onKeyDown);
      inputModelRef.current = null;
      hoveredTileRef.current = -1;
      // Task 7: revert to the no-op defaults so a stray call into
      // paletteInputModel/panelInputModel after this effect has torn down
      // (already guarded by inputModelRef being null above, via `?.`) never
      // reaches a closure over a `sim`/`inputModel` this cleanup just
      // discarded.
      syncRef.current = { ui: () => {}, highlight: () => {}, snapshot: () => {} };
      loopRef.current?.stop();
      loopRef.current = null;
      resizeObserver?.disconnect();
      renderer.destroy();
      rendererRef.current = null;
      simRef.current = null;
      snapshotsRef.current = null;
      // Task 8: resume the background canvas — NEVER touches
      // settings.enabled/localStorage, only the transient flag.
      setSuspended(false);
    };
    // seed/mode changing after mount isn't a flow anything exercises yet
    // (Task 8 picks the seed once, before this ever mounts) — re-running
    // the full teardown+setup if they ever did change is still correct.
    // `setSuspended` is a plain useState setter (stable identity across
    // renders), so including it here never causes an extra re-run.
  }, [seed, mode, setSuspended]);

  // Task 7: a wave is imminent once we're within WAVE_IMMINENT_TICKS of the
  // next spawn boundary — never true pre-round (wave 0) or after game over,
  // since neither state has a "next wave" worth flagging.
  const waveImminent =
    snapshot.wave > 0 &&
    !snapshot.gameOver &&
    WAVE_INTERVAL_TICKS - (snapshot.tick % WAVE_INTERVAL_TICKS) <= WAVE_IMMINENT_TICKS;

  return (
    <div ref={containerRef} style={containerStyle}>
      <canvas ref={canvasRef} style={canvasStyle} />
      {/* Task 7: DOM HUD overlaid on the canvas — see hudOverlayStyle's
          comment for the pointer-events-passthrough trick. */}
      <div style={hudOverlayStyle}>
        <div style={hudTopLeftStyle}>
          <Hud
            bank={snapshot.bank}
            score={snapshot.score}
            wave={snapshot.wave}
            creepAlive={snapshot.creepAlive}
            creepCount={snapshot.creepCount}
            creepCap={ALIVE_CAP_NORMAL}
            waveImminent={waveImminent}
          />
        </div>
        <div style={hudTopRightStyle}>
          <SpeedControls
            loop={loopControls}
            started={snapshot.wave > 0}
            paused={uiPaused}
            speed={uiSpeed}
            onPauseChange={(p) => {
              pausedRef.current = p;
              setUiPaused(p);
            }}
            onSpeedChange={setUiSpeed}
          />
          {uiState.tile !== -1 && (
            <SelectedTowerPanel
              tile={uiState.tile}
              type={uiState.tileType}
              level={uiState.tileLevel}
              bank={snapshot.bank}
              inputModel={panelInputModel}
            />
          )}
        </div>
        <div style={hudBottomStyle}>
          <TowerPalette bank={snapshot.bank} selectedType={uiState.towerType} inputModel={paletteInputModel} />
        </div>
        {snapshot.gameOver && (
          <GameOver score={snapshot.score} wave={snapshot.wave} onPlayAgain={() => window.location.reload()} />
        )}
      </div>
    </div>
  );
}

// ResizeObserver lives on the canvas's *container*, not the canvas itself:
// the resize callback below mutates the canvas's backing-store size
// (inside Renderer.resize), and observing the element whose size you're
// about to change invites a feedback loop. `device-pixel-content-box`
// reports the box already in device pixels (exact, no rounding from a
// separate devicePixelRatio read racing a layout change); Safari doesn't
// support that box option and throws synchronously from `.observe()` when
// asked for it, hence the try/catch fallback to the ordinary content box.
function observeResize(container: HTMLElement, renderer: Renderer): ResizeObserver {
  const observer = new ResizeObserver((entries) => {
    const entry = entries[0];
    if (!entry) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const boxes = entry.devicePixelContentBoxSize;
    if (boxes && boxes.length > 0) {
      // Already device pixels — divide back to CSS px so Renderer.resize's
      // (cssW, cssH, dpr) contract stays uniform regardless of which path
      // measured it.
      renderer.resize(boxes[0].inlineSize / dpr, boxes[0].blockSize / dpr, dpr);
    } else {
      const rect = entry.contentRect;
      renderer.resize(rect.width, rect.height, dpr);
    }
  });
  try {
    observer.observe(container, { box: "device-pixel-content-box" });
  } catch {
    observer.observe(container);
  }
  return observer;
}
