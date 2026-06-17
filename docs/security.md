# Security Posture

- **Manifest V3.** `host_permissions` limited to `https://excalidraw.com/*` and
  `https://www.googleapis.com/*` (Drive + Picker). Permissions: `identity`,
  `storage`. Nothing broader.
- **OAuth scope `drive.file` only** — the app sees nothing in Drive except the
  picked folder and files it created.
- **No client secret** — `getAuthToken` uses Chrome's signed-in account.
- **Token never leaves the background worker**, is never logged, and is never
  exposed to the content script. Chrome owns the token cache.
- **All Google API calls happen in the background worker only.**
- **Strict CSP**, no remote code, no `eval`, no CDN — everything bundled. WXT's
  default MV3 CSP is kept locked.
- **Input validation:** every `.excalidraw` payload (from Drive or storage) is
  validated against a schema before being written into page storage, preventing
  injection of malformed or hostile data into Excalidraw.
- **Conflict guard:** `headRevisionId` is checked before `updateFile` — no silent
  remote overwrite.
- **Destructive actions confirmed:** replace-canvas, sign-out (and later,
  delete).
- **`web_accessible_resources` minimized** to only what the content script must
  expose.
- **Dependency hygiene:** lockfile, `npm audit` and `knip` in CI, minimal
  dependencies.
