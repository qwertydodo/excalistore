import { fileURLToPath } from "node:url";
import { defineConfig } from "wxt";

const SRC_DIR = fileURLToPath(new URL("./src", import.meta.url));

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
  vite: () => ({
    plugins: [srcAlias()],
  }),
  manifest: {
    name: "Excalistore",
    description: "Store and autosave Excalidraw diagrams in Google Drive.",
    permissions: ["identity", "storage"],
    host_permissions: ["https://excalidraw.com/*", "https://www.googleapis.com/*"],
    oauth2: {
      // Replace with your Google Cloud OAuth client id (type: Chrome extension).
      client_id: import.meta.env.WXT_OAUTH_CLIENT_ID ?? "REPLACE_WITH_OAUTH_CLIENT_ID",
      scopes: ["https://www.googleapis.com/auth/drive.file"],
    },
    // Single sanctioned remote-script exception: Google Picker (first-party).
    content_security_policy: {
      extension_pages:
        "script-src 'self' https://apis.google.com; object-src 'self'; frame-src https://docs.google.com https://accounts.google.com;",
    },
  },
});
