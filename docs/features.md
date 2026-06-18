# Features

## Next to pick up
- Open diagram (replace canvas, with Save/Discard/Cancel guard).
- Create diagram (name prompt + blank scene).
- Rename diagram.
- Autosave (debounced, conflict-guarded).
- Full sign-out flow (flush autosave, clear canvas, revoke token).
- Change folder without disconnecting.
- Thumbnail previews.
- Conflict resolution UI (currently blocks + warns).
- Delete / move diagrams, subfolders.
- Self-hosted Excalidraw hosts.
- Cross-browser (Edge / Firefox via PKCE).
- Playwright E2E.
- Add steiger (FSD lint) once features/widgets exist.

## Shipped
_(Move items here as they ship, with a short behavior description.)_

- Foundation: repo scaffold, tooling, shared layer (messages, excalidraw-format,
  theme, ui primitives). No user-facing features yet.
- Connect Google Drive (OAuth, sign-in/out): popup "Connect Google Drive"
  button triggers `chrome.identity.getAuthToken` (interactive), then Google
  Picker for folder selection; the background gateway persists
  `{connected, folderId, folderName}` to `chrome.storage.local`. "Sign out"
  removes the cached token, best-effort revokes it, and clears the stored
  connection. The OAuth token never leaves the background service worker
  except being handed to Picker (running in the popup) for the duration of
  folder selection.
- Browse folder file list (background): the gateway's `drive/list` message
  calls the Drive REST v3 client to list `.excalidraw` files in the
  connected folder (id, name, modifiedTime, headRevisionId), returning an
  error if not yet connected. No UI surfaces this list yet — that's the
  panel in Plan 3.
