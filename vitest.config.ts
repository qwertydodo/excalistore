import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Mirrors wxt.config.ts's React Compiler wiring so component tests exercise
  // the same compiled output the real build ships, not an uncompiled path.
  // Cast: vitest@2.1.9 bundles its own nested vite@5.x, structurally distinct
  // from the root vite@6.x @vitejs/plugin-react resolves against (same dual-
  // package hazard noted in wxt.config.ts) — functionally fine, only the
  // Plugin type identity differs between the two installs.
  plugins: [
    react({
      babel: { plugins: [["babel-plugin-react-compiler", { target: "19" }]] },
    }),
    // biome-ignore lint/suspicious/noExplicitAny: dual-package-hazard cast, see comment above
  ] as any,
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["src/test-setup.ts"],
    environmentMatchGlobs: [
      ["src/shared/ui/**", "jsdom"],
      ["entrypoints/**/ui/**", "jsdom"],
    ],
    css: { modules: { classNameStrategy: "non-scoped" } },
    coverage: { provider: "v8", reporter: ["text", "lcov"] },
  },
  resolve: { alias: { "@": new URL("./src", import.meta.url).pathname } },
});
