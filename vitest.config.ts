import babel from "@rolldown/plugin-babel";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Mirrors wxt.config.ts's React Compiler wiring so component tests exercise
  // the same compiled output the real build ships, not an uncompiled path.
  // @vitejs/plugin-react v6 dropped its `babel` option, so the compiler runs as
  // a standalone Rolldown babel plugin fed reactCompilerPreset().
  // Cast: vitest@4 bundles its own nested vite, structurally distinct from the
  // root vite @vitejs/plugin-react resolves against (same dual-package hazard
  // noted in wxt.config.ts) — functionally fine, only the Plugin type identity
  // differs between the two installs.
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] }),
    // biome-ignore lint/suspicious/noExplicitAny: dual-package-hazard cast, see comment above
  ] as any,
  test: {
    globals: true,
    // vitest@4 no longer auto-clears spy call history between tests; restore so
    // module-level spies re-created in beforeEach start fresh each test.
    restoreMocks: true,
    setupFiles: ["src/test-setup.ts"],
    css: { modules: { classNameStrategy: "non-scoped" } },
    coverage: { provider: "v8", reporter: ["text", "lcov"] },
    // vitest@4 dropped environmentMatchGlobs — split into projects instead so
    // component tests get jsdom and everything else stays on node.
    projects: [
      {
        extends: true,
        test: {
          name: "node",
          environment: "node",
          include: ["src/**/*.test.{ts,tsx}", "entrypoints/**/*.test.{ts,tsx}"],
          exclude: ["src/shared/ui/**", "entrypoints/**/ui/**"],
        },
      },
      {
        extends: true,
        test: {
          name: "dom",
          environment: "jsdom",
          include: ["src/shared/ui/**/*.test.{ts,tsx}", "entrypoints/**/ui/**/*.test.{ts,tsx}"],
        },
      },
    ],
  },
  resolve: { alias: { "@": new URL("./src", import.meta.url).pathname } },
});
