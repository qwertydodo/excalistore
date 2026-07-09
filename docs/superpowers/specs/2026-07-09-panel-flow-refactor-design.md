# Panel Flow Refactor — Design

Date: 2026-07-09 (revised same day after review: centralized unauthorized handling,
top-level readiness gates, session-aware `loadInitial`)
Scope: `entrypoints/content/` only (content-script panel flow). No background, protocol,
entity, or shared-UI changes.

## Context

`entrypoints/content/model/useActiveDiagram.ts` has grown to 211 lines and hosts three
unrelated effects (initial load + pointer reconciliation, autosave loop, auto-create
watcher) plus a module-level store helper (`handleRemoteDeletion`). Around it:

1. **"Save the current scene to Drive"** (readScene → `DRIVE_UPDATE` with
   `getState().revision` → update revision) exists three times: `activeDiagramStore.onOpen`
   (pre-switch save), the autosave effect's `save()` callback, and
   `useSignOutFlow.doSignOut` (best-effort flush).
2. **"Update the file list and its cache"** (`onFilesChange(next); setCachedFiles(next)`)
   exists five times: `onAutoCreate`, `onRename`, `onDelete`, `handleRemoteDeletion`, and
   inside `refresh`.
3. **"401 → mark disconnected"** is threaded as an `onUnauthorized` callback through every
   caller of `refresh` (a workaround for the "stores never import authStore" convention).
4. **Connection/readiness guards** (`isConnected`, `isInitialLoadComplete`) are re-checked
   inside every effect instead of once at the top level.

Goal: store-centric orchestration (thin hooks, fat testable stores), one middleware-style
unauthorized handler, webapp-style top-level readiness gates in `App`, and the oversized
hook split into focused files. Small behavior shifts are acceptable where they simplify
the logic (explicitly agreed; listed below).

## Centralized unauthorized handling

New file `entrypoints/content/api/driveRequest.ts` (+ barrel `index.ts`):

```ts
export const sendDriveRequest = async <T>(request: Request): Promise<T> => {
  try {
    return await sendToBackground<T>(request);
  } catch (e) {
    if (e instanceof RequestError && e.code === ERROR_CODE.UNAUTHORIZED) {
      useAuthStore.getState().markDisconnected();
    }
    throw e;
  }
};
```

- The middleware analog of a web app's 401 interceptor. It is not a store, so importing
  `useAuthStore` does not break the "stores never import authStore" convention — it
  *removes the reason the convention forced callback threading*.
- Every content-script Drive call goes through it: `diagramLibraryStore.refresh`,
  all `activeDiagramStore` actions, the autosave/auto-create save callbacks, and
  `useSignOutFlow`'s flush. `authStore` itself keeps raw `sendToBackground` (its calls
  *are* the auth flow; also avoids an import cycle).
- `refresh(onUnauthorized?)` loses its parameter. Bonus: an autosave 401 now also marks
  the panel disconnected (today it only shows a generic "Save failed").

## Session-aware `loadInitial` and top-level gates

### sessionStore renames (mechanical)

- `hasValidatedFileListThisSession()` → `isFirstSessionLoad()` (inverted meaning:
  `true` when the flag is absent)
- `markFileListValidatedThisSession()` → `markSessionLoaded()`
- `clearFileListValidatedThisSession()` → `clearSessionLoaded()`

Still sessionStorage-backed (a plain variable cannot work: it must survive the
writeScene-triggered same-tab reload but not a new tab/browser session). `doSignOut`
keeps calling `clearSessionLoaded()` — sessionStorage survives the sign-out reload, and
without the clear a same-tab reconnect would wrongly trust the previous session's cache.

### `diagramLibraryStore`

- **`setFiles(files)`** — sets `files` in state AND writes `setCachedFiles(files)`; the
  single write path for the list. `onFilesChange` is deleted.
- **`refresh()`** becomes dumb: fetch `DRIVE_LIST` via `sendDriveRequest`, `setFiles`,
  return the list — and **throws** on failure instead of swallowing to `[]`.
  All session-awareness (spinner decision, `markSessionLoaded`) moves out.
  **`isFilesLoading` is deleted** — the panel never renders without data anymore.
- `isQueryLoaded` → **`isQueryReady`** (gate-naming sync).

### `activeDiagramStore`

New fields/actions:

- **`isListReady: boolean`** — the panel may mount: the list state is populated (from
  cache on a navigation reload, from Drive on a fresh session).
- **`isReconciled: boolean`** — "do we *know yet* whether a diagram is active?" True only
  after the Drive refresh + stale-pointer reconcile finished. Gates the watchers: without
  it, drawing during startup (pointer restore still in flight) would auto-create a
  duplicate "Untitled" alongside the diagram about to become active. The panel does NOT
  wait for it.
- **`isLoadInFlight: boolean`** — internal re-entrancy guard so concurrent `loadInitial`
  calls (React strict-mode double effects) collapse to one.
- **`loadInitial(): Promise<void>`** — no parameters (runs only when connected; 401s are
  the wrapper's job). Branches on `isFirstSessionLoad()`:
  - **Fresh session:** skip the cache entirely (it may be stale — Drive is the source of
    truth). `await refresh()`, `markSessionLoaded()`, adopt-or-drop the persisted pointer
    against the fresh list, then set `isListReady` and `isReconciled` together.
  - **Navigation reload** (same-tab reload from open/create/delete-of-active/sign-out —
    note rename does *not* reload): paint cache + adopt pointer + set `isListReady`
    immediately (fast, no network); then background `await refresh()`, adopt-or-drop
    against the fresh list, set `isReconciled`.
  - On `refresh()` failure: keep whatever is painted and the pointer, and still flip the
    readiness flags (except `markSessionLoaded`, which only ever records a *successful*
    first fetch). This fixes a latent bug: today a transient network error during init
    returns `[]` and silently **drops the active pointer** as "stale".
- **`saveActiveScene(id: string): Promise<void>`** — the single implementation of "write
  what's on the canvas to Drive file `id`": `readScene(bridge)` → `DRIVE_UPDATE` with
  `get().revision` as the conflict guard → set the new revision → `setActiveFile` with
  refreshed metadata. The id is an explicit parameter (not `get().activeId`) so a caller
  holding an id (autosave's effect closure, sign-out's selector) can never race a
  concurrent pointer change. Throws on failure; callers keep their own error policy
  (`onOpen` aborts the switch, autosave lets `createAutosave` classify, sign-out
  swallows).
- **`onRemoteDeleted(deletedId)`** — `handleRemoteDeletion` moves in as a store action.

### `panelVisibilityStore`

- `isInitialized` → **`isPanelReady`** (gate-naming sync).

### `App` composition (the one guard, webapp-router style)

```tsx
if (!isStatusLoaded) return null;
if (!status.isConnected) return <ConnectButton />;
if (!isPanelReady || !isQueryReady || !isListReady) return null; // fresh session only; reload is instant
return (
  <>
    <DiagramPanel onSignOut={signOut.openSignOut} />
    {isReconciled && <DiagramWatchers />}
    {signOut.isSignOutOpen && <ConfirmDialog … />}
  </>
);
```

- The gate returns `null` like the existing `isStatusLoaded` gate (a visible skeleton is
  already a separate backlog item in `docs/features.md`).
- `DiagramPanel` loses its `isFilesLoading` spinner branch entirely.
- `DiagramWatchers` (`entrypoints/content/ui/DiagramWatchers/`) is a renderless component
  that just calls `useAutosave()` + `useAutoCreate()`. Mount/unmount IS the guard:
  disconnect (sign-out or 401 via the wrapper) unmounts it and the effects clean up.

## Hook layer

`useActiveDiagram.ts` is **deleted**. Replacements in `entrypoints/content/model/`:

- **`useInitialDiagramLoad.ts`** — called by `useAppInit` (outside the gate, or the gate
  would deadlock): one effect on `isConnected`; when it flips true, call
  `useActiveDiagramStore.getState().loadInitial()`. Re-fires on a reconnect after an
  involuntary logout (no reload happened, so this is what refreshes the list);
  `isLoadInFlight` collapses strict-mode double-runs.
- **`useAutosave.ts`** — effect keyed on `activeId` only: wire `createAutosave`
  (`getHash` via `currentSceneHash`, `save: () => saveActiveScene(activeId)`, `onStatus`
  → `onSaveStatusChange` + `onRemoteDeleted` on DELETED). Baseline-hash-then-start and
  flush-on-cleanup stay exactly as today. No connection guards — mounting is the guard.
- **`useAutoCreate.ts`** — effect keyed on `activeId` with a single `if (activeId) return`
  guard: `createAutosave` seeded with `EMPTY_SCENE_HASH` (constant moves here), `save` =
  `refresh()` (fresh list → collision-safe naming; a throw aborts this tick and the
  controller retries) → `nextUntitledName` → `onAutoCreate`. Stop-without-flush cleanup
  stays. No connection/reconcile guards — `DiagramWatchers`' mount condition is the guard.

`useConnectDrive` simplifies to `connect` + `show()`: the list load is no longer its job —
`useInitialDiagramLoad` reacts to the `isConnected` flip.

**Dependency-array policy:** store actions are read via `useXStore.getState()` inside
effect bodies (zustand actions are created once, stable identity; `getState()` always
returns the current snapshot — verified against zustand docs, and the codebase already
uses the pattern). Reactive selectors remain only for values that must re-run the effect.

## Accepted behavior shifts

1. Fresh-session first paint no longer shows the panel frame + spinner; `App` renders
   `null` until the first real Drive list arrives (per review: first load should come
   from the backend, cache is only for navigation reloads).
2. `onOpen`'s pre-switch save now also persists the refreshed revision/name via
   `setActiveFile` before the new file's pointer overwrites it — strictly more correct.
3. A 401 anywhere (including autosave) now marks the panel disconnected via the wrapper.
4. A transient network error during init no longer drops the active pointer (bug fix, see
   `loadInitial`).
5. If the fresh-session `refresh()` fails, `isReconciled` still flips true, so a user
   drawing while offline with an unresolvable pointer could auto-create a duplicate once
   the network returns — accepted as an edge-of-edge (offline fresh session + immediate
   drawing + a pre-existing pointer).
6. Effect dependency arrays shrink to true reactive triggers only.

Everything else — `EMPTY_SCENE_HASH` seeding, flush-vs-stop cleanup asymmetry,
conflict/404 handling — is preserved.

## Testing

- Wrapper: unit tests (401 → `markDisconnected` + rethrow; success passes through;
  non-401 errors don't touch the auth store).
- Store actions (`loadInitial` both branches + failure paths, `saveActiveScene`,
  `onRemoteDeleted`, `setFiles`): plain async tests in the store test files — no
  `renderHook`.
- Hooks (`useInitialDiagramLoad`, `useAutosave`, `useAutoCreate`): `renderHook` wiring
  tests, reusing the scaffolding from the old `useActiveDiagram.test.ts` (its cases are
  redistributed, not dropped).
- `App.test.tsx` updated for the new gates; `DiagramPanel.test.tsx` loses spinner cases.
- Reuse `src/shared/lib/testUtils.ts` and `entrypoints/content/lib/testUtils.ts` fakes.
- Full suite, `tsc --noEmit`, Biome, steiger, knip must stay green.

## Documentation

- Update `docs/architecture.md`: store-centric model layer, the `sendDriveRequest`
  middleware, and the App-level readiness gates.
