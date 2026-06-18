# Excalistore Plan 3 — Scene Bridge & Diagram I/O

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make diagrams round-trip between Drive and the excalidraw.com canvas — complete the background Drive gateway (get/create/update/rename) and build the content-script **scene bridge** that reads/writes Excalidraw's page storage (localStorage elements/appState + IndexedDB image binaries) with schema validation before every write.

**Architecture:** Feature-Sliced. The background worker stays the only holder of the OAuth token / Drive API access; this plan adds the read-write message handlers to the existing `features/driveGateway`. The content-script side gets `features/sceneBridge` — pure, dependency-injected transform logic (localStorage ↔ `.excalidraw` envelope) that is fully unit-tested, plus a thin `idb-keyval` adapter for the IndexedDB binary store (the one manually-verified fragile boundary, mirroring how Plan 2 treated Google Picker). No UI is built here — the React panel, autosave, and session lifecycle that consume these libs are Plan 4. End state: every diagram I/O primitive exists and is tested; the panel just wires them up.

**Tech Stack:** WXT, React 19, TS strict, Biome, Vitest, knip, lefthook. Google Drive REST v3 (existing `driveClient`), `idb-keyval` (new, for interop with Excalidraw's `files-db`).

**Reference:** Spec `docs/superpowers/specs/2026-06-17-excalistore-design.md` (Components → Content script → `scene-bridge`; Data Flow → Open/Create; Architecture diagram). Plans 1 & 2 are merged to `main`.

**Branch:** `feat/scene-bridge` (create off `main`).

**Conventions (from CLAUDE.md):** FSD layers import downward only (`shared → entities → features → widgets`); module files camelCase, components PascalCase; CSS Modules + colocated tests; Conventional Commits; do not bypass git hooks.

---

## Windows / line-endings note (applies to EVERY task)

This repo is developed on Windows; the Write tool emits CRLF but Biome requires LF. **Before every `git commit`** run `npx biome check --write .`, then re-`git add` the affected files. If the lefthook/biome `pre-commit` hook blocks a commit on formatting, run `npx biome check --write .`, re-stage, and re-commit. **Never** use `--no-verify`.

---

## Excalidraw storage format (the integration contract)

Excalidraw persists the local scene as:

- `localStorage["excalidraw"]` — a JSON **array of elements**.
- `localStorage["excalidraw-state"]` — a JSON **appState object** (includes `theme: "light" | "dark"`).
- IndexedDB database **`files-db`**, object store **`files-store`** — image binaries keyed by file id, written via the `idb-keyval` library (`createStore("files-db", "files-store")`). Each value is a `BinaryFileData`-shaped object (`{ id, mimeType, dataURL, created?, lastRetrieved? }`).

The localStorage transform is deterministic and unit-tested. The IndexedDB binary encoding is the fragile, version-sensitive boundary: it is isolated behind a single adapter (`filesDb.ts`) and verified manually (Task 6), so a format drift is a one-file change.

---

## File Structure (added by this plan)

```
src/
  entities/
    diagram/
      model/{activeFile.ts, index.ts}         # ActiveFile pointer type (+ guard)
      index.ts                                  # (export model)
  features/
    sceneBridge/
      lib/
        sceneBridge.ts + sceneBridge.test.ts   # read/write/clear/theme/hash (DI, pure-ish)
        filesDb.ts                              # idb-keyval adapter for files-db (untested boundary)
        index.ts
      index.ts
  shared/
    api/
      messages.ts                              # + DiagramContent; (Request union already has drive/get|create|update|rename)
      messages.test.ts                         # + DiagramContent shape test
  features/
    driveGateway/
      lib/
        handleMessage.ts + handleMessage.test.ts  # + get/create/update/rename cases & deps
entrypoints/
  background.ts                                # wire new gateway deps (getFile/createFile/updateFile/renameFile)
```

---

## Task 1: Message contract — `DiagramContent`

The `Request` union already declares `drive/get`, `drive/create`, `drive/update`, `drive/rename` (added in Plan 2). This task adds the response payload type for `drive/get` so the gateway and (Plan 4) the panel agree on the shape. `create`/`update`/`rename` reuse the existing `DriveFileMeta`.

**Files:**
- Modify: `src/shared/api/messages.ts`
- Modify: `src/shared/api/messages.test.ts`

- [x] **Step 1: Add a failing test**

Append to `src/shared/api/messages.test.ts`:

```typescript
import type { DiagramContent } from "./messages";

it("DiagramContent shape", () => {
  const d: DiagramContent = {
    meta: { id: "1", name: "a.excalidraw", modifiedTime: "t", headRevisionId: "r" },
    content: "{}",
  };
  expect(d.content).toBe("{}");
  expect(d.meta.headRevisionId).toBe("r");
});
```

- [x] **Step 2: Run to verify it fails**

Run: `npx vitest run src/shared/api/messages.test.ts`
Expected: FAIL — `DiagramContent` not exported.

- [x] **Step 3: Add the type to `messages.ts`**

Add, right after the `DriveFileMeta` interface:

```typescript
// drive/get response: file metadata (for the conflict guard + name) plus the
// raw .excalidraw JSON content.
export interface DiagramContent {
  meta: DriveFileMeta;
  content: string;
}
```

- [x] **Step 4: Run to verify it passes**

Run: `npx vitest run src/shared/api/messages.test.ts`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
npx biome check --write .
git add src/shared/api/messages.ts src/shared/api/messages.test.ts
git commit -m "feat: add diagram content message payload type"
```

---

## Task 2: Gateway — get / create / update / rename

Extend the pure `handleMessage` router with the four read-write Drive operations. Each requires a connection; `create` also requires a stored `folderId`. The existing `err()` helper already maps `/conflict/i` → `code: "conflict"` and `/unauthor|401/i` → `code: "unauthorized"`, so `updateFile`'s conflict error and any 401 propagate with the right code automatically.

**Files:**
- Modify: `src/features/driveGateway/lib/handleMessage.ts`
- Modify: `src/features/driveGateway/lib/handleMessage.test.ts`

- [x] **Step 1: Add failing tests**

Append these cases inside the existing `describe("handleMessage", ...)` block in `handleMessage.test.ts`. They rely on extending the `deps()` helper — update that helper first (replace the existing `deps` factory with this version, which adds the four new mocks while keeping the existing ones):

```typescript
function deps(over: Partial<GatewayDeps> = {}): GatewayDeps {
  return {
    getToken: vi.fn(async () => "TOK"),
    signOut: vi.fn(async () => undefined),
    listFolder: vi.fn(async () => [{ id: "1", name: "a", modifiedTime: "t", headRevisionId: "r" }]),
    getFile: vi.fn(async () => ({
      meta: { id: "1", name: "a.excalidraw", modifiedTime: "t", headRevisionId: "r" },
      content: '{"type":"excalidraw"}',
    })),
    createFile: vi.fn(async () => ({ id: "2", name: "new.excalidraw", modifiedTime: "t", headRevisionId: "r0" })),
    updateFile: vi.fn(async () => ({ id: "1", name: "a.excalidraw", modifiedTime: "t2", headRevisionId: "r2" })),
    renameFile: vi.fn(async () => ({ id: "1", name: "renamed.excalidraw", modifiedTime: "t2", headRevisionId: "r" })),
    getStore: vi.fn(async () => ({ connected: true, folderId: "F", folderName: "Diagrams" })),
    setStore: vi.fn(async () => undefined),
    ...over,
  };
}
```

Then add the new test cases:

```typescript
it("drive/get fetches content + meta with token", async () => {
  const d = deps();
  const res = await handleMessage({ type: "drive/get", id: "1" }, d);
  expect(d.getToken).toHaveBeenCalled();
  expect(d.getFile).toHaveBeenCalledWith("TOK", "1");
  expect(res).toEqual({
    ok: true,
    data: {
      meta: { id: "1", name: "a.excalidraw", modifiedTime: "t", headRevisionId: "r" },
      content: '{"type":"excalidraw"}',
    },
  });
});

it("drive/get errors when not connected", async () => {
  const d = deps({ getStore: vi.fn(async () => ({ connected: false })) });
  const res = await handleMessage({ type: "drive/get", id: "1" }, d);
  expect(res).toEqual({ ok: false, error: expect.stringMatching(/not connected/i), code: "unknown" });
});

it("drive/create uses token + stored folder", async () => {
  const d = deps();
  const res = await handleMessage(
    { type: "drive/create", name: "new.excalidraw", content: "{}" },
    d,
  );
  expect(d.createFile).toHaveBeenCalledWith("TOK", "new.excalidraw", "F", "{}");
  expect(res).toEqual({
    ok: true,
    data: { id: "2", name: "new.excalidraw", modifiedTime: "t", headRevisionId: "r0" },
  });
});

it("drive/create errors without a folder", async () => {
  const d = deps({ getStore: vi.fn(async () => ({ connected: true })) });
  const res = await handleMessage({ type: "drive/create", name: "n", content: "{}" }, d);
  expect(res).toEqual({ ok: false, error: expect.stringMatching(/no folder|not connected/i), code: "unknown" });
});

it("drive/update passes the prev revision for the conflict guard", async () => {
  const d = deps();
  const res = await handleMessage(
    { type: "drive/update", id: "1", content: "{}", prevRevision: "r" },
    d,
  );
  expect(d.updateFile).toHaveBeenCalledWith("TOK", "1", "{}", "r");
  expect(res).toEqual({
    ok: true,
    data: { id: "1", name: "a.excalidraw", modifiedTime: "t2", headRevisionId: "r2" },
  });
});

it("drive/update surfaces conflict with code conflict", async () => {
  const d = deps({
    updateFile: vi.fn(async () => {
      throw new Error("conflict: remote revision changed");
    }),
  });
  const res = await handleMessage({ type: "drive/update", id: "1", content: "{}", prevRevision: "rOLD" }, d);
  expect(res).toEqual({ ok: false, error: "conflict: remote revision changed", code: "conflict" });
});

it("drive/rename renames with token", async () => {
  const d = deps();
  const res = await handleMessage({ type: "drive/rename", id: "1", name: "renamed.excalidraw" }, d);
  expect(d.renameFile).toHaveBeenCalledWith("TOK", "1", "renamed.excalidraw");
  expect(res).toEqual({
    ok: true,
    data: { id: "1", name: "renamed.excalidraw", modifiedTime: "t2", headRevisionId: "r" },
  });
});
```

- [x] **Step 2: Run to verify it fails**

Run: `npx vitest run src/features/driveGateway/lib/handleMessage.test.ts`
Expected: FAIL — `GatewayDeps` has no `getFile`/`createFile`/`updateFile`/`renameFile`; the new cases are unhandled (`unhandled request`).

- [x] **Step 3: Extend `handleMessage.ts`**

Add the four deps to the `GatewayDeps` interface (keep the existing members):

```typescript
import type { DriveFile } from "@/entities/driveFile";
import type { ConnectionStatus, DiagramContent, Request, Response } from "@/shared/api";

export interface GatewayDeps {
  getToken: (interactive: boolean) => Promise<string>;
  signOut: (token: string) => Promise<void>;
  listFolder: (token: string, folderId: string) => Promise<DriveFile[]>;
  getFile: (token: string, id: string) => Promise<DiagramContent>;
  createFile: (token: string, name: string, folderId: string, content: string) => Promise<DriveFile>;
  updateFile: (token: string, id: string, content: string, prevRevision: string) => Promise<DriveFile>;
  renameFile: (token: string, id: string, name: string) => Promise<DriveFile>;
  getStore: () => Promise<ConnectionStatus>;
  setStore: (s: ConnectionStatus) => Promise<void>;
}
```

Add these `case`s to the `switch (req.type)` (before the `default`):

```typescript
      case "drive/get": {
        const store = await deps.getStore();
        if (!store.connected) return err("not connected");
        const token = await deps.getToken(false);
        return { ok: true, data: await deps.getFile(token, req.id) };
      }

      case "drive/create": {
        const store = await deps.getStore();
        if (!store.connected || !store.folderId) return err("not connected: no folder");
        const token = await deps.getToken(false);
        return { ok: true, data: await deps.createFile(token, req.name, store.folderId, req.content) };
      }

      case "drive/update": {
        const store = await deps.getStore();
        if (!store.connected) return err("not connected");
        const token = await deps.getToken(false);
        return {
          ok: true,
          data: await deps.updateFile(token, req.id, req.content, req.prevRevision),
        };
      }

      case "drive/rename": {
        const store = await deps.getStore();
        if (!store.connected) return err("not connected");
        const token = await deps.getToken(false);
        return { ok: true, data: await deps.renameFile(token, req.id, req.name) };
      }
```

(Note: `DiagramContent` must be imported from `@/shared/api` — confirm `messages.ts`'s `DiagramContent` is re-exported by the `shared/api` barrel; it is, via `export * from "./messages"`.)

- [x] **Step 4: Run to verify it passes**

Run: `npx vitest run src/features/driveGateway/lib/handleMessage.test.ts`
Expected: PASS (all cases, including the pre-existing ones).

- [x] **Step 5: Verify types + commit**

Run: `npm run lint && npm run compile`
Expected: exit 0.

```bash
npx biome check --write .
git add src/features/driveGateway/lib/handleMessage.ts src/features/driveGateway/lib/handleMessage.test.ts
git commit -m "feat: handle diagram get/create/update/rename in gateway"
```

---

## Task 3: Wire the new gateway deps in `background.ts`

The pure gateway now needs real implementations. `driveClient` already exports `getMeta`, `getContent`, `createFile`, `updateFile`, `renameFile`; `getFile` is composed from `getMeta` + `getContent`.

**Files:**
- Modify: `entrypoints/background.ts`

- [x] **Step 1: Update `background.ts`**

Replace the file with:

```typescript
import {
  createFile,
  getContent,
  getMeta,
  listFolder,
  renameFile,
  updateFile,
} from "@/entities/driveFile";
import { getToken, signOut } from "@/features/auth";
import { type GatewayDeps, handleMessage } from "@/features/driveGateway";
import type { ConnectionStatus, Request } from "@/shared/api";

// Background service worker — trusted core. Holds the only access to the
// OAuth token and Drive APIs; routes typed messages through the gateway.
const STORE_KEY = "connection";

const deps: GatewayDeps = {
  getToken,
  signOut,
  listFolder,
  getFile: async (token, id) => {
    const [meta, content] = await Promise.all([getMeta(token, id), getContent(token, id)]);
    return { meta, content };
  },
  createFile,
  updateFile,
  renameFile,
  getStore: async () =>
    ((await chrome.storage.local.get(STORE_KEY))[STORE_KEY] as ConnectionStatus) ?? {
      connected: false,
    },
  setStore: async (s) => chrome.storage.local.set({ [STORE_KEY]: s }),
};

export default defineBackground(() => {
  chrome.runtime.onMessage.addListener((req: Request, _sender, sendResponse) => {
    handleMessage(req, deps).then(sendResponse);
    return true; // async response
  });
});
```

(`getMeta` and `getContent` are already exported from `src/entities/driveFile/api/driveClient.ts` and re-exported by the `driveFile` barrel — no entity changes needed.)

- [x] **Step 2: Verify build + commit**

Run: `npm run lint && npm run compile && npm run build`
Expected: exit 0; `wxt build` succeeds.

```bash
npx biome check --write .
git add entrypoints/background.ts
git commit -m "feat: wire diagram read-write deps into background gateway"
```

---

## Task 4: `ActiveFile` pointer type (entities/diagram)

The active-file pointer (which Drive file the canvas currently represents, and the revision it was loaded at — for the conflict guard) is a diagram-domain concept. Plan 4 persists it across the writeScene→reload; this task just defines the type + a guard.

**Files:**
- Create: `src/entities/diagram/model/activeFile.ts`, `src/entities/diagram/model/index.ts`
- Modify: `src/entities/diagram/index.ts`
- Create: `src/entities/diagram/model/activeFile.test.ts`

- [x] **Step 1: Write the failing test**

`src/entities/diagram/model/activeFile.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { isActiveFile } from "./activeFile";

describe("isActiveFile", () => {
  it("accepts a well-formed pointer", () => {
    expect(isActiveFile({ id: "1", name: "a.excalidraw", loadedRevision: "r" })).toBe(true);
  });

  it("rejects null and partial shapes", () => {
    expect(isActiveFile(null)).toBe(false);
    expect(isActiveFile({ id: "1", name: "a" })).toBe(false);
    expect(isActiveFile({ id: 1, name: "a", loadedRevision: "r" })).toBe(false);
  });
});
```

- [x] **Step 2: Run to verify it fails**

Run: `npx vitest run src/entities/diagram/model/activeFile.test.ts`
Expected: FAIL — module not found.

- [x] **Step 3: Write `activeFile.ts`**

```typescript
// Which Drive file the canvas currently represents. loadedRevision is the
// headRevisionId at load time and feeds the autosave conflict guard.
export interface ActiveFile {
  id: string;
  name: string;
  loadedRevision: string;
}

export function isActiveFile(value: unknown): value is ActiveFile {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.name === "string" &&
    typeof v.loadedRevision === "string"
  );
}
```

- [x] **Step 4: Barrels**

`src/entities/diagram/model/index.ts`:

```typescript
export * from "./activeFile";
```

`src/entities/diagram/index.ts` — add the model export (keep the existing `export * from "./lib";`):

```typescript
export * from "./lib";
export * from "./model";
```

- [x] **Step 5: Run to verify it passes**

Run: `npx vitest run src/entities/diagram/model/activeFile.test.ts`
Expected: PASS.

- [x] **Step 6: Verify + commit**

Run: `npm run lint && npm run compile && npm run knip`
Expected: exit 0.

```bash
npx biome check --write .
git add src/entities/diagram
git commit -m "feat: add active file pointer type"
```

---

## Task 5: Scene bridge core (read / write / clear / theme / hash)

The heart of Plan 3: transform between Excalidraw's page storage and the validated `.excalidraw` envelope. Storage access is **dependency-injected** so the transform is unit-tested without a real browser; the real `localStorage` / IndexedDB defaults are wired in Task 6. `writeScene`/`clearScene` reload the tab last (Excalidraw restores from storage on load).

**Files:**
- Create: `src/features/sceneBridge/lib/sceneBridge.ts`, `sceneBridge.test.ts`

- [x] **Step 1: Write the failing test `sceneBridge.test.ts`**

```typescript
import { describe, expect, it, vi } from "vitest";
import { clearScene, currentSceneHash, readScene, readTheme, writeScene } from "./sceneBridge";
import type { SceneBridgeDeps } from "./sceneBridge";
import { buildExcalidrawFile } from "@/entities/diagram";

// Map-backed fake of the Web Storage API (the subset the bridge uses).
function fakeStorage(seed: Record<string, string> = {}): Storage {
  const m = new Map<string, string>(Object.entries(seed));
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
    key: (i: number) => Array.from(m.keys())[i] ?? null,
    get length() {
      return m.size;
    },
  } as Storage;
}

function deps(over: Partial<SceneBridgeDeps> = {}): SceneBridgeDeps {
  return {
    storage: fakeStorage(),
    loadFiles: vi.fn(async () => ({})),
    saveFiles: vi.fn(async () => undefined),
    clearFiles: vi.fn(async () => undefined),
    reload: vi.fn(),
    ...over,
  };
}

describe("readScene", () => {
  it("builds a validated envelope from storage + files", async () => {
    const d = deps({
      storage: fakeStorage({
        excalidraw: JSON.stringify([{ id: "e1", version: 1 }]),
        "excalidraw-state": JSON.stringify({ theme: "dark", viewBackgroundColor: "#fff" }),
      }),
      loadFiles: vi.fn(async () => ({
        f1: { id: "f1", mimeType: "image/png", dataURL: "data:image/png;base64,AAAA" },
      })),
    });
    const scene = await readScene(d);
    expect(scene.type).toBe("excalidraw");
    expect(scene.elements).toEqual([{ id: "e1", version: 1 }]);
    expect(scene.appState).toMatchObject({ theme: "dark" });
    expect(scene.files.f1.mimeType).toBe("image/png");
  });

  it("defaults to an empty scene when storage is blank", async () => {
    const scene = await readScene(deps());
    expect(scene.elements).toEqual([]);
    expect(scene.files).toEqual({});
  });
});

describe("writeScene", () => {
  it("validates, writes storage + files, then reloads", async () => {
    const d = deps();
    const file = buildExcalidrawFile(
      [{ id: "e1", version: 2 }],
      { theme: "light" },
      { f1: { id: "f1", mimeType: "image/png", dataURL: "data:image/png;base64,AAAA" } },
    );
    await writeScene(file, d);
    expect((d.storage as Storage).getItem("excalidraw")).toBe(JSON.stringify(file.elements));
    expect((d.storage as Storage).getItem("excalidraw-state")).toBe(JSON.stringify(file.appState));
    expect(d.saveFiles).toHaveBeenCalledWith(file.files);
    expect(d.reload).toHaveBeenCalledOnce();
  });

  it("rejects an invalid envelope before touching storage", async () => {
    const d = deps();
    await expect(writeScene({ type: "nope" } as never, d)).rejects.toThrow();
    expect(d.saveFiles).not.toHaveBeenCalled();
    expect(d.reload).not.toHaveBeenCalled();
  });
});

describe("clearScene", () => {
  it("removes storage keys, clears files, reloads", async () => {
    const d = deps({
      storage: fakeStorage({ excalidraw: "[]", "excalidraw-state": "{}" }),
    });
    await clearScene(d);
    expect((d.storage as Storage).getItem("excalidraw")).toBeNull();
    expect((d.storage as Storage).getItem("excalidraw-state")).toBeNull();
    expect(d.clearFiles).toHaveBeenCalledOnce();
    expect(d.reload).toHaveBeenCalledOnce();
  });
});

describe("readTheme", () => {
  it("reads the theme from appState, defaulting to light", () => {
    expect(readTheme(deps({ storage: fakeStorage({ "excalidraw-state": '{"theme":"dark"}' }) }))).toBe("dark");
    expect(readTheme(deps())).toBe("light");
  });
});

describe("currentSceneHash", () => {
  it("is stable across reads and changes with elements", async () => {
    const base = deps({
      storage: fakeStorage({ excalidraw: JSON.stringify([{ id: "e1", version: 1 }]) }),
    });
    const h1 = await currentSceneHash(base);
    const h2 = await currentSceneHash(base);
    expect(h1).toBe(h2);
    const changed = deps({
      storage: fakeStorage({ excalidraw: JSON.stringify([{ id: "e1", version: 2 }]) }),
    });
    expect(await currentSceneHash(changed)).not.toBe(h1);
  });
});
```

- [x] **Step 2: Run to verify it fails**

Run: `npx vitest run src/features/sceneBridge/lib/sceneBridge.test.ts`
Expected: FAIL — module not found.

- [x] **Step 3: Write `sceneBridge.ts`**

```typescript
import {
  type BinaryFile,
  buildExcalidrawFile,
  type ExcalidrawFile,
  sceneHash,
  validateExcalidrawFile,
} from "@/entities/diagram";
import type { ThemeMode } from "@/shared/config";

// Excalidraw's localStorage keys.
const ELEMENTS_KEY = "excalidraw";
const STATE_KEY = "excalidraw-state";

// All page-storage access is injected so the transform is unit-testable and the
// fragile IndexedDB binding lives in one adapter (filesDb.ts, wired in Task 6).
export interface SceneBridgeDeps {
  storage: Storage;
  loadFiles: () => Promise<Record<string, BinaryFile>>;
  saveFiles: (files: Record<string, BinaryFile>) => Promise<void>;
  clearFiles: () => Promise<void>;
  reload: () => void;
}

function readJson<T>(storage: Storage, key: string, fallback: T): T {
  const raw = storage.getItem(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

// Read the current canvas into a validated .excalidraw envelope.
export async function readScene(deps: SceneBridgeDeps): Promise<ExcalidrawFile> {
  const elements = readJson<Array<Record<string, unknown>>>(deps.storage, ELEMENTS_KEY, []);
  const appState = readJson<Record<string, unknown>>(deps.storage, STATE_KEY, {});
  const files = await deps.loadFiles();
  return buildExcalidrawFile(elements, appState, files);
}

// Replace the canvas: validate, write storage + binaries, then reload so
// Excalidraw restores from storage. Validation is the security boundary.
export async function writeScene(file: ExcalidrawFile, deps: SceneBridgeDeps): Promise<void> {
  validateExcalidrawFile(file);
  deps.storage.setItem(ELEMENTS_KEY, JSON.stringify(file.elements));
  deps.storage.setItem(STATE_KEY, JSON.stringify(file.appState));
  await deps.saveFiles(file.files);
  deps.reload();
}

// Wipe the local scene (used by safe sign-out in Plan 4), then reload.
export async function clearScene(deps: SceneBridgeDeps): Promise<void> {
  deps.storage.removeItem(ELEMENTS_KEY);
  deps.storage.removeItem(STATE_KEY);
  await deps.clearFiles();
  deps.reload();
}

// Excalidraw's current theme, mirrored onto the panel host in Plan 4.
export function readTheme(deps: SceneBridgeDeps): ThemeMode {
  const appState = readJson<{ theme?: string }>(deps.storage, STATE_KEY, {});
  return appState.theme === "dark" ? "dark" : "light";
}

// Hash of the current scene for autosave change-detection (Plan 4).
export async function currentSceneHash(deps: SceneBridgeDeps): Promise<string> {
  return sceneHash(await readScene(deps));
}
```

(`ThemeMode` is exported from `src/shared/config/theme.ts` and re-exported by the `shared/config` barrel — confirm before relying on it; if `theme.ts` isn't re-exported by `src/shared/config/index.ts`, add `export * from "./theme";` there in this task.)

- [x] **Step 4: Run to verify it passes**

Run: `npx vitest run src/features/sceneBridge/lib/sceneBridge.test.ts`
Expected: PASS.

- [x] **Step 5: Verify + commit**

Run: `npm run lint && npm run compile`
Expected: exit 0.

```bash
npx biome check --write .
git add src/features/sceneBridge/lib/sceneBridge.ts src/features/sceneBridge/lib/sceneBridge.test.ts src/shared/config/index.ts
git commit -m "feat: add scene bridge transform between storage and excalidraw envelope"
```

---

## Task 6: files-db adapter + barrels + default deps

The `idb-keyval` adapter that talks to Excalidraw's actual `files-db`/`files-store`. This is the **fragile, manually-verified boundary** (jsdom can't meaningfully exercise the same IndexedDB Excalidraw uses) — keep it thin. It also provides `defaultSceneBridgeDeps()` so callers (Plan 4 content script) get a ready-wired `SceneBridgeDeps` without knowing the storage details.

**Files:**
- Create: `src/features/sceneBridge/lib/filesDb.ts`
- Create: `src/features/sceneBridge/lib/index.ts`
- Create: `src/features/sceneBridge/index.ts`
- Modify: `package.json` / `package-lock.json` (add `idb-keyval`)
- Modify: `knip.json` if the feature barrel is flagged

- [x] **Step 1: Install `idb-keyval`**

Run: `npm install idb-keyval`
Expected: adds `idb-keyval` to `dependencies` (it is a runtime dep, not dev — the content script ships it).

- [x] **Step 2: Write `filesDb.ts`**

```typescript
import { clear, entries, set, createStore } from "idb-keyval";
import type { BinaryFile } from "@/entities/diagram";
import type { SceneBridgeDeps } from "./sceneBridge";

// Excalidraw stores image binaries with idb-keyval under this exact db/store
// pair — we must match it to interoperate. This is the one fragile, version-
// sensitive integration point; verified manually (see docs/development.md).
const filesStore = createStore("files-db", "files-store");

async function loadFiles(): Promise<Record<string, BinaryFile>> {
  const out: Record<string, BinaryFile> = {};
  for (const [key, value] of await entries(filesStore)) {
    out[String(key)] = value as BinaryFile;
  }
  return out;
}

async function saveFiles(files: Record<string, BinaryFile>): Promise<void> {
  await Promise.all(Object.entries(files).map(([id, file]) => set(id, file, filesStore)));
}

async function clearFiles(): Promise<void> {
  await clear(filesStore);
}

// Real, browser-wired SceneBridgeDeps for the content script.
export function defaultSceneBridgeDeps(): SceneBridgeDeps {
  return {
    storage: window.localStorage,
    loadFiles,
    saveFiles,
    clearFiles,
    reload: () => window.location.reload(),
  };
}
```

- [x] **Step 3: Barrels**

`src/features/sceneBridge/lib/index.ts`:

```typescript
export * from "./filesDb";
export * from "./sceneBridge";
```

`src/features/sceneBridge/index.ts`:

```typescript
export * from "./lib";
```

- [x] **Step 4: knip**

Run: `npm run knip`
If `src/features/sceneBridge/index.ts` is flagged as an unused entry (nothing imports it until Plan 4), add it to the `entry` array in `knip.json` (same pattern as the other feature barrels already listed there).

- [x] **Step 5: Verify + commit**

Run: `npm run lint && npm run compile && npm run knip && npm run build`
Expected: exit 0; build bundles `idb-keyval` into the content script.

```bash
npx biome check --write .
git add src/features/sceneBridge package.json package-lock.json knip.json
git commit -m "feat: add files-db adapter and default scene bridge deps"
```

---

## Task 7: Docs

**Files:**
- Modify: `docs/architecture.md`
- Modify: `docs/development.md`
- Modify: `docs/features.md`

- [x] **Step 1: `docs/architecture.md`**

Add `features/sceneBridge` to the FSD source layout, and add the `entities/diagram` `model/activeFile` note. Document the scene-bridge contract: storage keys (`excalidraw`, `excalidraw-state`), the `files-db`/`files-store` IndexedDB store via `idb-keyval`, and that `writeScene`/`clearScene` reload the tab so Excalidraw restores from storage. Note the gateway now routes `drive/get|create|update|rename` and that the OAuth token still never leaves the background worker.

- [x] **Step 2: `docs/development.md`**

Add a "Scene bridge manual verification" subsection (this is the one boundary not covered by unit tests):

```markdown
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
```

- [x] **Step 3: `docs/features.md`**

Under "Next to pick up", add a short note that the diagram I/O primitives (scene bridge + gateway read/write) landed as infrastructure in Plan 3; the user-facing open/create/rename/autosave ship with the panel in Plan 4. Do **not** move anything into "Shipped" yet (no user-facing feature is complete until Plan 4).

- [x] **Step 4: Commit**

```bash
npx biome check --write .
git add docs/architecture.md docs/development.md docs/features.md
git commit -m "docs: record scene bridge and diagram i/o (plan 3)"
```

---

## Self-Review

- **Spec coverage (Plan 3 portion):** `scene-bridge` `readScene`/`writeScene` + validation + reload ✓ (Task 5); `sceneHash` reuse for change detection ✓ (Task 5, `currentSceneHash`); `clearScene` for sign-out ✓ (Task 5, consumed in Plan 4); embedded-image fidelity via `files-db` interop ✓ (Task 6); `drive-client` create/update/rename/get surfaced through the gateway ✓ (Tasks 2–3); conflict guard preserved (`updateFile` prevRevision + `code: "conflict"`) ✓ (Task 2); token stays in background ✓ (Task 3, all token use server-side). Panel UI, autosave debounce, theme mirror, session lifecycle (safe sign-out flush→clear, 401→reconnect) are **Plan 4** by design.
- **Placeholders:** none — every step has complete code or an exact command. The IndexedDB encoding is real code isolated in `filesDb.ts`; if Excalidraw's on-disk shape differs at verification time (Task 6 / development.md), it is a one-function change in `loadFiles`/`saveFiles`, not a placeholder.
- **Type consistency:** `ExcalidrawFile`/`BinaryFile`/`buildExcalidrawFile`/`validateExcalidrawFile`/`sceneHash` reused from `entities/diagram` (Plan 1); `DiagramContent`/`DriveFileMeta`/`Request`/`Response` from `shared/api`; `GatewayDeps` extended consistently; `SceneBridgeDeps` defined once (Task 5) and supplied by `defaultSceneBridgeDeps` (Task 6); `ActiveFile`/`isActiveFile` names consistent.
- **Known follow-ups for Plan 4:** mount the React panel in a Shadow DOM (consume `shared/ui`), the autosave controller (debounce 2.5s + conflict badge), active-file persistence across the writeScene→reload, theme mirror via `readTheme` + a `MutationObserver`/poll, safe sign-out (`clearScene` + revoke + clear state), and `401 → "session expired, reconnect"` without clearing the local scene.
```
