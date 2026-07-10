# Features

## Next to pick up
- Change folder without disconnecting (currently: re-connect with a different
  folder name).
- Create additional folders (beyond the single app-owned one) and organize
  diagrams from the panel; open/close diagrams (clear active state) from the
  panel.
- Subfolders aren't shown — `listFolder` only returns direct children of the
  connected folder, with no way to navigate into a subfolder.
- Thumbnail previews.
- Conflict resolution UI (currently blocks + warns; no reload-remote /
  overwrite / save-as flow yet).
- Delete / move diagrams, subfolders.
- Large-folder support: infinite scroll (paged `drive/list` with a
  `pageToken` protocol, scroll-loading panel) plus search — one is not useful
  without the other once a folder is big enough to need paging. Deferred:
  folders anywhere near Drive's 1000-files-per-page threshold aren't expected
  for now, so `listFolder` simply follows `nextPageToken` to completion and
  the panel renders the full list.
- Self-hosted Excalidraw hosts.
- Cross-browser (Edge / Firefox via PKCE).
- Playwright E2E.
- Debounce the autosave poll off real edit events if Excalidraw exposes them.
- Skeleton loaders: on a fresh tab/browser session, the panel currently
  renders nothing at all until the file list and the persisted search query
  have both resolved — a blank gap before it appears, rather than a spinner or
  placeholder. A skeleton (placeholder rows shaped like the eventual content)
  would read better than a bare gap; a navigation reload never hits this case
  at all, since it paints the cache instantly.

## Shipped
_(Move items here as they ship, with a short behavior description.)_

- FSD lint: `steiger` + `@feature-sliced/steiger-plugin` check `src/` against
  Feature-Sliced Design rules (`npm run fsd-lint`, config at
  `steiger.config.ts`). Fixed the real violations it caught (a few imports
  bypassing a segment's `index.ts` public API) and disabled
  `fsd/insignificant-slice` project-wide (false positive — the rule can't see
  `entrypoints/` outside `src/` consuming a slice).

- Storybook for shared/ui: `.storybook/` config with light/dark theme toggle and autodocs;
  stories for all 12 primitives (Badge, Box, Button, ConfirmDialog, Dialog, Heading,
  IconButton, ListItem, Spinner, Stack, Text, TextField). Run with `npm run storybook`.

- Foundation: repo scaffold, tooling, shared layer (messages, excalidraw-format,
  theme, ui primitives). No user-facing features yet.
- Connect Google Drive (OAuth, sign-in/out): on excalidraw.com, before a
  folder is connected, a single labeled "Connect Google Drive" button
  (`entrypoints/content/ui/ConnectButton`) opens an in-page dialog with the
  folder-name form (defaulting to "Excalidraw Diagrams"). Submitting sends
  `drive/connect` to the background gateway, which triggers
  `chrome.identity.getAuthToken` (interactive), finds or creates an app-owned
  Drive folder with that exact name, and persists `{connected, folderId,
  folderName}` to `chrome.storage.local`. On success the diagram panel opens
  automatically (the connect flow sets the persisted panel state to expanded).
  There is no folder browsing — under `drive.file` the app can only ever see
  folders it created, so naming a folder is the sanctioned way to connect one.
  "Sign out" (in the panel) removes the cached token, best-effort revokes it,
  and clears the stored connection. The OAuth token never leaves the background
  service worker.
- Thin popup (`entrypoints/popup/ui/PopupStatus`): shows connection status
  (connected + folder name, or a "not connected — open Excalidraw to connect"
  hint) and a single "Open Excalidraw" button that focuses an existing
  excalidraw.com tab if one is open, else opens a new one. Connecting and
  signing out now live in-page, not in the popup.
- Browse folder file list (background): the gateway's `drive/list` message
  calls the Drive REST v3 client to list `.excalidraw` files in the
  connected folder (id, name, modifiedTime, headRevisionId), returning an
  error if not yet connected.
- In-page diagram panel (excalidraw.com, Shadow DOM): lists the connected
  folder's `.excalidraw` files with name + modified date, highlights the
  active file, and shows a save-status badge (idle / saving / saved / error /
  conflict).
- Open diagram: clicking a file fetches it, validates the `.excalidraw`
  envelope, writes it into Excalidraw's localStorage + IndexedDB, and reloads
  the tab so Excalidraw restores it as the active file.
- Create diagram: names a new file, creates a blank `.excalidraw` scene in
  Drive, writes it locally, and reloads, becoming the active file.
- Rename diagram: inline rename in the panel updates the Drive file name and
  refreshes the list.
- Debounced autosave: edits are hashed and, once stable-but-changed for
  ~2.5s, written to Drive via `drive/update` with the loaded revision as the
  conflict guard. If the remote `headRevisionId` no longer matches, the save
  is rejected and the badge shows "Conflict — not saved" — no silent
  overwrite; conflict resolution UI is deferred. Autosave also flushes any
  pending change when the active file changes or the panel unmounts, so
  switching diagrams doesn't drop debounced edits.
- Action error feedback: failed open/create/rename/sign-out surface the error
  message in-panel, and a failed connect surfaces in the connect dialog,
  instead of failing silently; the connect button is disabled while a connect
  is in flight, so a double-click can't create duplicate folders.
- Stale-pointer safety: on load, a restored active-file pointer is adopted only
  if it's still in the connected folder's file list; otherwise it's dropped (so
  a pointer from a previous account/folder can't drive saves to a stale id).
- Safe sign-out: confirms with the user, flushes (saves) the active file,
  clears the local canvas (storage + IndexedDB binaries) and reloads, then
  revokes the cached OAuth token and clears the stored connection + active
  file.
- Involuntary-logout handling: an auth failure — a Drive `401`/`403` (e.g.
  "insufficient scopes") or a failed silent token refresh, classified as
  `unauthorized` — marks the panel disconnected without touching the local
  canvas, distinct from explicit sign-out, which clears it. Centralized in one
  place (the content script's Drive-request middleware), so a `401` from *any*
  Drive call marks the panel disconnected the same way — including one
  surfacing mid-session from an autosave tick, not just from loading the file
  list — instead of leaving a stale "connected" panel while saves silently
  fail.
- Persisted panel collapse: the panel's collapsed/expanded state is stored in
  `chrome.storage.local` and restored on load, so collapsing the panel sticks
  across the writeScene-triggered reloads from opening/creating/renaming a
  diagram.
- Client-side diagram search: a search box at the top of the panel filters
  the already-loaded diagram list by name (case-insensitive substring),
  once the query reaches 3 characters. Input is debounced 300ms before
  filtering (and before persisting). The query is persisted to
  `chrome.storage.local` so it survives the tab reload that opening a
  diagram triggers. Purely local — no protocol change; works because
  `listFolder` already returns the complete list.
- Live theme sync: the panel's own light/dark theme (`data-theme` on the
  Shadow-DOM host) tracks excalidraw.com's theme automatically. A
  `MutationObserver` watches the `.excalidraw` container's `class` attribute
  for the `theme--dark` token excalidraw itself toggles — event-driven, no
  polling — and applies the same host on mount, so there's no flash of the
  wrong theme. No manual override; the panel always mirrors the page.
- Fast-paint file list with session-aware revalidation: on a same-tab
  navigation reload (switching/opening/creating/deleting a diagram), the panel
  paints the last-known file list from a local cache immediately (and adopts
  the active-file highlight against it), then silently revalidates against
  Drive in the background — never flickers or waits. A brand new tab/browser
  session is treated differently: since its cache could be stale (files
  added/removed on Drive elsewhere since last time), the panel renders
  nothing at all until that session's first real Drive response arrives,
  rather than trusting a possibly-stale cache. Tracked via a `sessionStorage`
  flag that survives same-tab reloads but not a new tab/browser session.
- Remote-deletion handling: if autosave's write fails because the active file
  no longer exists on Drive (`404`, classified as the `not_found` gateway
  error code), the badge shows "Diagram deleted on Drive", the active pointer
  and its row in the panel list are dropped, and autosave stops retrying that
  file for good (a 404 never resolves itself, unlike a conflict) — instead of
  silently retrying against a deleted file forever.
- Auto-create on first stroke: if a connected user has no active diagram and
  starts drawing anyway, the panel silently creates a new Drive file
  ("Untitled", "Untitled 2", ...) from the current canvas content once the
  change has been stable for the same ~2.5s debounce as regular autosave —
  no dialog, no tab reload, drawing is never interrupted. From then on it
  behaves like any other active diagram (autosaves, appears in the list,
  can be renamed). Composes with remote-deletion handling: if the active file
  gets deleted mid-session and the user keeps drawing, this is what silently
  creates its replacement.
