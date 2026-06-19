import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "wxt";
import { DRIVE_FILE_SCOPE, GOOGLE_API_ORIGIN } from "./src/shared/config/drive";
import { EXCALIDRAW_ORIGIN } from "./src/shared/config/excalidraw";

const SRC_DIR = fileURLToPath(new URL("./src", import.meta.url));

// WXT does not populate import.meta.env when this config file is evaluated, so
// read .env directly for the manifest's oauth2 client id (Chrome reads it from
// the built manifest). Runtime entrypoints still get import.meta.env via Vite's
// define as usual. process.env wins so CI/shell vars override the .env file.
function loadEnv(): Record<string, string | undefined> {
  const file: Record<string, string> = {};
  try {
    const raw = readFileSync(new URL("./.env", import.meta.url), "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*?)\s*$/);
      if (m?.[1]) file[m[1]] = (m[2] ?? "").replace(/^["']|["']$/g, "");
    }
  } catch {
    // No .env (e.g. fresh clone before setup) — fall back to process.env only.
  }
  return { ...file, ...process.env };
}

const env = loadEnv();

// App code lives under src/ (entrypoints/ stays at the repo root, per WXT
// convention, since moving it under src/ is out of scope here). WXT always
// points its own "@" alias at srcDir (the repo root), which doesn't match
// tsconfig's "@/*": ["./src/*"] used by tsc/Vitest/Biome. A `config()` hook
// with `enforce: "post"` runs after WXT's own alias plugin and wins Vite's
// alias merge (last-applied alias takes precedence), repointing "@" at src/
// for the bundler too.
function srcAlias() {
  return {
    name: "excalistore:src-alias",
    enforce: "post" as const,
    config: () => ({ resolve: { alias: { "@": SRC_DIR } } }),
  };
}

// Manifest V3, minimal permissions. drive.file scope + identity for OAuth.
// host_permissions limited to excalidraw.com and Google APIs only.
export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  // React Compiler auto-memoizes components/hooks, so app code shouldn't
  // need manual useCallback/useMemo. @vitejs/plugin-react is pinned to ^5
  // (devDependencies) specifically because v6 dropped this `babel` option in
  // favor of a Rolldown-only integration WXT's bundled vite 6.x can't use;
  // v5's `babel` option runs in both dev and prod. target: "19" uses React
  // 19's built-in compiler runtime exports — no react-compiler-runtime
  // polyfill needed.
  react: {
    vite: {
      babel: {
        plugins: [["babel-plugin-react-compiler", { target: "19" }]],
      },
    },
  },
  vite: () => ({
    plugins: [srcAlias()],
  }),
  manifest: {
    name: "Excalistore",
    description: "Store and autosave Excalidraw diagrams in Google Drive.",
    // Pins a deterministic extension ID (kmjjeibokndaipkloajhppiaamdggeai) so the
    // OAuth client binding stays stable across machines/reloads. Required —
    // set WXT_PUBLIC_KEY in .env (see .env.example); the matching private
    // key lives in .keys/ (gitignored).
    key: env.WXT_PUBLIC_KEY,
    permissions: ["identity", "storage"],
    host_permissions: [`${EXCALIDRAW_ORIGIN}/*`, `${GOOGLE_API_ORIGIN}/*`],
    oauth2: {
      // Replace with your Google Cloud OAuth client id (type: Chrome extension).
      client_id: env.WXT_OAUTH_CLIENT_ID ?? "REPLACE_WITH_OAUTH_CLIENT_ID",
      scopes: [DRIVE_FILE_SCOPE],
    },
    content_security_policy: {
      extension_pages: "script-src 'self'; object-src 'self';",
    },
  },
});
