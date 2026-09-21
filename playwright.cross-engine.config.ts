// playwright.cross-engine.config.ts
//
// Dedicated config for e2e/cross-engine-determinism.spec.ts, kept separate
// from playwright.config.ts (3A's WebGPU render + Canvas2D fallback smokes).
// Two reasons it can't just reuse that config:
//
// 1. playwright.config.ts's `webServer` runs `npm run build && npm run
//    start` before ANY test using that config can start — a full
//    production build. The cross-engine determinism spec never touches the
//    Next.js app at all: it launches chromium/firefox/webkit directly via
//    `@playwright/test`'s browser-type exports and injects the esbuild
//    bundle into a blank `about:blank` page with `page.addScriptTag`.
//    Paying for a full build+start on every run of this spec would be slow
//    and adds a flakiness surface (port binding, build time) this gate has
//    no need to depend on.
// 2. playwright.config.ts's three `projects` each narrow `testMatch` to
//    their own spec's filename (render.smoke.spec.ts /
//    fallback.smoke.spec.ts), so cross-engine-determinism.spec.ts matches
//    none of them and simply wouldn't run under that config at all.
//
// The spec doesn't use Playwright's own `page` fixture / project-selected
// browser — it manually imports and launches all three engines inside a
// single test body — so no `projects`/`use.browserName` config is needed
// here; the default (single, otherwise-unconfigured) project is enough to
// let the 3 `test(...)` calls run at all.
//
// Invocation: `npx playwright test --config=playwright.cross-engine.config.ts`
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  testMatch: /cross-engine-determinism\.spec\.ts$/,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  timeout: 60_000,
  // Deliberately no `webServer` and no `projects` — see header comment.
});
