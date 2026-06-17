# Excalistore — Design Spec

**Date:** 2026-06-17
**Status:** Approved (pending written-spec review)

## Summary

Excalistore is a Chrome extension (Manifest V3, TypeScript) that connects
[excalidraw.com](https://excalidraw.com) to a user's Google Drive. It adds an
in-page panel that lists diagrams stored in a chosen Drive folder, and supports
opening, creating, renaming, and autosaving diagrams — with full fidelity
(including embedded images), minimal OAuth permissions, and a strong security
posture. The UI matches Excalidraw's styling and mirrors its light/dark theme.

## Goals

- Browse diagrams from a Google Drive folder in an in-page panel on excalidraw.com.
- Open a diagram into the canvas, create new diagrams in the folder, and rename them.
- Autosave the active diagram back to Drive while editing.
- Sign in / sign out, with a safe sign-out that saves then clears the canvas.
- Minimum OAuth scope (`drive.file`) and maximum practical security checks.
- UI consistent with Excalidraw, theme-ready (light + dark).

## Non-Goals (v1)

Deferred to the roadmap (see `docs/features.md` → "Next to pick up"):
changing the folder without disconnecting, thumbnail previews, a conflict
resolution UI, delete/move/subfolders, self-hosted Excalidraw hosts,
cross-browser support, and Playwright E2E.

## Key Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Target surface | excalidraw.com only | Single, well-known DOM/storage surface. |
| Drive scope | `drive.file` + Google Picker | App only ever sees the one picked folder + files it creates. Minimal. |
| Browser | Chrome only | Enables `chrome.identity.getAuthToken` — no client secret, Chrome-managed token. |
| Auth | `getAuthToken` | Most secure flow available; no secret shipped. |
| Previews | Names + modified date | Tight v1 scope; thumbnails deferred. |
| Embedded images | Full fidelity | Read IndexedDB binaries, embed in `.excalidraw` `files`. No silent data loss. |
| Autosave | Debounced (~2.5s idle) | Google-Docs-like; avoids spamming the Drive API. |
| Replace canvas | Warn + "Save current first" | Save / Discard / Cancel — prevents accidental loss. |
| On page load | Track active file, don't auto-reload | Least surprising; never clobbers local Excalidraw state. |
| Folder change | Re-pick only via disconnect/reconnect (v1) | Dedicated change-folder UI deferred. |
| Build stack | WXT + React + TypeScript (strict) | Modern MV3 framework; least boilerplate; matches Excalidraw's React UI. |

## Architecture

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

## Security

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
  default MV3 CSP is kept locked.
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

## Tooling

- **WXT** (MV3, entrypoints, HMR) + **React** + **TypeScript** (strict).
- **Biome** — single tool for lint + format (replaces ESLint + Prettier).
- **`tsc --noEmit`** for typechecking.
- **knip** — dead-code detection (unused files, exports, dependencies).
- **Vitest** for tests (see below).
- **lefthook** pre-commit hooks:
  - `pre-commit`: `biome check` (staged), `tsc --noEmit`, `knip`.
  - `commit-msg`: **commitlint** enforcing Conventional Commits.
- **CI (GitHub Actions):** install → `biome ci` → typecheck → test → `knip` →
  `npm audit` → build. Runs on PR.

## Tests (Vitest)

- **Unit (pure, high value):** `excalidraw-format` (build/parse/validate,
  roundtrip including embedded images), `drive-client` (fetch mocked),
  conflict-guard logic, `sceneHash`, message contracts.
- **Component:** `ui` primitives and dialogs via Testing Library (jsdom).
- **Integration (mocked):** autosave debounce + conflict path; sign-out
  flush→clear sequence; `401` → reconnect.
- **Manual E2E checklist** (real Drive) lives in `docs/development.md`. Automated
  Playwright-against-extension is deferred.

## Skills (in repo)

- `frontend-design` — anthropics/skills.
- `chrome-extension-development` — mindrally.
- `chrome-extension-wxt` — tenequm/skills (WXT framework patterns).
- `biome` — tenequm/skills.
- A conventional-commit skill (e.g. git-commit-helper).

## Docs

- `CLAUDE.md` (repo root) — project rules (see below).
- `docs/architecture.md` — architecture diagram, component boundaries, shared
  layer, data flow.
- `docs/features.md` — per-feature behavior, with a **"Next to pick up"**
  roadmap section at the top.
- `docs/security.md` — the security posture record.
- `docs/development.md` — setup, `wxt dev`, load unpacked, test/lint, Google
  OAuth client + Picker API setup, manual E2E checklist.
- `README.md` — overview, install, screenshots.

## Project Rules (CLAUDE.md)

- Update the corresponding doc after any change (architecture change →
  `architecture.md`, security change → `security.md`, etc.).
- After shipping a feature, move it out of "Next to pick up" in `features.md` and
  document its behavior.
- Stack/conventions: WXT + React + TS (strict), Biome, Vitest, `drive.file`
  scope only, all Drive calls in the background worker, validate scene content
  before writing it.
- **Commits:** Conventional Commits — `type(scope): subject`; types
  `feat|fix|docs|chore|refactor|test|build|ci`; enforced by commitlint.
- **Branches:** Conventional Branch — `type/short-description`
  (e.g. `feat/drive-autosave`, `fix/conflict-guard`, `docs/architecture`).

## MVP Scope

- Sign in / sign out (safe sign-out: flush → clear) + involuntary-logout
  handling.
- Pick folder once at connect.
- List folder (names + modified date), open (replace-canvas dialog), create,
  rename.
- Autosave (debounced) with conflict guard.
- Embedded images, full fidelity.
- Theme mirror (light/dark); primitives theme-ready.
- Shared `ui`/`theme` layer, security posture, Biome, knip, Vitest, lefthook +
  commitlint, CI, docs, skills.

## Next to Pick Up (Future)

- Change folder without disconnecting.
- Thumbnail previews.
- Conflict resolution UI (v1 only blocks + warns).
- Delete / move diagrams, subfolders.
- Self-hosted Excalidraw hosts.
- Cross-browser (Edge / Firefox via PKCE).
- Playwright E2E.
