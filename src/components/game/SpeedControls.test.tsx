// @vitest-environment jsdom
//
// src/components/game/SpeedControls.test.tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import SpeedControls, { type Speed } from "./SpeedControls";

describe("SpeedControls", () => {
  let container: HTMLDivElement;
  let root: Root;

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  function renderControls(started: boolean, paused: boolean, speed: Speed = 1) {
    const setPaused = vi.fn();
    const setSpeed = vi.fn();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(
        <SpeedControls loop={{ setPaused, setSpeed }} started={started} paused={paused} speed={speed} />
      );
    });
    return { setPaused, setSpeed };
  }

  function findButton(text: string): HTMLButtonElement {
    const button = Array.from(container.querySelectorAll("button")).find((b) => b.textContent === text);
    if (!button) throw new Error(`no button with text "${text}"`);
    return button;
  }

  it("shows only a GO button before the round has started", () => {
    renderControls(false, true);
    expect(container.querySelectorAll("button")).toHaveLength(1);
    expect(container.textContent).toContain("GO");
  });

  it("GO calls loop.setPaused(false)", () => {
    const { setPaused } = renderControls(false, true);
    const go = findButton("GO");
    act(() => {
      go.click();
    });
    expect(setPaused).toHaveBeenCalledWith(false);
  });

  it("shows Pause/Play + speed buttons once started", () => {
    renderControls(true, false);
    expect(container.textContent).toContain("Pause");
    expect(container.textContent).toContain("1×");
    expect(container.textContent).toContain("2×");
    expect(container.textContent).toContain("4×");
  });

  it("clicking 2x calls loop.setSpeed(2)", () => {
    const { setSpeed } = renderControls(true, false);
    const twoX = findButton("2×");
    act(() => {
      twoX.click();
    });
    expect(setSpeed).toHaveBeenCalledWith(2);
  });

  it("clicking the pause toggle calls loop.setPaused with the opposite of the current paused prop", () => {
    const { setPaused } = renderControls(true, false);
    const toggle = findButton("Pause");
    act(() => {
      toggle.click();
    });
    expect(setPaused).toHaveBeenCalledWith(true);
  });

  it("Space toggles pause once started", () => {
    const { setPaused } = renderControls(true, false);
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: " " }));
    });
    expect(setPaused).toHaveBeenCalledWith(true);
  });

  it("Space does nothing before the round has started (GO is the only way to start)", () => {
    const { setPaused } = renderControls(false, true);
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: " " }));
    });
    expect(setPaused).not.toHaveBeenCalled();
  });

  it("ignores a modified Space (final-review finding #8 — e.g. Ctrl+Space is an IME toggle on some platforms)", () => {
    const { setPaused } = renderControls(true, false);
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: " ", ctrlKey: true }));
    });
    expect(setPaused).not.toHaveBeenCalled();
  });

  it("ignores Meta+Space and Alt+Space", () => {
    const { setPaused } = renderControls(true, false);
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: " ", metaKey: true }));
      window.dispatchEvent(new KeyboardEvent("keydown", { key: " ", altKey: true }));
    });
    expect(setPaused).not.toHaveBeenCalled();
  });
});
