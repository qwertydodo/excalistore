# Architecture

## Source layout (simplified Feature-Sliced Design)

`src/` is organized as simplified FSD. Layers import only from layers strictly
below: `shared → entities → features → widgets`. `entrypoints/` (background,
content, popup) is the app/composition root and may import from any layer.
Slices on the same layer never import each other. Each slice exposes a barrel
`index.ts` as its public API.

```
src/
  shared/        business-agnostic primitives reused everywhere
    ui/          Button, Dialog/ConfirmDialog, TextField, ListItem, Badge,
                 Spinner
    api/         cross-process message contracts + the Drive REST v3 client
    config/      design tokens (theme) and shared constants
  entities/
    diagram/     the .excalidraw business entity — format build/parse/
                 validate, the ActiveFile pointer
  features/
    auth/          chrome.identity wrapper (background only)
    driveGateway/  message router; only consumer of auth + the Drive client
    sceneBridge/   content-script transform between page storage and the
                   validated .excalidraw envelope
    autosave/      debounced autosave controller
    session/       active-file pointer persisted across reload
    driveConnect/  FolderNameForm — connect-folder form shared by both
                   connect widgets
  widgets/
    popupConnect/  popup UI
    diagramPanel/  in-page panel UI — DiagramPanel composes DiagramRow (one
                   list row, owns its own rename state) and CreateDiagramForm
entrypoints/
  content/    mounts diagramPanel in a Shadow DOM on excalidraw.com; split
              into mount wiring (index.tsx) and a composition root (App.tsx)
              at the entrypoint root, one hook per concern under model/
              (theme sync, file list, active-file + autosave + CRUD actions,
              sign-out, connect), and the shared scene-bridge instance under
              lib/
  popup/      extension popup
  background.ts  service worker; the only place holding the OAuth token
```

Module files are camelCase; React components are PascalCase. Theme tokens are
CSS custom properties (`--es-*`) in `shared/config/theme.css`, applied to
`:root`/`:host` and switched via the `data-theme` attribute — not a JS object.

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
│  • Drive client      list / read / create / rename / update /     │
│                       findOrCreateFolder                          │
│  • Drive gateway     all Google API calls happen HERE only        │
└────────┬──────────────────────────────────────────────────────────┘
         │ HTTPS (Bearer)
              Google Drive REST v3
```

**Core principle:** all network access and token handling live **only** in the
background service worker. The content script and panel never hold the OAuth
token. Panel and background communicate over typed `chrome.runtime` messages.

**Message flow (popup → gateway → auth/drive):** the popup (`widgets/popupConnect`,
driven by `entrypoints/popup/App.tsx`) never calls Drive APIs directly and
never holds the OAuth token. It collects a folder name from the user and
sends a single typed request, `drive/connect { folderName }`, to the
background — interactive sign-in and the find-or-create folder lookup both
happen inside the gateway, not the popup. The popup otherwise sends typed
requests (`auth/status`, `auth/signOut`, `drive/list`, …) straight to the
background. `entrypoints/background.ts` registers a single
`chrome.runtime.onMessage` listener that hands every request to
`features/driveGateway`'s `handleMessage(req, deps)`, a pure function injected
with `getToken`/`signOut` (`features/auth`),
`listFolder`/`getFile`/`createFile`/`updateFile`/`renameFile`/
`findOrCreateFolder` (`shared/api`), and `getStore`/`setStore`
(`chrome.storage.local`). The gateway routes the full diagram read-write
surface — `drive/get|create|update|rename`, the connect flow
(`drive/connect`) — and `auth/*`, and is the only thing in the
background that touches `auth` or Drive's REST client; the OAuth token never leaves
the background worker. Before routing, the listener validates the message
sender via `isAllowedSender` — the request must come from the extension's own
popup page or a content script on `https://excalidraw.com/` (same
`chrome.runtime.id`); anything else is rejected with `forbidden sender`. It returns a typed `Response<T>` that
`sendToBackground` unwraps, throwing a `RequestError` on `{ ok: false }` that
carries the response's `code` (`"conflict" | "unauthorized" | "unknown"`) as
a typed property (`RequestError.code`), not just baked into the message
string — so callers (the panel container, the autosave save callback) can
branch on it directly, e.g. `e instanceof RequestError && e.code ===
"unauthorized"` to distinguish an expired session from a generic failure.
`updateFile`'s conflict guard (remote `headRevisionId` ≠ the caller's
`prevRevision`) maps to `code: "conflict"`. Auth failures map to
`code: "unauthorized"`: the gateway's `err()` helper classifies on the
structured `DriveError.status` (HTTP `401`/`403`, e.g. Drive's "insufficient
scopes") and on token-grant failures from `getToken` ("not granted /
revoked"), rather than string-matching a status code that happened to appear
in the message. `listFolder` follows Drive's `nextPageToken`, so folders with
more than one page of diagrams list completely.

**Content-script mount (`entrypoints/content/`):** the app-layer composition
root for excalidraw.com, split across files the same way `entrypoints/popup/`
splits `main.tsx` from `App.tsx`. The mount wiring calls WXT's
`createShadowRootUi` (`cssInjectionMode: "ui"`, `position: "inline"`) to
render the panel into a Shadow DOM positioned fixed top-right, carrying the
`data-theme` attribute the theme mirror updates so `:host([data-theme=...])`
rules in `theme.css` apply. The composition component itself stays thin: each
piece of state (file list, active-file + autosave + CRUD actions, sign-out,
connect) lives in its own hook over a single shared `SceneBridgeDeps`
instance, and renders `widgets/diagramPanel`'s `DiagramPanel`, keeping that
widget presentational and FSD-clean. The active-file hook is the one that
stays largest: `revisionRef` and `activeId` genuinely couple the
open/create/rename actions to the autosave save callback, so splitting it
further would just move that coupling into more prop-drilling without
reducing it.

Excalidraw.com exposes no public JS API on the page. The scene is read from and
written to its `localStorage` (`excalidraw` elements, `excalidraw-state`
appState) and IndexedDB (`files-db` image binaries); loading a diagram writes
storage then reloads the tab so Excalidraw restores it. `features/sceneBridge`
owns this boundary: `readScene`/`writeScene`/`clearScene`/`readTheme`/
`currentSceneHash` operate against an injected `SceneBridgeDeps` (a `Storage`
plus `loadFiles`/`saveFiles`/`clearFiles`/`reload`), so the localStorage
transform and validation are fully unit-tested without a browser. The real
binary store is `idb-keyval`'s `createStore("files-db", "files-store")` —
matching Excalidraw's own encoding exactly — wired up by
`filesDb.ts#defaultSceneBridgeDeps()`. `writeScene` validates the
`.excalidraw` envelope (the security boundary before anything is written into
page storage) and `writeScene`/`clearScene` both reload the tab afterward so
Excalidraw restores the new state from storage rather than from in-memory
React state.

## Components

Each component has a single purpose, a well-defined interface, and is testable
in isolation.

### Background (trusted core)

- **`auth`** — `getAuthToken({interactive})`, token caching,
  `removeCachedAuthToken` + token revocation on disconnect. Scope: `drive.file`.
- **`drive-client`** — typed wrapper over Drive REST v3: `listFolder(folderId)`,
  `getFile(id)`, `createFile(name, folderId, content)`,
  `updateFile(id, content, prevRevision)`, `renameFile(id, name)`,
  `findOrCreateFolder(token, name)` (looks up an app-owned folder by exact
  name, creating it if none matches). Returns `modifiedTime` +
  `headRevisionId` for the conflict guard.
- **`gateway`** — message router; the only place that touches `auth` and
  `drive-client`. Validates the message sender (`isAllowedSender`) before
  routing `auth/status|signOut`, `drive/connect|list|get|create|update|rename`.

### Content script

- **`scene-bridge`** — `readScene()` (localStorage elements/appState + IndexedDB
  binaries → `.excalidraw` JSON), `writeScene(file)` (validate, write storage +
  binaries, reload tab), `clearScene()` (wipe + reload, for safe sign-out),
  `readTheme()`, `currentSceneHash()` for change detection. Validates the
  `.excalidraw` envelope against a schema before any write — the security
  boundary before untrusted content reaches page storage.
- **`autosave`** (`features/autosave`) — `createAutosave({getHash, save,
  onStatus, delayMs, pollMs, now})` polls `currentSceneHash`, and once the
  hash has been stable-but-different from the last saved hash for `delayMs`
  (~2.5s), calls `save()` and reports `saving` → `saved`/`conflict`/`error`.
  `flush()` forces an immediate save when dirty (used by sign-out); the clock
  and poll trigger are injectable, so the controller is fully unit-tested
  without real timers.
- **`session`** (`features/session`) — `getActiveFile`/`setActiveFile`/
  `clearActiveFile` persist the `ActiveFile` pointer (`id`, `name`,
  `loadedRevision`) in `chrome.storage.local` so it survives the
  `writeScene`-triggered tab reload.
- **`panel`** (`widgets/diagramPanel`, React, Shadow DOM) — presentational:
  file list (name + modified date), active-file indicator, save-status badge,
  inline rename (each row owns its own rename-edit state), and
  `onOpen`/`onCreate`/`onRename`/`onSignOut` callbacks. The replace-canvas
  confirm and sign-out `ConfirmDialog` are rendered by the container
  (`entrypoints/content/App.tsx`), not the widget, since they need
  orchestration. Mirrors Excalidraw's theme via the host's `data-theme`.

### Shared layer

Reusable foundation everything else is built from:

- **`shared/ui`** — primitive components rendered in Shadow DOM: `Button`,
  `IconButton`, `Dialog`/`ConfirmDialog`, `TextField`, `ListItem`, `Badge`,
  `Spinner`. The panel and every dialog (replace-canvas, sign-out, rename,
  conflict) are composed from these.
- **`shared/config` (`theme`)** — design tokens as CSS custom properties
  (`theme.css`) for light and dark, mirrored from Excalidraw's appState via the
  `data-theme` attribute (`THEME_ATTR`). Single source of styling for the
  primitives.
- **`shared/api` (`messages`, `driveClient`)** — typed request/response
  contracts (discriminated unions) shared by content script and background,
  plus the Drive REST v3 client (pure CRUD, fetch-injected, no business
  logic).
- **`entities/diagram` (`excalidrawFormat`)** — pure functions to build, parse,
  and validate the `.excalidraw` file format. No browser dependencies; fully
  unit-testable.

This isolates the fragile DOM/storage coupling inside `scene-bridge`, and keeps
`excalidrawFormat` and `drive-client` pure and easy to test. No component
re-implements a button, dialog, or theme lookup.

## Data Flow

- **Connect (first run):** popup → user types a folder name → "Connect Drive"
  → `drive/connect { folderName }` → gateway calls `getAuthToken(interactive)`
  then `findOrCreateFolder(token, folderName)` → store `folderId` +
  `connected` in `chrome.storage.local`. No token stored (Chrome caches it).
  No folder browsing: under `drive.file` the app can only ever see folders it
  created, so naming a folder is how connect works.
- **List:** panel mounts (connected) → gateway `drive/list` → render names +
  modified dates; a `401` here flips the panel to disconnected without
  touching the canvas (see Involuntary logout below).
- **Open diagram:** click file → gateway `drive/get(id)` → `parseExcalidrawFile`
  validates the envelope → `setActiveFile({id, name, loadedRevision:
  headRevisionId})` persists the pointer → `sceneBridge.writeScene(file)`
  writes localStorage + IndexedDB binaries and reloads the tab → Excalidraw
  restores it.
- **Create:** "New diagram" → name entered → `buildExcalidrawFile([], {theme},
  {})` (blank scene) → gateway `drive/create` → `setActiveFile` → `writeScene`
  (write + reload) → becomes active.
- **Autosave:** the autosave controller polls `currentSceneHash` on a
  ~1s interval; once changed-and-stable for ~2.5s, it reads the scene
  (`readScene`), calls gateway `drive/update(id, content, prevRevision:
  loadedRevision)`, and on success updates `loadedRevision` to the new
  `headRevisionId` and re-persists the active-file pointer. If the remote
  `headRevisionId` no longer matches `prevRevision`, the gateway returns
  `code: "conflict"`; the badge shows "Conflict — not saved" — no silent
  overwrite (resolution UI deferred; v1 blocks + tells the user).
- **Rename:** inline edit → gateway `drive/rename(id, name)` → re-fetch
  `drive/list` to refresh the panel.

## Auth / Session Lifecycle

- **Sign in:** popup "Connect Google Drive" (with a folder name entered) →
  gateway `drive/connect` → `getAuthToken(interactive)` →
  `findOrCreateFolder` → connected.
- **Sign out (explicit):** the panel's "Sign out" opens a `ConfirmDialog` —
  "This saves the current diagram to Drive and clears the canvas. Continue?"
  On confirm (`doSignOut`): (1) best-effort flush — if a file is active, save
  it now via `drive/update` (failure doesn't block sign-out); (2)
  `auth/signOut` revokes the cached OAuth token in the background; (3)
  `clearActiveFile()` removes the session pointer; (4) local state resets and
  the panel shows disconnected; (5) `sceneBridge.clearScene()` wipes
  localStorage + IndexedDB binaries and reloads the tab.
- **Involuntary logout (token expired or revoked externally):** any
  `sendToBackground` call that throws a `RequestError` with `code ===
  "unauthorized"` (the panel's `refresh()` checks this on `drive/list`
  failures) flips the panel to disconnected **without** clearing or reloading
  the local scene — deliberately distinct from explicit sign-out, which
  clears. The active-file pointer in `chrome.storage.local` is left intact so
  re-connecting can resume where the user left off.
