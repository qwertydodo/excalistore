# Architecture

```
┌─────────────────────── excalidraw.com tab ───────────────────────┐
│                                                                   │
│  Excalidraw app (page world)                                      │
│    localStorage: excalidraw / excalidraw-state                    │
│    IndexedDB: files-db (image binaries)                           │
│         ▲ read/write + reload                                     │
│         │                                                         │
│  Content script (isolated world)                                  │
│    • Scene Bridge  (read/build/parse .excalidraw, hash, reload)   │
│    • Panel UI  (React in Shadow DOM)  ◀── theme mirror            │
│    • Autosave Controller (debounce + conflict guard)             │
│         ▲  typed messages (chrome.runtime)                        │
└─────────┼─────────────────────────────────────────────────────────┘
          │
┌─────────▼──────── Background service worker (trusted core) ───────┐
│  • Auth module       chrome.identity.getAuthToken (drive.file)    │
│  • Drive client      list / read / create / rename / update       │
│  • Drive gateway     all Google API calls happen HERE only        │
└────────┬──────────────────────────────────────────────────────────┘
         │ HTTPS (Bearer)
   Google Drive REST v3  +  Google Picker (folder pick, one-time)
```

**Core principle:** all network access and token handling live **only** in the
background service worker. The content script and panel never hold the OAuth
token. Panel and background communicate over typed `chrome.runtime` messages.

Excalidraw.com exposes no public JS API on the page. The scene is read from and
written to its `localStorage` (`excalidraw` elements, `excalidraw-state`
appState) and IndexedDB (`files-db` image binaries); loading a diagram writes
storage then reloads the tab so Excalidraw restores it.

## Components

Each component has a single purpose, a well-defined interface, and is testable
in isolation.

### Background (trusted core)

- **`auth`** — `getAuthToken({interactive})`, token caching,
  `removeCachedAuthToken` + token revocation on disconnect. Scope: `drive.file`.
- **`drive-client`** — typed wrapper over Drive REST v3: `listFolder(folderId)`,
  `getFile(id)`, `createFile(name, folderId, content)`,
  `updateFile(id, content, prevRevision)`, `renameFile(id, name)`. Returns
  `modifiedTime` + `headRevisionId` for the conflict guard.
- **`gateway`** — message router; the only place that touches `auth` and
  `drive-client`.

### Content script

- **`scene-bridge`** — `readScene()` (localStorage elements/appState + IndexedDB
  binaries → `.excalidraw` JSON), `writeScene(file)` (write storage + reload
  tab), `sceneHash()` for change detection. Validates JSON against a schema
  before any write.
- **`autosave`** — watches `sceneHash`, debounces ~2.5s idle, calls gateway
  `updateFile`, surfaces status (idle / saving / saved / error / conflict).
- **`panel`** (React, Shadow DOM) — file list (name + modified date),
  active-file indicator, save-status badge, actions: open, create, rename, and
  the replace-canvas and sign-out dialogs. Mirrors Excalidraw's theme.

### Shared layer

Reusable foundation everything else is built from:

- **`ui`** — primitive components rendered in Shadow DOM: `Button`,
  `IconButton`, `Dialog`/`ConfirmDialog`, `TextField`, `ListItem`, `Badge`,
  `Spinner`. The panel and every dialog (replace-canvas, sign-out, rename,
  conflict) are composed from these.
- **`theme`** — design tokens (CSS variables) for light and dark, mirrored from
  Excalidraw's appState. Single source of styling for the primitives.
- **`messages`** — typed request/response contracts (discriminated unions)
  shared by content script and background.
- **`excalidraw-format`** — pure functions to build, parse, and validate the
  `.excalidraw` file format. No browser dependencies; fully unit-testable.

This isolates the fragile DOM/storage coupling inside `scene-bridge`, and keeps
`excalidraw-format` and `drive-client` pure and easy to test. No component
re-implements a button, dialog, or theme lookup.

## Data Flow

- **Connect (first run):** popup → "Connect Drive" → `getAuthToken(interactive)`
  → Google Picker → user picks folder → store `folderId` + `connected` in
  `chrome.storage.local`. No token stored (Chrome caches it).
- **List:** panel open → gateway `listFolder(folderId)` → render names + modified
  dates.
- **Open diagram:** click file → `getFile(id)` → replace-canvas dialog (Save /
  Discard / Cancel) → on confirm, `scene-bridge.writeScene()` → reload tab →
  Excalidraw restores it → set active file (`fileId`, `loadedRevision`).
- **Create:** "New" → name prompt → replace-canvas dialog →
  `createFile(name, folderId, emptyScene)` → write blank scene + reload →
  becomes active.
- **Autosave:** edits → `sceneHash` changes → debounce 2.5s → build
  `.excalidraw` → gateway `updateFile(id, content, loadedRevision)`. If remote
  `headRevisionId` ≠ `loadedRevision` → conflict: badge warns, no silent
  overwrite (resolution UI deferred; v1 blocks + tells the user).
- **Rename:** inline edit → `renameFile(id, name)` → refresh list.

## Auth / Session Lifecycle

- **Sign in:** popup "Sign in with Google" → `getAuthToken(interactive)` →
  Picker (first time only) → connected.
- **Sign out (explicit):** warn first — "Signing out saves the current diagram
  to Drive and clears the canvas. Continue?" On confirm: (1) flush autosave —
  save the active file now; if the canvas is dirty but has no active file, prompt
  Save as new / Discard; (2) clear scene (localStorage keys + IndexedDB
  binaries) and reload; (3) `removeCachedAuthToken` + revoke token; (4) clear
  `connected` / `folderId` / active-file state; (5) panel returns to the
  disconnected state.
- **Involuntary logout (token expired or revoked externally):** the gateway
  catches a `401`, marks disconnected, and does **not** clear or lose the local
  scene. The panel shows "Session expired — reconnect." The local canvas stays
  intact. This is deliberately distinct from explicit sign-out (which clears).
