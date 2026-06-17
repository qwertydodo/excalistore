import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["tests/ui/setup.ts"],
    environmentMatchGlobs: [["tests/ui/**", "jsdom"]],
    coverage: { provider: "v8", reporter: ["text", "lcov"] },
  },
  resolve: { alias: { "@": new URL("./src", import.meta.url).pathname } },
});
