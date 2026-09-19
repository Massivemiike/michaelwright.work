import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    // Default stays "node" — the sim/logic tests under src/game are the
    // vast majority and don't need a DOM. GameClient.test.tsx (Task 5)
    // opts into jsdom per-file via a `// @vitest-environment jsdom`
    // pragma comment instead of flipping this globally.
    environment: "node",
    include: ["src/game/**/*.test.ts", "src/app/games/**/*.test.tsx"],
  },
});
