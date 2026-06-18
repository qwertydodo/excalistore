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
