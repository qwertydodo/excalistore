# Review Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix every issue found in the 2026-06-18 codebase review — security, correctness, and cleanup — and delete dead code.

**Architecture:** Work bottom-up: remove dead surface first (smaller attack/maintenance surface), then harden the security boundary (background message routing, Drive query escaping), then make the Drive client robust (random multipart boundary, fetch timeouts, structured error classification, pagination), then fix scene/storage integrity and the autosave + UI error paths, then small hardening, then docs. Each task is an isolated commit with tests where the unit is testable.

**Tech Stack:** WXT, React 19, TypeScript (strict), Vitest, idb-keyval, zod, Biome. Background service worker holds all Drive/auth access; content script + popup talk to it via typed `sendToBackground`.

**Conventions reminder:** FSD layers `shared → entities → features → widgets`, downward imports only; `entrypoints/` is the composition root. Module files camelCase, components PascalCase. Tests colocated. CSS Modules referencing `var(--es-*)`. Conventional Commits.

**Per-task gate:** every task ends green on:
```
npx tsc --noEmit && npx biome check . && npx vitest run && npx knip
```

---

## Phase A — Delete dead code

### Task 1: Remove the dead `drive/setConnection` and `auth/signIn` message types

Both are unreachable from app code. `drive/setConnection` is a live, unvalidated state-overwrite handler reachable only by tests/old plans (security finding #2). `auth/signIn` is in the `Request` union with no handler (falls to `default` → error).

**Files:**
- Modify: `src/shared/api/messages.ts:18-28`
- Modify: `src/features/driveGateway/lib/handleMessage.ts:59-61`
- Modify: `src/features/driveGateway/lib/handleMessage.test.ts:77-83`

- [ ] **Step 1: Edit the `Request` union** — `src/shared/api/messages.ts`, remove the `auth/signIn` and `drive/setConnection` members:

```ts
export type Request =
  | { type: "auth/status" }
  | { type: "auth/signOut" }
  | { type: "drive/connect"; folderName: string }
  | { type: "drive/list" }
  | { type: "drive/get"; id: string }
  | { type: "drive/create"; name: string; content: string }
  | { type: "drive/update"; id: string; content: string; prevRevision: string }
  | { type: "drive/rename"; id: string; name: string };
```

- [ ] **Step 2: Remove the gateway case** — in `src/features/driveGateway/lib/handleMessage.ts`, delete these three lines:

```ts
      case "drive/setConnection":
        await deps.setStore(req.status);
        return { ok: true, data: req.status };
```

- [ ] **Step 3: Delete the obsolete test** — in `handleMessage.test.ts`, delete the entire `it("drive/setConnection stores and echoes the status", ...)` block (lines 77-83).

- [ ] **Step 4: Run the gate**

Run: `npx tsc --noEmit && npx vitest run src/features/driveGateway && npx knip`
Expected: PASS, no type errors (TypeScript proves no remaining sender of either message).

- [ ] **Step 5: Commit**

```bash
git add src/shared/api/messages.ts src/features/driveGateway/lib/handleMessage.ts src/features/driveGateway/lib/handleMessage.test.ts
git commit -m "refactor: drop dead drive/setConnection and auth/signIn message types"
```

---

### Task 2: Delete the unused `IconButton` component

Zero consumers anywhere in `src/` or `entrypoints/`; no test.

**Files:**
- Delete: `src/shared/ui/IconButton/` (whole folder: `IconButton.tsx`, `IconButton.module.css`, `index.ts`)
- Modify: `src/shared/ui/index.ts:5`

- [ ] **Step 1: Verify it is unused** —

Run: `npx grep -rn "IconButton" src entrypoints` *(or use ripgrep)*
Expected: matches only inside `src/shared/ui/IconButton/*` and the one re-export line `src/shared/ui/index.ts:5`. If anything else references it, STOP and reassess.

- [ ] **Step 2: Delete the folder**

```bash
git rm -r src/shared/ui/IconButton
```

- [ ] **Step 3: Remove the barrel re-export** — in `src/shared/ui/index.ts`, delete the line:

```ts
export { IconButton } from "./IconButton";
```

- [ ] **Step 4: Run the gate**

Run: `npx tsc --noEmit && npx biome check . && npx vitest run && npx knip`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/shared/ui/index.ts
git commit -m "refactor: remove unused IconButton component"
```

---

### Task 3: Remove leftover picker type packages and the unused `DRIVE_SCOPE` constant

The Google Picker feature was removed (commit `569d64f`); its `@types/gapi` / `@types/google.picker` dev-deps and tsconfig `types` entries are dead. `DRIVE_SCOPE` in `drive.ts` has no consumer (the scope lives in the manifest). Also delete the leftover `WXT_PICKER_API_KEY` line from the local (untracked, gitignored) `.env`.

**Files:**
- Modify: `package.json:35-36`
- Modify: `tsconfig.json:12`
- Modify: `src/shared/config/drive.ts:3`
- Modify: `.env` (local only — not tracked)

- [ ] **Step 1: Confirm `DRIVE_SCOPE` is unused**

Run: `npx grep -rn "DRIVE_SCOPE" src entrypoints`
Expected: only its definition in `src/shared/config/drive.ts:3`. (If used, keep it and skip the drive.ts edit.)

- [ ] **Step 2: Remove the constant** — in `src/shared/config/drive.ts`, delete:

```ts
export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
```

- [ ] **Step 3: Drop the picker type packages**

```bash
npm uninstall @types/gapi @types/google.picker
```

- [ ] **Step 4: Remove them from `tsconfig.json`** — change line 12 from:

```json
    "types": ["vitest/globals", "@testing-library/jest-dom", "chrome", "gapi", "google.picker"],
```
to:
```json
    "types": ["vitest/globals", "@testing-library/jest-dom", "chrome"],
```

- [ ] **Step 5: Scrub the local `.env`** — open `.env` and delete the `WXT_PICKER_API_KEY=...` line. Rotate/revoke that key in Google Cloud Console separately (it is a live credential). This file is gitignored, so it is not part of the commit — note it in the commit body only.

- [ ] **Step 6: Run the gate**

Run: `npx tsc --noEmit && npx vitest run && npx knip`
Expected: PASS (tsc still resolves `chrome` types; no `gapi`/`google.picker` references remain).

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json tsconfig.json src/shared/config/drive.ts
git commit -m "chore: remove dead picker type deps and unused DRIVE_SCOPE

Local .env WXT_PICKER_API_KEY also removed (untracked); rotate the key."
```

---

## Phase B — Security boundary

### Task 4: Validate message sender in the background listener

`chrome.runtime.onMessage` currently routes any message regardless of origin (finding #1). Add an allowlist: same extension id, and a URL that is either the popup page or `https://excalidraw.com/*`. Extract a pure helper so it is unit-testable.

**Files:**
- Create: `src/features/driveGateway/lib/isAllowedSender.ts`
- Create: `src/features/driveGateway/lib/isAllowedSender.test.ts`
- Modify: `src/features/driveGateway/lib/index.ts`
- Modify: `entrypoints/background.ts:37-42`

- [ ] **Step 1: Write the failing test** — `src/features/driveGateway/lib/isAllowedSender.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isAllowedSender } from "./isAllowedSender";

const opts = {
  extensionId: "abc123",
  popupUrl: "chrome-extension://abc123/popup.html",
};

describe("isAllowedSender", () => {
  it("accepts the extension's own popup page", () => {
    expect(isAllowedSender({ id: "abc123", url: "chrome-extension://abc123/popup.html" }, opts)).toBe(
      true,
    );
  });

  it("accepts the excalidraw.com content script", () => {
    expect(isAllowedSender({ id: "abc123", url: "https://excalidraw.com/" }, opts)).toBe(true);
  });

  it("rejects a different extension id", () => {
    expect(isAllowedSender({ id: "evil", url: "https://excalidraw.com/" }, opts)).toBe(false);
  });

  it("rejects an unknown origin", () => {
    expect(isAllowedSender({ id: "abc123", url: "https://evil.example/" }, opts)).toBe(false);
  });

  it("rejects a missing url", () => {
    expect(isAllowedSender({ id: "abc123" }, opts)).toBe(false);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/features/driveGateway/lib/isAllowedSender.test.ts`
Expected: FAIL — `isAllowedSender` not found.

- [ ] **Step 3: Implement** — `src/features/driveGateway/lib/isAllowedSender.ts`:

```ts
// Trust boundary: the background worker only acts on messages from the
// extension's own popup page or a content script running on excalidraw.com.
const EXCALIDRAW_ORIGIN = "https://excalidraw.com/";

export interface SenderLike {
  id?: string;
  url?: string;
}

export interface SenderOpts {
  extensionId: string;
  popupUrl: string;
}

export function isAllowedSender(sender: SenderLike, opts: SenderOpts): boolean {
  if (sender.id !== opts.extensionId) return false;
  const url = sender.url ?? "";
  return url.startsWith(EXCALIDRAW_ORIGIN) || url.startsWith(opts.popupUrl);
}
```

- [ ] **Step 4: Export it** — add to `src/features/driveGateway/lib/index.ts` (keep existing exports):

```ts
export { isAllowedSender } from "./isAllowedSender";
```

Confirm the slice barrel `src/features/driveGateway/index.ts` re-exports the lib barrel (it already exposes `handleMessage`/`GatewayDeps`); add `isAllowedSender` there too if it lists names explicitly.

- [ ] **Step 5: Wire the listener** — replace `entrypoints/background.ts` `defineBackground` block with:

```ts
export default defineBackground(() => {
  const popupUrl = chrome.runtime.getURL("popup.html");
  chrome.runtime.onMessage.addListener((req: Request, sender, sendResponse) => {
    if (!isAllowedSender(sender, { extensionId: chrome.runtime.id, popupUrl })) {
      sendResponse({ ok: false, error: "forbidden sender", code: "unknown" });
      return false;
    }
    handleMessage(req, deps)
      .then(sendResponse)
      .catch((e: unknown) =>
        sendResponse({ ok: false, error: (e as Error).message, code: "unknown" }),
      );
    return true; // async response
  });
});
```

Add `isAllowedSender` to the existing import from `@/features/driveGateway` at the top of `background.ts`. (This step also closes finding #24 — the `.catch` backstop.)

- [ ] **Step 6: Run the gate**

Run: `npx tsc --noEmit && npx vitest run && npx knip`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/features/driveGateway entrypoints/background.ts
git commit -m "feat(security): validate message sender in background listener"
```

---

### Task 5: Harden Drive query string escaping

`findOrCreateFolder` escapes `'` but not `\` (a name ending in an odd number of backslashes breaks out of the quoted literal); `listFolder`'s `folderId` is interpolated unescaped (finding from security agent, low risk but correct to fix).

**Files:**
- Modify: `src/entities/driveFile/api/driveClient.ts:18-27, 99-113`
- Modify: `src/entities/driveFile/api/driveClient.test.ts` (extend the escaping test)

- [ ] **Step 1: Add a failing test** — append to the `findOrCreateFolder` describe block in `driveClient.test.ts`:

```ts
  it("escapes backslashes before quotes in the folder name query", async () => {
    const fetchMock = vi.fn(async (url: RequestInfo | URL) => {
      const u = decodeURIComponent(String(url));
      // a trailing backslash must be doubled so it can't escape the closing quote
      expect(u).toContain("back\\\\slash");
      return { ok: true, status: 200, json: async () => ({ files: [] }) } as Response;
    });
    await findOrCreateFolder(TOKEN, "back\\slash", fetchMock);
  });
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/entities/driveFile/api/driveClient.test.ts -t "escapes backslashes"`
Expected: FAIL — backslash not doubled.

- [ ] **Step 3: Implement** — in `driveClient.ts`, add a shared escaper and use it in both query builders:

```ts
// Drive query strings wrap values in single quotes; escape backslash first,
// then the quote, so a value can't break out of the quoted literal.
function escapeQueryValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}
```

In `listFolder`, change the `q` line to use it:

```ts
  const q = encodeURIComponent(
    `'${escapeQueryValue(folderId)}' in parents and trashed=false`,
  ).replace(/%20/g, "+");
```

In `findOrCreateFolder`, replace the `safe` line and the `q` builder:

```ts
  const safe = escapeQueryValue(name);
  const q = encodeURIComponent(
    `mimeType='${FOLDER_MIME}' and name='${safe}' and trashed=false`,
  ).replace(/%20/g, "+");
```

- [ ] **Step 4: Run the gate**

Run: `npx vitest run src/entities/driveFile/api/driveClient.test.ts`
Expected: PASS — including the existing "escapes single quotes" test (still asserts `Bob\'s`).

- [ ] **Step 5: Commit**

```bash
git add src/entities/driveFile/api/driveClient.ts src/entities/driveFile/api/driveClient.test.ts
git commit -m "fix(security): escape backslashes in Drive query values"
```

---

## Phase C — Drive client robustness

### Task 6: Use a random, collision-proof multipart boundary in `createFile`

A fixed `es-boundary` string lets user `.excalidraw` content that contains `--es-boundary` corrupt or inject the multipart upload body (finding #3).

**Files:**
- Modify: `src/entities/driveFile/api/driveClient.ts:40-61`
- Modify: `src/entities/driveFile/api/driveClient.test.ts` (createFile describe)

- [ ] **Step 1: Write a failing test** — replace/extend the `createFile` describe block:

```ts
describe("createFile", () => {
  it("multipart-uploads name+parents+content and returns metadata", async () => {
    const fetchMock = mockFetch({
      id: "9",
      name: "n.excalidraw",
      modifiedTime: "t",
      headRevisionId: "r",
    });
    const meta = await createFile(TOKEN, "n.excalidraw", "FOLDER", '{"x":1}', fetchMock);
    expect(meta.id).toBe("9");
    const url = fetchMock.mock.calls[0]?.[0] as string;
    expect(url).toContain("/upload/drive/v3/files");
    expect(url).toContain("uploadType=multipart");
  });

  it("uses a boundary that does not collide with the content body", async () => {
    let capturedBody = "";
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      capturedBody = init?.body as string;
      const ct = (init?.headers as Record<string, string>)["Content-Type"] ?? "";
      const boundary = ct.match(/boundary=(.+)$/)?.[1] ?? "";
      // the chosen boundary must not appear inside the user content
      expect(boundary).not.toBe("");
      expect(content.includes(boundary)).toBe(false);
      return {
        ok: true,
        status: 200,
        json: async () => ({ id: "9", name: "n", modifiedTime: "t", headRevisionId: "r" }),
      } as Response;
    });
    // content deliberately contains the OLD fixed boundary token
    const content = '{"note":"--es-boundary--"}';
    await createFile(TOKEN, "n.excalidraw", "F", content, fetchMock);
    expect(capturedBody).toContain(content);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/entities/driveFile/api/driveClient.test.ts -t "does not collide"`
Expected: FAIL — fixed `es-boundary` collides with content.

- [ ] **Step 3: Implement** — in `createFile`, generate a random boundary:

```ts
export async function createFile(
  token: string,
  name: string,
  folderId: string,
  content: string,
  f: Fetch = fetch,
): Promise<DriveFile> {
  const boundary = `es-${crypto.randomUUID()}`;
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
```

`crypto.randomUUID()` is available in the MV3 service worker and in jsdom (Vitest). A v4 UUID cannot appear in attacker content by guessing, so collision is not feasible.

- [ ] **Step 4: Run the gate**

Run: `npx vitest run src/entities/driveFile/api/driveClient.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/entities/driveFile/api/driveClient.ts src/entities/driveFile/api/driveClient.test.ts
git commit -m "fix: use random multipart boundary to prevent upload corruption"
```

---

### Task 7: Add request timeouts to every Drive fetch

No call has a timeout; a hung request leaves autosave's `saving` flag stuck forever (finding #4).

**Files:**
- Modify: `src/entities/driveFile/api/driveClient.ts` (all fetch call sites)
- Modify: `src/entities/driveFile/api/driveClient.test.ts`

- [ ] **Step 1: Write a failing test** — add near the top-level describes in `driveClient.test.ts`:

```ts
describe("request timeout", () => {
  it("passes an abort signal to fetch", async () => {
    let sawSignal = false;
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      sawSignal = init?.signal instanceof AbortSignal;
      return {
        ok: true,
        status: 200,
        json: async () => ({ files: [] }),
      } as Response;
    });
    await listFolder(TOKEN, "F", fetchMock);
    expect(sawSignal).toBe(true);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/entities/driveFile/api/driveClient.test.ts -t "abort signal"`
Expected: FAIL — no signal on init.

- [ ] **Step 3: Implement** — in `driveClient.ts`, add a constant and a tiny wrapper, then route every `f(...)` call through it:

```ts
// Abort any Drive request that stalls past this, so the autosave/save pipeline
// can't wedge on a hung connection.
const REQUEST_TIMEOUT_MS = 15_000;

function timed(init: RequestInit = {}): RequestInit {
  return { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) };
}
```

Then wrap each init object. For example `listFolder`:

```ts
  const data = await asJson<{ files: DriveFile[] }>(
    await f(url, timed({ headers: authHeaders(token) })),
  );
```

Apply the same `timed(...)` wrap to the fetch init in `getMeta`, `getContent`, `createFile`, `updateFile`, `renameFile`, and both fetches in `findOrCreateFolder`. `AbortSignal.timeout` is supported in MV3 service workers and jsdom.

- [ ] **Step 4: Run the gate**

Run: `npx vitest run src/entities/driveFile/api/driveClient.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/entities/driveFile/api/driveClient.ts src/entities/driveFile/api/driveClient.test.ts
git commit -m "fix: add 15s timeout to all Drive requests"
```

---

### Task 8: Classify Drive 401/403 and token-failure as `unauthorized`

Error code classification regex-matches `e.message` and only catches literal `401`/`unauthor`. Real auth failures (Drive 403 "insufficient scopes", `getToken` reject like "OAuth2 not granted or revoked") fall to `unknown`, so the UI never prompts re-auth (finding #5). Carry the HTTP status on a structured error and classify on it.

**Files:**
- Modify: `src/entities/driveFile/api/driveClient.ts:13-16` (+ new export)
- Modify: `src/entities/driveFile/model/types.ts` or `model/index.ts` (export `DriveError`)
- Modify: `src/entities/driveFile/index.ts` (barrel)
- Modify: `src/features/driveGateway/lib/handleMessage.ts:29-36`
- Modify: `src/features/driveGateway/lib/handleMessage.test.ts`

- [ ] **Step 1: Write failing tests** — add to `handleMessage.test.ts`:

```ts
  it("classifies a Drive 403 as unauthorized", async () => {
    const { DriveError } = await import("@/entities/driveFile");
    const d = deps({
      listFolder: vi.fn(async () => {
        throw new DriveError(403, "Drive request failed: 403");
      }),
    });
    const res = await handleMessage({ type: "drive/list" }, d);
    expect(res).toMatchObject({ ok: false, code: "unauthorized" });
  });

  it("classifies a token-grant failure as unauthorized", async () => {
    const d = deps({
      getToken: vi.fn(async () => {
        throw new Error("OAuth2 not granted or revoked");
      }),
    });
    const res = await handleMessage({ type: "drive/list" }, d);
    expect(res).toMatchObject({ ok: false, code: "unauthorized" });
  });
```

- [ ] **Step 2: Run them, verify they fail**

Run: `npx vitest run src/features/driveGateway -t "unauthorized"`
Expected: FAIL — current `err()` returns `unknown` for these.

- [ ] **Step 3: Add `DriveError`** — in `src/entities/driveFile/api/driveClient.ts`, define and throw it from `asJson` and `getContent`:

```ts
export class DriveError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "DriveError";
    this.status = status;
  }
}

async function asJson<T>(res: Response): Promise<T> {
  if (!res.ok) throw new DriveError(res.status, `Drive request failed: ${res.status}`);
  return (await res.json()) as T;
}
```

In `getContent`, replace the throw:

```ts
  if (!res.ok) throw new DriveError(res.status, `Drive content fetch failed: ${res.status}`);
```

- [ ] **Step 4: Export it** — re-export `DriveError` from `src/entities/driveFile/api/index.ts` and ensure `src/entities/driveFile/index.ts` surfaces it (it re-exports the api barrel). The message format keeps the status digits, so the existing `listFolder` "throws with status on failure" test (`/403/`) still passes.

- [ ] **Step 5: Rewrite the classifier** — in `handleMessage.ts`, replace `err()` with a version that inspects `DriveError.status`:

```ts
import { DriveError } from "@/entities/driveFile";
// ...

function err(e: unknown): Extract<Response<never>, { ok: false }> {
  const message = e instanceof Error ? e.message : String(e);
  const status = e instanceof DriveError ? e.status : undefined;
  let code: Extract<Response<never>, { ok: false }>["code"] = "unknown";
  if (/conflict/i.test(message)) {
    code = "conflict";
  } else if (
    status === 401 ||
    status === 403 ||
    /unauthor|insufficient|not granted|revoked|no auth token/i.test(message)
  ) {
    code = "unauthorized";
  }
  return { ok: false, error: message, code };
}
```

Update the two internal callers that pass a string literal (`err("not connected")`, etc.) — they still work because `String("not connected")` is the message and classifies as `unknown` (matches the existing tests). The final `catch (e)` now calls `err(e)` instead of `err((e as Error).message)`.

- [ ] **Step 6: Run the gate**

Run: `npx tsc --noEmit && npx vitest run && npx knip`
Expected: PASS — existing "not connected → unknown" and "conflict → conflict" tests still green.

- [ ] **Step 7: Commit**

```bash
git add src/entities/driveFile src/features/driveGateway
git commit -m "fix: classify Drive 401/403 and token failures as unauthorized"
```

---

### Task 9: Follow `nextPageToken` in `listFolder`

Drive returns at most ~100 files per page; folders with more silently truncate (finding #17).

**Files:**
- Modify: `src/entities/driveFile/api/driveClient.ts:18-27`
- Modify: `src/entities/driveFile/api/driveClient.test.ts`

- [ ] **Step 1: Write a failing test** — add to the `listFolder` describe:

```ts
  it("follows nextPageToken across pages", async () => {
    const fetchMock = vi.fn(async (url: RequestInfo | URL) => {
      const u = String(url);
      if (u.includes("pageToken=PAGE2")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            files: [{ id: "2", name: "b", modifiedTime: "t", headRevisionId: "r" }],
          }),
        } as Response;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          nextPageToken: "PAGE2",
          files: [{ id: "1", name: "a", modifiedTime: "t", headRevisionId: "r" }],
        }),
      } as Response;
    });
    const files = await listFolder(TOKEN, "F", fetchMock);
    expect(files.map((x) => x.id)).toEqual(["1", "2"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/entities/driveFile/api/driveClient.test.ts -t "nextPageToken"`
Expected: FAIL — only the first page returned.

- [ ] **Step 3: Implement** — replace `listFolder`:

```ts
export async function listFolder(
  token: string,
  folderId: string,
  f: Fetch = fetch,
): Promise<DriveFile[]> {
  const q = encodeURIComponent(
    `'${escapeQueryValue(folderId)}' in parents and trashed=false`,
  ).replace(/%20/g, "+");
  const out: DriveFile[] = [];
  let pageToken: string | undefined;
  do {
    const page = pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : "";
    const url = `${DRIVE_API}/files?q=${q}&fields=nextPageToken,files(${FIELDS})&orderBy=modifiedTime desc&pageSize=1000${page}`;
    const data = await asJson<{ files?: DriveFile[]; nextPageToken?: string }>(
      await f(url, timed({ headers: authHeaders(token) })),
    );
    out.push(...(data.files ?? []));
    pageToken = data.nextPageToken;
  } while (pageToken);
  return out;
}
```

- [ ] **Step 4: Run the gate**

Run: `npx vitest run src/entities/driveFile/api/driveClient.test.ts`
Expected: PASS — the existing single-page test still passes (`fields=` now includes `nextPageToken,files(...)`, still contains `'FOLDER'+in+parents`).

- [ ] **Step 5: Commit**

```bash
git add src/entities/driveFile/api/driveClient.ts src/entities/driveFile/api/driveClient.test.ts
git commit -m "fix: paginate listFolder over nextPageToken"
```

---

## Phase D — Scene & storage integrity

### Task 10: Make `writeScene` write binaries before localStorage

Current order writes `localStorage` first, then awaits `saveFiles`; on a `saveFiles` failure the elements/appState are already committed but the binaries are not, and `reload()` is skipped — the next page load reads a scene referencing missing images (finding, MEDIUM). Reorder so a binary-save failure leaves localStorage untouched.

**Files:**
- Modify: `src/features/sceneBridge/lib/sceneBridge.ts:44-50`
- Modify: `src/features/sceneBridge/lib/sceneBridge.test.ts`

- [ ] **Step 1: Write a failing test** — add to `sceneBridge.test.ts` (mirror the existing dep-injection style used there):

```ts
  it("does not touch localStorage when saving binaries fails", async () => {
    const storage = makeStorage(); // existing helper in this test file
    const deps = makeDeps({
      storage,
      saveFiles: async () => {
        throw new Error("quota exceeded");
      },
    });
    const file = buildExcalidrawFile([{ id: "e1" } as never], {}, {});
    await expect(writeScene(file, deps)).rejects.toThrow(/quota/);
    expect(storage.getItem("excalidraw")).toBeNull();
    expect(storage.getItem("excalidraw-state")).toBeNull();
  });
```

If `sceneBridge.test.ts` lacks `makeStorage`/`makeDeps` helpers, reuse whatever fixture it already defines for injecting `SceneBridgeDeps`; the assertion is the point — localStorage stays untouched on a `saveFiles` rejection.

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/features/sceneBridge/lib/sceneBridge.test.ts -t "saving binaries fails"`
Expected: FAIL — localStorage was written before the throw.

- [ ] **Step 3: Implement** — reorder `writeScene`:

```ts
export async function writeScene(file: ExcalidrawFile, deps: SceneBridgeDeps): Promise<void> {
  validateExcalidrawFile(file);
  // Persist binaries first: if this throws (quota/IDB), localStorage is left
  // untouched so the next reload still reads a self-consistent old scene.
  await deps.saveFiles(file.files);
  deps.storage.setItem(ELEMENTS_KEY, JSON.stringify(file.elements));
  deps.storage.setItem(STATE_KEY, JSON.stringify(file.appState));
  deps.reload();
}
```

- [ ] **Step 4: Run the gate**

Run: `npx vitest run src/features/sceneBridge && npx tsc --noEmit`
Expected: PASS — existing writeScene happy-path test still green (order change is invisible on success).

- [ ] **Step 5: Commit**

```bash
git add src/features/sceneBridge/lib/sceneBridge.ts src/features/sceneBridge/lib/sceneBridge.test.ts
git commit -m "fix: write scene binaries before localStorage for atomic restore"
```

---

### Task 11: Prune removed image binaries in `filesDb.saveFiles`

`saveFiles` only `set()`s incoming keys, never deletes keys absent from the new scene — orphaned blobs accumulate forever and bleed across opened diagrams (finding, MEDIUM).

**Files:**
- Modify: `src/features/sceneBridge/lib/filesDb.ts:1, 18-20`

- [ ] **Step 1: Implement prune** — replace the imports and `saveFiles` in `filesDb.ts`:

```ts
import { clear, createStore, del, entries, keys, set } from "idb-keyval";
```

```ts
async function saveFiles(files: Record<string, BinaryFile>): Promise<void> {
  const nextIds = new Set(Object.keys(files));
  const existingIds = (await keys(filesStore)).map(String);
  // Delete blobs no longer referenced by the scene being written.
  await Promise.all(
    existingIds.filter((id) => !nextIds.has(id)).map((id) => del(id, filesStore)),
  );
  await Promise.all(Object.entries(files).map(([id, file]) => set(id, file, filesStore)));
}
```

- [ ] **Step 2: Verify the build** — `filesDb` wraps the real IndexedDB binding and is verified manually (per its file comment); there is no unit test harness for it. Confirm types and knip:

Run: `npx tsc --noEmit && npx knip`
Expected: PASS — `del`/`keys` are valid idb-keyval exports.

- [ ] **Step 3: Manual check (record in commit body)** — in `npm run dev` on excalidraw.com: open a diagram with an image, delete the image, let autosave run, reload — confirm `files-db` no longer holds the orphaned blob (DevTools → Application → IndexedDB).

- [ ] **Step 4: Commit**

```bash
git add src/features/sceneBridge/lib/filesDb.ts
git commit -m "fix: prune orphaned image binaries when writing a scene"
```

---

## Phase E — Autosave & UI error paths

### Task 12: Flush autosave on teardown and set the baseline before starting

The content-script autosave effect calls `stop()` on cleanup but never `flush()`, dropping debounced edits when the active file changes; and `markSaved` is wired after `start()` (finding #7). Restructure the effect.

**Files:**
- Modify: `entrypoints/content.tsx:72-92`

- [ ] **Step 1: Implement** — replace the autosave `useEffect`:

```tsx
  // Autosave: only meaningful once a file is active.
  useEffect(() => {
    if (!activeId) return;
    const autosave = createAutosave({
      getHash: () => currentSceneHash(bridge),
      save: async () => {
        const scene = await readScene(bridge);
        const meta = await sendToBackground<DriveFileMeta>({
          type: "drive/update",
          id: activeId,
          content: JSON.stringify(scene),
          prevRevision: revisionRef.current ?? "",
        });
        revisionRef.current = meta.headRevisionId;
        await setActiveFile({ id: meta.id, name: meta.name, loadedRevision: meta.headRevisionId });
      },
      onStatus: setSaveStatus,
    });
    let stopped = false;
    // Establish the saved baseline before the first tick can fire.
    void currentSceneHash(bridge).then((h) => {
      if (stopped) return;
      autosave.markSaved(h);
      autosave.start();
    });
    return () => {
      stopped = true;
      void autosave.flush();
      autosave.stop();
    };
  }, [activeId]);
```

- [ ] **Step 2: Run the gate**

Run: `npx tsc --noEmit && npx vitest run`
Expected: PASS (no content.tsx unit test exists; behavior is exercised via the autosave controller's own tests). This is verified manually in Task 17.

- [ ] **Step 3: Commit**

```bash
git add entrypoints/content.tsx
git commit -m "fix: flush autosave on teardown and set baseline before start"
```

---

### Task 13: Surface action errors in the panel and the disconnected-state class

`onOpen`/`onCreate`/`onRename`/`doSignOut` have no try/catch and no error UI; failures look like dead buttons (finding #6). Also replace the rationalized inline `style` on the disconnected message with a CSS class (finding #19).

**Files:**
- Modify: `entrypoints/content.tsx`
- Modify: `src/widgets/diagramPanel/DiagramPanel/DiagramPanel.tsx` (add an optional `error` banner)
- Modify: `src/widgets/diagramPanel/DiagramPanel/DiagramPanel.module.css`
- Modify: `src/shared/config/theme.css` (add a `.es-disconnected` utility + `--es-overlay` token — token also used by Task 19)
- Modify: `src/widgets/diagramPanel/DiagramPanel/DiagramPanel.test.tsx` (assert the error banner)

- [ ] **Step 1: Write a failing test** — add to `DiagramPanel.test.tsx`:

```tsx
  it("renders an error banner when error is set", () => {
    render(
      <DiagramPanel
        files={[]}
        activeId={null}
        saveStatus="idle"
        loading={false}
        error="Could not open diagram"
        onOpen={() => {}}
        onCreate={() => {}}
        onRename={() => {}}
        onSignOut={() => {}}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Could not open diagram");
  });
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/widgets/diagramPanel -t "error banner"`
Expected: FAIL — no `error` prop / no alert.

- [ ] **Step 3: Add the prop to `DiagramPanel`** — extend `Props` and render the banner under the header:

```tsx
interface Props {
  files: DriveFileMeta[];
  activeId: string | null;
  saveStatus: SaveStatus;
  loading: boolean;
  error?: string | null;
  onOpen: (id: string) => void;
  onCreate: (name: string) => void;
  onRename: (id: string, name: string) => void;
  onSignOut: () => void;
}
```

Add `error` to the destructured params, and after the `</header>`:

```tsx
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
```

- [ ] **Step 4: Style the banner** — add to `DiagramPanel.module.css`:

```css
.error {
  margin: 0 0 8px;
  padding: 8px 10px;
  font-size: 12px;
  color: var(--es-accent-text);
  background: var(--es-danger);
  border-radius: var(--es-radius);
}
```

- [ ] **Step 5: Add tokens/utility to `theme.css`** — inside the light `:root, :host` block add an overlay token (used by Task 19):

```css
  --es-overlay: rgba(0, 0, 0, 0.4);
```

and at the end of the file add the disconnected-message utility:

```css
.es-disconnected {
  padding: 12px;
  font: 13px system-ui;
}
```

- [ ] **Step 6: Wire errors + class in `content.tsx`** — add an error state and wrap each action; replace the inline-style paragraph:

```tsx
  const [actionError, setActionError] = useState<string | null>(null);
```

Wrap each handler body, e.g. `onOpen`:

```tsx
  const onOpen = useCallback(async (id: string) => {
    setActionError(null);
    try {
      const { meta, content } = await sendToBackground<DiagramContent>({ type: "drive/get", id });
      const file = parseExcalidrawFile(content); // validates before write
      await setActiveFile({ id: meta.id, name: meta.name, loadedRevision: meta.headRevisionId });
      await writeScene(file, bridge); // reloads the tab
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Failed to open diagram");
    }
  }, []);
```

Apply the same `setActionError(null)` + `try/catch` shape to `onCreate`, `onRename`, and `doSignOut`. For `doSignOut`, keep the existing best-effort flush try/catch, but wrap the sign-out/clear sequence so a failure shows an error instead of leaving limbo state.

Replace the disconnected return:

```tsx
  if (!status.connected) {
    return (
      <p className="es-disconnected">
        Excalistore: open the extension popup to connect Google Drive.
      </p>
    );
  }
```

Pass the error to the panel:

```tsx
      <DiagramPanel
        files={files}
        activeId={activeId}
        saveStatus={saveStatus}
        loading={loading}
        error={actionError}
        onOpen={onOpen}
        onCreate={onCreate}
        onRename={onRename}
        onSignOut={() => setSignOutOpen(true)}
      />
```

- [ ] **Step 7: Run the gate**

Run: `npx tsc --noEmit && npx biome check . && npx vitest run && npx knip`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add entrypoints/content.tsx src/widgets/diagramPanel src/shared/config/theme.css
git commit -m "feat: surface action errors in panel and drop rationalized inline style"
```

---

### Task 14: Validate the restored active-file against the current file list

On load, a stale `activeFile` pointer from a previous account/folder is trusted blindly (finding #16). Only adopt it if it's in the freshly-listed files; otherwise clear it.

**Files:**
- Modify: `entrypoints/content.tsx:41-69`

- [ ] **Step 1: Implement** — change `refresh` to return the list, and validate the active pointer in the initial-load effect:

```tsx
  const refresh = useCallback(async (): Promise<DriveFileMeta[]> => {
    setLoading(true);
    try {
      const list = await sendToBackground<DriveFileMeta[]>({ type: "drive/list" });
      setFiles(list);
      return list;
    } catch (e) {
      if (e instanceof RequestError && e.code === "unauthorized") {
        setStatus({ connected: false });
      }
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load: connection status, file list, restore the active pointer.
  useEffect(() => {
    void (async () => {
      const s = await sendToBackground<ConnectionStatus>({ type: "auth/status" }).catch(
        () => ({ connected: false }) as ConnectionStatus,
      );
      setStatus(s);
      const active = await getActiveFile();
      const list = s.connected ? await refresh() : [];
      if (active && list.some((f) => f.id === active.id)) {
        setActiveId(active.id);
        revisionRef.current = active.loadedRevision;
      } else if (active) {
        // Stale pointer (different account/folder, or deleted) — drop it.
        await clearActiveFile();
      }
    })();
  }, [refresh]);
```

`clearActiveFile` is already imported in `content.tsx`.

- [ ] **Step 2: Run the gate**

Run: `npx tsc --noEmit && npx vitest run`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add entrypoints/content.tsx
git commit -m "fix: drop stale active-file pointer not in the current Drive list"
```

---

### Task 15: Add connecting/error state to the popup and prevent double-connect

`App.tsx` `onConnect`/`onSignOut` have no try/catch and no UI feedback, and the connect form can be submitted repeatedly, racing duplicate-folder creation (findings #6 popup, #14).

**Files:**
- Modify: `entrypoints/popup/App.tsx`
- Modify: `src/widgets/popupConnect/PopupConnect/PopupConnect.tsx`
- Modify: `src/widgets/popupConnect/PopupConnect/PopupConnect.module.css`
- Modify: `src/widgets/popupConnect/PopupConnect/PopupConnect.test.tsx`

- [ ] **Step 1: Write a failing test** — add to `PopupConnect.test.tsx`:

```tsx
  it("disables the connect button and shows an error while busy/failed", () => {
    render(
      <PopupConnect
        status={{ connected: false }}
        busy
        error="Sign-in was cancelled"
        onConnect={() => {}}
        onSignOut={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: /connect/i })).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent("Sign-in was cancelled");
  });
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/widgets/popupConnect -t "disables the connect"`
Expected: FAIL — no `busy`/`error` props.

- [ ] **Step 3: Extend `PopupConnect`** — add props and use them:

```tsx
interface Props {
  status: ConnectionStatus;
  busy?: boolean;
  error?: string | null;
  onConnect: (folderName: string) => void;
  onSignOut: () => void;
}
```

Destructure `busy = false, error = null`, disable the submit button (`<Button type="submit" disabled={busy}>{busy ? "Connecting…" : "Connect Google Drive"}</Button>`), disable the sign-out button with `disabled={busy}`, and render `{error ? <p className={styles.error} role="alert">{error}</p> : null}` inside `<main>`.

- [ ] **Step 4: Style the error** — add to `PopupConnect.module.css`:

```css
.error {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--es-danger);
}
```

- [ ] **Step 5: Wire state in `App.tsx`**:

```tsx
export function App() {
  const [status, setStatus] = useState<ConnectionStatus>({ connected: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    sendToBackground<ConnectionStatus>({ type: "auth/status" })
      .then(setStatus)
      .catch(() => undefined);
  }, []);

  async function onConnect(folderName: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const next = await sendToBackground<ConnectionStatus>({ type: "drive/connect", folderName });
      setStatus(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not connect to Google Drive");
    } finally {
      setBusy(false);
    }
  }

  async function onSignOut() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const next = await sendToBackground<ConnectionStatus>({ type: "auth/signOut" });
      setStatus(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not sign out");
    } finally {
      setBusy(false);
    }
  }

  return (
    <PopupConnect status={status} busy={busy} error={error} onConnect={onConnect} onSignOut={onSignOut} />
  );
}
```

- [ ] **Step 6: Run the gate**

Run: `npx tsc --noEmit && npx biome check . && npx vitest run && npx knip`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add entrypoints/popup/App.tsx src/widgets/popupConnect
git commit -m "feat: popup connect busy/error state, prevent double-connect"
```

---

## Phase F — Smaller hardening

### Task 16: Single-flight non-interactive `getToken`; guard `signOut` against a hung callback

Concurrent gateway messages each call `getToken(false)`; dedupe in-flight calls. `signOut` hangs forever if `removeCachedAuthToken`'s callback never fires; add a fallback (findings #21).

**Files:**
- Modify: `src/features/auth/api/authClient.ts`
- Modify: `src/features/auth/api/authClient.test.ts`

- [ ] **Step 1: Write a failing test** — add to `authClient.test.ts`:

```ts
  it("dedupes concurrent non-interactive getToken calls", async () => {
    let calls = 0;
    // @ts-expect-error minimal chrome stub for the test
    globalThis.chrome = {
      runtime: { lastError: undefined },
      identity: {
        getAuthToken: (_opts: unknown, cb: (t: string) => void) => {
          calls += 1;
          setTimeout(() => cb("TOK"), 5);
        },
      },
    };
    const [a, b] = await Promise.all([getToken(false), getToken(false)]);
    expect(a).toBe("TOK");
    expect(b).toBe("TOK");
    expect(calls).toBe(1);
  });
```

Match the existing `authClient.test.ts` chrome-stub style if it already defines one; reuse its helper rather than redefining `globalThis.chrome` if present.

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/features/auth -t "dedupes concurrent"`
Expected: FAIL — `calls` is 2.

- [ ] **Step 3: Implement** — in `authClient.ts`, memoize the in-flight non-interactive promise and add a sign-out fallback:

```ts
let inflightSilent: Promise<string> | null = null;

export function getToken(interactive: boolean): Promise<string> {
  if (!interactive && inflightSilent) return inflightSilent;
  const p = new Promise<string>((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive }, (result) => {
      const err = chrome.runtime.lastError;
      const raw = result as unknown as string | { token?: string } | undefined;
      const token = typeof raw === "string" ? raw : raw?.token;
      if (err || !token) {
        reject(new Error(err?.message ?? "no auth token"));
        return;
      }
      resolve(token);
    });
  });
  if (!interactive) {
    inflightSilent = p;
    void p.finally(() => {
      inflightSilent = null;
    });
  }
  return p;
}
```

In `signOut`, resolve even if the callback never fires:

```ts
export function signOut(token: string, f: Fetch = fetch): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    const fallback = setTimeout(done, 3_000);
    chrome.identity.removeCachedAuthToken({ token }, () => {
      void f(`${OAUTH_REVOKE}?token=${token}`, { method: "POST" })
        .catch(() => undefined)
        .finally(() => {
          clearTimeout(fallback);
          done();
        });
    });
  });
}
```

- [ ] **Step 4: Run the gate**

Run: `npx vitest run src/features/auth && npx tsc --noEmit`
Expected: PASS — existing authClient tests still green.

- [ ] **Step 5: Commit**

```bash
git add src/features/auth/api/authClient.ts src/features/auth/api/authClient.test.ts
git commit -m "fix: single-flight silent getToken and guard signOut from hanging"
```

---

### Task 17: Warn on corrupted page storage; reject empty active-file fields

`readJson` silently turns corrupt JSON into an empty scene (data-loss-masking); `isActiveFile` accepts empty strings (findings #22). Project rule requires validating every payload.

**Files:**
- Modify: `src/features/sceneBridge/lib/sceneBridge.ts:24-32`
- Modify: `src/entities/diagram/model/activeFile.ts:9-15`
- Modify: `src/entities/diagram/model/activeFile.test.ts`

- [ ] **Step 1: Write a failing test** — add to `activeFile.test.ts`:

```ts
  it("rejects an object with empty-string fields", () => {
    expect(isActiveFile({ id: "", name: "", loadedRevision: "" })).toBe(false);
  });
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/entities/diagram/model/activeFile.test.ts -t "empty-string"`
Expected: FAIL — currently returns true.

- [ ] **Step 3: Tighten `isActiveFile`**:

```ts
export function isActiveFile(value: unknown): value is ActiveFile {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    v.id.length > 0 &&
    typeof v.name === "string" &&
    v.name.length > 0 &&
    typeof v.loadedRevision === "string"
  );
}
```

(`loadedRevision` may legitimately be empty before the first save, so only `id`/`name` are required non-empty.)

- [ ] **Step 4: Warn on corruption** — in `sceneBridge.ts` `readJson`, log before falling back:

```ts
function readJson<T>(storage: Storage, key: string, fallback: T): T {
  const raw = storage.getItem(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    console.warn(`[excalistore] corrupt JSON in localStorage["${key}"]; using fallback`);
    return fallback;
  }
}
```

- [ ] **Step 5: Run the gate**

Run: `npx vitest run && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/sceneBridge/lib/sceneBridge.ts src/entities/diagram/model/activeFile.ts src/entities/diagram/model/activeFile.test.ts
git commit -m "fix: warn on corrupt page storage and reject empty active-file fields"
```

---

### Task 18: Make `activeFileStore` resilient to storage rejections

`chrome.storage.local` can reject on extension-context invalidation; an unguarded `getActiveFile()` rejection aborts the whole initial-load effect (finding #23).

**Files:**
- Modify: `src/features/session/lib/activeFileStore.ts`
- Modify: `src/features/session/lib/activeFileStore.test.ts`

- [ ] **Step 1: Write a failing test** — add to `activeFileStore.test.ts` (reuse its chrome stub):

```ts
  it("returns null when storage.get rejects", async () => {
    // @ts-expect-error stub override
    chrome.storage.local.get = vi.fn(async () => {
      throw new Error("context invalidated");
    });
    await expect(getActiveFile()).resolves.toBeNull();
  });
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/features/session -t "storage.get rejects"`
Expected: FAIL — rejection propagates.

- [ ] **Step 3: Implement** — wrap `getActiveFile`:

```ts
export async function getActiveFile(): Promise<ActiveFile | null> {
  try {
    const value = (await chrome.storage.local.get(KEY))[KEY];
    return isActiveFile(value) ? value : null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run the gate**

Run: `npx vitest run src/features/session && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/session/lib/activeFileStore.ts src/features/session/lib/activeFileStore.test.ts
git commit -m "fix: getActiveFile returns null on storage rejection"
```

---

### Task 19: Tokenize the Dialog overlay scrim; fix test deep-imports

`Dialog.module.css` hardcodes `rgba(0,0,0,0.4)` instead of a token (finding #20); the `--es-overlay` token was added in Task 13. Also switch the two `shared/ui` test deep-imports to relative colocated imports (finding #18).

**Files:**
- Modify: `src/shared/ui/Dialog/Dialog.module.css:4`
- Modify: `src/shared/ui/Button/Button.test.tsx:4`
- Modify: `src/shared/ui/ConfirmDialog/ConfirmDialog.test.tsx:4`

- [ ] **Step 1: Tokenize** — in `Dialog.module.css` change line 4:

```css
  background: var(--es-overlay);
```

- [ ] **Step 2: Fix test imports** — in `Button.test.tsx` change line 4 to `import { Button } from "./Button";`, and in `ConfirmDialog.test.tsx` change line 4 to `import { ConfirmDialog } from "./ConfirmDialog";`.

- [ ] **Step 3: Run the gate**

Run: `npx vitest run src/shared/ui && npx biome check . && npx knip`
Expected: PASS — overlay still renders (token resolves to the same rgba).

- [ ] **Step 4: Commit**

```bash
git add src/shared/ui/Dialog/Dialog.module.css src/shared/ui/Button/Button.test.tsx src/shared/ui/ConfirmDialog/ConfirmDialog.test.tsx
git commit -m "refactor: tokenize dialog scrim and use relative test imports"
```

---

## Phase G — Docs

### Task 20: Update docs to match the changes

Per CLAUDE.md docs discipline: architecture, security, and features docs must track the changes.

**Files:**
- Modify: `docs/architecture.md`
- Modify: `docs/security.md`
- Modify: `docs/features.md`

- [ ] **Step 1: `architecture.md`** — remove references to `drive/setConnection` and `auth/signIn` (around lines 137 and 199); add a note that the background listener validates `sender` via `isAllowedSender` before routing, and that `listFolder` paginates.

- [ ] **Step 2: `security.md`** — document: (a) message-sender allowlist (extension id + popup/excalidraw.com origin); (b) random multipart boundary; (c) Drive query-value escaping (backslash + quote); (d) 15s request timeouts; (e) the **known limitation**: `updateFile`'s revision check is best-effort optimistic concurrency — the Drive v3 API has no `If-Match` precondition for `files.update`, so a concurrent writer racing the check→PATCH window can still clobber; two-tab editing of one file is therefore last-write-wins (finding #15, documented not fixed).

- [ ] **Step 3: `features.md`** — note autosave now flushes on teardown, surfaces errors in the panel, and validates the restored active-file pointer; popup shows connecting/error state.

- [ ] **Step 4: Final full gate**

Run: `npx tsc --noEmit && npx biome check . && npx vitest run && npx knip`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add docs/architecture.md docs/security.md docs/features.md
git commit -m "docs: record review-fix changes and updateFile concurrency limitation"
```

---

## Self-review notes

- **Finding coverage:** #1 Task 4 · #2 Task 1 · #3 Task 6 · #4 Task 7 · #5 Task 8 · #6 Tasks 13/15 · #7 Task 12 · atomic write Task 10 · binary prune Task 11 · duplicate-folder/double-connect Task 15 · stale active-file Task 14 · query escaping Task 5 · #11/#15 TOCTOU documented Task 20 · #17 pagination Task 9 · barrel/test imports Task 19 · #19 inline style Task 13 · #20 scrim Task 19 · dead `IconButton`/types/consts Tasks 2-3 · #21 Task 16 · #22 Task 17 · #23 Task 18 · #24 Task 4.
- **Not code-fixable:** `updateFile` TOCTOU (#15) — Drive v3 has no `If-Match` for files; documented in Task 20. The existing pre-flight revision guard is retained.
- **Type consistency:** `DriveError(status, message)` defined in Task 8 is the exact shape imported in its tests and in `handleMessage`. `isAllowedSender(sender, opts)` signature is identical in helper, test, and `background.ts`. `DiagramPanel` gains `error?: string | null`; `PopupConnect` gains `busy?`/`error?` — both optional, so existing call sites/tests compile unchanged.
```

