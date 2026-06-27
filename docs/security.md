# Security Posture

- **Manifest V3.** `host_permissions` limited to `https://excalidraw.com/*` and
  `https://www.googleapis.com/*` (Drive). Permissions: `identity`, `storage`.
  Nothing broader.
- **OAuth scope `drive.file` only** — the app sees nothing in Drive except the
  app-owned folder it finds or creates and the files it created within it.
- **No client secret** — `getAuthToken` uses Chrome's signed-in account.
- **Token never leaves the background worker**, is never logged, and is never
  exposed to the content script or the popup. Chrome owns the token cache; the
  token is fetched per request by the `googleClient` auth interceptor and is
  never cached in the worker's memory (the MV3 worker is ephemeral, and an
  in-memory copy could go stale after an external revoke).
- **All Google API calls happen in the background worker only.**
- **Message-sender allowlist.** The background `onMessage` listener validates
  every request's sender (`isAllowedSender`) before acting: it must carry the
  extension's own `chrome.runtime.id` and originate from the popup page or a
  content script on `https://excalidraw.com/`. Other senders get `forbidden
  sender`. The unused, unvalidated `drive/setConnection` message (which let any
  caller overwrite the stored connection) has been removed entirely.
- **Drive query escaping.** Folder names and ids interpolated into Drive `q`
  search strings escape `\` then `'` (axios `params` handle URL encoding; this
  escape targets the query *language*), so a crafted name can't break out of
  the quoted literal.
- **Multipart upload integrity.** `createFile` uses a random per-request
  boundary (`es-<uuid>`), so user `.excalidraw` content can't collide with or
  inject into the multipart body.
- **Request timeouts.** The shared `googleClient` axios instance sets a 15s
  `timeout` on every Drive request, so a hung request can't wedge the
  autosave/save pipeline.
- **No remote code anywhere.** `content_security_policy.extension_pages` is
  `script-src 'self'; object-src 'self';` — no per-origin exceptions, no
  sandboxed page, nothing loaded from a CDN or Google's own script hosts.
  Everything the extension runs is bundled at build time.
- **Input validation:** every `.excalidraw` payload (from Drive or storage) is
  validated against a schema before being written into page storage, preventing
  injection of malformed or hostile data into Excalidraw.
- **Conflict guard:** `headRevisionId` is checked before `updateFile` — no silent
  remote overwrite. **Known limitation:** this is best-effort optimistic
  concurrency. The Drive v3 API has no `If-Match` precondition for
  `files.update`, so a second writer that commits in the window between the
  revision check and the `PATCH` can still clobber it — two tabs/devices editing
  one file is effectively last-write-wins. The guard catches staleness known
  before the request, not a concurrent writer racing that window.
- **Destructive actions confirmed:** replace-canvas, sign-out (and later,
  delete).
- **`web_accessible_resources` minimized** to only what the content script must
  expose.
- **Dependency hygiene:** lockfile, `npm audit` and `knip` in CI, minimal
  dependencies.

## Folder selection: app-owned folder

Under the `drive.file` scope, the app cannot list or browse the user's
existing Drive folders by design — that's exactly what keeps its visibility
limited to files it created. Earlier plans tried to work around this with
Google's own folder-browsing UI (the Picker), but the Picker itself is bound
by the same scope: it can only show files the app already owns, so its folder
list is empty for a fresh install. There is no scope-respecting way to let a
user browse and pick an arbitrary existing folder.

So there is no Picker. Instead, the user **types a folder name** in the popup,
and the background gateway **finds or creates** an app-owned folder with that
exact name via `drive.file` (`findOrCreateFolder` in
`src/entities/google/drive/api/driveRepo.ts`). The lookup only ever sees
folders this app created, so calling connect again with the same name is
idempotent — it reuses the existing folder rather than creating a duplicate.

This removes an entire class of previous exposure:

- **No sandboxed page.** The Picker required an MV3 sandboxed page
  (`entrypoints/sandbox`) with its own relaxed CSP permitting
  `https://apis.google.com` and friends, communicating with the popup over
  `postMessage`. That page, its CSP carve-out, and the trust boundary it
  required no longer exist.
- **Tightened CSP.** `content_security_policy.extension_pages` is now
  `script-src 'self'; object-src 'self';` with no `frame-src` exception —
  the OAuth flow uses `chrome.identity.getAuthToken`, not an in-page Google
  iframe, so no Google origin needs to be referenced in the CSP at all.
- **One fewer secret.** `WXT_PICKER_API_KEY` is no longer read by any code
  path — the Picker API key's threat model (public-but-quota-bound, scoped to
  the Picker API only) is now moot, since the key is unused.

`drive.file` still keeps Drive exposure scoped to that one app-created folder
and the files within it — connecting under a different name simply
finds-or-creates a different app-owned folder; it never grants visibility into
folders the app didn't create. A user who wants existing diagrams in the
connected folder can move them there using Drive's own UI; the extension never
needs broader read access to make that possible.
