// playwright.config.ts
//
// Reusable Playwright harness for Circle TD. 3A uses it for the WebGPU
// render smoke (chromium) + Canvas2D fallback smoke (webkit/firefox); Plan
// 3B REUSES this same config for the cross-engine determinism gate (add a
// spec + an all-three-engine project). The webServer runs `next build &&
// next start` — NEVER `next dev` (space-in-path Turbopack dev bug per
// MEMORY) — and we test the local server, never curl a Vercel URL (429).
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  timeout: 60_000,
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "render-smoke",
      testMatch: /render\.smoke\.spec\.ts$/,
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: {
          // Best-effort WebGPU in headless CI; the smoke still passes if no
          // adapter is available (it asserts fallback engaged instead).
          args: ["--enable-unsafe-webgpu", "--enable-features=Vulkan"],
        },
      },
    },
    { name: "fallback-webkit", testMatch: /fallback\.smoke\.spec\.ts$/, use: { ...devices["Desktop Safari"] } },
    { name: "fallback-firefox", testMatch: /fallback\.smoke\.spec\.ts$/, use: { ...devices["Desktop Firefox"] } },
  ],
  webServer: {
    command: "npm run build && npm run start",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
  },
});
