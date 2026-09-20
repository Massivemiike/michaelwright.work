// e2e/circle-td-render.smoke.spec.ts
import { test, expect } from "@playwright/test";
import { trackConsoleErrors } from "./_smoke-helpers";

// Render smoke (chromium): WebGPU inits OR the fallback engages, a frame
// draws (canvas has a real backing store and is not a single flat color),
// and nothing logs a console error. CI runners often have no GPU adapter, so
// this tolerates either backend rather than requiring WebGPU.
test("a backend engages, a frame draws, no console errors", async ({ page }) => {
  // See _smoke-helpers.ts for why the benign, site-wide, renderer-unrelated
  // /_vercel/insights/ 404 is excused (budgeted by confirmed network
  // responses, matched loosely on "404" so it holds across engines).
  const getUnexpectedErrors = trackConsoleErrors(page);

  await page.goto("/games/circle-td");
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
  await expect(canvas).toHaveAttribute("data-renderer", /^(webgpu|canvas2d)$/);

  // Let the fixed-timestep loop render several frames.
  await page.waitForTimeout(600);

  const size = await canvas.evaluate((c: HTMLCanvasElement) => ({ w: c.width, h: c.height }));
  expect(size.w).toBeGreaterThan(0);
  expect(size.h).toBeGreaterThan(0);

  // "Not blank": draw the game canvas into a 2D canvas and count distinct
  // sampled pixels. drawImage reads the composited surface for both a WebGPU
  // and a Canvas2D source in Chromium.
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
