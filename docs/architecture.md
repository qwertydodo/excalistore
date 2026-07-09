# Architecture

## Source layout (simplified Feature-Sliced Design)

`src/` is organized as simplified FSD. Layers import only from layers strictly
below: `shared → entities → features`. `entrypoints/` (background, content,
popup) is the app/composition root and may import from any layer. Slices on
the same layer never import each other. Each slice exposes a barrel
`index.ts` as its public API.

There is no `widgets` (or `pages`) layer in use: with three independent
composition roots and no shared UI block reused across more than one of
them, promoting a component to `widgets/` would just be ceremony. Each
entrypoint owns its own page-local code directly, under its own `ui/`
(components), `model/` (hooks + session stores), and `lib/` (pure helpers)
folders — e.g. `DiagramPanel` (composes `DiagramRow` and
`CreateDiagramForm`), `ConnectButton`, and `FolderNameForm` live under
`entrypoints/content/ui/`, `PopupStatus` under `entrypoints/popup/ui/`, the
scene bridge and autosave controller under `entrypoints/content/lib/`.
Promote something to `src/widgets/` (or pull a piece out to
`src/features/`) only once it's actually reused by a second composition
root — until then it stays page-local and FSD's "is it imported by 2+
slices" test for promotion just isn't met. `features/driveGateway` is the
one feature slice that passes this test: three composition roots consume it
(background runs `handleMessage`, content and popup call
`sendToBackground`), so it owns the cross-context message contract.

```
src/
  shared/        business-agnostic primitives reused everywhere
    ui/          Button, Dialog/ConfirmDialog, TextField, ListItem, Badge,
                 Spinner
    api/         googleClient (ky transport singleton only — no API methods,
                 no auth)
    config/      design tokens (theme) and shared constants (googleApi URLs/
                 scopes, diagram storage constants, excalidraw origin)
  entities/
    diagram/       the .excalidraw business entity — format build/parse/
                   validate, the ActiveFile pointer
    google/        provider group sharing the googleClient transport
      auth/        ALL auth: authRepo (getToken/signOut/revoke via
                   chrome.identity) + installAuthInterceptor (background only)
      drive/       driveRepo — Drive REST v3 CRUD + findOrCreateFolder;
                   DriveFile/DiagramContent domain types
  features/
    driveGateway/  the cross-context messaging feature: api/ holds the typed
                   request/response contract + sendToBackground client (used
                   by content + popup); lib/ holds the background router
                   (handleMessage), sender guard, and connectionService
entrypoints/
  content/    mounts the panel in a Shadow DOM on excalidraw.com; split into
              mount wiring (index.tsx) and a composition root (App.tsx) at
              the entrypoint root, one hook per concern under model/ (file list, active-file + autosave + CRUD actions,
              panel visibility, sign-out, connect) plus the chrome.storage
              session stores (active-file pointer, file-list cache, panel
              state), page-local components
              under ui/ (ConnectButton + its FolderNameForm connect dialog,
              DiagramPanel + its
              DiagramRow/CreateDiagramForm sub-components), and the scene
              bridge, its IndexedDB adapter, and the autosave controller
              under lib/
  popup/      extension popup; composition root (App.tsx) + PopupStatus
              under ui/ (status + Open Excalidraw shortcut)
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
│    • Panel UI  (React in Shadow DOM)                              │
│    • Autosave Controller (debounce + conflict guard)             │
│         ▲  typed messages (chrome.runtime)                        │
└─────────┼─────────────────────────────────────────────────────────┘
          │
┌─────────▼──────── Background service worker (trusted core) ───────┐
│  • authRepo          chrome.identity.getAuthToken (drive.file)    │
│  • auth interceptor  attaches Bearer per request + 401 retry      │
│  • driveRepo         list / read / create / rename / update /     │
│                       findOrCreateFolder                          │
│  • Drive gateway     all Google API calls happen HERE only        │
└────────┬──────────────────────────────────────────────────────────┘
         │ HTTPS (Bearer)
              Google Drive REST v3
```

**Core principle:** all network access and token handling live **only** in the
background service worker. The content script and panel never hold the OAuth
token. Panel and background communicate over typed `chrome.runtime` messages.

**Message flow (panel → gateway → auth/drive):** the in-page connect UI
(`ConnectButton`'s dialog, driven by the diagram library store's `connect`
action) never calls Drive APIs directly and never holds the OAuth token. It collects a folder name from the
user and sends a single typed request, `drive/connect { folderName }`, to the
background — interactive sign-in and the find-or-create folder lookup both
happen inside the gateway, not the page. The panel and popup otherwise send
typed requests (`auth/status`, `auth/signOut`, `drive/list`, …) straight to the
background. The popup itself is thin (`PopupStatus`): it only reads
`auth/status` and opens excalidraw.com — it no longer connects or signs out. `entrypoints/background.ts` is the composition root: at startup it
calls `installAuthInterceptor()` once — the single side-effect that wires auth
into the shared `googleClient` — then registers a single
`chrome.runtime.onMessage` listener that hands every request to
`features/driveGateway`'s `handleMessage(req)`. There is no dependency
injection: FSD already lets the gateway import its collaborators directly, so
`handleMessage` calls `connectionService` (connect/getStatus/signOut over
`chrome.storage.local` + `entities/google/auth`) and `driveRepo`
(`entities/google/drive`) straight — the repo already exposes the exact domain
methods the routes call, so there is no wrapper service and nothing to thread
through. The gateway routes the full diagram read-write surface —
`drive/get|create|update|rename`, the connect flow (`drive/connect`) — and
`auth/*`.

**Token never threads through the gateway.** Drive requests do not carry a
token argument; the auth interceptor on `googleClient` attaches
`Authorization: Bearer <token>` per request (silent `getToken`, deduped) and,
on a `401`, drops the cached token and retries once. `drive/connect` is the
one route that needs interactive consent, which `connectionService.connect`
triggers itself via `getToken(true)`. `handleMessage` itself stays a generic
dispatcher (look up route, run it, classify errors); each route owns its own
preconditions via the `requireConnection` / `requireFolderId` guards, so the
connection rules live with the route, not baked into the dispatch loop. The
OAuth token never leaves the background worker, and is never cached in memory
(the
MV3 worker is ephemeral; Chrome caches/refreshes the token).

Before routing, the listener validates the message sender via `isAllowedSender`
(`messageGuards`) — the request must come from the extension's own popup page
or a content script on `https://excalidraw.com/` (same `chrome.runtime.id`);
anything else is rejected with `forbidden sender`. The gateway returns a typed
`Response<T>` that `sendToBackground` unwraps, throwing a `RequestError` on
`{ ok: false }` that carries the response's `code`
(`"conflict" | "unauthorized" | "not_found" | "unknown"`) as a typed property
(`RequestError.code`) — so callers (the panel container, the autosave save
callback) branch on it directly, e.g. `e instanceof RequestError && e.code ===
"unauthorized"` to distinguish an expired session from a generic failure.
`updateFile`'s conflict guard (remote `headRevisionId` ≠ the caller's
`prevRevision`) maps to `code: "conflict"`. Auth failures map to
`code: "unauthorized"`: the gateway's `classifyError` helper keys off the
structured `DriveError.status` (HTTP `401`/`403`, e.g. Drive's "insufficient
scopes") and off named message patterns for token-grant failures
(`UNAUTHORIZED_MESSAGE_PATTERN`), rather than inline magic strings. A `404`
(the active file deleted on Drive out from under an in-flight autosave) maps
to `code: "not_found"`, also keyed off `DriveError.status`.
`listFolder` follows Drive's `nextPageToken`, so folders with more than one
page of diagrams list completely.

**Content-script mount (`entrypoints/content/`):** the app-layer composition
root for excalidraw.com, split across files the same way `entrypoints/popup/`
splits `main.tsx` from `App.tsx`. The mount wiring calls WXT's
`createShadowRootUi` (`cssInjectionMode: "ui"`, `position: "inline"`) to
render the panel into a Shadow DOM positioned fixed top-right. `index.tsx`'s
`onMount` also wires two DOM-level concerns at this same top level, each with
a matching `onRemove` cleanup: `scopeKeyboard` stops key events from bubbling
past the Shadow DOM, and `syncPanelTheme`
(`entrypoints/content/lib/themeSync.ts`) mirrors Excalidraw's own light/dark
theme onto the panel. Excalidraw exposes no public theme API, so
`syncPanelTheme` watches the DOM directly: it finds Excalidraw's root
`.excalidraw` container (waiting for it via a `childList`/`subtree`
`MutationObserver` on `document.body` if the container isn't mounted yet),
then observes that container's `class` attribute for the `theme--dark` token
Excalidraw itself toggles, and mirrors the mapped theme onto the shadow
host's `data-theme` attribute — the same attribute the `--es-*` CSS cascade
already switches on. Event-driven, no polling; the initial theme is read
synchronously before observation starts, so there's no flash of the wrong
theme on mount. State lives in
two zustand stores under `model/`, each read directly by whichever
hook/component needs it instead of being threaded through `App` as
props/params:

- **`diagramLibraryStore`** — the connected Drive file list, connection
  status, the persisted search query's initial load, and the connect flow
  (`isConnecting`/`connectError`/`connect`; `connect` is just another store
  action, the same shape as `refresh`, rather than a separate hook
  duplicating its own loading/error state). `useDiagramLibrary` (called once
  from `App`, kicking off the search-query load) exposes only `status`,
  since that's all the composition root needs to branch between
  `ConnectButton` and the panel — `ConnectButton` itself reads
  `isConnecting`/`connectError`/`connect` straight off the store (one
  `useShallow` call), so `App` passes it no props at all.
- **`activeDiagramStore`** — the active-file pointer (`activeId`), its save
  `revision`, `saveStatus`, `actionError`, and the CRUD actions
  (`onOpen`/`onCreate`/`onRename`/`onDelete`) that read/write that pointer.
  the store's own lifecycle effects are split across three gated hooks:
  `useInitialDiagramLoad` (called from `useAppInit`, outside App's readiness
  gate — kicks off `loadInitial` on the `isConnected` flip), and
  `useAutosave`/`useAutoCreate` (called from the renderless `DiagramWatchers`,
  which `App` mounts only once `isReconciled` — the autosave loop wired to
  whichever file is active, and the auto-create watcher for when none is) —
  everything they produce lives in the store. Each consumer reads only the
  slice it needs, directly off the store, rather than via props: `DiagramPanel`
  reads `saveStatus`/`actionError`/`onOpen` (one `useShallow` call) since it
  wraps `onOpen` in its own in-flight lock; `DiagramList` reads
  `activeId`/`onRename`/`onDelete`; `CreateDiagramForm` reads `onCreate`.
  `App` renders `<DiagramPanel onSignOut={...} />` with nothing else to pass.
  `useSignOutFlow` likewise reads `activeId`/`onActiveIdChange`/
  `onActionErrorChange` off `activeDiagramStore` and `onStatusChange` off
  `diagramLibraryStore` directly, so it takes no params either.

`onSignOut` stays a top-level prop on `DiagramPanel` since sign-out is its own
flow, not a diagram action. Whether the panel itself is shown or collapsed is
owned entirely inside `DiagramPanel` via its own `usePanelVisibility` hook
(`entrypoints/content/model/usePanelVisibility`) — that state has no
dependency on the active diagram or the composition root, so it isn't
threaded through `App` at all.

Excalidraw.com exposes no public JS API on the page. The scene is read from and
written to its `localStorage` (`excalidraw` elements, `excalidraw-state`
appState) and IndexedDB (`files-db` image binaries); loading a diagram writes
storage then reloads the tab so Excalidraw restores it. The scene bridge
(`entrypoints/content/lib/sceneBridge.ts`) owns this boundary: `readScene`/`writeScene`/`clearScene`/`readTheme`/
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

- **`entities/google/auth`** — all auth in one slice. `authRepo`:
  `getToken({interactive})`, `invalidateToken`, `signOut` (revoke +
  `removeCachedAuthToken`). `installAuthInterceptor()` wires the Bearer-on-
  request + 401-retry behaviour into `googleClient`; called once from
  `background.ts`. Scope: `drive.file`.
- **`entities/google/drive`** — `driveRepo`, a typed wrapper over Drive REST
  v3: `listFolder(folderId)`, `getMeta(id)`, `getContent(id)`,
  `getDiagram(id)` (meta + content together), `createFile(name, folderId,
  content)`, `updateFile(id, content, prevRevision)`, `renameFile(id, name)`,
  `trashFile(id)`, `findOrCreateFolder(name)`. No token arguments — auth is
  attached by the interceptor. Returns `modifiedTime` + `headRevisionId` for
  the conflict guard.
- **`gateway`** — message router (`handleMessage`); the only place that touches
  the Google entities. Calls `connectionService` + `driveRepo` directly (no DI).
  Validates the message sender (`isAllowedSender`, in `messageGuards`) before
  routing `auth/status|signOut`,
  `drive/connect|list|get|create|update|rename|trash`.

### Content script

- **`scene-bridge`** — `readScene()` (localStorage elements/appState + IndexedDB
  binaries → `.excalidraw` JSON), `writeScene(file)` (validate, write storage +
  binaries, reload tab), `clearScene()` (wipe + reload, for safe sign-out),
  `readTheme()`, `currentSceneHash()` for change detection. Validates the
  `.excalidraw` envelope against a schema before any write — the security
  boundary before untrusted content reaches page storage.
- **`autosave`** (`entrypoints/content/lib/autosaveController.ts`) —
  `createAutosave({getHash, save,
  onStatus, delayMs, pollMs, now})` polls `currentSceneHash`, and once the
  hash has been stable-but-different from the last saved hash for `delayMs`
  (~2.5s), calls `save()` and reports `saving` →
  `saved`/`conflict`/`error`/`deleted`. A `save()` rejection with
  `RequestError.code === "not_found"` reports `deleted` and permanently stops
  the poll timer for that controller instance — a `404` never resolves itself
  the way a conflict might, so retrying forever would just spam Drive with
  requests against a file that's gone. `flush()` forces an immediate save
  when dirty (used by sign-out) but is likewise a no-op once `deleted`; the
  clock and poll trigger are injectable, so the controller is fully
  unit-tested without real timers. `useAutosave` and `useAutoCreate` each
  create their own independent instance of it — one for regular per-file
  autosave, one for the auto-create-on-first-stroke watcher below — same
  debounce semantics, two different `save()` callbacks.
- **`sessionStore`** (`entrypoints/content/model/stores/sessionStore.ts`) —
  plain `chrome.storage.local` get/set/clear wrappers, one file since each is
  just a key/value pair, not real app state: `getActiveFile`/`setActiveFile`/
  `clearActiveFile` persist the `ActiveFile` pointer (`id`, `name`,
  `loadedRevision`) so it survives the `writeScene`-triggered tab reload;
  `getCachedFiles`/`setCachedFiles`/`clearCachedFiles` (file-list cache),
  `getPanelCollapsed`/`setPanelCollapsed` (panel collapse), and
  `getDiagramSearchQuery`/`setDiagramSearchQuery` (search query) persist the
  same way. Also `hasValidatedFileListThisSession`/
  `markFileListValidatedThisSession`, backed by `window.sessionStorage`
  instead of `chrome.storage.local`: it must survive a same-tab
  `writeScene`-triggered reload (so an open/switch/create doesn't re-show the
  full-list loading spinner) but must NOT survive a fresh tab/browser session
  (whose cached file list could be stale relative to Drive).
- **zustand stores** (`entrypoints/content/model/stores/` —
  `diagramLibraryStore`, `activeDiagramStore`) — in-memory (not persisted)
  reactive state, alongside `sessionStore` since both are "the app's stores",
  just different persistence models. `diagramLibraryStore` covers the
  connected Drive file list, connection status, the persisted search query's
  resolved initial value, and the connect flow; `activeDiagramStore` covers
  the active-file pointer, its save revision, save status, action error, and
  the open/create/rename/delete actions. Both are read directly by whichever
  hook/component needs them instead of being threaded through `App.tsx` as
  props/params.
- **`panel`** (`entrypoints/content/ui/DiagramPanel`, React, Shadow DOM) —
  presentational: gates on the library store's loading state (selecting
  `saveStatus`/`actionError`/`onOpen` off `activeDiagramStore` in one
  `useShallow` call), renders `DiagramList` (file list + search box, name +
  modified date, active-file indicator), save-status badge, and inline
  rename (each row owns its own rename-edit state). `DiagramList` itself
  reads `activeId`/`onRename`/`onDelete` straight off `activeDiagramStore`
  rather than taking them as props from `DiagramPanel` (only the panel-local
  `areRowsLocked`/`openingId`/`onRowOpen` — derived state that wraps the
  store's `onOpen` with an in-flight lock — are real props); `DiagramList`
  also owns the sort + search itself via `useDiagramData` (sorts by name,
  runs `useTextSearch` over it, persists the debounced query to
  `sessionStore`). `CreateDiagramForm` likewise reads `onCreate` directly off
  `activeDiagramStore` instead of taking it as a prop. The replace-canvas
  confirm and sign-out `ConfirmDialog` are rendered by the container
  (`entrypoints/content/App.tsx`), not the component, since they need
  orchestration.

### Shared layer

Reusable foundation everything else is built from:

- **`shared/ui`** — primitive components rendered in Shadow DOM: `Button`,
  `Dialog`/`ConfirmDialog`, `TextField`, `SearchField`, `ListItem`, `Badge`,
  `Spinner`, plus
  the layout/typography primitives `Box`, `Stack`, `Text`, `Heading` (all
  polymorphic via an `as` prop; `Stack` composes `Box`, `Heading` composes
  `Text`). `Box` owns the `padding`/`border`/`radius`/`shadow` token scales —
  every bordered/rounded/shadowed surface (`Button`, `TextField`, `ListItem`,
  `Dialog`'s panel, `DiagramPanel`'s root via `Stack`) goes
  through it instead of repeating `border`/`border-radius`/`box-shadow`
  per-component. The panel and every dialog (replace-canvas, sign-out,
  rename, conflict) are composed from these.
- **`shared/lib`** — cross-cutting hooks (under `hooks/`: `useDebounce`,
  `useTextSearch` — generic type-to-filter hook, used by the diagram panel's
  search box) and plain functions (`dateFormatUtils`, `typeUtils`, `testUtils`).
- **`shared/config` (`theme`)** — design tokens as CSS custom properties in
  `theme.css`, following a two-layer architecture:
  - **Primitive tokens** (`--es-color-*`) — raw hex palette values; never used
    directly in components.
  - **Semantic tokens** (`--es-color-bg-*`, `--es-color-text-*`,
    `--es-color-border*`, `--es-color-interactive-*`, `--es-color-status-*`,
    `--es-color-overlay`) — purpose-named, reference primitives, switch per
    theme. These are the only tokens components consume.
  Theme switching (light/dark) is done via the `data-theme` attribute on
  `:root`/`:host`; only semantic tokens change between themes. Flat,
  theme-independent scales live alongside: spacing (`--es-space-*`), typography
  (`--es-font-*`, `--es-line-height-*`), radius (`--es-radius-*`), border-width
  (`--es-border-width-*`), shadow (`--es-shadow-*`), z-index, transitions,
  focus-ring geometry.
  Component-level tokens are intentionally avoided — semantic tokens are
  expressive enough for all current components.
- **`shared/api` (`googleClient`)** — the ky transport singleton (no API
  methods, no auth; Drive CRUD lives in `entities/google/drive`). The typed
  request/response contracts (discriminated unions) shared by content script
  and background live with their owner, `features/driveGateway/api`.
- **`entities/diagram` (`excalidrawFormat`)** — pure functions to build, parse,
  and validate the `.excalidraw` file format. No browser dependencies; fully
  unit-testable.

This isolates the fragile DOM/storage coupling inside `scene-bridge`, and keeps
`excalidrawFormat` and `driveRepo` pure and easy to test. No component
re-implements a button, dialog, or theme lookup.

## Data Flow

- **Connect (first run):** in-page "Connect Google Drive" button → dialog →
  user types a folder name → submit → `drive/connect { folderName }` →
  `connectionService.connect` calls `getToken(interactive)` then
  `findOrCreateFolder(folderName)` (auth attached by the interceptor) → store
  `folderId` + `connected` in `chrome.storage.local`. No token stored (Chrome
  caches it). On success the store's `connect` action also sets the persisted
  panel state to expanded, so the panel opens automatically when `App` swaps
  to it.
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
  overwrite (resolution UI deferred; v1 blocks + tells the user). If the file
  no longer exists on Drive at all, the gateway returns `code: "not_found"`;
  the badge shows "Diagram deleted on Drive", `useAutosave` calls
  `activeDiagramStore.onRemoteDeleted` to clear the active pointer and drop
  the row from the panel list, and the autosave controller stops polling for
  that file for good (see `autosave` above).
- **Auto-create on first stroke:** `useAutoCreate` — mounted (via
  `DiagramWatchers`) only once `App` has confirmed connected + reconciled —
  runs the opposite condition to `useAutosave`: no `activeId`. No further
  connection/reconcile guard is needed inside the hook itself, since
  unmounting `DiagramWatchers` on disconnect is the cleanup path.
  It reuses the same `createAutosave` debounce (~2.5s stable-changed) as
  regular autosave; once it fires, `activeDiagramStore.onAutoCreate(content,
  name)` creates a Drive file from the *current* scene (not blank) and sets
  `activeId`/`revision` directly — no `writeScene`, no reload, so the user's
  drawing is never interrupted. The name comes from `nextUntitledName`
  (`src/entities/diagram/lib/fileName.ts`): `"Untitled"`, `"Untitled 2"`, ...,
  case-insensitive collision check against the current library list. Once
  `activeId` flips non-null, the regular autosave effect above takes over —
  no special handoff code. Composes with remote-deletion handling above with
  no extra logic: if the active file gets deleted mid-session and the user
  keeps drawing, `activeId` going back to null re-arms this same watcher.
- **Rename:** inline edit → gateway `drive/rename(id, name)` → re-fetch
  `drive/list` to refresh the panel.

## Auth / Session Lifecycle

- **Sign in:** in-page "Connect Google Drive" dialog (with a folder name
  entered) → gateway `drive/connect` → `getAuthToken(interactive)` →
  `findOrCreateFolder` → connected.
- **Sign out (explicit):** the panel's "Sign out" opens a `ConfirmDialog` —
  "This saves the current diagram to Drive and clears the canvas. Continue?"
  On confirm (`doSignOut`): (1) best-effort flush — if a file is active, save
  it now via `drive/update` (failure doesn't block sign-out); (2)
  `auth/signOut` revokes the cached OAuth token in the background; (3)
  `clearActiveFile()` removes the session pointer; (4) local state resets and
  the panel shows disconnected; (5) `sceneBridge.clearScene()` wipes
  localStorage + IndexedDB binaries and reloads the tab.
- **Involuntary logout (token expired or revoked externally):** the auth
  interceptor first transparently retries a single `401` with a refreshed
  token; only if that retry also fails does the error surface. Any
  `sendToBackground` call that throws a `RequestError` with `code ===
  "unauthorized"` (the panel's `refresh()` checks this on `drive/list`
  failures) flips the panel to disconnected **without** clearing or reloading
  the local scene — deliberately distinct from explicit sign-out, which
  clears. The active-file pointer in `chrome.storage.local` is left intact so
  re-connecting can resume where the user left off.
