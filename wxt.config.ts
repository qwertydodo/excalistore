import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "wxt";

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
  vite: () => ({
    plugins: [srcAlias()],
  }),
  manifest: {
    name: "Excalistore",
    description: "Store and autosave Excalidraw diagrams in Google Drive.",
    // Pins a deterministic extension ID (kmjjeibokndaipkloajhppiaamdggeai) so the
    // OAuth client binding stays stable across machines/reloads. This is the
    // PUBLIC key — safe to commit; the private key lives in .keys/ (gitignored).
    key: "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA2eJ0lLaAPC/QtqdJRi+0ejRdfybvi7BaeUa6N5PYsD/E8bWMC0vrd1OBXPaNDD8RcMgzaH/i6+yCnMzLhYU+SRRckwXIZpo9ijJxr1o3235qudNeTONdw1SgZ62P0b5Dmp71IlT28tewken6d93kBb4BeET1nrDNL6LBbPoO9JbMdgMDW5vF+FVlAKako/RRQjpDAYrK55cdSjQ63c7CnTiIoV/BnzK5+wSJ9724tDF9WXllxOWB15BjQ7mkKt+p7GkLths3RjFSZMS/8HnGkPf69h0fAv48pjk1QP7atVWbzhMdF8AZ0FZGiyLukT8FWF5i1NNq913UwfkRPG3GeQIDAQAB",
    permissions: ["identity", "storage"],
    host_permissions: ["https://excalidraw.com/*", "https://www.googleapis.com/*"],
    oauth2: {
      // Replace with your Google Cloud OAuth client id (type: Chrome extension).
      client_id: env.WXT_OAUTH_CLIENT_ID ?? "REPLACE_WITH_OAUTH_CLIENT_ID",
      scopes: ["https://www.googleapis.com/auth/drive.file"],
    },
    content_security_policy: {
      extension_pages: "script-src 'self'; object-src 'self';",
    },
  },
});
