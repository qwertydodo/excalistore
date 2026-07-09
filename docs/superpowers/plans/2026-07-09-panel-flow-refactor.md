# Panel Flow Refactor Implementation Plan (revised)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Store-centric panel flow: one 401 middleware (`sendDriveRequest`), orchestration in store actions (`loadInitial`/`saveActiveScene`/`onRemoteDeleted`/`setFiles`), webapp-style readiness gates in `App`, and `useActiveDiagram` (211 lines) split into three guard-free lifecycle hooks.

**Architecture:** Per spec `docs/superpowers/specs/2026-07-09-panel-flow-refactor-design.md` (revised version). Key decisions: `sendDriveRequest` wrapper centralizes unauthorized handling; `loadInitial()` branches on `isFirstSessionLoad()` (fresh session waits for Drive, navigation reload paints cache instantly); `App` gates the panel on `isPanelReady && isQueryReady && isListReady` and the watchers on `isReconciled`; hooks carry no connection guards — mount/unmount is the guard.

**Tech Stack:** WXT + React 19 + TypeScript (strict), zustand, Vitest (+ @testing-library/react), Biome, steiger, knip.

## Global Constraints

- **Never commit without the user's explicit go-ahead** — show a diff/summary first and wait (user rule). Every "Commit" step below is conditional on that approval.
- Branch in place (never a worktree): `refactor/panel-flow-store-centric` off `main`.
- Conventional Commits, enforced by commitlint.
- Stores never import `authStore`. The `sendDriveRequest` wrapper (an `api/` segment module, not a store) may and does. `authStore` itself keeps raw `sendToBackground` (its calls are the auth flow; also avoids an import cycle).
- Zustand actions are stable; inside effect bodies read actions via `useXStore.getState()`; dependency arrays list only true reactive triggers.
- Booleans start with `is`/`has`/`should`. Prefer `type` over `interface`. Tests colocated. Reuse `src/shared/lib/testUtils.ts` (`stubChromeStorageLocal`) and `entrypoints/content/lib/testUtils.ts` (`createFakeSceneBridgeDeps`); never hand-roll new fakes.
- Preserve: `EMPTY_SCENE_HASH` baseline seeding, autosave flush-on-cleanup vs auto-create stop-only cleanup, conflict/404 classification in `autosaveController`.
- Run `npm test` after every implementation step; the suite must be green at every commit.

---

### Task 0: Branch

- [ ] **Step 1: Create the working branch**

```bash
git switch main && git pull && git switch -c refactor/panel-flow-store-centric
```

---

### Task 1: `sendDriveRequest` — the 401 middleware

**Files:**
- Create: `entrypoints/content/api/driveRequest.ts`
- Create: `entrypoints/content/api/index.ts`
- Create: `entrypoints/content/api/driveRequest.test.ts`
- Modify (migrate callers): `entrypoints/content/model/stores/diagramLibraryStore.ts`, `entrypoints/content/model/stores/activeDiagramStore.ts`, `entrypoints/content/model/useActiveDiagram.ts`, `entrypoints/content/model/useSignOutFlow.ts`, `entrypoints/content/model/useConnectDrive.ts`

**Interfaces:**
- Produces: `sendDriveRequest<T>(request: Request): Promise<T>` — delegates to `sendToBackground`, and on `RequestError` with `ERROR_CODE.UNAUTHORIZED` calls `useAuthStore.getState().markDisconnected()` before rethrowing. All errors rethrow.
- `diagramLibraryStore.refresh` loses its `onUnauthorized` parameter: `refresh: () => Promise<DriveFile[]>` (error swallowing unchanged in this task — the throw change comes in Task 6).

- [ ] **Step 1: Write the failing tests**

`entrypoints/content/api/driveRequest.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ERROR_CODE, RequestError, sendToBackground } from "@/features/driveGateway";

vi.mock("@/features/driveGateway", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/driveGateway")>()),
  sendToBackground: vi.fn(),
}));

const { sendDriveRequest } = await import("./driveRequest");
const { useAuthStore } = await import("../model/stores/authStore");

const INITIAL_AUTH_STATE = useAuthStore.getState();

beforeEach(() => {
  useAuthStore.setState(INITIAL_AUTH_STATE, true);
  vi.mocked(sendToBackground).mockReset();
});

describe("sendDriveRequest", () => {
  it("passes the request through and returns the response", async () => {
    vi.mocked(sendToBackground).mockResolvedValue([{ id: "1" }]);

    await expect(sendDriveRequest({ type: "drive/list" })).resolves.toEqual([{ id: "1" }]);
    expect(sendToBackground).toHaveBeenCalledWith({ type: "drive/list" });
  });

  it("marks the auth store disconnected on an unauthorized error, then rethrows", async () => {
    useAuthStore.setState({ status: { isConnected: true }, isStatusLoaded: true });
    vi.mocked(sendToBackground).mockRejectedValue(
      new RequestError(ERROR_CODE.UNAUTHORIZED, "insufficient scopes"),
    );

    await expect(sendDriveRequest({ type: "drive/list" })).rejects.toThrow(
      "insufficient scopes",
    );
    expect(useAuthStore.getState().status.isConnected).toBe(false);
  });

  it("leaves the auth store untouched on non-auth errors", async () => {
    useAuthStore.setState({ status: { isConnected: true }, isStatusLoaded: true });
    vi.mocked(sendToBackground).mockRejectedValue(new Error("network down"));

    await expect(sendDriveRequest({ type: "drive/list" })).rejects.toThrow("network down");
    expect(useAuthStore.getState().status.isConnected).toBe(true);
  });
});
```

Check `RequestError`'s constructor signature in `src/features/driveGateway/api/sendMessage.ts` before writing (order of code/message args) and adjust the test to match. Check that the `Request` type is exported from the `@/features/driveGateway` barrel; if not, export it there.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run entrypoints/content/api/driveRequest.test.ts`
Expected: FAIL — cannot resolve `./driveRequest`.

- [ ] **Step 3: Implement**

`entrypoints/content/api/driveRequest.ts`:

```ts
import {
  ERROR_CODE,
  type Request,
  RequestError,
  sendToBackground,
} from "@/features/driveGateway";
import { useAuthStore } from "../model/stores/authStore";

// The content script's 401 middleware — the analog of a web app's auth
// interceptor. Every Drive call goes through here so "token no longer valid"
// flips the panel to disconnected in exactly one place, instead of each
// caller threading an onUnauthorized callback. Not a store, so importing
// authStore here doesn't breach the stores-never-import-authStore rule.
// authStore's own calls stay on raw sendToBackground (they ARE the auth flow).
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

`entrypoints/content/api/index.ts`:

```ts
export { sendDriveRequest } from "./driveRequest";
```

- [ ] **Step 4: Migrate every content-script Drive call**

Search: `rg -n "sendToBackground" entrypoints/content` — replace each call with `sendDriveRequest` (import from `../api` / `../../api` as depth requires), EXCEPT `model/stores/authStore.ts` (keeps raw `sendToBackground`).

Then remove the callback threading:
- `diagramLibraryStore.ts`: `refresh: async (onUnauthorized) =>` → `refresh: async () =>`; delete the `catch` branch's `if (e instanceof RequestError … ) onUnauthorized?.();` lines (keep `return []` for now); update the `DiagramLibraryStore` type; drop now-unused `ERROR_CODE`/`RequestError` imports.
- `useActiveDiagram.ts`: both `refresh(markDisconnected)` calls → `refresh()`; drop `markDisconnected` from the `useAuthStore` selector and from both effects' dep arrays.
- `useConnectDrive.ts`: `refresh(markDisconnected)` → `refresh()`; drop `markDisconnected` from its selector.
- Update tests that pass/assert `onUnauthorized` (check `diagramLibraryStore.test.ts`, `useConnectDrive.test.ts`, `useActiveDiagram.test.ts`).

Note: existing tests mock `@/features/driveGateway`'s `sendToBackground` — the wrapper calls straight through it, so those mocks keep working unchanged.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit (after user approval)**

```bash
git add -A && git commit -m "refactor(content): centralize 401 handling in sendDriveRequest"
```

---

### Task 2: `diagramLibraryStore.setFiles` replaces `onFilesChange` + `setCachedFiles` pairs

**Files:**
- Modify: `entrypoints/content/model/stores/diagramLibraryStore.ts`
- Modify: `entrypoints/content/model/stores/activeDiagramStore.ts` (3 call sites)
- Modify: `entrypoints/content/model/useActiveDiagram.ts` (2 call sites)
- Test: `entrypoints/content/model/stores/diagramLibraryStore.test.ts`

**Interfaces:**
- Produces: `setFiles: (files: DriveFile[]) => void` — sets `files` in state AND fire-and-forget writes `setCachedFiles(files)`. `onFilesChange` is deleted.

- [ ] **Step 1: Write the failing test**

Add to `diagramLibraryStore.test.ts` (match its existing scaffolding; import `getCachedFiles` from `./sessionStore` if missing):

```ts
describe("setFiles", () => {
  it("sets the in-memory list and writes the fast-paint cache in one action", async () => {
    const files = [{ id: "1", name: "a.excalidraw", modifiedTime: "t", headRevisionId: "r1" }];

    useDiagramLibraryStore.getState().setFiles(files);

    expect(useDiagramLibraryStore.getState().files).toEqual(files);
    await expect(getCachedFiles()).resolves.toEqual(files);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run entrypoints/content/model/stores/diagramLibraryStore.test.ts`
Expected: FAIL — `setFiles is not a function`.

- [ ] **Step 3: Implement `setFiles`, delete `onFilesChange`**

In `diagramLibraryStore.ts` replace the `onFilesChange` type field + implementation with:

```ts
  // The one write path for the file list: state and the fast-paint cache
  // (chrome.storage.local) always move together, so no caller can update one
  // and forget the other.
  setFiles: (files) => {
    set({ files });
    setCachedFiles(files);
  },
```

Inside `refresh`, replace `set({ files: list }); setCachedFiles(list);` with `get().setFiles(list);` (change the `create` callback signature to `(set, get)`).

- [ ] **Step 4: Migrate all callers**

Search: `rg -n "onFilesChange" entrypoints src` — replace each `onFilesChange(next); setCachedFiles(next);` pair with a single `setFiles(next)` (destructure `setFiles` instead of `onFilesChange` from `getState()`): `activeDiagramStore.onAutoCreate`, `.onRename`, `.onDelete`, `useActiveDiagram.handleRemoteDeletion`. In `useActiveDiagram`'s initial-load effect the cache-paint line becomes `if (cached.length) useDiagramLibraryStore.getState().setFiles(cached);` and `onFilesChange` leaves the hook's selector + dep array. Remove `setCachedFiles` imports where the pair was the only use. Update any tests referencing `onFilesChange`.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit (after user approval)**

```bash
git add -A && git commit -m "refactor(content): merge file-list state+cache writes into setFiles"
```

---

### Task 3: `activeDiagramStore.saveActiveScene`

**Files:**
- Modify: `entrypoints/content/model/stores/activeDiagramStore.ts`
- Modify: `entrypoints/content/model/useSignOutFlow.ts`
- Modify: `entrypoints/content/model/useActiveDiagram.ts` (autosave `save` callback)
- Test: `entrypoints/content/model/stores/activeDiagramStore.test.ts`

**Interfaces:**
- Produces: `saveActiveScene: (id: string) => Promise<void>` — `readScene(bridge)` → `DRIVE_UPDATE` for `id` with `get().revision ?? ""` → set new revision → `setActiveFile` with refreshed metadata. Throws on failure. Explicit id parameter (never `get().activeId`) so callers holding an id can't race a concurrent pointer change.

- [ ] **Step 1: Write the failing tests**

Add to `activeDiagramStore.test.ts`:

```ts
describe("saveActiveScene", () => {
  it("saves the scene with the stored revision as conflict guard, then records the new revision and pointer", async () => {
    useActiveDiagramStore.setState({ activeId: "1", revision: "r1" });
    vi.mocked(sendToBackground).mockImplementation(async (request) => {
      if (request.type === REQUEST_TYPE.DRIVE_UPDATE) {
        expect(request.id).toBe("1");
        expect(request.prevRevision).toBe("r1");
        return { ...meta, id: "1", headRevisionId: "r2" };
      }
      throw new Error(`unexpected request ${request.type}`);
    });

    await useActiveDiagramStore.getState().saveActiveScene("1");

    expect(useActiveDiagramStore.getState().revision).toBe("r2");
    await expect(getActiveFile()).resolves.toEqual({
      id: "1",
      name: "beta.excalidraw",
      loadedRevision: "r2",
    });
  });

  it("propagates a failed save to the caller and leaves the revision untouched", async () => {
    useActiveDiagramStore.setState({ activeId: "1", revision: "r1" });
    vi.mocked(sendToBackground).mockRejectedValue(new Error("conflict"));

    await expect(useActiveDiagramStore.getState().saveActiveScene("1")).rejects.toThrow(
      "conflict",
    );
    expect(useActiveDiagramStore.getState().revision).toBe("r1");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run entrypoints/content/model/stores/activeDiagramStore.test.ts`
Expected: FAIL — `saveActiveScene is not a function`.

- [ ] **Step 3: Implement and refactor `onOpen`**

Add to the type: `saveActiveScene: (id: string) => Promise<void>;` and to the store:

```ts
  // The one implementation of "write what's on the canvas to Drive file `id`
  // with the stored revision as the conflict guard" — used by onOpen's
  // pre-switch flush, the autosave loop, and sign-out's best-effort flush.
  // Throws on failure so each caller keeps its own error policy.
  saveActiveScene: async (id) => {
    const scene = await readScene(bridge);
    const meta = await sendDriveRequest<DriveFile>({
      type: REQUEST_TYPE.DRIVE_UPDATE,
      id,
      content: JSON.stringify(scene),
      prevRevision: get().revision ?? "",
    });
    set({ revision: meta.headRevisionId });
    await setActiveFile({ id: meta.id, name: meta.name, loadedRevision: meta.headRevisionId });
  },
```

In `onOpen`, replace the inline pre-switch save block with `if (activeId) await get().saveActiveScene(activeId);` (keep the explanatory comment).

- [ ] **Step 4: Migrate `useSignOutFlow` and the autosave callback**

`useSignOutFlow.ts`: replace the flush block inside `if (activeId) { try { … } catch {} }` with `await useActiveDiagramStore.getState().saveActiveScene(activeId);` (keep the try/catch wrapper + its comment). Drop now-unused imports and the stale getState-revision comment.

`useActiveDiagram.ts`: the autosave effect's `save` callback becomes `save: () => useActiveDiagramStore.getState().saveActiveScene(activeId),`. Then `rg -n "onRevisionChange"` — if the hook was its only consumer, delete `onRevisionChange` from the store type + object and from the hook's selector/deps.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit (after user approval)**

```bash
git add -A && git commit -m "refactor(content): extract saveActiveScene store action"
```

---

### Task 4: `onRemoteDeleted` moves into the store

**Files:**
- Modify: `entrypoints/content/model/stores/activeDiagramStore.ts`
- Modify: `entrypoints/content/model/useActiveDiagram.ts` (delete `handleRemoteDeletion`)
- Test: `entrypoints/content/model/stores/activeDiagramStore.test.ts` (test moves here from `useActiveDiagram.test.ts`)

**Interfaces:**
- Produces: `onRemoteDeleted: (deletedId: string) => Promise<void>`.

- [ ] **Step 1: Move the test**

Delete `describe("handleRemoteDeletion", …)` from `useActiveDiagram.test.ts`; add to `activeDiagramStore.test.ts`:

```ts
describe("onRemoteDeleted", () => {
  it("clears the active pointer and drops the deleted row from the library list", async () => {
    const survivor = { id: "2", name: "b.excalidraw", modifiedTime: "t", headRevisionId: "r2" };
    const deleted = { id: "1", name: "a.excalidraw", modifiedTime: "t", headRevisionId: "r1" };
    useDiagramLibraryStore.setState({ files: [deleted, survivor] });
    useActiveDiagramStore.setState({ activeId: "1", revision: "r1" });

    await useActiveDiagramStore.getState().onRemoteDeleted("1");

    expect(useActiveDiagramStore.getState().activeId).toBeNull();
    expect(useActiveDiagramStore.getState().revision).toBeNull();
    expect(useDiagramLibraryStore.getState().files).toEqual([survivor]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run entrypoints/content/model/stores/activeDiagramStore.test.ts`
Expected: FAIL — `onRemoteDeleted is not a function`.

- [ ] **Step 3: Implement, delete the standalone function**

Add to the type + store (move the existing comment along):

```ts
  // The active file was confirmed gone from Drive (autosave got a 404) — drop
  // the local pointer and the stale row so the panel stops highlighting/
  // re-attempting saves against a diagram that no longer exists.
  onRemoteDeleted: async (deletedId) => {
    await clearActiveFile();
    set({ activeId: null, revision: null });
    const { files, setFiles } = useDiagramLibraryStore.getState();
    setFiles(files.filter((f) => f.id !== deletedId));
  },
```

In `useActiveDiagram.ts`: delete `handleRemoteDeletion` (+ orphaned imports); the autosave `onStatus` line becomes `if (status === SAVE_STATUS.DELETED) useActiveDiagramStore.getState().onRemoteDeleted(activeId);`.

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit (after user approval)**

```bash
git add -A && git commit -m "refactor(content): move remote-deletion handling into activeDiagramStore"
```

---

### Task 5: sessionStore renames

**Files:**
- Modify: `entrypoints/content/model/stores/sessionStore.ts`
- Modify: all consumers (`diagramLibraryStore.ts`, `useSignOutFlow.ts`, tests)

**Interfaces:**
- Produces: `isFirstSessionLoad(): boolean` (⚠ inverted: returns `true` when the old flag is ABSENT — i.e. `sessionStorage.getItem(…) !== "true"`), `markSessionLoaded(): void`, `clearSessionLoaded(): void`. Same sessionStorage key, same comments (a plain variable can't replace this: it must survive the same-tab writeScene reload but die with the tab).

- [ ] **Step 1: Rename + invert**

In `sessionStore.ts`:

```ts
// Whether this tab session has already loaded a real file list from Drive.
// Backed by window.sessionStorage (not chrome.storage.local): the answer must
// survive a same-tab writeScene→reload (open/create/delete-of-active) so
// those reloads can trust the fast-paint cache, but must NOT survive a fresh
// tab/browser session — a brand new session may be looking at a cache gone
// stale from Drive changes made elsewhere, so it must wait for a real list.
export const isFirstSessionLoad = (): boolean => {
  try {
    return sessionStorage.getItem(FILE_LIST_VALIDATED_KEY) !== "true";
  } catch {
    return true;
  }
};

export const markSessionLoaded = (): void => { /* body of markFileListValidatedThisSession, unchanged */ };

// Sign-out reloads the same tab, which sessionStorage survives — without
// this, a same-tab reconnect would wrongly skip the real load using a flag
// left over from the previous (now signed-out) session's Drive folder.
export const clearSessionLoaded = (): void => { /* body of clearFileListValidatedThisSession, unchanged */ };
```

Update consumers: `diagramLibraryStore.refresh`'s `if (!hasValidatedFileListThisSession()) set({ isFilesLoading: true });` → `if (isFirstSessionLoad()) set({ isFilesLoading: true });` and `markFileListValidatedThisSession()` → `markSessionLoaded()`; `useSignOutFlow`'s `clearFileListValidatedThisSession()` → `clearSessionLoaded()`. Update `sessionStore.test.ts` names/assertions (behavior identical modulo inversion).

- [ ] **Step 2: Run the full suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 3: Commit (after user approval)**

```bash
git add -A && git commit -m "refactor(content): rename session-validation flag helpers"
```

---

### Task 6: Session-aware `loadInitial` + top-level readiness gates

The big one: `loadInitial`/`isListReady`/`isReconciled` in the store, dumb throwing `refresh`, `isFilesLoading` deleted, gate renames, `App` gates. `useActiveDiagram.ts` is interim-updated (deleted next task) to keep the suite green.

**Files:**
- Modify: `entrypoints/content/model/stores/activeDiagramStore.ts`
- Modify: `entrypoints/content/model/stores/diagramLibraryStore.ts`
- Modify: `entrypoints/content/model/stores/panelVisibilityStore.ts`
- Modify: `entrypoints/content/model/useActiveDiagram.ts`, `entrypoints/content/model/useAppInit.ts`, `entrypoints/content/App.tsx`, `entrypoints/content/ui/DiagramPanel/DiagramPanel.tsx`
- Tests: `activeDiagramStore.test.ts`, `diagramLibraryStore.test.ts`, `panelVisibilityStore.test.ts`, `App.test.tsx`, `DiagramPanel.test.tsx`, `useActiveDiagram.test.ts`

**Interfaces (produces):**
- `activeDiagramStore`: `isListReady: boolean`, `isReconciled: boolean`, `isLoadInFlight: boolean` (all initial `false`), `loadInitial: () => Promise<void>`
- `diagramLibraryStore`: `refresh: () => Promise<DriveFile[]>` now THROWS on failure; `isFilesLoading` deleted; `isQueryLoaded` → `isQueryReady`
- `panelVisibilityStore`: `isInitialized` → `isPanelReady`
- `useAppInit` returns `{ isStatusLoaded, isPanelReady, isQueryReady, isListReady, isReconciled, status, signOut }`

- [ ] **Step 1: Write the failing store tests**

Add to `activeDiagramStore.test.ts`. Note: `isFirstSessionLoad` is real code over `sessionStorage` — jsdom provides it; control the branch via `markSessionLoaded()`/`clearSessionLoaded()` (import from `./sessionStore`) and reset in `beforeEach` with `clearSessionLoaded()`.

```ts
describe("loadInitial", () => {
  const active = { id: "1", name: "a.excalidraw", loadedRevision: "r1" };
  const activeRow = { id: "1", name: "a.excalidraw", modifiedTime: "t", headRevisionId: "r1" };

  it("fresh session: skips the cache, waits for Drive, then flips both flags together", async () => {
    await setActiveFile(active);
    await setCachedFiles([{ ...activeRow, id: "stale" }]); // must be ignored
    vi.mocked(sendToBackground).mockResolvedValue([activeRow]);

    await useActiveDiagramStore.getState().loadInitial();

    expect(useDiagramLibraryStore.getState().files).toEqual([activeRow]);
    expect(useActiveDiagramStore.getState().activeId).toBe("1");
    expect(useActiveDiagramStore.getState().isListReady).toBe(true);
    expect(useActiveDiagramStore.getState().isReconciled).toBe(true);
    expect(isFirstSessionLoad()).toBe(false); // marked loaded on success
  });

  it("navigation reload: paints the cache and flips isListReady before the network resolves", async () => {
    markSessionLoaded();
    await setActiveFile(active);
    await setCachedFiles([activeRow]);
    let resolveList: (v: unknown) => void = () => {};
    vi.mocked(sendToBackground).mockImplementation(
      () => new Promise((resolve) => (resolveList = resolve)),
    );

    const pending = useActiveDiagramStore.getState().loadInitial();
    await vi.waitFor(() => {
      expect(useActiveDiagramStore.getState().isListReady).toBe(true);
    });
    expect(useActiveDiagramStore.getState().activeId).toBe("1"); // adopted from cache
    expect(useActiveDiagramStore.getState().isReconciled).toBe(false); // network still pending

    resolveList([activeRow]);
    await pending;
    expect(useActiveDiagramStore.getState().isReconciled).toBe(true);
  });

  it("drops a pointer the refreshed list no longer contains", async () => {
    markSessionLoaded();
    await setActiveFile(active);
    await setCachedFiles([]);
    vi.mocked(sendToBackground).mockResolvedValue([]);

    await useActiveDiagramStore.getState().loadInitial();

    expect(useActiveDiagramStore.getState().activeId).toBeNull();
    await expect(getActiveFile()).resolves.toBeNull();
  });

  it("keeps the pointer and cache when the refresh fails (never drops on a network error)", async () => {
    markSessionLoaded();
    await setActiveFile(active);
    await setCachedFiles([activeRow]);
    vi.mocked(sendToBackground).mockRejectedValue(new Error("network down"));

    await useActiveDiagramStore.getState().loadInitial();

    expect(useActiveDiagramStore.getState().activeId).toBe("1");
    expect(useActiveDiagramStore.getState().isListReady).toBe(true);
    expect(useActiveDiagramStore.getState().isReconciled).toBe(true);
    expect(useDiagramLibraryStore.getState().files).toEqual([activeRow]);
  });

  it("fresh-session refresh failure does not mark the session loaded", async () => {
    vi.mocked(sendToBackground).mockRejectedValue(new Error("network down"));

    await useActiveDiagramStore.getState().loadInitial();

    expect(isFirstSessionLoad()).toBe(true);
    expect(useActiveDiagramStore.getState().isListReady).toBe(true);
  });

  it("collapses concurrent calls (strict-mode double effect)", async () => {
    vi.mocked(sendToBackground).mockResolvedValue([]);

    await Promise.all([
      useActiveDiagramStore.getState().loadInitial(),
      useActiveDiagramStore.getState().loadInitial(),
    ]);

    const listCalls = vi
      .mocked(sendToBackground)
      .mock.calls.filter(([r]) => r.type === "drive/list");
    expect(listCalls).toHaveLength(1);
  });
});
```

Also add to `diagramLibraryStore.test.ts`:

```ts
it("refresh throws on failure instead of swallowing to an empty list", async () => {
  useDiagramLibraryStore.setState({ files: [existingFile] });
  vi.mocked(sendToBackground).mockRejectedValue(new Error("network down"));

  await expect(useDiagramLibraryStore.getState().refresh()).rejects.toThrow("network down");
  expect(useDiagramLibraryStore.getState().files).toEqual([existingFile]); // untouched
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run entrypoints/content/model/stores/activeDiagramStore.test.ts entrypoints/content/model/stores/diagramLibraryStore.test.ts`
Expected: FAIL — `loadInitial is not a function`; refresh resolves `[]` instead of throwing.

- [ ] **Step 3: Implement the store side**

`diagramLibraryStore.ts` — `refresh` becomes dumb (delete `isFilesLoading` from type/state, delete the session check and try/catch; `markSessionLoaded` moves to `loadInitial`); rename `isQueryLoaded` → `isQueryReady`:

```ts
  // Dumb fetch: callers own spinners/failure policy. Throws on failure —
  // loadInitial catches (keeps cache + pointer), the auto-create watcher lets
  // the throw abort the tick so the controller retries.
  refresh: async () => {
    const list = await sendDriveRequest<DriveFile[]>({ type: REQUEST_TYPE.DRIVE_LIST });
    get().setFiles(list);
    return list;
  },
```

`activeDiagramStore.ts` — add `isListReady: false, isReconciled: false, isLoadInFlight: false,` and (imports: `getActiveFile`, `getCachedFiles`, `isFirstSessionLoad`, `markSessionLoaded` from `./sessionStore`; `ActiveFile` type from `@/entities/diagram`):

```ts
  // One-shot startup reconciliation, kicked off by useInitialDiagramLoad when
  // isConnected flips true (and again on a reconnect after an involuntary
  // logout — no reload happens there, so this is also what refreshes the
  // list). Fresh tab session: the cache may be stale, so wait for Drive and
  // flip both flags together. Navigation reload (open/create/delete-of-
  // active/sign-out reloads; rename does NOT reload): paint the cache and let
  // the panel mount immediately, then reconcile against Drive in the
  // background. A failed refresh keeps the painted state and the pointer —
  // a network error must never drop the active pointer as "stale".
  loadInitial: async () => {
    if (get().isLoadInFlight) return;
    set({ isLoadInFlight: true });
    try {
      const adoptAgainst = (active: ActiveFile, list: DriveFile[]): boolean => {
        if (!list.some((f) => f.id === active.id)) return false;
        set({ activeId: active.id, revision: active.loadedRevision });
        return true;
      };
      const dropPointer = async (): Promise<void> => {
        await clearActiveFile();
        set({ activeId: null, revision: null });
      };
      const active = await getActiveFile();
      const { refresh, setFiles } = useDiagramLibraryStore.getState();
      if (isFirstSessionLoad()) {
        try {
          const list = await refresh();
          markSessionLoaded();
          if (active && !adoptAgainst(active, list)) await dropPointer();
        } catch {
          // Offline first load: mount an empty panel; the session stays
          // "first load" so the next reload tries Drive again.
        }
        set({ isListReady: true, isReconciled: true });
      } else {
        const cached = await getCachedFiles();
        if (cached.length) setFiles(cached);
        if (active) adoptAgainst(active, cached);
        set({ isListReady: true });
        try {
          const list = await refresh();
          if (active && !adoptAgainst(active, list)) await dropPointer();
        } catch {
          // Silent background revalidation failed — keep cache + pointer.
        }
        set({ isReconciled: true });
      }
    } finally {
      set({ isLoadInFlight: false });
    }
  },
```

`panelVisibilityStore.ts`: rename `isInitialized` → `isPanelReady` (type, state, `loadPanelVisibility`, tests, consumers).

- [ ] **Step 4: Rewire the interim hook, `useAppInit`, `App`, `DiagramPanel`**

`useActiveDiagram.ts` (interim; deleted in Task 7): delete the `isInitialLoadComplete` `useState` and the initial-load effect; add:

```ts
  const isReconciled = useActiveDiagramStore((s) => s.isReconciled);

  useEffect(() => {
    if (!isConnected) return;
    useActiveDiagramStore.getState().loadInitial();
  }, [isConnected]);
```

and switch the auto-create effect's guard/deps from `isInitialLoadComplete` to `isReconciled`. Drop `isStatusLoaded` from the hook (no longer needed — `isConnected` implies it).

`useAppInit.ts`:

```ts
export type AppInit = {
  isStatusLoaded: boolean;
  isPanelReady: boolean;
  isQueryReady: boolean;
  isListReady: boolean;
  isReconciled: boolean;
  status: ConnectionStatus;
  signOut: SignOutFlow;
};
```

Select `isListReady`/`isReconciled` from `useActiveDiagramStore` (one `useShallow` call), rename the panel/query selections, return all.

`App.tsx`:

```tsx
  if (!isStatusLoaded) return null;
  if (!status.isConnected) return <ConnectButton />;
  // Fresh session: wait for the first real Drive list (cache is only trusted
  // across same-tab navigation reloads). Reload sessions pass instantly.
  if (!isPanelReady || !isQueryReady || !isListReady) return null;
  return (
    <>
      <DiagramPanel onSignOut={signOut.openSignOut} />
      {signOut.isSignOutOpen && (/* ConfirmDialog unchanged */)}
    </>
  );
```

(`isReconciled` is consumed in Task 7 by `<DiagramWatchers />`; until then `useActiveDiagram` still handles the watchers internally.)

`DiagramPanel.tsx`: delete `const isLoading = useDiagramLibraryStore((s) => s.isFilesLoading);`, the spinner branch that renders when it's true, and the stale `isQueryLoaded` comment; drop orphaned imports (`Spinner`, `useDiagramLibraryStore` if unused otherwise).

`useConnectDrive.ts`: drop the `refresh()` call and the `useDiagramLibraryStore` import — the connect flow no longer loads the list itself; the `isConnected` flip triggers `loadInitial` (via the interim effect now, `useInitialDiagramLoad` after Task 7), which owns it. `onConnect` becomes:

```ts
  const onConnect = async (folderName: string) => {
    const status = await connect(folderName);
    if (status.isConnected) await show();
  };
```

Update `useConnectDrive.test.ts` (drop refresh/list assertions).

Also check `useDiagramData.ts` (`rg -n "isFilesLoading|isQueryLoaded" entrypoints src`) and update any remaining consumers to the renamed/deleted fields.

- [ ] **Step 5: Update affected tests, run the full suite**

`App.test.tsx`: connected render now additionally requires `isListReady: true` seeded on `useActiveDiagramStore` — update setup. `DiagramPanel.test.tsx`: delete spinner cases. `useActiveDiagram.test.ts`: `connectAs(true)` alone now triggers `loadInitial`; the auto-create cases seed `useActiveDiagramStore.setState({ isReconciled: true })` where they previously relied on the initial load completing (mocked `getActiveFile`/`getCachedFiles` stay valid — `loadInitial` calls them via the mocked sessionStore module).

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit (after user approval)**

```bash
git add -A && git commit -m "refactor(content): session-aware loadInitial with top-level readiness gates"
```

---

### Task 7: Split into `useInitialDiagramLoad` + `useAutosave` + `useAutoCreate` + `DiagramWatchers`

**Files:**
- Create: `entrypoints/content/model/useInitialDiagramLoad.ts`, `entrypoints/content/model/useAutosave.ts`, `entrypoints/content/model/useAutoCreate.ts`
- Create: `entrypoints/content/ui/DiagramWatchers/DiagramWatchers.tsx`, `entrypoints/content/ui/DiagramWatchers/index.ts`
- Create: `entrypoints/content/model/useInitialDiagramLoad.test.ts`, `entrypoints/content/model/useAutosave.test.ts`, `entrypoints/content/model/useAutoCreate.test.ts`
- Modify: `entrypoints/content/model/useAppInit.ts`, `entrypoints/content/App.tsx`
- Delete: `entrypoints/content/model/useActiveDiagram.ts`, `entrypoints/content/model/useActiveDiagram.test.ts`

**Interfaces:**
- Consumes: `loadInitial`, `saveActiveScene(id)`, `onRemoteDeleted(id)`, `onSaveStatusChange`, `onAutoCreate`, `isReconciled` from `activeDiagramStore`; `refresh` from `diagramLibraryStore`; `status.isConnected` from `authStore`.
- Produces: `useInitialDiagramLoad(): void`, `useAutosave(): void`, `useAutoCreate(): void`, `DiagramWatchers` (renderless component).

- [ ] **Step 1: Create the hooks + component**

`useInitialDiagramLoad.ts`:

```ts
import { useEffect } from "react";
import { useActiveDiagramStore } from "./stores/activeDiagramStore";
import { useAuthStore } from "./stores/authStore";

// Kicks off loadInitial whenever isConnected flips true: app start in a
// connected tab, and a reconnect after an involuntary logout (no reload
// happens there, so this re-fire is what refreshes the list). Runs from
// useAppInit — outside App's readiness gate, or the gate would deadlock.
// loadInitial's own isLoadInFlight guard collapses strict-mode double runs.
export const useInitialDiagramLoad = (): void => {
  const isConnected = useAuthStore((s) => s.status.isConnected);

  useEffect(() => {
    if (!isConnected) return;
    useActiveDiagramStore.getState().loadInitial();
  }, [isConnected]);
};
```

`useAutosave.ts`:

```ts
import { useEffect } from "react";
import { createAutosave, SAVE_STATUS } from "../lib/autosaveController";
import { bridge } from "../lib/bridge";
import { currentSceneHash } from "../lib/sceneBridge";
import { useActiveDiagramStore } from "./stores/activeDiagramStore";

// Wires the debounced autosave loop to whichever file is active; tears down
// (with a final flush) and rewires whenever the active file changes. No
// connection guard — DiagramWatchers' mount condition is the guard.
export const useAutosave = (): void => {
  const activeId = useActiveDiagramStore((s) => s.activeId);

  useEffect(() => {
    if (!activeId) return;
    const { saveActiveScene, onSaveStatusChange, onRemoteDeleted } =
      useActiveDiagramStore.getState();
    const autosave = createAutosave({
      getHash: () => currentSceneHash(bridge),
      save: () => saveActiveScene(activeId),
      onStatus: (status) => {
        onSaveStatusChange(status);
        if (status === SAVE_STATUS.DELETED) onRemoteDeleted(activeId);
      },
    });
    let isStopped = false;
    // Establish the saved baseline before the first tick can fire.
    currentSceneHash(bridge).then((h) => {
      if (isStopped) return;
      autosave.markSaved(h);
      autosave.start();
    });
    return () => {
      isStopped = true;
      autosave.flush();
      autosave.stop();
    };
  }, [activeId]);
};
```

`useAutoCreate.ts` (`EMPTY_SCENE_HASH` + its comment move here; keep the refresh-before-retry, baseline-seeding, and no-flush-cleanup comments from the old file):

```ts
import { useEffect } from "react";
import {
  buildExcalidrawFile,
  ensureExcalidrawExtension,
  nextUntitledName,
  sceneHash,
} from "@/entities/diagram";
import { createAutosave } from "../lib/autosaveController";
import { bridge } from "../lib/bridge";
import { currentSceneHash, readScene } from "../lib/sceneBridge";
import { useActiveDiagramStore } from "./stores/activeDiagramStore";
import { useDiagramLibraryStore } from "./stores/diagramLibraryStore";

// Canonical hash of a blank scene (no elements, no app state, no files) —
// the baseline the auto-create watcher diffs against, so an untouched canvas
// never registers as dirty.
const EMPTY_SCENE_HASH = sceneHash(buildExcalidrawFile([], {}, {}));

// Auto-create: no active diagram, but the user started drawing anyway —
// silently promote the scene to a new Drive file once the change has been
// stable for the same debounce window as regular autosave. Once that
// succeeds, activeId flips non-null, this effect stops, and useAutosave takes
// over. No connection/reconcile guards — DiagramWatchers only mounts once
// App's gates say connected + reconciled.
export const useAutoCreate = (): void => {
  const activeId = useActiveDiagramStore((s) => s.activeId);

  useEffect(() => {
    if (activeId) return;
    const { onAutoCreate, onSaveStatusChange } = useActiveDiagramStore.getState();
    const autosave = createAutosave({
      getHash: () => currentSceneHash(bridge),
      save: async () => {
        const scene = await readScene(bridge);
        // Refresh the file list from Drive first — rather than trusting the
        // possibly-stale local snapshot — so a retry after a lost-response
        // partial success sees that file in the fresh list and picks the next
        // distinct name instead of colliding on an identical one. A throw
        // here (network, 401) aborts the tick and the controller retries.
        const files = await useDiagramLibraryStore.getState().refresh();
        const name = ensureExcalidrawExtension(nextUntitledName(files.map((f) => f.name)));
        await onAutoCreate(JSON.stringify(scene), name);
      },
      onStatus: onSaveStatusChange,
    });
    // No previously-saved baseline to diff against — seed with the canonical
    // empty-scene hash so a blank canvas stays "not dirty" forever, while any
    // real content hashes differently and gets picked up as dirty.
    autosave.markSaved(EMPTY_SCENE_HASH);
    autosave.start();
    return () => {
      // No flush() here: this watcher has never successfully saved anything
      // by the time cleanup runs, so there's no already-saved state to
      // protect.
      autosave.stop();
    };
  }, [activeId]);
};
```

`DiagramWatchers/DiagramWatchers.tsx` (+ `index.ts` re-export; no CSS module — renderless):

```tsx
import { useAutoCreate } from "../../model/useAutoCreate";
import { useAutosave } from "../../model/useAutosave";

// Renderless mount point for the save/auto-create watchers. App only renders
// it once connected + reconciled, so the hooks need no guards of their own —
// unmounting on disconnect IS the cleanup path.
export const DiagramWatchers = () => {
  useAutosave();
  useAutoCreate();
  return null;
};
```

- [ ] **Step 2: Rewire `useAppInit` + `App`, delete `useActiveDiagram.ts`**

`useAppInit.ts`: replace the `useActiveDiagram()` call with `useInitialDiagramLoad();` (import swap). `App.tsx` connected branch gains the watcher mount:

```tsx
      <DiagramPanel onSignOut={signOut.openSignOut} />
      {isReconciled && <DiagramWatchers />}
```

Delete `entrypoints/content/model/useActiveDiagram.ts`.

- [ ] **Step 3: Split the test file**

Delete `useActiveDiagram.test.ts`; each new test file copies its preamble (the `createFakeSceneBridgeDeps` fake, the `vi.mock` blocks, `INITIAL_*_STATE` reset `beforeEach`, `connectAs`) and imports its own hook.

`useInitialDiagramLoad.test.ts` — re-target the two initial-load cases:
- "runs loadInitial only once across re-renders": `connectAs(true)`, `renderHook(() => useInitialDiagramLoad())`, two `rerender()`s, assert `getActiveFile` called exactly once.
- "adopts the active pointer from the cached list immediately, without waiting on the network refresh": seed `markSessionLoaded()` (reload branch), otherwise unchanged assertions against `useActiveDiagramStore.getState().activeId`.
- New: "does nothing while disconnected": `connectAs(false)`, render, assert `getActiveFile` never called.

`useAutosave.test.ts` — new coverage (the old file never tested the autosave effect directly):

```ts
describe("useAutosave", () => {
  it("saves via drive/update once a change has been stable past the debounce", async () => {
    vi.useFakeTimers();
    try {
      useActiveDiagramStore.setState({ activeId: "1", revision: "r1" });
      vi.mocked(sendToBackground).mockImplementation(async (request) => {
        if (request.type === "drive/update")
          return { id: "1", name: "a.excalidraw", modifiedTime: "t", headRevisionId: "r2" };
        throw new Error(`unexpected request ${request.type}`);
      });
      let hash = "h0";
      vi.mocked(currentSceneHash).mockImplementation(async () => hash);

      renderHook(() => useAutosave());
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0); // baseline established
      });

      hash = "h1"; // user edits
      await act(async () => {
        await vi.advanceTimersByTimeAsync(4000); // past the 2.5s debounce
      });

      expect(sendToBackground).toHaveBeenCalledWith(
        expect.objectContaining({ type: "drive/update", id: "1", prevRevision: "r1" }),
      );
      expect(useActiveDiagramStore.getState().revision).toBe("r2");
      expect(useActiveDiagramStore.getState().saveStatus).toBe("saved");
    } finally {
      vi.useRealTimers();
    }
  });

  it("flushes a pending dirty change on unmount", async () => {
    vi.useFakeTimers();
    try {
      useActiveDiagramStore.setState({ activeId: "1", revision: "r1" });
      vi.mocked(sendToBackground).mockImplementation(async (request) => {
        if (request.type === "drive/update")
          return { id: "1", name: "a.excalidraw", modifiedTime: "t", headRevisionId: "r2" };
        throw new Error(`unexpected request ${request.type}`);
      });
      let hash = "h0";
      vi.mocked(currentSceneHash).mockImplementation(async () => hash);

      const { unmount } = renderHook(() => useAutosave());
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0); // baseline established
      });

      hash = "h1"; // dirty, inside the debounce window
      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
      });

      unmount();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0); // let the flush settle
      });

      expect(sendToBackground).toHaveBeenCalledWith(
        expect.objectContaining({ type: "drive/update", id: "1" }),
      );
    } finally {
      vi.useRealTimers();
    }
  });
});
```

`useAutoCreate.test.ts` — the old `describe("auto-create watcher", …)` cases minus the two whose guards moved up: drop "does not auto-create while disconnected" and "does not auto-create before the initial load/reconciliation finishes" (those guards are now App's mount condition — `App.test.tsx` covers that `DiagramWatchers` isn't rendered without `isReconciled`). Remaining cases switch `renderHook(() => useActiveDiagram())` → `renderHook(() => useAutoCreate())` and no longer need `getActiveFile`/`getCachedFiles` mocks or `connectAs` (the hook reads neither) — seed only what each case asserts on.

`App.test.tsx` — add: connected + `isReconciled: false` renders panel without watchers; flipping `isReconciled: true` mounts them (observable via the panel rendering plus, e.g., asserting no `drive/create` fires — or simply snapshot that `App` renders; keep it minimal: assert `App` renders `DiagramPanel` in both states without crashing).

- [ ] **Step 4: Run the full suite + static checks**

Run: `npm test && npx tsc --noEmit && npm run fsd-lint && npx knip && npx biome check .`
Expected: all PASS. Prune anything knip flags (`rg -n "onActivePointerChange|onRevisionChange"` — delete store actions with no remaining consumers).

- [ ] **Step 5: Commit (after user approval)**

```bash
git add -A && git commit -m "refactor(content): split useActiveDiagram into gated lifecycle hooks"
```

---

### Task 8: Docs + final verification

**Files:**
- Modify: `docs/architecture.md`

- [ ] **Step 1: Update `docs/architecture.md`**

Replace mentions of `useActiveDiagram` with the new shape. Cover three conventions (adjust wording to the document's structure):

> The content script's model layer is store-centric: zustand stores under `model/stores/` own state **and** orchestration (`activeDiagramStore`: active-file pointer, `loadInitial` startup reconciliation, `saveActiveScene`, `onRemoteDeleted`, CRUD actions; `diagramLibraryStore`: file list whose single write path `setFiles` keeps the fast-paint cache in sync). All content-side Drive calls go through `entrypoints/content/api/driveRequest.ts` — a 401 middleware that marks the panel disconnected in one place. Readiness is gated once, at the top: `App` mounts the panel on `isPanelReady && isQueryReady && isListReady` and the renderless `DiagramWatchers` (autosave + auto-create) on `isReconciled`; the hooks themselves carry no connection guards — unmounting on disconnect is the guard. `loadInitial` is session-aware: a fresh tab session waits for the real Drive list (cache may be stale), a same-tab navigation reload paints the cache instantly and revalidates in the background.

- [ ] **Step 2: Full verification**

Run: `npm test && npx tsc --noEmit && npm run fsd-lint && npx knip && npx biome check .`
Expected: all green.

Manual verification (user, in the loaded extension): fresh tab — brief blank then panel with real list; open a diagram — instant repaint after reload (cache); rename — row updates without reload; autosave badge cycles saving→saved; drawing with no active diagram auto-creates "Untitled" without reload; sign-out flushes, clears, and a reconnect waits for a real list again.

- [ ] **Step 3: Commit docs (after user approval), then hand off for PR**

```bash
git add docs/architecture.md && git commit -m "docs: describe store-centric content model layer"
```

PR creation, CI wait, and merge follow the project's standard rules (PR needs its own explicit user go-ahead).
