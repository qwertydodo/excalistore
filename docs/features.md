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
- Self-hosted Excalidraw hosts.
- Cross-browser (Edge / Firefox via PKCE).
- Playwright E2E.
- Debounce the autosave poll off real edit events if Excalidraw exposes them.

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
- Involuntary-logout handling: an auth failure from the gateway — a Drive
  `401`/`403` (e.g. "insufficient scopes") or a failed silent token refresh,
  classified as `unauthorized` — marks the panel disconnected without touching
  the local canvas, distinct from explicit sign-out, which clears it.
- Persisted panel collapse: the panel's collapsed/expanded state is stored in
  `chrome.storage.local` and restored on load, so collapsing the panel sticks
  across the writeScene-triggered reloads from opening/creating/renaming a
  diagram.
