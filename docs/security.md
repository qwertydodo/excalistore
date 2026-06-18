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

## Picker: sandboxed page, not a CSP exception

`drive.file` scope deliberately cannot list or browse the user's Drive — that's
what keeps the app's visibility limited to files it created. The tradeoff is
that picking an existing folder requires Google's own UI: **Google Picker**,
loaded from `https://apis.google.com/js/api.js`.

Manifest V3 forbids remote scripts on extension pages outright —
`content_security_policy.extension_pages` is locked to `script-src 'self'`,
with no per-origin exception possible. Chrome rejects a manifest that tries to
loosen it. So the Picker cannot run in the popup directly.

Instead, the Picker runs inside an MV3 **sandboxed page**
(`entrypoints/sandbox`, declared via `manifest.sandbox.pages` in
`wxt.config.ts`), which gets its own, separate CSP
(`content_security_policy.sandbox`) that is permitted to load
`https://apis.google.com` and the handful of Google origins Picker's UI needs.
The popup embeds this sandboxed page as an iframe and the two communicate only
via `postMessage` — a sandboxed page has no access to `chrome.*` APIs at all,
by design.

The trust boundary:

- The OAuth token reaches the sandbox **only** via `postMessage` from the
  popup, for the duration of a single pick. It is constructed in the
  background worker, handed to the popup for that one call, and is never
  persisted or logged in either the popup or the sandbox.
- The sandbox iframe cannot call any `chrome.*` API — it can only post
  messages back to its embedder (the popup). It cannot read `chrome.storage`,
  cannot make extension-privileged requests, and cannot reach the content
  script.
- `pickFolder(token, apiKey, appId)` (`features/pickFolder`) keeps the same
  signature it had before this change, so the popup, the gateway, and the
  background worker are otherwise unaffected.
- `drive.file` still keeps Drive exposure limited to the folder the user picks
  plus files the app creates — the Picker is just the UI used to choose that
  folder, not a broader grant.
- The sandbox CSP (`wxt.config.ts` → `manifest.content_security_policy.sandbox`)
  is tuned against real Picker traffic, not derived from documentation alone —
  treat it as a manually-verified boundary. If the Picker shows CSP violations
  in the sandboxed iframe's devtools console, widen the specific offending
  directive and rebuild; don't broaden it further than the violation requires.

No other remote script, style, or resource is permitted anywhere in the
extension outside this sandboxed page.
