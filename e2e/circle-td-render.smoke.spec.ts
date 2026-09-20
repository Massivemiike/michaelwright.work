// e2e/circle-td-render.smoke.spec.ts
import { test, expect } from "@playwright/test";

// Render smoke (chromium): WebGPU inits OR the fallback engages, a frame
// draws (canvas has a real backing store and is not a single flat color),
// and nothing logs a console error. CI runners often have no GPU adapter, so
// this tolerates either backend rather than requiring WebGPU.
test("a backend engages, a frame draws, no console errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(e.message));
  // The root layout mounts <Analytics/> (@vercel/analytics) site-wide, which
  // probes /_vercel/insights/script.js — a path that exists only on actual
  // Vercel infra. `next start` (here and in CI) always 404s it, logging the
  // browser's generic resource-load-failure line below. Unrelated to the
  // renderer; tracked by response so exactly that many (and no more) generic
  // 404 lines are excused below, not a blanket ignore.
  let analytics404s = 0;
  page.on("response", (r) => { if (r.status() === 404 && r.url().includes("/_vercel/insights/")) analytics404s++; });

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

  const GENERIC_404 = "Failed to load resource: the server responded with a status of 404 (Not Found)";
  let budget = analytics404s;
  const unexpectedErrors: string[] = [];
  for (const e of errors) {
    if (e === GENERIC_404 && budget > 0) {
      budget -= 1;
    } else {
      unexpectedErrors.push(e);
    }
  }
  expect(unexpectedErrors).toEqual([]);
});
