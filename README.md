# Excalistore

A Chrome extension (Manifest V3) that connects [excalidraw.com](https://excalidraw.com) to Google Drive. It adds an in-page panel to browse, open, create, rename, and autosave `.excalidraw` diagrams stored in a Drive folder — with full image fidelity, minimal OAuth permissions, and a UI that matches Excalidraw's light/dark theme.

## Features

- **Browse & open diagrams** — panel on excalidraw.com lists files from your connected Drive folder (name + modified date).
- **Create & rename** — create new diagrams in Drive and rename them inline.
- **Debounced autosave** — saves changes ~2.5s after you stop editing; shows idle / saving / saved / conflict status.
- **Full image fidelity** — embedded images are read from IndexedDB and stored in the `.excalidraw` envelope; no silent data loss.
- **Safe sign-out** — flushes any pending autosave, clears the local canvas, then revokes the OAuth token.
- **Conflict guard** — if the Drive file was modified elsewhere, the save is blocked and the badge warns you; no silent overwrite.
- **Theme mirror** — the panel follows Excalidraw's light/dark theme within ~1s.

## Stack

| Tool | Purpose |
|------|---------|
| [WXT](https://wxt.dev) | MV3 extension framework (HMR, entrypoints, build) |
| React 19 + TypeScript (strict) | UI and type safety |
| Biome | Lint + format (replaces ESLint + Prettier) |
| Vitest + Testing Library | Unit and component tests |
| lefthook + commitlint | Pre-commit hooks, Conventional Commits |
| knip | Dead-code detection |

## Architecture

All network access and OAuth token handling live exclusively in the background service worker. The content script and panel communicate with it over typed `chrome.runtime` messages and never hold the token.

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
│    • Autosave Controller (debounce + conflict guard)              │
│         ▲  typed messages (chrome.runtime)                        │
└─────────┼─────────────────────────────────────────────────────────┘
          │
┌─────────▼──────── Background service worker (trusted core) ───────┐
│  • Auth module       chrome.identity.getAuthToken (drive.file)    │
│  • Drive client      list / read / create / rename / update       │
│  • Drive gateway     all Google API calls happen HERE only        │
└────────┬──────────────────────────────────────────────────────────┘
         │ HTTPS (Bearer)
   Google Drive REST v3
```

### Source layout

The project follows [Feature-Sliced Design v2.1](https://feature-sliced.design/). Layers import only downward (`shared → entities → features`). `entrypoints/` is the composition root (equivalent to FSD's `app` layer).

```
src/
  shared/           Business-agnostic primitives reused everywhere
    ui/             Button, Dialog/ConfirmDialog, TextField, ListItem,
                    Badge, Spinner, Box, Stack, Text, Heading
    api/            Typed chrome.runtime message contracts +
                    Drive REST v3 client
    config/         Design tokens (theme.css, --es-* CSS vars) +
                    shared constants
  entities/
    diagram/        .excalidraw format: build / parse / validate
  features/
    auth/           chrome.identity wrapper (background only)
    driveGateway/   Message router; sole consumer of auth + Drive client
    sceneBridge/    Content-script bridge between Excalidraw's storage
                    and the .excalidraw envelope
    autosave/       Debounced autosave controller
    session/        Active-file pointer persisted across tab reloads
    driveConnect/   Folder-name form (shared by panel + popup)

entrypoints/
  content/          Mounts the Shadow DOM panel on excalidraw.com
    App.tsx         Composition root
    model/          Hooks: file list, active diagram + CRUD, autosave,
                    sign-out, connect, panel visibility, theme sync
    ui/             ConnectCard, DiagramPanel, DiagramRow,
                    CreateDiagramForm
    lib/            Shared SceneBridgeDeps instance
  popup/            Extension popup
    App.tsx         Composition root
    ui/             PopupConnect
  background.ts     Service worker; holds the OAuth token
```

Module files are camelCase; React components are PascalCase. Theme tokens are CSS custom properties (`--es-*`) in `shared/config/theme.css`, switched via the `data-theme` attribute on the Shadow DOM host.

## Setup

### Prerequisites

- Node.js 20+
- A Google Cloud project with the Drive API enabled (required for OAuth)

### Install

```bash
npm install
```

### Environment variables

```bash
cp .env.example .env
```

Fill in the two variables in `.env`:

| Variable | Description |
|----------|-------------|
| `WXT_OAUTH_CLIENT_ID` | OAuth 2.0 client ID of type "Chrome extension" |
| `WXT_PUBLIC_KEY` | Extension manifest `key` (pins the extension ID) |

Neither variable is committed. The project builds without them, but OAuth will not work.

### Google OAuth setup

1. Create a Google Cloud project and enable the **Drive API**.
2. Run `npm run build` and load `.output/chrome-mv3` as an unpacked extension at `chrome://extensions` (Developer mode on). Note the extension ID shown on its card.
3. Create an OAuth 2.0 client of type **Chrome extension** bound to that ID.
4. Set `WXT_OAUTH_CLIENT_ID` to the client ID in `.env`.
5. Ask a maintainer for `WXT_PUBLIC_KEY`, or generate your own for a fork.

The OAuth scope is `drive.file` only — the extension can only see folders it created and files it manages.

## Development

```bash
npm run dev          # Start WXT dev server with HMR
```

Load `.output/chrome-mv3` as an unpacked extension at `chrome://extensions`. WXT rebuilds on save and the extension reloads automatically.

## Commands

```bash
npm run build        # Production build → .output/chrome-mv3
npm run zip          # Package for the Chrome Web Store
npm test             # Run Vitest once
npm run test:watch   # Vitest in watch mode
npm run lint         # Biome check
npm run lint:fix     # Biome check --write
npm run compile      # TypeScript typecheck (tsc --noEmit)
npm run knip         # Dead-code detection
```

## Security posture

- **Manifest V3.** `host_permissions` limited to `excalidraw.com` and `googleapis.com`. No `tabs`, `webRequest`, or broad host access.
- **OAuth scope `drive.file` only** — the app sees nothing in Drive except the folder it created and files it manages.
- **No client secret** — `chrome.identity.getAuthToken` uses Chrome's signed-in account; no secret is shipped.
- **Token never leaves the background worker** and is never logged or passed to the content script.
- **Input validation** — every `.excalidraw` payload (from Drive or localStorage) is validated against a Zod schema before being written into page storage.
- **Strict CSP**, no remote code, no `eval`, no CDN — everything bundled by WXT.

See `docs/security.md` for the full security record.

## Docs

| File | Contents |
|------|----------|
| `docs/architecture.md` | Detailed component boundaries and data flow |
| `docs/features.md` | Shipped features and roadmap |
| `docs/security.md` | Full security posture record |
| `docs/development.md` | OAuth setup, manual E2E checklist, React Compiler notes |

## Contributing

Commits follow [Conventional Commits](https://www.conventionalcommits.org/): `type(scope): subject` — enforced by commitlint on pre-commit. Branch names follow the same pattern: `feat/short-description`, `fix/short-description`, etc.

Pre-commit hooks (lefthook) run `biome check` on staged files, `tsc --noEmit`, and `knip` before every commit.
