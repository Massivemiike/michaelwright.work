// e2e/circle-td-fallback.smoke.spec.ts
import { test, expect } from "@playwright/test";
import { trackConsoleErrors } from "./_smoke-helpers";

// Fallback smoke (webkit + firefox projects): forcing ?renderer=canvas2d
// exercises the Canvas2D path deterministically (the escape hatch survives
// the SPA "Free play" click since it never navigates), and the game is
// playable without any GPU adapter.
test("Canvas2D fallback engages and draws", async ({ page }) => {
  // See _smoke-helpers.ts for why the benign, site-wide, renderer-unrelated
  // /_vercel/insights/ 404 is excused (budgeted by confirmed network
  // responses, matched loosely on "404" so it holds across engines — this
  // spec runs on firefox, where the console text differs from Chromium/
  // WebKit's per microsoft/playwright#24111).
  const getUnexpectedErrors = trackConsoleErrors(page);

  await page.goto("/games/circle-td?renderer=canvas2d");
  await page.getByRole("button", { name: /free play/i }).click();

  // Scoped to [data-renderer] (not bare "canvas"): the root layout also
  // mounts a site-wide decorative background canvas (NodeNetworkCanvas)
  // that stays in the DOM (merely paused) while a game is mounted, so a
  // bare `page.locator("canvas")` resolves to 2 elements here and trips
  // Playwright's strict mode. Only GameClient's own canvas ever gets the
  // data-renderer attribute (see GameClient.tsx), so this also naturally
  // waits out the async createRenderer() before asserting on it.
  const canvas = page.locator("canvas[data-renderer]");
  await expect(canvas).toBeVisible();
  await expect(canvas).toHaveAttribute("data-renderer", "canvas2d");

  await page.waitForTimeout(600);

  const distinct = await canvas.evaluate((c: HTMLCanvasElement) => {
    const off = document.createElement("canvas");
    off.width = c.width; off.height = c.height;
    const ctx = off.getContext("2d");
    if (!ctx) return 0;
    ctx.drawImage(c, 0, 0);
    const { data } = ctx.getImageData(0, 0, c.width, c.height);
    const seen = new Set<number>();
    for (let i = 0; i < data.length; i += 4 * 1009) {
      seen.add((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
      if (seen.size > 3) break;
    }
    return seen.size;
  });
  expect(distinct).toBeGreaterThan(1);
  expect(getUnexpectedErrors()).toEqual([]);
});
