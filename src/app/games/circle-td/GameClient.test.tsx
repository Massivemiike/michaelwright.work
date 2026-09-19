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
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import GameClient from "./GameClient";

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
          <GameClient seed={1} mode="free" />
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
          <GameClient seed={1} mode="free" />
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
