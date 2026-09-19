"use client";

// src/app/games/circle-td/GameClient.tsx
//
// Owns the <canvas>, the Circle TD sim, the Canvas2D renderer, and the
// fixed-timestep loop (src/game/runtime/loop.ts) driving them. 'use client'
// because it touches <canvas>, ResizeObserver, requestAnimationFrame, and
// document visibility — none of which exist on the server (see
// node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md).
//
// This file is created here (Task 5) and extended in place by later tasks
// in the same plan: pointer/keyboard input (Task 6) and the HUD (Task 7)
// both read/write the refs set up below rather than introducing their own.
// Task 8 is what actually routes to this component (dynamic, ssr:false,
// behind a click-to-play gate) and picks a real seed; until then this
// always free-plays a fixed seed so there's something deterministic to
// look at (Task 9's browser check) the moment it mounts.
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

// Free-play default until Task 8 derives a real daily seed and gates the
// mount behind a click. A fixed constant (not e.g. Date.now()) keeps this
// component's own behavior deterministic — the sim's own randomness comes
// from the seed, not from when the page happened to load.
const DEFAULT_SEED = 1;
const DEFAULT_MODE: SimConfig["mode"] = "free";

// No sim hit feed exists yet — Task 6 is what produces real HitEvents.
// One shared empty array avoids allocating (and handing the renderer a
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

    // Typed as the Renderer interface, not the concrete class, even though
    // Canvas2D is the only backend today — Plan 3's WebGPU renderer drops
    // in here unchanged (see src/game/runtime/render/Renderer.ts).
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
    }

    function onVisibilityChange(): void {
      loopRef.current?.setPaused(document.hidden);
    }
    document.addEventListener("visibilitychange", onVisibilityChange);

    setup();

    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", onVisibilityChange);
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
