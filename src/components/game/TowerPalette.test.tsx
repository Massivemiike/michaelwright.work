// @vitest-environment jsdom
//
// src/components/game/TowerPalette.test.tsx
//
// Renders with plain react-dom/client (no @testing-library — not a
// dependency of this repo; GameClient.test.tsx already establishes this
// pattern) and a mock InputModel ({ selectTower: vi.fn() }) so this is a
// pure isolated-component test: no real sim, no GameClient involved.
import { describe, it, expect, vi, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import TowerPalette from "./TowerPalette";
import { TOWERS } from "@/game/titles/circle-td/content";

describe("TowerPalette", () => {
  let container: HTMLDivElement;
  let root: Root;

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  function renderPalette(bank: number, selectedType: number, selectTower: (type: number) => void) {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(<TowerPalette bank={bank} selectedType={selectedType} inputModel={{ selectTower }} />);
    });
  }

  function findButton(name: string): HTMLButtonElement {
    const button = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes(name)
    );
    if (!button) throw new Error(`no button found containing "${name}"`);
    return button;
  }

  it("renders all five towers", () => {
    renderPalette(1000, 4, vi.fn());
    expect(container.querySelectorAll("button")).toHaveLength(TOWERS.length);
  });

  it("disables and dims a tower that costs more than the current bank", () => {
    renderPalette(100, 4, vi.fn()); // Damage costs 260 > 100
    const damageButton = findButton("Damage");
    expect(damageButton.disabled).toBe(true);
    expect(damageButton.style.opacity).not.toBe("1");
  });

  it("leaves an affordable tower enabled", () => {
    renderPalette(100, 4, vi.fn()); // Fast costs 50 <= 100
    const fastButton = findButton("Fast");
    expect(fastButton.disabled).toBe(false);
  });

  it("calls inputModel.selectTower on click for an affordable tower", () => {
    const selectTower = vi.fn();
    renderPalette(100, 4, selectTower);
    const fastButton = findButton("Fast"); // index 0
    act(() => {
      fastButton.click();
    });
    expect(selectTower).toHaveBeenCalledWith(0);
  });

  it("calls inputModel.selectTower on pressing '1'", () => {
    const selectTower = vi.fn();
    renderPalette(100, 4, selectTower);
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "1" }));
    });
    expect(selectTower).toHaveBeenCalledWith(0);
  });

  it("ignores '1' when Ctrl is held (final-review finding #8 — don't fight Ctrl+1 tab switching)", () => {
    const selectTower = vi.fn();
    renderPalette(1000, 4, selectTower);
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "1", ctrlKey: true }));
    });
    expect(selectTower).not.toHaveBeenCalled();
  });

  it("ignores '1' when Meta (Cmd) is held", () => {
    const selectTower = vi.fn();
    renderPalette(1000, 4, selectTower);
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "1", metaKey: true }));
    });
    expect(selectTower).not.toHaveBeenCalled();
  });

  it("ignores '1' when Alt is held", () => {
    const selectTower = vi.fn();
    renderPalette(1000, 4, selectTower);
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "1", altKey: true }));
    });
    expect(selectTower).not.toHaveBeenCalled();
  });

  it("does not call selectTower via keyboard for an unaffordable tower", () => {
    const selectTower = vi.fn();
    renderPalette(100, 4, selectTower);
    act(() => {
      // '5' -> index 4 -> Damage, cost 260 > bank 100
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "5" }));
    });
    expect(selectTower).not.toHaveBeenCalled();
  });

  it("marks the currently selected type as pressed", () => {
    renderPalette(1000, 2, vi.fn());
    const slowButton = findButton("Slow"); // index 2
    expect(slowButton.getAttribute("aria-pressed")).toBe("true");
    const fastButton = findButton("Fast");
    expect(fastButton.getAttribute("aria-pressed")).toBe("false");
  });
});
