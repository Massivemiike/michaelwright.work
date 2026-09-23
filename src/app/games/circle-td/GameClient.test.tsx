// @vitest-environment jsdom
//
// src/app/games/circle-td/GameClient.test.tsx
//
// jsdom's <canvas> has no real 2D context (the optional "canvas" npm
// package isn't installed), so Canvas2DRenderer.init() throws inside this
// component's mount effect every time this test runs — there is no path
// to a real render, so nothing here can assert on canvas output or that
// the loop/renderer/ResizeObserver actually started. What IS worth
// covering in jsdom is the React lifecycle contract: the component must
// mount without throwing, tolerate React's StrictMode double-invoke of
// effects, and unmount cleanly with no leaked timers/observers/unhandled
// rejections — GameClient's `alive`-guarded async setup (it catches
// renderer.init()'s failure, logs, and bails before creating a loop or
// ResizeObserver) is exactly what makes that true even though the
// "real" renderer path never runs here. Real visual/behavioral
// verification happens in a real browser in Task 9.
//
// Task 8 wraps every render in NodeNetworkProvider: GameClient now calls
// useNodeNetwork() (to suspend the background canvas for as long as it's
// mounted — see NodeNetworkContext.tsx), which throws outside a
// provider.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import GameClient, { mapTowerHitsToRenderHits } from "./GameClient";
import { NodeNetworkProvider } from "@/components/context/NodeNetworkContext";
import { TILES } from "@/game/titles/circle-td/content";
import { toFloat } from "@/game/sim/math/fixed";
import { makeRenderSnapshot } from "@/game/titles/circle-td/snapshot";
import type { TowerHit } from "@/game/titles/circle-td/rules";

// jsdom implements neither — GameClient's ResizeObserver is created only
// after a successful renderer.init() (which fails in jsdom, see above), so
// this stub is never actually exercised today, but stubbing it keeps this
// test robust against that ordering changing later rather than relying on
// it.
class StubResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

// Final-review finding #6: mapTowerHitsToRenderHits is a pure function
// (module-scope constants only, no DOM/canvas), so this describe block
// doesn't need any of the mount/unmount jsdom machinery below — it's here
// rather than in its own file because the function itself lives in
// GameClient.tsx (the one place a sim-space TowerHit needs to become a
// render-space HitEvent), not in a shared, title-agnostic module.
describe("mapTowerHitsToRenderHits", () => {
  it("maps a TowerHit's tile to that tile's world xy, and its towerType to kind", () => {
    const tile = 3;
    const hit: TowerHit = { towerType: 4, tile, creepId: 42, killed: true };

    const [rendered] = mapTowerHitsToRenderHits([hit]);

    expect(rendered.x).toBeCloseTo(toFloat(TILES[tile * 2]));
    expect(rendered.y).toBeCloseTo(toFloat(TILES[tile * 2 + 1]));
    expect(rendered.kind).toBe(4);
  });

  it("maps an empty hit list to an empty render list", () => {
    expect(mapTowerHitsToRenderHits([])).toEqual([]);
  });

  it("maps several hits in order, independently of tile", () => {
    const hits: TowerHit[] = [
      { towerType: 0, tile: 1, creepId: 1, killed: false },
      { towerType: 2, tile: 5, creepId: 2, killed: true },
    ];

    const rendered = mapTowerHitsToRenderHits(hits);

    expect(rendered).toHaveLength(2);
    expect(rendered[0].kind).toBe(0);
    expect(rendered[1].kind).toBe(2);
    expect(rendered[0].x).toBeCloseTo(toFloat(TILES[1 * 2]));
    expect(rendered[1].x).toBeCloseTo(toFloat(TILES[5 * 2]));
  });

  it("sets tx/ty to the struck creep's world position (looked up by creepId)", () => {
    const snap = makeRenderSnapshot(1, 0);
    snap.creepId[0] = 42;
    snap.creepXY[0] = 123;
    snap.creepXY[1] = 456;
    const hit: TowerHit = { towerType: 0, tile: 2, creepId: 42, killed: false };

    const [r] = mapTowerHitsToRenderHits([hit], snap);

    expect(r.x).toBeCloseTo(toFloat(TILES[2 * 2])); // source = the firing tower's tile
    expect(r.y).toBeCloseTo(toFloat(TILES[2 * 2 + 1]));
    expect(r.tx).toBe(123); // target = the struck creep's world position
    expect(r.ty).toBe(456);
  });

  it("falls back tx/ty to the tower when the creep is gone (killed this tick)", () => {
    const snap = makeRenderSnapshot(0, 0);
    const hit: TowerHit = { towerType: 0, tile: 2, creepId: 99, killed: true };

    const [r] = mapTowerHitsToRenderHits([hit], snap);

    expect(r.tx).toBeCloseTo(toFloat(TILES[2 * 2])); // no creep -> collapses to the tower
    expect(r.ty).toBeCloseTo(toFloat(TILES[2 * 2 + 1]));
  });
});

describe("GameClient", () => {
  let container: HTMLDivElement;
  let root: Root | null;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.stubGlobal("ResizeObserver", StubResizeObserver);
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    // GameClient logs (not throws) when renderer.init() fails, which it
    // always does under jsdom's stub canvas — expected noise, not a test
    // failure signal.
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    container = document.createElement("div");
    document.body.appendChild(container);
    root = null;
  });

  afterEach(() => {
    root?.unmount();
    container.remove();
    errorSpy.mockRestore();
    vi.unstubAllGlobals();
  });

  it("mounts under StrictMode without throwing", async () => {
    await act(async () => {
      root = createRoot(container);
      root.render(
        <StrictMode>
          <NodeNetworkProvider>
            <GameClient seed={1} mode="free" />
          </NodeNetworkProvider>
        </StrictMode>
      );
    });

    expect(container.querySelector("canvas")).not.toBeNull();
    expect(errorSpy).toHaveBeenCalledWith(
      "GameClient: renderer failed to initialize",
      expect.anything()
    );
  });

  it("unmounts cleanly with no thrown error", async () => {
    await act(async () => {
      root = createRoot(container);
      root.render(
        <StrictMode>
          <NodeNetworkProvider>
            <GameClient seed={1} mode="free" />
          </NodeNetworkProvider>
        </StrictMode>
      );
    });

    expect(() => {
      act(() => {
        root!.unmount();
      });
    }).not.toThrow();
    root = null;
  });
});
