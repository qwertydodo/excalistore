import { defineConfig } from "wxt";

// Manifest V3, minimal permissions. drive.file scope + identity for OAuth.
// host_permissions limited to excalidraw.com and Google APIs only.
export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  manifest: {
    name: "Excalistore",
    description: "Store and autosave Excalidraw diagrams in Google Drive.",
    permissions: ["identity", "storage"],
    host_permissions: ["https://excalidraw.com/*", "https://www.googleapis.com/*"],
    // oauth2 client id is filled in Plan 2 (requires a Google Cloud client).
  },
});
