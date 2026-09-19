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
// gets verified later are identical by construction. Task 7's HUD reads
// the refs set up below (inputModelRef in particular) rather than
// introducing its own. Task 8 is what actually routes to this component
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
import { useEffect, useRef, type CSSProperties } from "react";
import { makeSim, type CircleTdSim, type SimConfig } from "@/game/titles/circle-td";
import { Canvas2DRenderer } from "@/game/runtime/render/canvas2d/Canvas2DRenderer";
import type { Renderer, HitEvent } from "@/game/runtime/render/Renderer";
import type { RenderSnapshot } from "@/game/sim/engine";
import { makeLoop, type GameLoop } from "@/game/runtime/loop";
import { InputModel, tileAtWorld, towerIndexAtTile } from "@/game/runtime/input/pointer";

// Free-play default until Task 8 derives a real daily seed and gates the
// mount behind a click. A fixed constant (not e.g. Date.now()) keeps this
// component's own behavior deterministic — the sim's own randomness comes
// from the seed, not from when the page happened to load.
const DEFAULT_SEED = 1;
const DEFAULT_MODE: SimConfig["mode"] = "free";

// No sim hit feed exists yet (Task 6 turned out to be pointer input, not
// this — see Canvas2DRenderer's advanceHits comment). One shared empty
// array avoids allocating (and handing the renderer a
// new-identity-but-still-empty list) every single frame in the meantime.
const NO_HITS: HitEvent[] = [];

export interface GameClientProps {
  seed?: number;
  mode?: SimConfig["mode"];
}

const containerStyle: CSSProperties = {
  width: "100%",
  height: "100%",
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

export default function GameClient({ seed = DEFAULT_SEED, mode = DEFAULT_MODE }: GameClientProps) {
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
  const pausedRef = useRef<boolean>(false);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

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
    pausedRef.current = false;

    // Typed as the Renderer interface, not the concrete class, even though
    // Canvas2D is the only backend today — Plan 3's WebGPU renderer drops
    // in here unchanged (see src/game/runtime/render/Renderer.ts). The
    // pointer handlers below narrow to Canvas2DRenderer via `instanceof`
    // only where they need its Task-6 extras (setHighlight/
    // setHighlightTower), which aren't part of the shared interface.
    const renderer: Renderer = new Canvas2DRenderer();

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
            sim.tick();
            snapshots.curr = sim.snapshot();
          },
          render(alpha) {
            const snapshots = snapshotsRef.current;
            if (!snapshots) return;
            renderer.frame(snapshots.prev, snapshots.curr, alpha, NO_HITS);
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
      // Reflect the default armed tower type (and any hover that already
      // happened before init() resolved) the moment the renderer exists,
      // rather than waiting for the next pointer event to paint it.
      syncRendererHighlight();
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
    const syncRendererHighlight = (): void => {
      const r = rendererRef.current;
      if (!(r instanceof Canvas2DRenderer)) return;
      if (inputModel.selectedTile !== -1) {
        const idx = towerIndexAtTile(sim.state, inputModel.selectedTile);
        r.setHighlightTower(idx === -1 ? null : idx);
        r.setHighlight(-1, -1);
      } else {
        r.setHighlightTower(null);
        r.setHighlight(hoveredTileRef.current, inputModel.selectedTowerType);
      }
    };

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
        inputModel.place(tile);
      }
      syncRendererHighlight();
    };

    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key >= "1" && e.key <= "5") {
        inputModel.selectTower(Number(e.key) - 1); // '1'..'5' -> tower index 0..4
        syncRendererHighlight();
        return;
      }
      switch (e.key.toLowerCase()) {
        case "u":
          if (inputModel.selectedTile !== -1) inputModel.upgrade(inputModel.selectedTile);
          syncRendererHighlight();
          return;
        case "s":
          if (inputModel.selectedTile !== -1) inputModel.sell(inputModel.selectedTile);
          syncRendererHighlight();
          return;
        case "escape":
          inputModel.cancel();
          syncRendererHighlight();
          return;
        case " ":
          e.preventDefault(); // don't let Space also scroll the page
          pausedRef.current = !pausedRef.current;
          loopRef.current?.setPaused(pausedRef.current);
          return;
        default:
          return;
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
      loopRef.current?.setPaused(document.hidden);
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
      loopRef.current?.stop();
      loopRef.current = null;
      resizeObserver?.disconnect();
      renderer.destroy();
      rendererRef.current = null;
      simRef.current = null;
      snapshotsRef.current = null;
    };
    // seed/mode changing after mount isn't a flow anything exercises yet
    // (Task 8 picks the seed once, before this ever mounts) — re-running
    // the full teardown+setup if they ever did change is still correct.
  }, [seed, mode]);

  return (
    <div ref={containerRef} style={containerStyle}>
      <canvas ref={canvasRef} style={canvasStyle} />
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
