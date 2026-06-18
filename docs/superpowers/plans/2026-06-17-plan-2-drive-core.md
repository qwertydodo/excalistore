# Excalistore Plan 2 — Drive Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect the extension to Google Drive — OAuth sign-in/out, a minimal-scope Drive REST client, folder selection via Google Picker, and a background gateway the rest of the app talks to over typed messages, surfaced through a popup connect UI.

**Architecture:** Feature-Sliced. The background service worker is the only place holding the OAuth token or calling Google APIs. `entities/driveFile` owns the Drive REST client (pure, fetch-injected, fully unit-tested). `features/auth` wraps `chrome.identity`. `features/pickFolder` wraps Google Picker (the one sanctioned remote script, behind a scoped CSP). `features/driveGateway` orchestrates auth + drive and routes typed messages. `widgets/popupConnect` is the popup UI. Content-script/popup never touch the token — they call the gateway via `shared/api` messaging.

**Tech Stack:** WXT, React 19, TS strict, Biome, Vitest, knip, lefthook. Google Drive REST v3, Google Picker, `chrome.identity`.

**Reference:** Spec `docs/superpowers/specs/2026-06-17-excalistore-design.md`; Plan 1 foundation already merged to `main`.

**Branch:** `feat/drive-core` (already created off `main`).

**Conventions (from CLAUDE.md):** FSD layers import downward only; module files camelCase, components PascalCase; CSS Modules + colocated tests; two-tier design tokens; Conventional Commits; do not bypass git hooks.

---

## Security note: Picker + CSP exception

`drive.file` scope cannot list the user's Drive, so folder selection uses **Google Picker**, which loads Google's first-party `https://apis.google.com/js/api.js`. This is the single, documented exception to the "no remote code" posture, scoped to `script-src` for `apis.google.com` on extension pages only. The OAuth token still never leaves the background worker except being handed to Picker (running in the popup) for the duration of folder selection. Document this in `docs/security.md`.

---

## File Structure (added by this plan)

```
src/
  entities/
    driveFile/
      model/{types.ts, index.ts}            # DriveFile domain types
      api/{driveClient.ts, driveClient.test.ts, index.ts}   # Drive REST v3
      index.ts
  features/
    auth/
      api/{authClient.ts, authClient.test.ts, index.ts}     # chrome.identity wrapper
      index.ts
    pickFolder/
      lib/{picker.ts, index.ts}             # Google Picker wrapper (thin, untested)
      index.ts
    driveGateway/
      lib/{handleMessage.ts, handleMessage.test.ts, index.ts}  # message router logic
      index.ts
  shared/
    api/
      sendMessage.ts + sendMessage.test.ts  # typed runtime messaging client
      messages.ts                            # (extend with folder/connect requests)
    config/
      drive.ts + index.ts                    # Drive endpoints, scope, mime constants
  widgets/
    popupConnect/
      PopupConnect/{PopupConnect.tsx, PopupConnect.module.css, PopupConnect.test.tsx, index.ts}
      index.ts
entrypoints/
  background.ts                              # wire chrome.runtime.onMessage -> gateway
  popup/App.tsx                              # render <PopupConnect/>
```

---

## Task 1: Two-tier color tokens

**Files:**
- Modify: `src/shared/config/theme.css`

- [ ] **Step 1: Rewrite `theme.css` with primitive + semantic tokens**

Define raw color primitives once, then map semantic vars to them (light + dark
reassign semantics, not raw hex). Keep the same `--es-*` semantic names so no
component changes are needed.

```css
/* Color primitives — raw palette, referenced only by semantic tokens below. */
:root,
:host {
  --es-color-white: #ffffff;
  --es-color-violet-50: #f1f0ff;
  --es-color-violet-300: #a8a5ff;
  --es-color-violet-500: #6965db;
  --es-color-ink-900: #1b1b1f;
  --es-color-ink-700: #232329;
  --es-color-ink-600: #2e2d39;
  --es-color-ink-400: #3b3a47;
  --es-color-gray-500: #6a6a75;
  --es-color-gray-300: #9a99a5;
  --es-color-red-500: #e03131;
  --es-color-red-300: #ff8787;

  /* Semantic tokens (light) */
  --es-bg: var(--es-color-white);
  --es-surface: var(--es-color-violet-50);
  --es-text: var(--es-color-ink-900);
  --es-muted: var(--es-color-gray-500);
  --es-border: var(--es-color-violet-50);
  --es-accent: var(--es-color-violet-500);
  --es-accent-text: var(--es-color-white);
  --es-danger: var(--es-color-red-500);
  --es-radius: 8px;
  --es-shadow: 0 1px 4px rgba(0, 0, 0, 0.1);
}

:root[data-theme="dark"],
:host([data-theme="dark"]) {
  --es-bg: var(--es-color-ink-700);
  --es-surface: var(--es-color-ink-600);
  --es-text: #e3e3e8;
  --es-muted: var(--es-color-gray-300);
  --es-border: var(--es-color-ink-400);
  --es-accent: var(--es-color-violet-300);
  --es-accent-text: var(--es-color-ink-900);
  --es-danger: var(--es-color-red-300);
  --es-shadow: 0 1px 4px rgba(0, 0, 0, 0.4);
}
```

(Note `#e3e3e8` is dark text; add it as `--es-color-ink-50` primitive if you
prefer strict purity — acceptable either way, but prefer adding the primitive.)

- [ ] **Step 2: Verify and commit**

Run: `npm run lint && npm run build`
Expected: exit 0; build succeeds.

```bash
git add src/shared/config/theme.css
git commit -m "refactor: two-tier color tokens (primitives then semantic)"
```

---

## Task 2: Drive constants config

**Files:**
- Create: `src/shared/config/drive.ts`
- Modify: `src/shared/config/index.ts`

- [ ] **Step 1: Create `src/shared/config/drive.ts`**

```typescript
// Central Drive/OAuth constants. The OAuth client id is injected via the
// manifest (Task 8); these are the API surface constants used by the client.
export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
export const DRIVE_API = "https://www.googleapis.com/drive/v3";
export const DRIVE_UPLOAD = "https://www.googleapis.com/upload/drive/v3";
export const OAUTH_REVOKE = "https://oauth2.googleapis.com/revoke";
// Excalidraw scenes are stored as JSON with an .excalidraw name suffix.
export const DIAGRAM_MIME = "application/json";
export const DIAGRAM_EXT = ".excalidraw";
```

- [ ] **Step 2: Re-export from the config barrel**

Add to `src/shared/config/index.ts`: `export * from "./drive";`

- [ ] **Step 3: Verify and commit**

Run: `npm run lint && npm run knip && npm run compile`
Expected: exit 0. (If knip flags unused consts, they are consumed in Task 3+;
keep `src/shared/config/index.ts` in knip `entry` — already is.)

```bash
git add src/shared/config/drive.ts src/shared/config/index.ts
git commit -m "feat: add drive api constants"
```

---

## Task 3: driveFile entity — domain types

**Files:**
- Create: `src/entities/driveFile/model/types.ts`, `src/entities/driveFile/model/index.ts`
- Create: `src/entities/driveFile/index.ts`

- [ ] **Step 1: Create `src/entities/driveFile/model/types.ts`**

```typescript
// A Drive file as the app cares about it. headRevisionId drives the conflict
// guard; modifiedTime is shown in the panel.
export interface DriveFile {
  id: string;
  name: string;
  modifiedTime: string;
  headRevisionId: string;
}
```

- [ ] **Step 2: Barrels**

`src/entities/driveFile/model/index.ts`: `export * from "./types";`
`src/entities/driveFile/index.ts`: `export * from "./model";`

- [ ] **Step 3: Verify and commit**

Run: `npm run lint && npm run compile`
Expected: exit 0.

```bash
git add src/entities/driveFile
git commit -m "feat: add driveFile entity types"
```

---

## Task 4: driveFile entity — Drive REST client

**Files:**
- Create: `src/entities/driveFile/api/driveClient.ts`, `driveClient.test.ts`, `index.ts`
- Modify: `src/entities/driveFile/index.ts` (export api)
- Modify: `knip.json` (`entry`: `src/entities/driveFile/index.ts` if needed)

- [ ] **Step 1: Write the failing test `driveClient.test.ts`**

```typescript
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFile, listFolder, renameFile, updateFile } from "./driveClient";

const TOKEN = "tok123";

function mockFetch(body: unknown, ok = true, status = 200) {
  return vi.fn(
    async (_url: RequestInfo | URL, _init?: RequestInit) =>
      ({ ok, status, json: async () => body, text: async () => JSON.stringify(body) }) as Response,
  );
}

afterEach(() => vi.restoreAllMocks());

describe("listFolder", () => {
  it("requests the folder's files and maps them", async () => {
    const fetchMock = mockFetch({
      files: [{ id: "1", name: "a.excalidraw", modifiedTime: "t", headRevisionId: "r" }],
    });
    const files = await listFolder(TOKEN, "FOLDER", fetchMock);
    expect(files).toEqual([{ id: "1", name: "a.excalidraw", modifiedTime: "t", headRevisionId: "r" }]);
    const url = (fetchMock.mock.calls[0]?.[0] as string) ?? "";
    expect(url).toContain("'FOLDER'+in+parents");
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);
  });

  it("throws with status on failure", async () => {
    await expect(listFolder(TOKEN, "F", mockFetch({ error: "no" }, false, 403))).rejects.toThrow(/403/);
  });
});

describe("createFile", () => {
  it("multipart-uploads name+parents+content and returns metadata", async () => {
    const fetchMock = mockFetch({ id: "9", name: "n.excalidraw", modifiedTime: "t", headRevisionId: "r" });
    const meta = await createFile(TOKEN, "n.excalidraw", "FOLDER", "{\"x\":1}", fetchMock);
    expect(meta.id).toBe("9");
    const url = fetchMock.mock.calls[0]?.[0] as string;
    expect(url).toContain("/upload/drive/v3/files");
    expect(url).toContain("uploadType=multipart");
  });
});

describe("updateFile", () => {
  it("rejects on revision mismatch before writing", async () => {
    // getMeta returns a newer revision than the caller's prevRevision.
    const fetchMock = vi.fn(async (url: RequestInfo | URL) => {
      if (String(url).includes("fields=")) {
        return { ok: true, status: 200, json: async () => ({ id: "9", name: "n", modifiedTime: "t", headRevisionId: "rNEW" }) } as Response;
      }
      return { ok: true, status: 200, json: async () => ({}) } as Response;
    });
    await expect(updateFile(TOKEN, "9", "{}", "rOLD", fetchMock)).rejects.toThrow(/conflict/i);
  });

  it("writes when revision matches", async () => {
    // getMeta hits /drive/v3; the write hits /upload/drive/v3 — discriminate on that.
    const fetchMock = vi.fn(async (url: RequestInfo | URL) => {
      if (String(url).includes("/upload/")) {
        return { ok: true, status: 200, json: async () => ({ id: "9", name: "n", modifiedTime: "t2", headRevisionId: "rNEXT" }) } as Response;
      }
      return { ok: true, status: 200, json: async () => ({ id: "9", name: "n", modifiedTime: "t", headRevisionId: "rSAME" }) } as Response;
    });
    const meta = await updateFile(TOKEN, "9", "{}", "rSAME", fetchMock);
    expect(meta.headRevisionId).toBe("rNEXT");
  });
});

describe("renameFile", () => {
  it("PATCHes the name as JSON", async () => {
    const fetchMock = mockFetch({ id: "9", name: "new.excalidraw", modifiedTime: "t", headRevisionId: "r" });
    const meta = await renameFile(TOKEN, "9", "new.excalidraw", fetchMock);
    expect(meta.name).toBe("new.excalidraw");
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body as string)).toEqual({ name: "new.excalidraw" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/entities/driveFile/api/driveClient.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/entities/driveFile/api/driveClient.ts`**

```typescript
import { DRIVE_API, DRIVE_UPLOAD, DIAGRAM_MIME } from "@/shared/config";
import type { DriveFile } from "../model";

// fetch is injected so the client stays pure and unit-testable.
type Fetch = typeof fetch;

const FIELDS = "id,name,modifiedTime,headRevisionId";

function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

async function asJson<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`Drive request failed: ${res.status}`);
  return (await res.json()) as T;
}

export async function listFolder(token: string, folderId: string, f: Fetch = fetch): Promise<DriveFile[]> {
  const q = encodeURIComponent(`'${folderId}' in parents and trashed=false`)
    .replace(/%20/g, "+");
  const url = `${DRIVE_API}/files?q=${q}&fields=files(${FIELDS})&orderBy=modifiedTime desc`;
  const data = await asJson<{ files: DriveFile[] }>(await f(url, { headers: authHeaders(token) }));
  return data.files ?? [];
}

export async function getMeta(token: string, id: string, f: Fetch = fetch): Promise<DriveFile> {
  const url = `${DRIVE_API}/files/${id}?fields=${FIELDS}`;
  return asJson<DriveFile>(await f(url, { headers: authHeaders(token) }));
}

export async function getContent(token: string, id: string, f: Fetch = fetch): Promise<string> {
  const res = await f(`${DRIVE_API}/files/${id}?alt=media`, { headers: authHeaders(token) });
  if (!res.ok) throw new Error(`Drive content fetch failed: ${res.status}`);
  return res.text();
}

export async function createFile(
  token: string,
  name: string,
  folderId: string,
  content: string,
  f: Fetch = fetch,
): Promise<DriveFile> {
  const boundary = "es-boundary";
  const metadata = { name, parents: [folderId], mimeType: DIAGRAM_MIME };
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\nContent-Type: ${DIAGRAM_MIME}\r\n\r\n` +
    `${content}\r\n--${boundary}--`;
  const url = `${DRIVE_UPLOAD}/files?uploadType=multipart&fields=${FIELDS}`;
  const res = await f(url, {
    method: "POST",
    headers: { ...authHeaders(token), "Content-Type": `multipart/related; boundary=${boundary}` },
    body,
  });
  return asJson<DriveFile>(res);
}

export async function updateFile(
  token: string,
  id: string,
  content: string,
  prevRevision: string,
  f: Fetch = fetch,
): Promise<DriveFile> {
  // Conflict guard: refuse to overwrite if remote moved since we loaded it.
  const current = await getMeta(token, id, f);
  if (current.headRevisionId !== prevRevision) {
    throw new Error("conflict: remote revision changed");
  }
  const url = `${DRIVE_UPLOAD}/files/${id}?uploadType=media&fields=${FIELDS}`;
  const res = await f(url, {
    method: "PATCH",
    headers: { ...authHeaders(token), "Content-Type": DIAGRAM_MIME },
    body: content,
  });
  return asJson<DriveFile>(res);
}

export async function renameFile(token: string, id: string, name: string, f: Fetch = fetch): Promise<DriveFile> {
  const url = `${DRIVE_API}/files/${id}?fields=${FIELDS}`;
  const res = await f(url, {
    method: "PATCH",
    headers: { ...authHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  return asJson<DriveFile>(res);
}
```

- [ ] **Step 4: Barrels**

`src/entities/driveFile/api/index.ts`: `export * from "./driveClient";`
`src/entities/driveFile/index.ts`: add `export * from "./api";`

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/entities/driveFile/api/driveClient.test.ts`
Expected: PASS (all cases).

- [ ] **Step 6: Verify and commit**

Run: `npm run lint && npm run compile && npm run knip`
Expected: exit 0.

```bash
git add src/entities/driveFile knip.json
git commit -m "feat: add drive rest client with conflict guard"
```

---

## Task 5: auth feature — chrome.identity wrapper

**Files:**
- Create: `src/features/auth/api/authClient.ts`, `authClient.test.ts`, `index.ts`
- Create: `src/features/auth/index.ts`

- [ ] **Step 1: Write the failing test `authClient.test.ts`**

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getToken, signOut } from "./authClient";

const identity = {
  getAuthToken: vi.fn(),
  removeCachedAuthToken: vi.fn((_: unknown, cb: () => void) => cb()),
};

beforeEach(() => {
  (globalThis as unknown as { chrome: unknown }).chrome = { identity, runtime: {} };
  identity.getAuthToken.mockReset();
  identity.removeCachedAuthToken.mockClear();
});
afterEach(() => vi.restoreAllMocks());

describe("getToken", () => {
  it("resolves the token from chrome.identity", async () => {
    identity.getAuthToken.mockImplementation((_: unknown, cb: (t?: string) => void) => cb("TOK"));
    await expect(getToken(true)).resolves.toBe("TOK");
    expect(identity.getAuthToken).toHaveBeenCalledWith({ interactive: true }, expect.any(Function));
  });

  it("rejects when no token returned", async () => {
    (globalThis as unknown as { chrome: { runtime: { lastError?: { message: string } } } }).chrome.runtime.lastError = { message: "denied" };
    identity.getAuthToken.mockImplementation((_: unknown, cb: (t?: string) => void) => cb(undefined));
    await expect(getToken(true)).rejects.toThrow(/denied/);
  });
});

describe("signOut", () => {
  it("removes the cached token and revokes it", async () => {
    const f = vi.fn(async () => ({ ok: true }) as Response);
    await signOut("TOK", f);
    expect(identity.removeCachedAuthToken).toHaveBeenCalledWith({ token: "TOK" }, expect.any(Function));
    expect((f.mock.calls[0]?.[0] as string)).toContain("revoke?token=TOK");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/auth/api/authClient.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/features/auth/api/authClient.ts`**

```typescript
import { OAUTH_REVOKE } from "@/shared/config";

type Fetch = typeof fetch;

// Token never leaves the background worker. getAuthToken uses Chrome's signed-in
// account — no client secret. lastError is checked to surface user denial.
export function getToken(interactive: boolean): Promise<string> {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive }, (token) => {
      const err = chrome.runtime.lastError;
      if (err || !token) {
        reject(new Error(err?.message ?? "no auth token"));
        return;
      }
      resolve(token);
    });
  });
}

export function signOut(token: string, f: Fetch = fetch): Promise<void> {
  return new Promise((resolve) => {
    chrome.identity.removeCachedAuthToken({ token }, () => {
      // Best-effort revoke; resolve regardless so sign-out always completes.
      void f(`${OAUTH_REVOKE}?token=${token}`, { method: "POST" }).catch(() => undefined).finally(resolve);
    });
  });
}
```

- [ ] **Step 4: Barrels**

`src/features/auth/api/index.ts`: `export * from "./authClient";`
`src/features/auth/index.ts`: `export * from "./api";`

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/features/auth/api/authClient.test.ts`
Expected: PASS.

- [ ] **Step 6: Verify and commit**

Run: `npm run lint && npm run compile && npm run knip`
Expected: exit 0. (Add `src/features/auth/index.ts` to knip `entry` if flagged.)

```bash
git add src/features/auth knip.json
git commit -m "feat: add auth client wrapping chrome.identity"
```

---

## Task 6: Extend message contracts

**Files:**
- Modify: `src/shared/api/messages.ts`
- Modify: `src/shared/api/messages.test.ts`

- [ ] **Step 1: Add failing test for the new response payloads**

Append to `messages.test.ts`:

```typescript
import type { ConnectionStatus } from "./messages";

it("ConnectionStatus shape", () => {
  const s: ConnectionStatus = { connected: true, folderId: "F", folderName: "Diagrams" };
  expect(s.connected).toBe(true);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/shared/api/messages.test.ts`
Expected: FAIL — `ConnectionStatus` not exported.

- [ ] **Step 3: Extend `messages.ts`**

Add the `ConnectionStatus` type and ensure the `Request` union (from Plan 1)
covers `auth/status`, `auth/signIn`, `auth/signOut`, `drive/pickFolder`,
`drive/list`. Add:

```typescript
export interface ConnectionStatus {
  connected: boolean;
  folderId?: string;
  folderName?: string;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/shared/api/messages.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/shared/api/messages.ts src/shared/api/messages.test.ts
git commit -m "feat: add connection status message type"
```

---

## Task 7: Typed messaging client

**Files:**
- Create: `src/shared/api/sendMessage.ts`, `sendMessage.test.ts`
- Modify: `src/shared/api/index.ts`

- [ ] **Step 1: Write the failing test `sendMessage.test.ts`**

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendToBackground } from "./sendMessage";

const runtime = { sendMessage: vi.fn() };
beforeEach(() => {
  (globalThis as unknown as { chrome: unknown }).chrome = { runtime };
  runtime.sendMessage.mockReset();
});
afterEach(() => vi.restoreAllMocks());

describe("sendToBackground", () => {
  it("resolves data on ok response", async () => {
    runtime.sendMessage.mockResolvedValue({ ok: true, data: { connected: false } });
    await expect(sendToBackground({ type: "auth/status" })).resolves.toEqual({ connected: false });
  });

  it("throws on error response", async () => {
    runtime.sendMessage.mockResolvedValue({ ok: false, error: "nope" });
    await expect(sendToBackground({ type: "auth/status" })).rejects.toThrow("nope");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/shared/api/sendMessage.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/shared/api/sendMessage.ts`**

```typescript
import { isErrorResponse, type Request, type Response } from "./messages";

// Thin typed wrapper around chrome.runtime.sendMessage used by popup + content
// script. Throws on error responses so callers use try/catch.
export async function sendToBackground<T>(request: Request): Promise<T> {
  const res = (await chrome.runtime.sendMessage(request)) as Response<T>;
  if (isErrorResponse(res)) throw new Error(res.error);
  return res.data;
}
```

- [ ] **Step 4: Re-export + run**

Add to `src/shared/api/index.ts`: `export * from "./sendMessage";`
Run: `npx vitest run src/shared/api/sendMessage.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/shared/api
git commit -m "feat: add typed background messaging client"
```

---

## Task 8: OAuth + Picker manifest config

**Files:**
- Modify: `wxt.config.ts`
- Modify: `docs/development.md`, `docs/security.md`

- [x] **Step 1: Add oauth2 + CSP to `wxt.config.ts`**

```typescript
import { defineConfig } from "wxt";

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  manifest: {
    name: "Excalistore",
    description: "Store and autosave Excalidraw diagrams in Google Drive.",
    permissions: ["identity", "storage"],
    host_permissions: ["https://excalidraw.com/*", "https://www.googleapis.com/*"],
    oauth2: {
      // Replace with your Google Cloud OAuth client id (type: Chrome extension).
      client_id: import.meta.env.WXT_OAUTH_CLIENT_ID ?? "REPLACE_WITH_OAUTH_CLIENT_ID",
      scopes: ["https://www.googleapis.com/auth/drive.file"],
    },
    // Single sanctioned remote-script exception: Google Picker (first-party).
    content_security_policy: {
      extension_pages:
        "script-src 'self' https://apis.google.com; object-src 'self'; frame-src https://docs.google.com https://accounts.google.com;",
    },
  },
});
```

- [x] **Step 2: Document setup in `docs/development.md`**

Under the existing "Google OAuth" section, add: create OAuth client (type Chrome
extension) bound to the unpacked extension ID; enable Drive API + Picker API;
create an API key for Picker; set `WXT_OAUTH_CLIENT_ID` (and a Picker API key env
`WXT_PICKER_API_KEY`) in a local `.env` (gitignored). Note the extension ID is
shown at `chrome://extensions` after loading unpacked.

- [x] **Step 3: Document the CSP exception in `docs/security.md`**

Add a subsection "Picker CSP exception" explaining the `apis.google.com`
`script-src` allowance is the single remote-code exception, why it's required
(`drive.file` can't list Drive), and that the token only reaches Picker in the
popup, never the content script.

- [x] **Step 4: Verify build + commit**

Run: `npm run build`
Expected: build succeeds with the new manifest (placeholder client id is fine
for building; real id needed only at runtime for sign-in).

```bash
git add wxt.config.ts docs/development.md docs/security.md
git commit -m "feat: add oauth2 manifest config and scoped picker csp"
```

Also add `.env` to `.gitignore` if not already ignored (it is via `*.log`? no —
add an explicit `.env` line). Commit that with the same change if needed.

---

## Task 9: Google Picker wrapper

**Files:**
- Create: `src/features/pickFolder/lib/picker.ts`, `index.ts`
- Create: `src/features/pickFolder/index.ts`

**Note:** This wraps the remote Picker API; it is integration code verified
manually (Task 12), not unit-tested (loading `gapi` in jsdom isn't meaningful).
Keep it thin so the untested surface is minimal.

- [ ] **Step 1: Write `src/features/pickFolder/lib/picker.ts`**

```typescript
// Thin Google Picker wrapper. Loads gapi (first-party, CSP-allowed), shows a
// folder-only picker, resolves the chosen folder. Runs in the popup, where it
// is handed the OAuth token for the picker session only.
interface PickedFolder {
  id: string;
  name: string;
}

const GAPI_SRC = "https://apis.google.com/js/api.js";

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const el = document.createElement("script");
    el.src = src;
    el.onload = () => resolve();
    el.onerror = () => reject(new Error(`failed to load ${src}`));
    document.head.appendChild(el);
  });
}

export async function pickFolder(token: string, apiKey: string, appId: string): Promise<PickedFolder | null> {
  await loadScript(GAPI_SRC);
  await new Promise<void>((resolve) => google.picker ? resolve() : gapi.load("picker", { callback: () => resolve() }));

  return new Promise<PickedFolder | null>((resolve) => {
    const view = new google.picker.DocsView(google.picker.ViewId.FOLDERS)
      .setSelectFolderEnabled(true)
      .setMimeTypes("application/vnd.google-apps.folder");
    const picker = new google.picker.PickerBuilder()
      .addView(view)
      .setOAuthToken(token)
      .setDeveloperKey(apiKey)
      .setAppId(appId)
      .setCallback((data: google.picker.ResponseObject) => {
        if (data.action === google.picker.Action.PICKED) {
          const doc = data.docs?.[0];
          resolve(doc ? { id: doc.id, name: doc.name } : null);
        } else if (data.action === google.picker.Action.CANCEL) {
          resolve(null);
        }
      })
      .build();
    picker.setVisible(true);
  });
}
```

- [ ] **Step 2: Add Picker types**

Install types: `npm install -D @types/google.picker @types/gapi`
(If those packages are unavailable, add a minimal `src/features/pickFolder/lib/gapi.d.ts`
declaring the `gapi`/`google.picker` globals you use — declare `gapi.load`,
`google.picker.DocsView`, `PickerBuilder`, `ViewId`, `Action`, `ResponseObject`.)

- [ ] **Step 3: Barrels**

`src/features/pickFolder/lib/index.ts`: `export * from "./picker";`
`src/features/pickFolder/index.ts`: `export * from "./lib";`

- [ ] **Step 4: Verify and commit**

Run: `npm run lint && npm run compile && npm run knip && npm run build`
Expected: exit 0. (Add `src/features/pickFolder/index.ts` to knip `entry` if
flagged — it's consumed by the popup in Task 11.)

```bash
git add src/features/pickFolder knip.json package.json package-lock.json
git commit -m "feat: add google picker folder selection wrapper"
```

---

## Task 10: Background gateway

**Files:**
- Create: `src/features/driveGateway/lib/handleMessage.ts`, `handleMessage.test.ts`, `index.ts`
- Create: `src/features/driveGateway/index.ts`
- Modify: `entrypoints/background.ts`

The gateway logic is a pure function over injected dependencies so it is unit
testable; `background.ts` only wires `chrome.runtime.onMessage` + `chrome.storage`
to it.

- [ ] **Step 1: Write the failing test `handleMessage.test.ts`**

```typescript
import { describe, expect, it, vi } from "vitest";
import { handleMessage } from "./handleMessage";
import type { GatewayDeps } from "./handleMessage";

function deps(over: Partial<GatewayDeps> = {}): GatewayDeps {
  return {
    getToken: vi.fn(async () => "TOK"),
    signOut: vi.fn(async () => undefined),
    listFolder: vi.fn(async () => [{ id: "1", name: "a", modifiedTime: "t", headRevisionId: "r" }]),
    getStore: vi.fn(async () => ({ connected: true, folderId: "F", folderName: "Diagrams" })),
    setStore: vi.fn(async () => undefined),
    ...over,
  };
}

describe("handleMessage", () => {
  it("auth/status returns stored connection", async () => {
    const res = await handleMessage({ type: "auth/status" }, deps());
    expect(res).toEqual({ ok: true, data: { connected: true, folderId: "F", folderName: "Diagrams" } });
  });

  it("drive/list uses token + stored folder", async () => {
    const d = deps();
    const res = await handleMessage({ type: "drive/list" }, d);
    expect(d.getToken).toHaveBeenCalled();
    expect(d.listFolder).toHaveBeenCalledWith("TOK", "F");
    expect(res).toEqual({ ok: true, data: [{ id: "1", name: "a", modifiedTime: "t", headRevisionId: "r" }] });
  });

  it("drive/list errors when not connected", async () => {
    const d = deps({ getStore: vi.fn(async () => ({ connected: false })) });
    const res = await handleMessage({ type: "drive/list" }, d);
    expect(res).toEqual({ ok: false, error: expect.stringMatching(/not connected/i), code: "unknown" });
  });

  it("auth/signOut clears the store", async () => {
    const d = deps();
    const res = await handleMessage({ type: "auth/signOut" }, d);
    expect(d.signOut).toHaveBeenCalled();
    expect(d.setStore).toHaveBeenCalledWith({ connected: false });
    expect(res).toEqual({ ok: true, data: { connected: false } });
  });

  it("maps conflict errors to code conflict", async () => {
    const d = deps({ listFolder: vi.fn(async () => { throw new Error("conflict: x"); }) });
    const res = await handleMessage({ type: "drive/list" }, d);
    expect(res).toEqual({ ok: false, error: "conflict: x", code: "conflict" });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/features/driveGateway/lib/handleMessage.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/features/driveGateway/lib/handleMessage.ts`**

```typescript
import type { ConnectionStatus, Request, Response } from "@/shared/api";
import type { DriveFile } from "@/entities/driveFile";

// Dependencies injected so the router is pure and testable. background.ts
// supplies the real implementations.
export interface GatewayDeps {
  getToken: (interactive: boolean) => Promise<string>;
  signOut: (token: string) => Promise<void>;
  listFolder: (token: string, folderId: string) => Promise<DriveFile[]>;
  getStore: () => Promise<ConnectionStatus>;
  setStore: (s: ConnectionStatus) => Promise<void>;
}

function err(message: string): Extract<Response<never>, { ok: false }> {
  const code = /conflict/i.test(message) ? "conflict" : /unauthor|401/i.test(message) ? "unauthorized" : "unknown";
  return { ok: false, error: message, code };
}

export async function handleMessage(req: Request, deps: GatewayDeps): Promise<Response<unknown>> {
  try {
    switch (req.type) {
      case "auth/status":
        return { ok: true, data: await deps.getStore() };

      case "auth/signOut": {
        const token = await deps.getToken(false).catch(() => "");
        if (token) await deps.signOut(token);
        const next: ConnectionStatus = { connected: false };
        await deps.setStore(next);
        return { ok: true, data: next };
      }

      case "drive/list": {
        const store = await deps.getStore();
        if (!store.connected || !store.folderId) return err("not connected");
        const token = await deps.getToken(false);
        return { ok: true, data: await deps.listFolder(token, store.folderId) };
      }

      default:
        return err(`unhandled request: ${(req as { type: string }).type}`);
    }
  } catch (e) {
    return err((e as Error).message);
  }
}
```

(Note: `auth/signIn` and `drive/pickFolder` complete in the popup, which holds
the token for Picker, then persists the chosen folder via a `setStore` message;
add those cases when wiring Task 11 if you route them through the gateway. For
v1 the popup may call auth/pick directly and only persist via the gateway.)

- [ ] **Step 4: Barrels + run**

`src/features/driveGateway/lib/index.ts`: `export * from "./handleMessage";`
`src/features/driveGateway/index.ts`: `export * from "./lib";`
Run: `npx vitest run src/features/driveGateway/lib/handleMessage.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire `entrypoints/background.ts`**

```typescript
import { handleMessage, type GatewayDeps } from "@/features/driveGateway";
import { getToken, signOut } from "@/features/auth";
import { listFolder } from "@/entities/driveFile";
import type { ConnectionStatus, Request } from "@/shared/api";

const STORE_KEY = "connection";

const deps: GatewayDeps = {
  getToken,
  signOut,
  listFolder,
  getStore: async () => ((await chrome.storage.local.get(STORE_KEY))[STORE_KEY] as ConnectionStatus) ?? { connected: false },
  setStore: async (s) => chrome.storage.local.set({ [STORE_KEY]: s }),
};

export default defineBackground(() => {
  chrome.runtime.onMessage.addListener((req: Request, _sender, sendResponse) => {
    handleMessage(req, deps).then(sendResponse);
    return true; // async response
  });
});
```

- [ ] **Step 6: Verify and commit**

Run: `npm run lint && npm run compile && npm run knip && npm test && npm run build`
Expected: exit 0; gateway tests pass.

```bash
git add src/features/driveGateway entrypoints/background.ts knip.json
git commit -m "feat: add background gateway routing typed messages to drive/auth"
```

---

## Task 11: Popup connect widget

**Files:**
- Create: `src/widgets/popupConnect/PopupConnect/PopupConnect.tsx`, `.module.css`, `.test.tsx`, `index.ts`
- Create: `src/widgets/popupConnect/index.ts`
- Modify: `entrypoints/popup/App.tsx`

- [ ] **Step 1: Write the failing test `PopupConnect.test.tsx`**

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PopupConnect } from "./PopupConnect";

describe("PopupConnect", () => {
  it("shows connect button when disconnected", () => {
    render(<PopupConnect status={{ connected: false }} onConnect={vi.fn()} onSignOut={vi.fn()} />);
    expect(screen.getByRole("button", { name: /connect/i })).toBeInTheDocument();
  });

  it("shows folder + sign out when connected", async () => {
    const onSignOut = vi.fn();
    render(
      <PopupConnect
        status={{ connected: true, folderId: "F", folderName: "Diagrams" }}
        onConnect={vi.fn()}
        onSignOut={onSignOut}
      />,
    );
    expect(screen.getByText("Diagrams")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /sign out/i }));
    expect(onSignOut).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/widgets/popupConnect/PopupConnect/PopupConnect.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `PopupConnect.tsx`** (presentational; state/effects live in App)

```tsx
import { Button } from "@/shared/ui";
import type { ConnectionStatus } from "@/shared/api";
import styles from "./PopupConnect.module.css";

interface Props {
  status: ConnectionStatus;
  onConnect: () => void;
  onSignOut: () => void;
}

export function PopupConnect({ status, onConnect, onSignOut }: Props) {
  return (
    <main className={styles.root}>
      <h1 className={styles.title}>Excalistore</h1>
      {status.connected ? (
        <>
          <p className={styles.folder}>
            Folder: <strong>{status.folderName ?? status.folderId}</strong>
          </p>
          <Button variant="secondary" onClick={onSignOut}>
            Sign out
          </Button>
        </>
      ) : (
        <Button onClick={onConnect}>Connect Google Drive</Button>
      )}
    </main>
  );
}
```

- [ ] **Step 4: Write `PopupConnect.module.css`**

```css
.root {
  width: 280px;
  padding: 16px;
  background: var(--es-bg);
  color: var(--es-text);
  font: 14px/1.4 system-ui, sans-serif;
}
.title {
  margin: 0 0 12px;
  font-size: 16px;
}
.folder {
  margin: 0 0 12px;
  color: var(--es-muted);
}
```

- [ ] **Step 5: Barrels**

`src/widgets/popupConnect/PopupConnect/index.ts`: `export { PopupConnect } from "./PopupConnect";`
`src/widgets/popupConnect/index.ts`: `export * from "./PopupConnect";`

- [ ] **Step 6: Run component test to verify it passes**

Run: `npx vitest run src/widgets/popupConnect/PopupConnect/PopupConnect.test.tsx`
Expected: PASS.

- [ ] **Step 7: Wire `entrypoints/popup/App.tsx`**

```tsx
import { useEffect, useState } from "react";
import { PopupConnect } from "@/widgets/popupConnect";
import { sendToBackground } from "@/shared/api";
import type { ConnectionStatus } from "@/shared/api";
import { getToken } from "@/features/auth";
import { pickFolder } from "@/features/pickFolder";

export function App() {
  const [status, setStatus] = useState<ConnectionStatus>({ connected: false });

  useEffect(() => {
    sendToBackground<ConnectionStatus>({ type: "auth/status" }).then(setStatus).catch(() => undefined);
  }, []);

  async function onConnect() {
    // Sign in + pick folder happen in the popup (Picker needs the token here),
    // then persistence is delegated to the background gateway.
    const token = await getToken(true);
    const apiKey = import.meta.env.WXT_PICKER_API_KEY ?? "";
    const appId = (import.meta.env.WXT_OAUTH_CLIENT_ID ?? "").split("-")[0] ?? "";
    const folder = await pickFolder(token, apiKey, appId);
    if (!folder) return;
    const next: ConnectionStatus = { connected: true, folderId: folder.id, folderName: folder.name };
    await sendToBackground({ type: "drive/setConnection", status: next } as never);
    setStatus(next);
  }

  async function onSignOut() {
    const next = await sendToBackground<ConnectionStatus>({ type: "auth/signOut" });
    setStatus(next);
  }

  return <PopupConnect status={status} onConnect={onConnect} onSignOut={onSignOut} />;
}
```

**Note:** add a `drive/setConnection` case to `Request` (in `messages.ts`) and to
the gateway (`handleMessage` → `deps.setStore(req.status)` → return it). Update
the gateway test with a case for it. This keeps all persistence in the gateway.

- [ ] **Step 8: Add `drive/setConnection` to messages + gateway**

- Add to `Request` union: `| { type: "drive/setConnection"; status: ConnectionStatus }`.
- Add a `handleMessage` case: `case "drive/setConnection": await deps.setStore(req.status); return { ok: true, data: req.status };`
- Add a gateway test asserting it calls `setStore` and echoes the status.

- [ ] **Step 9: Verify and commit**

Run: `npm run lint && npm run compile && npm run knip && npm test && npm run build`
Expected: exit 0; all tests pass.

```bash
git add src/widgets src/shared/api src/features/driveGateway entrypoints/popup/App.tsx knip.json
git commit -m "feat: add popup connect ui with sign-in, picker, sign-out"
```

---

## Task 12: Manual verification + docs

**Files:**
- Modify: `docs/features.md`, `docs/development.md`

- [ ] **Step 1: Manual E2E (requires real Google Cloud client)**

With `WXT_OAUTH_CLIENT_ID` + `WXT_PICKER_API_KEY` set in `.env`:
1. `npm run build`, load unpacked `.output/chrome-mv3`.
2. Open the popup → "Connect Google Drive" → Google sign-in → Picker opens →
   choose a folder → popup shows the folder name.
3. Reopen popup → still connected (status persisted).
4. In Drive, add a `.excalidraw` file to that folder → (verified in Plan 3's panel;
   for now confirm `drive/list` returns it via the background console).
5. "Sign out" → popup returns to the connect state.

Record results in `docs/development.md` "Manual E2E checklist".

- [ ] **Step 2: Update `docs/features.md`**

Move "Connect Google Drive (OAuth, sign-in/out)" and "Browse folder file list
(background)" into "Shipped" with short behavior notes. Leave open-diagram /
create / rename / autosave under "Next to pick up" (Plan 3).

- [ ] **Step 3: Update `docs/architecture.md`**

Add `entities/driveFile`, `features/{auth,pickFolder,driveGateway}`,
`widgets/popupConnect` to the FSD layout, and note the message flow
popup → gateway → auth/drive.

- [ ] **Step 4: Commit**

```bash
git add docs/features.md docs/development.md docs/architecture.md
git commit -m "docs: record drive-core features, architecture, manual e2e"
```

---

## Self-Review

- **Spec coverage (Plan 2 portion):** OAuth sign-in/out (`features/auth`,
  gateway `auth/*`) ✓; `drive.file` scope + minimal manifest ✓; Drive REST client
  with conflict guard (`driveClient`) ✓; folder selection via Picker + scoped CSP
  ✓; background-only token + gateway message routing ✓; popup connect UI ✓;
  persisted connection state ✓. Scene-bridge / panel / autosave / full sign-out
  flush+clear are Plan 3.
- **Placeholders:** none — all modules have complete code. The OAuth client id /
  Picker API key are runtime secrets (env), not code placeholders, and are
  documented for the user to supply.
- **Type consistency:** `DriveFile`, `ConnectionStatus`, `Request`, `Response<T>`,
  `GatewayDeps` defined once and reused; `listFolder/getMeta/getContent/createFile/
  updateFile/renameFile`, `getToken/signOut`, `sendToBackground`, `handleMessage`,
  `pickFolder` names consistent across tasks.
- **Known follow-ups for Plan 3:** involuntary-logout (401 → reconnect) handling
  in `sendToBackground`/gateway; the safe sign-out flush+clear (needs scene-bridge).
```
