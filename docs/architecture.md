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
      model/
        activeFile.ts, activeFile.test.ts, index.ts  (ActiveFile pointer:
        which Drive file the canvas represents + the loadedRevision used by
        the autosave conflict guard)
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
    sceneBridge/               (content-script transform between Excalidraw's
                                 page storage and the validated .excalidraw
                                 envelope)
      lib/
        sceneBridge.ts, sceneBridge.test.ts  (readScene/writeScene/clearScene/
        readTheme/currentSceneHash — dependency-injected, unit-tested)
        filesDb.ts            (idb-keyval adapter for the files-db IndexedDB
                                store; the one manually-verified boundary)
        index.ts
      index.ts
    autosave/                  (debounced autosave controller)
      lib/
        autosaveController.ts, autosaveController.test.ts, index.ts
        (createAutosave: injectable getHash/save/now/tick; start() drives a
        real interval, flush() forces an immediate save on sign-out)
      index.ts
    session/                   (active-file pointer persisted across reload)
      lib/
        activeFileStore.ts, activeFileStore.test.ts, index.ts
        (getActiveFile/setActiveFile/clearActiveFile over
        chrome.storage.local, validated with entities/diagram's isActiveFile)
      index.ts
  widgets/
    popupConnect/              (popup UI composed from shared/ui)
      PopupConnect/
        PopupConnect.tsx, PopupConnect.module.css, PopupConnect.test.tsx,
        index.ts
      index.ts
    diagramPanel/               (in-page panel UI composed from shared/ui)
      DiagramPanel/
        DiagramPanel.tsx, DiagramPanel.module.css, DiagramPanel.test.tsx,
        index.ts
      index.ts
entrypoints/
  content.tsx                  (app layer: mounts diagramPanel in a Shadow
                                 DOM on excalidraw.com and orchestrates
                                 messaging + sceneBridge + autosave + session;
                                 presentational widget stays framework-thin)
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
`listFolder`/`getFile`/`createFile`/`updateFile`/`renameFile`
(`entities/driveFile`), and `getStore`/`setStore` (`chrome.storage.local`).
The gateway now routes the full diagram read-write surface —
`drive/get|create|update|rename`, alongside the existing
`drive/list|setConnection` and `auth/*` — and is the only thing in the
background that touches `auth` or `driveFile`; the OAuth token still never
leaves the background worker. It returns a typed `Response<T>` that
`sendToBackground` unwraps, throwing a `RequestError` on `{ ok: false }` that
carries the response's `code` (`"conflict" | "unauthorized" | "unknown"`) as
a typed property (`RequestError.code`), not just baked into the message
string — so callers (the panel container, the autosave save callback) can
branch on it directly, e.g. `e instanceof RequestError && e.code ===
"unauthorized"` to distinguish an expired session from a generic failure.
`updateFile`'s conflict guard (remote `headRevisionId` ≠ the caller's
`prevRevision`) and any `401` propagate through unchanged, mapped to
`code: "conflict"` / `code: "unauthorized"` by the gateway's `err()` helper.

**Content-script mount (`entrypoints/content.tsx`):** the app-layer
composition root for excalidraw.com. It calls WXT's `createShadowRootUi` with
`cssInjectionMode: "ui"` (so `defineContentScript`'s bundled CSS, including
`shared/config/theme.css` and the panel's CSS Module, is injected into the
shadow root) and `position: "inline"` / `anchor: "body"`. `onMount` receives
`(uiContainer, shadow, shadowHost)`: the React root is created on
`uiContainer` (the element whose styles are isolated inside the shadow root),
while `shadowHost` (the actual element WXT appends to the page DOM) is
positioned fixed top-right via inline styles (genuinely dynamic — Shadow DOM
hosts can't be targeted by a CSS Module from outside) and carries the
`data-theme` attribute the theme mirror updates, so `:host([data-theme=...])`
rules in `theme.css` apply. `PanelApp` wires `shared/api.sendToBackground` +
`features/sceneBridge` + `features/autosave` + `features/session` together
and renders `widgets/diagramPanel`'s `DiagramPanel`, keeping the widget itself
presentational and FSD-clean.

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
  `updateFile(id, content, prevRevision)`, `renameFile(id, name)`. Returns
  `modifiedTime` + `headRevisionId` for the conflict guard.
- **`gateway`** — message router; the only place that touches `auth` and
  `drive-client`. Routes `auth/status|signIn|signOut`, `drive/list|get|create|
  update|rename|setConnection`.

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
  inline rename, and `onOpen`/`onCreate`/`onRename`/`onSignOut` callbacks. The
  replace-canvas confirm and sign-out `ConfirmDialog` are rendered by the
  container (`entrypoints/content.tsx`), not the widget, since they need
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

- **Sign in:** popup "Sign in with Google" → `getAuthToken(interactive)` →
  Picker (first time only) → connected.
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
