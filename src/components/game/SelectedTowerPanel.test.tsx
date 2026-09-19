// @vitest-environment jsdom
//
// src/components/game/SelectedTowerPanel.test.tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import SelectedTowerPanel from "./SelectedTowerPanel";
import { TOWERS } from "@/game/titles/circle-td/content";
import { upgradeCost } from "@/game/sim/replay";

const TILE = 5;
const TYPE = 0; // Fast, cost 50

describe("SelectedTowerPanel", () => {
  let container: HTMLDivElement;
  let root: Root;

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  function renderPanel(level: number, bank: number) {
    const upgrade = vi.fn();
    const sell = vi.fn();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(
        <SelectedTowerPanel tile={TILE} type={TYPE} level={level} bank={bank} inputModel={{ upgrade, sell }} />
      );
    });
    return { upgrade, sell };
  }

  function findButton(name: string): HTMLButtonElement {
    const button = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes(name)
    );
    if (!button) throw new Error(`no button found containing "${name}"`);
    return button;
  }

  it("renders nothing when tile is -1 (nothing selected)", () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(
        <SelectedTowerPanel tile={-1} type={0} level={0} bank={100} inputModel={{ upgrade: vi.fn(), sell: vi.fn() }} />
      );
    });
    expect(container.textContent).toBe("");
  });

  it("shows the correct next-level upgrade cost and enables Upgrade when affordable", () => {
    const cost = upgradeCost(TOWERS[TYPE].cost, 8);
    renderPanel(8, 1000);
    expect(container.textContent).toContain(String(cost));
    const upgradeButton = findButton("Upgrade");
    expect(upgradeButton.disabled).toBe(false);
  });

  it("disables Upgrade when unaffordable, even below the level cap", () => {
    renderPanel(0, 0);
    const upgradeButton = findButton("Upgrade");
    expect(upgradeButton.disabled).toBe(true);
  });

  it("disables Upgrade at level 9 (the cap) regardless of bank", () => {
    renderPanel(9, 1_000_000);
    const buttons = Array.from(container.querySelectorAll("button"));
    const upgradeButton = buttons.find((b) => /upgrade|max/i.test(b.textContent ?? ""))!;
    expect(upgradeButton).toBeDefined();
    expect(upgradeButton.disabled).toBe(true);
  });

  it("pressing U calls inputModel.upgrade(tile) when affordable", () => {
    const { upgrade } = renderPanel(0, 1000);
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "u" }));
    });
    expect(upgrade).toHaveBeenCalledWith(TILE);
  });

  it("pressing S calls inputModel.sell(tile)", () => {
    const { sell } = renderPanel(0, 1000);
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "s" }));
    });
    expect(sell).toHaveBeenCalledWith(TILE);
  });
});
