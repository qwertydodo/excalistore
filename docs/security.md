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
  default MV3 CSP is kept locked, with one documented exception below.
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

## Picker CSP exception

`drive.file` scope deliberately cannot list or browse the user's Drive — that's
what keeps the app's visibility limited to files it created. The tradeoff is
that picking an existing folder requires Google's own UI: **Google Picker**,
loaded from `https://apis.google.com/js/api.js`.

This is the single, deliberate exception to the "no remote code" posture in
this codebase. It is scoped as narrowly as possible:

- `content_security_policy.extension_pages` in `wxt.config.ts` allows
  `script-src` from `https://apis.google.com` only — no other origin, and only
  for extension pages (the popup), never the content script's page context.
- `frame-src` is limited to `https://docs.google.com` and
  `https://accounts.google.com`, the origins Picker itself needs to render.
- The script is first-party Google code, served over HTTPS, used only to
  render the folder-picker UI and return the chosen folder's id/name.
- The OAuth token is handed to Picker only for the duration of the picker
  session, and only in the popup (`features/pickFolder`). It is never passed
  to, or reachable from, the content script — the background worker remains
  the only long-lived holder of the token.

No other remote script, style, or resource is permitted anywhere in the
extension.
