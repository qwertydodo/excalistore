# Architecture

## Source layout (simplified Feature-Sliced Design)

`src/` is organized as simplified FSD. Layers import only from layers strictly
below: `shared → entities → features → widgets`. `entrypoints/` (background,
content, popup) is the app/composition root and may import from any layer.
Slices on the same layer never import each other. Each slice exposes a barrel
`index.ts` as its public API.

```
src/
  test-setup.ts
  shared/                  (business-agnostic, reused everywhere)
    ui/                    (primitive components; PascalCase + CSS Modules)
      Button/, IconButton/, Dialog/, ConfirmDialog/, TextField/,
      ListItem/, Badge/, Spinner/, index.ts
    api/                   (cross-process RPC contracts)
      messages.ts, messages.test.ts, index.ts
    config/                (design tokens / constants)
      theme.css, theme.ts, index.ts
  entities/
    diagram/                (the .excalidraw business entity)
      lib/
        excalidrawFormat.ts, excalidrawFormat.test.ts, index.ts
      index.ts
    driveFile/               (the Drive file domain entity)
      model/
        types.ts, index.ts             (DriveFile type)
      api/
        driveClient.ts, driveClient.test.ts, index.ts  (Drive REST v3 client,
        fetch-injected: listFolder, getMeta, getContent, createFile,
        updateFile [conflict-guarded], renameFile)
      index.ts
  features/
    auth/                    (chrome.identity wrapper — background only)
      api/
        authClient.ts, authClient.test.ts, index.ts  (getToken, signOut)
      index.ts
    pickFolder/               (Google Picker wrapper — runs in the popup)
      lib/
        picker.ts, index.ts             (pickFolder(token, apiKey, appId))
      index.ts
    driveGateway/              (message router; the only consumer of auth +
                                 driveFile from the background side)
      lib/
        handleMessage.ts, handleMessage.test.ts, index.ts
      index.ts
  widgets/
    popupConnect/              (popup UI composed from shared/ui)
      PopupConnect/
        PopupConnect.tsx, PopupConnect.module.css, PopupConnect.test.tsx,
        index.ts
      index.ts
  (Plan 3 adds: entities/scene, features/{autosave,openDiagram,createDiagram,
   renameDiagram}, widgets/diagramPanel)
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
│  • Drive client      list / read / create / rename / update       │
│  • Drive gateway     all Google API calls happen HERE only        │
└────────┬──────────────────────────────────────────────────────────┘
         │ HTTPS (Bearer)
   Google Drive REST v3  +  Google Picker (folder pick, one-time)
```

**Core principle:** all network access and token handling live **only** in the
background service worker. The content script and panel never hold the OAuth
token. Panel and background communicate over typed `chrome.runtime` messages.

**Message flow (popup → gateway → auth/drive):** the popup (`widgets/popupConnect`,
driven by `entrypoints/popup/App.tsx`) never calls Drive APIs directly. It
either (a) calls `features/auth`'s `getToken`/`features/pickFolder`'s
`pickFolder` locally — the one case where the popup briefly holds the OAuth
token, scoped to the Picker session — and then sends the result to the
background via `shared/api.sendToBackground({ type: "drive/setConnection",
status })`, or (b) sends a typed request (`auth/status`, `auth/signOut`,
`drive/list`, …) straight to the background. `entrypoints/background.ts`
registers a single `chrome.runtime.onMessage` listener that hands every
request to `features/driveGateway`'s `handleMessage(req, deps)`, a pure
function injected with `getToken`/`signOut` (`features/auth`),
`listFolder` (`entities/driveFile`), and `getStore`/`setStore`
(`chrome.storage.local`). The gateway is the only thing in the background
that touches `auth` or `driveFile`; it returns a typed `Response<T>` that
`sendToBackground` unwraps (throwing on `{ ok: false }`).

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

- **`shared/ui`** — primitive components rendered in Shadow DOM: `Button`,
  `IconButton`, `Dialog`/`ConfirmDialog`, `TextField`, `ListItem`, `Badge`,
  `Spinner`. The panel and every dialog (replace-canvas, sign-out, rename,
  conflict) are composed from these.
- **`shared/config` (`theme`)** — design tokens as CSS custom properties
  (`theme.css`) for light and dark, mirrored from Excalidraw's appState via the
  `data-theme` attribute (`THEME_ATTR`). Single source of styling for the
  primitives.
- **`shared/api` (`messages`)** — typed request/response contracts
  (discriminated unions) shared by content script and background.
- **`entities/diagram` (`excalidrawFormat`)** — pure functions to build, parse,
  and validate the `.excalidraw` file format. No browser dependencies; fully
  unit-testable.

This isolates the fragile DOM/storage coupling inside `scene-bridge`, and keeps
`excalidrawFormat` and `drive-client` pure and easy to test. No component
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
