# Development

## Setup
1. `npm install`
2. `cp .env.example .env` and fill in values (see "Google OAuth" below).
3. `npm run dev` — starts WXT dev; load `.output/chrome-mv3` as an unpacked
   extension at `chrome://extensions` (Developer mode on).

## Commands
- `npm run build` — production build.
- `npm test` — run Vitest once. `npm run test:watch` for watch mode.
- `npm run lint` / `npm run lint:fix` — Biome.
- `npm run compile` — TypeScript typecheck.
- `npm run knip` — dead-code check.

## React Compiler
React Compiler is enabled (`wxt.config.ts`'s `react.vite.babel` option, mirrored
in `vitest.config.ts` so tests exercise the same compiled output) — manual
`useCallback`/`useMemo` are usually unnecessary in new components. It runs
through `@vitejs/plugin-react`'s `babel` option, which only exists on
`@vitejs/plugin-react@5.x` — v6 dropped Babel support for an Oxc/Rolldown-based
React Refresh transform and requires Vite 8, which WXT (pinned to Vite 5/6)
doesn't support yet. Don't bump `@vitejs/plugin-react` past `^5.2.0` or `vite`
past `^6.x` until WXT itself upgrades.

**Known gap:** `babel-plugin-react-compiler@1.0.0` (current `latest`) cannot
lower *any* `finally` clause — with or without a `catch`, sync or async,
empty or not. This is a confirmed, intentional bailout (try/catch/finally
breaks the compiler's static control-flow analysis), tracked upstream at
[facebook/react#34131](https://github.com/facebook/react/issues/34131); the
silent (no build error) nature of it is its own tracked issue,
[facebook/react#35644](https://github.com/facebook/react/issues/35644). It
bails on the *whole enclosing hook/component*, leaving every value that hook
returns unmemoized, with no build error. Several of this app's hooks use
`try/finally` for async cleanup (e.g. `setIsLoading`), so don't assume
memoization happened — if a returned function/value is read by another
hook's `useEffect` deps array, verify its identity is actually stable (test
with `renderHook` + `rerender()` + `toBe`) before relying on the compiler;
wrap in `useCallback`/`useMemo` explicitly if the hook contains a `finally`.
This caused a real infinite-reload hang once (`useDiagramLibrary`'s
`refresh`/`onStatusChange`/`onFilesChange` feeding `useActiveDiagram`'s
`loadInitial` effect deps) — re-check this section once upstream fixes
#34131.

## Google OAuth (needed from Plan 2 on)
- Create a Google Cloud project, enable the Drive API.
- Load the extension unpacked once (`npm run build`, load
  `.output/chrome-mv3` at `chrome://extensions`) to get its extension ID —
  shown on the extension's card.
- Create an OAuth client ID of type "Chrome extension" bound to that
  extension ID.
- Add the client id to `wxt.config.ts` manifest `oauth2` with scope
  `https://www.googleapis.com/auth/drive.file`.
- Set `WXT_OAUTH_CLIENT_ID` (the OAuth client id) in a local `.env` file at
  the repo root — `.env` is gitignored and never committed (`.env.example`
  documents both vars). `wxt.config.ts` reads `import.meta.env.WXT_OAUTH_CLIENT_ID`
  at build time with a placeholder fallback so the project still builds
  without it. No other Google API or key is needed — folder selection no
  longer uses the Picker (see `docs/security.md` → "Folder selection:
  app-owned folder").
- `WXT_PUBLIC_KEY` is required — it's the manifest's `key`, which pins a
  deterministic extension ID. Ask a maintainer for the project's key, or set
  your own for a fork or a different extension identity. The key used to
  ship as a hardcoded fallback in `wxt.config.ts`; it now lives only in
  `.env` (gitignored) so it isn't checked into source.

## Manual E2E checklist

Requires `WXT_OAUTH_CLIENT_ID` set in a local `.env` (see "Google OAuth"
above). Pending the user's run on a real Google Cloud OAuth client —
automated agents cannot execute this checklist (no real Google account or
OAuth client available in this environment).

- [ ] `npm run build`, load `.output/chrome-mv3` as an unpacked extension.
- [ ] Open the popup → enter a folder name → click "Connect Google Drive" →
      complete Google sign-in → the app creates/reuses that folder → popup
      shows the folder name.
- [ ] Reopen the popup → still shows connected state (status persisted via
      `chrome.storage.local`).
- [ ] Add a `.excalidraw` file to the connected Drive folder → confirm
      `drive/list` returns it (check via the background service worker
      console; the panel UI for this lands in Plan 3).
- [ ] Click "Sign out" → popup returns to the disconnected / connect state.

### Scene bridge manual verification (Plan 3)

The localStorage transform is unit-tested; the IndexedDB binary store is not
(it requires Excalidraw's real `files-db`). Verify it by hand once:

1. `npm run build`, load unpacked `.output/chrome-mv3`, open https://excalidraw.com.
2. Draw a shape and paste/insert an image (creates a `files-db` entry).
3. In the page DevTools console, confirm the store exists:
   Application → IndexedDB → `files-db` → `files-store` has the image entry.
4. From the **extension** background service worker console, exercise the gateway
   round-trip once a folder is connected (Plan 2): `drive/create` a file from the
   current scene, then `drive/get` it back and confirm `elements` + `files` match.
   (A UI for this lands in Plan 4; for now drive it via `chrome.runtime.sendMessage`.)
5. Confirm `writeScene` reloads the tab and the shape + image reappear.

Record pass/fail here when run against a real Drive folder.

### Panel / autosave / sign-out manual E2E (Plan 4)

Requires `WXT_OAUTH_CLIENT_ID` in `.env`. Pending user run.

- [ ] Connect a folder via the popup (Plan 2), then open https://excalidraw.com.
- [ ] The panel appears top-right and lists the folder's `.excalidraw` files.
- [ ] Click a file → replace dialog/confirm → canvas reloads showing that diagram
      (including embedded images).
- [ ] "New diagram" → name it → blank canvas loads, file appears in Drive.
- [ ] Edit the canvas → after ~2.5s idle the badge shows Saving… then Saved; the
      Drive file's revision advances.
- [ ] Edit the same file in another tab/device, then edit locally → badge shows
      "Conflict — not saved"; no silent overwrite.
- [ ] Rename a file inline → list + Drive reflect the new name.
- [ ] "Sign out" → confirm → current diagram saves, canvas clears, panel shows the
      disconnected message; token revoked.
- [ ] Revoke the token externally (or let it expire) → next action shows the
      session as disconnected WITHOUT clearing the local canvas.
- [ ] Toggle Excalidraw's dark mode → the panel follows within ~1s.

## Skills not yet installed

The following skills referenced by the project spec could not be installed
automatically and should be added manually when available:

- `biome` — from tenequm/skills (https://github.com/tenequm/skills). As of
  this writing, the tenequm/skills repo has no standalone `biome` skill folder;
  Biome guidance is currently folded into that repo's `typescript-dev` skill
  (`skills/typescript-dev/references/biome.md`). Install the dedicated `biome`
  skill here once/if it is published as its own skill folder.
