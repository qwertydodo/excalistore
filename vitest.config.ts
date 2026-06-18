import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["src/test-setup.ts"],
    environmentMatchGlobs: [
      ["src/shared/ui/**", "jsdom"],
      ["src/widgets/**", "jsdom"],
    ],
    css: { modules: { classNameStrategy: "non-scoped" } },
    coverage: { provider: "v8", reporter: ["text", "lcov"] },
  },
  resolve: { alias: { "@": new URL("./src", import.meta.url).pathname } },
});
