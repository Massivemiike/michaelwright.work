// e2e/_smoke-helpers.ts
//
// Shared helper for the render/fallback smokes. Not a test file itself (no
// `.spec.ts` suffix) — playwright.config.ts's per-project `testMatch`
// regexes (`render.smoke.spec.ts$` / `fallback.smoke.spec.ts$`) never pick
// this up as a project's test, so it's a plain module both specs import.
//
// Both smokes assert zero unexpected console errors, but the root layout
// mounts <Analytics/> (@vercel/analytics) site-wide (src/app/layout.tsx),
// which probes /_vercel/insights/script.js — a path that exists only on
// actual Vercel infra. Any `next start` server (this machine or CI) 404s
// it on every route, logging a resource-load-failure console error that
// has nothing to do with the renderer.
//
// The real, engine-independent narrowing is the CONFIRMED NETWORK RESPONSE
// count for that exact path/status — that part must stay a response-count
// budget, not a text match. What must NOT stay a strict text match is the
// console message itself: Chromium/WebKit log a generic
// "Failed to load resource: the server responded with a status of 404
// (Not Found)" line, but Firefox formats a failed-resource console message
// differently (documented Playwright quirk, microsoft/playwright#24111).
// Matching the Chromium/WebKit string byte-for-byte would silently stop
// excusing this benign 404 on Firefox — the budget would go unused, the
// benign line would land in the "unexpected" bucket, and fallback-firefox
// would fail in CI for a reason unrelated to any renderer regression.
// Matching loosely on "404" (present in both engines' wording for a 404
// response) while keeping the response-count cap gives the same
// engine-independent guarantee: at most N 404-ish console lines are
// excused, and only when N genuine /_vercel/insights/ 404 responses were
// actually observed, so a real, different, or beyond-budget error still
// fails the assertion.
import type { Page } from "@playwright/test";

export function trackConsoleErrors(page: Page): () => string[] {
  const errors: string[] = [];
  let analytics404s = 0;
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("response", (r) => {
    if (r.status() === 404 && r.url().includes("/_vercel/insights/")) analytics404s++;
  });

  return function getUnexpectedErrors(): string[] {
    let budget = analytics404s;
    const unexpected: string[] = [];
    for (const e of errors) {
      if (e.includes("404") && budget > 0) {
        budget -= 1;
      } else {
        unexpected.push(e);
      }
    }
    return unexpected;
  };
}
