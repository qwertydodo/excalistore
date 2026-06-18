# Excalistore Plan 6 — App-owned folder (drop the Picker)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace folder selection. Under the `drive.file` scope the Google Picker can only show files the app already owns, so it can't browse a user's existing folders — confirmed live (the Picker's folder list is empty). Pivot to the sanctioned minimal-scope pattern: the user **names** a folder, and the app **finds-or-creates** an app-owned folder by that name via `drive.file`. This removes the Picker, the sandboxed page, and all remote-script CSP — a net security win (the extension now loads **no** remote code at all).

**Architecture:** Folder connect moves entirely into the background gateway: a new `drive/connect { folderName }` message triggers an interactive `getAuthToken`, then `findOrCreateFolder` (new `driveClient` method), then persists `{connected, folderId, folderName}`. The popup just collects a folder name. `features/pickFolder` and `entrypoints/sandbox` are deleted; `wxt.config.ts` drops `manifest.sandbox` + the sandbox CSP and tightens `extension_pages` to `script-src 'self'; object-src 'self'`. `WXT_PICKER_API_KEY` becomes unused. The content-script panel (open/create/rename/autosave) is unaffected — it already creates diagrams inside the connected folder.

**Tech Stack:** WXT, React 19, TS strict, Biome, Vitest, knip, lefthook. Google Drive REST v3 (`drive.file`).

**Reference:** Spec `docs/superpowers/specs/2026-06-17-excalistore-design.md` (Drive scope / minimum permissions). Supersedes Plan 2's Picker and Plan 5's sandboxed Picker — both removed here. Builds on Plans 1–5 (merged) + post-Plan-5 fixes.

**Branch:** `feat/app-owned-folder` (create off `main`).

**Conventions (from CLAUDE.md):** FSD layers import downward only; module files camelCase; Conventional Commits; do not bypass git hooks.

---

## Windows / line-endings note (applies to EVERY task)

Windows dev: the Write tool emits CRLF, Biome requires LF. **Before every `git commit`** run `npx biome check --write .`, then re-`git add`. If the lefthook hook blocks on formatting, run `npx biome check --write .`, re-stage, re-commit. **Never** use `--no-verify`. The hook runs `tsc --noEmit` + `knip` over the whole project — order matters; this plan is ordered so each commit type-checks.

---

## Task 1: Drive client — `findOrCreateFolder`

**Files:**
- Modify: `src/shared/config/drive.ts` (add `FOLDER_MIME`)
- Modify: `src/entities/driveFile/api/driveClient.ts`, `driveClient.test.ts`

- [x] **Step 1: Add the folder MIME constant**

In `src/shared/config/drive.ts`, after `DIAGRAM_MIME`:

```typescript
// Google Drive's folder MIME type.
export const FOLDER_MIME = "application/vnd.google-apps.folder";
```

- [x] **Step 2: Add failing tests** to `driveClient.test.ts` (append inside the file, new `describe`s):

```typescript
import { findOrCreateFolder } from "./driveClient";

describe("findOrCreateFolder", () => {
  it("returns an existing app folder by name without creating", async () => {
    const fetchMock = vi.fn(async (url: RequestInfo | URL) => {
      // list query → one match
      return {
        ok: true,
        status: 200,
        json: async () => ({ files: [{ id: "F1", name: "Diagrams" }] }),
      } as Response;
    });
    const folder = await findOrCreateFolder(TOKEN, "Diagrams", fetchMock);
    expect(folder).toEqual({ id: "F1", name: "Diagrams" });
    // only the list call happened (no create POST)
    expect(fetchMock).toHaveBeenCalledOnce();
    const url = String(fetchMock.mock.calls[0]?.[0]);
    expect(url).toContain("mimeType");
    expect(url).toContain("Diagrams");
  });

  it("creates the folder when none matches", async () => {
    const fetchMock = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") {
        return { ok: true, status: 200, json: async () => ({ id: "F2", name: "New" }) } as Response;
      }
      return { ok: true, status: 200, json: async () => ({ files: [] }) } as Response;
    });
    const folder = await findOrCreateFolder(TOKEN, "New", fetchMock);
    expect(folder).toEqual({ id: "F2", name: "New" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const createInit = fetchMock.mock.calls[1]?.[1] as RequestInit;
    expect(createInit.method).toBe("POST");
    expect(JSON.parse(createInit.body as string)).toMatchObject({
      name: "New",
      mimeType: "application/vnd.google-apps.folder",
    });
  });

  it("escapes single quotes in the folder name query", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ files: [] }) }) as Response);
    // create path returns; we only assert the list query escaping
    await findOrCreateFolder(TOKEN, "Bob's", vi.fn(async (url, init) => {
      if ((init as RequestInit | undefined)?.method === "POST") {
        return { ok: true, status: 200, json: async () => ({ id: "X", name: "Bob's" }) } as Response;
      }
      const u = String(url);
      expect(u).toContain("Bob%5C's".replace("%5C", "\\")); // contains escaped \'
      return { ok: true, status: 200, json: async () => ({ files: [] }) } as Response;
    }));
  });
});
```

(If the third test's escaping assertion is awkward against the encoded URL, simplify it to assert the query contains the backslash-escaped name before `encodeURIComponent`, or drop it — the core behavior is the first two tests. Keep the suite green.)

- [x] **Step 3: Run to verify it fails**

Run: `npx vitest run src/entities/driveFile/api/driveClient.test.ts`
Expected: FAIL — `findOrCreateFolder` not exported.

- [x] **Step 4: Implement in `driveClient.ts`**

Add `FOLDER_MIME` to the existing config import, then append:

```typescript
// Find an app-owned folder by exact name, or create it. Under drive.file the
// list only returns folders this app created, so this is idempotent per name.
export async function findOrCreateFolder(
  token: string,
  name: string,
  f: Fetch = fetch,
): Promise<{ id: string; name: string }> {
  const safe = name.replace(/'/g, "\\'");
  const q = encodeURIComponent(
    `mimeType='${FOLDER_MIME}' and name='${safe}' and trashed=false`,
  ).replace(/%20/g, "+");
  const listUrl = `${DRIVE_API}/files?q=${q}&fields=files(id,name)`;
  const listed = await asJson<{ files: Array<{ id: string; name: string }> }>(
    await f(listUrl, { headers: authHeaders(token) }),
  );
  const existing = listed.files?.[0];
  if (existing) return { id: existing.id, name: existing.name };

  const created = await asJson<{ id: string; name: string }>(
    await f(`${DRIVE_API}/files?fields=id,name`, {
      method: "POST",
      headers: { ...authHeaders(token), "Content-Type": "application/json" },
      body: JSON.stringify({ name, mimeType: FOLDER_MIME }),
    }),
  );
  return { id: created.id, name: created.name };
}
```

(`FOLDER_MIME` import: change the top import to `import { DIAGRAM_MIME, DRIVE_API, DRIVE_UPLOAD, FOLDER_MIME } from "@/shared/config";`.)

- [x] **Step 5: Run to verify it passes + commit**

Run: `npx vitest run src/entities/driveFile/api/driveClient.test.ts && npm run lint && npm run compile`

```bash
npx biome check --write .
git add src/shared/config/drive.ts src/entities/driveFile
git commit -m "feat: add find-or-create folder to drive client"
```

---

## Task 2: Message contract — `drive/connect`, drop `drive/pickFolder`

**Files:**
- Modify: `src/shared/api/messages.ts`

- [x] **Step 1: Update the `Request` union**

Remove `| { type: "drive/pickFolder" }`. Add `| { type: "drive/connect"; folderName: string }`. Leave `drive/setConnection` as-is (still valid). Result region:

```typescript
  | { type: "auth/status" }
  | { type: "auth/signIn" }
  | { type: "auth/signOut" }
  | { type: "drive/connect"; folderName: string }
  | { type: "drive/setConnection"; status: ConnectionStatus }
  | { type: "drive/list" }
  | { type: "drive/get"; id: string }
  | { type: "drive/create"; name: string; content: string }
  | { type: "drive/update"; id: string; content: string; prevRevision: string }
  | { type: "drive/rename"; id: string; name: string };
```

(Check the actual current union before editing — keep every member except the removed `drive/pickFolder`, and add `drive/connect`.)

- [x] **Step 2: Verify + commit**

Run: `npm run lint && npm run compile`
Expected: exit 0 (nothing references `drive/pickFolder` — it was never handled).

```bash
npx biome check --write .
git add src/shared/api/messages.ts
git commit -m "feat: add drive/connect message, drop unused pickFolder"
```

---

## Task 3: Gateway — handle `drive/connect`

**Files:**
- Modify: `src/features/driveGateway/lib/handleMessage.ts`, `handleMessage.test.ts`

- [x] **Step 1: Add failing tests**

Extend the `deps()` factory in `handleMessage.test.ts` with the new dep (add this member, keep the rest):

```typescript
    findOrCreateFolder: vi.fn(async () => ({ id: "F", name: "Diagrams" })),
```

Add a test case:

```typescript
it("drive/connect signs in interactively, finds/creates the folder, persists it", async () => {
  const d = deps();
  const res = await handleMessage({ type: "drive/connect", folderName: "Diagrams" }, d);
  expect(d.getToken).toHaveBeenCalledWith(true);
  expect(d.findOrCreateFolder).toHaveBeenCalledWith("TOK", "Diagrams");
  expect(d.setStore).toHaveBeenCalledWith({
    connected: true,
    folderId: "F",
    folderName: "Diagrams",
  });
  expect(res).toEqual({
    ok: true,
    data: { connected: true, folderId: "F", folderName: "Diagrams" },
  });
});
```

- [x] **Step 2: Run to verify it fails**

Run: `npx vitest run src/features/driveGateway/lib/handleMessage.test.ts`
Expected: FAIL — `findOrCreateFolder` missing from `GatewayDeps`; `drive/connect` unhandled.

- [x] **Step 3: Implement**

In `handleMessage.ts`, add to `GatewayDeps`:

```typescript
  findOrCreateFolder: (token: string, name: string) => Promise<{ id: string; name: string }>;
```

Add a case (before `default`):

```typescript
      case "drive/connect": {
        // Interactive sign-in happens here (first user gesture from the popup).
        const token = await deps.getToken(true);
        const folder = await deps.findOrCreateFolder(token, req.folderName);
        const next: ConnectionStatus = {
          connected: true,
          folderId: folder.id,
          folderName: folder.name,
        };
        await deps.setStore(next);
        return { ok: true, data: next };
      }
```

- [x] **Step 4: Run to verify it passes + commit**

Run: `npx vitest run src/features/driveGateway/lib/handleMessage.test.ts && npm run lint && npm run compile`

```bash
npx biome check --write .
git add src/features/driveGateway/lib/handleMessage.ts src/features/driveGateway/lib/handleMessage.test.ts
git commit -m "feat: handle drive/connect in gateway"
```

---

## Task 4: Wire the gateway dep in `background.ts`

**Files:**
- Modify: `entrypoints/background.ts`

- [x] **Step 1: Add the dep**

Add `findOrCreateFolder` to the `@/entities/driveFile` import, and add it to the `deps` object:

```typescript
import {
  createFile,
  findOrCreateFolder,
  getContent,
  getMeta,
  listFolder,
  renameFile,
  updateFile,
} from "@/entities/driveFile";
```

In the `deps` object add:

```typescript
  findOrCreateFolder,
```

- [x] **Step 2: Build + commit**

Run: `npm run lint && npm run compile && npm run build`

```bash
npx biome check --write .
git add entrypoints/background.ts
git commit -m "feat: wire find-or-create folder into background gateway"
```

---

## Task 5: Popup — collect a folder name

**Files:**
- Modify: `src/widgets/popupConnect/PopupConnect/PopupConnect.tsx`, `PopupConnect.test.tsx`
- Modify: `entrypoints/popup/App.tsx`

- [x] **Step 1: Update the test** `PopupConnect.test.tsx` (replace the disconnected-state test, keep the connected one):

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PopupConnect } from "./PopupConnect";

describe("PopupConnect", () => {
  it("connects with the entered folder name", async () => {
    const onConnect = vi.fn();
    render(<PopupConnect status={{ connected: false }} onConnect={onConnect} onSignOut={vi.fn()} />);
    const input = screen.getByLabelText(/folder name/i);
    await userEvent.clear(input);
    await userEvent.type(input, "My Diagrams");
    await userEvent.click(screen.getByRole("button", { name: /connect/i }));
    expect(onConnect).toHaveBeenCalledWith("My Diagrams");
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

- [x] **Step 2: Run to verify it fails**

Run: `npx vitest run src/widgets/popupConnect/PopupConnect/PopupConnect.test.tsx`
Expected: FAIL (no folder-name input; `onConnect` signature differs).

- [x] **Step 3: Update `PopupConnect.tsx`**

```tsx
import { useState } from "react";
import type { ConnectionStatus } from "@/shared/api";
import { Button, TextField } from "@/shared/ui";
import styles from "./PopupConnect.module.css";

interface Props {
  status: ConnectionStatus;
  onConnect: (folderName: string) => void;
  onSignOut: () => void;
}

const DEFAULT_FOLDER = "Excalidraw Diagrams";

export function PopupConnect({ status, onConnect, onSignOut }: Props) {
  const [name, setName] = useState(DEFAULT_FOLDER);

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
        <form
          className={styles.connectForm}
          onSubmit={(e) => {
            e.preventDefault();
            onConnect(name.trim() || DEFAULT_FOLDER);
          }}
        >
          <label className={styles.label} htmlFor="es-folder-name">
            Folder name
          </label>
          <TextField
            id="es-folder-name"
            aria-label="Folder name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <p className={styles.hint}>The app creates this folder in your Drive (or reuses it).</p>
          <Button type="submit">Connect Google Drive</Button>
        </form>
      )}
    </main>
  );
}
```

- [x] **Step 4: Add styles** to `PopupConnect.module.css` (append):

```css
.connectForm {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.label {
  font-size: 12px;
  color: var(--es-muted);
}
.hint {
  margin: 0;
  font-size: 11px;
  color: var(--es-muted);
}
```

- [x] **Step 5: Update `App.tsx`** — replace the whole file:

```tsx
import { useEffect, useState } from "react";
import type { ConnectionStatus } from "@/shared/api";
import { sendToBackground } from "@/shared/api";
import { PopupConnect } from "@/widgets/popupConnect";

export function App() {
  const [status, setStatus] = useState<ConnectionStatus>({ connected: false });

  useEffect(() => {
    sendToBackground<ConnectionStatus>({ type: "auth/status" })
      .then(setStatus)
      .catch(() => undefined);
  }, []);

  async function onConnect(folderName: string) {
    // Interactive sign-in + folder find/create happen in the background gateway.
    const next = await sendToBackground<ConnectionStatus>({ type: "drive/connect", folderName });
    setStatus(next);
  }

  async function onSignOut() {
    const next = await sendToBackground<ConnectionStatus>({ type: "auth/signOut" });
    setStatus(next);
  }

  return <PopupConnect status={status} onConnect={onConnect} onSignOut={onSignOut} />;
}
```

- [x] **Step 6: Run tests + verify + commit**

Run: `npx vitest run src/widgets/popupConnect && npm run lint && npm run compile`

```bash
npx biome check --write .
git add src/widgets/popupConnect entrypoints/popup/App.tsx
git commit -m "feat: connect by folder name instead of picker"
```

---

## Task 6: Remove the Picker + sandbox + remote CSP

**Files:**
- Delete: `src/features/pickFolder/` (whole dir), `entrypoints/sandbox/` (whole dir)
- Modify: `wxt.config.ts`, `knip.json`

- [ ] **Step 1: Delete the dead code**

```bash
git rm -r src/features/pickFolder entrypoints/sandbox
```

- [ ] **Step 2: Tighten `wxt.config.ts`**

Remove the `sandbox: { pages: [...] }` block entirely. Replace the whole `content_security_policy` with the no-remote-code version (no `sandbox` key, no Google `frame-src`):

```typescript
    content_security_policy: {
      extension_pages: "script-src 'self'; object-src 'self';",
    },
```

(The OAuth flow uses `chrome.identity`, not an in-page Google iframe, so no `frame-src` exception is needed anymore.)

- [ ] **Step 3: Update `knip.json`**

Remove the `"src/features/pickFolder/index.ts"` entry from the `entry` array. (The sandbox entrypoint was covered by the `entrypoints/**` glob and is now gone.)

- [ ] **Step 4: Verify nothing references the removed modules**

Run: `npm run lint && npm run compile && npm run knip && npm run build`
Expected: exit 0. If `tsc`/knip flag a dangling import of `@/features/pickFolder` or the sandbox, fix it (there should be none — App.tsx was updated in Task 5). Confirm the build no longer emits `sandbox.html` and the manifest has no `sandbox` key:

```bash
node -e "const m=require('./.output/chrome-mv3/manifest.json'); console.log('sandbox key:', 'sandbox' in m); console.log('csp:', JSON.stringify(m.content_security_policy));"
```

Expected: `sandbox key: false`; csp `extension_pages` = `script-src 'self'; object-src 'self';`.

- [ ] **Step 5: Commit**

```bash
npx biome check --write .
git add -A
git commit -m "refactor: remove google picker, sandbox page, and remote csp"
```

---

## Task 7: Docs

**Files:**
- Modify: `docs/security.md`, `docs/features.md`, `docs/development.md`

- [ ] **Step 1: `docs/security.md`**

Replace the entire "Picker" + "Sandbox CSP" + "Picker API key" sections with a concise **"Folder selection: app-owned folder"** section: under `drive.file` the app cannot browse the user's Drive (by design), so there is no Picker — the user names a folder and the app finds-or-creates an **app-owned** folder via `drive.file`. State the upgraded posture: **no remote scripts anywhere**, `extension_pages` CSP is `script-src 'self'; object-src 'self'`, no sandboxed page, no `WXT_PICKER_API_KEY`. Note `drive.file` keeps Drive exposure to that one app-created folder + files within it.

- [ ] **Step 2: `docs/features.md`**

Update folder selection: connect now creates/reuses a named app folder (no folder browsing). Move "Connect Google Drive" behavior note accordingly. Keep "change folder without disconnecting" under Next to pick up.

- [ ] **Step 3: `docs/development.md`**

Remove the Picker API-key setup steps and the sandboxed-picker debugging note. Update the Google OAuth section: only `WXT_OAUTH_CLIENT_ID` is needed now (no Picker key). Update the manual E2E checklist's connect step to "enter a folder name → app creates/reuses it" instead of the Picker.

- [ ] **Step 4: Commit**

```bash
npx biome check --write .
git add docs/security.md docs/features.md docs/development.md
git commit -m "docs: record app-owned folder model, remove picker docs"
```

---

## Task 8: Full verification

- [ ] **Step 1: Full suite**

Run: `npm run lint && npm run compile && npm run knip && npm test && npm run build`
Expected: exit 0. The `pickFolder` protocol tests are gone with the feature; `findOrCreateFolder` + gateway `drive/connect` + popup tests cover the new path.

---

## Self-Review

- **Spec coverage:** minimum scope `drive.file` retained ✓; folder selection now works within that scope via an app-owned folder (find-or-create by name) ✓; token still only in the background worker (interactive `getToken` in the gateway) ✓; **security improved** — no remote code, no sandbox, tighter CSP, one fewer secret (`WXT_PICKER_API_KEY` unused) ✓. The "pick an arbitrary existing folder" capability is intentionally dropped (it requires a sensitive/restricted scope + Google verification); the user can move existing diagrams into the app folder via Drive's own UI.
- **Placeholders:** none. The escaping test in Task 1 is flagged as simplify-if-awkward, with the core behavior covered by the first two cases.
- **Type consistency:** `findOrCreateFolder(token, name) => {id, name}` defined once (driveClient) and matched in `GatewayDeps`, the background `deps`, and the gateway case; `drive/connect { folderName }` consistent across `messages.ts`, gateway, and `App.tsx`; `PopupConnect.onConnect(folderName: string)` matches `App.onConnect`.
- **Known follow-ups:** "change folder without disconnecting" (roadmap) becomes "re-connect with a different name"; a future migration could let the user pick among multiple app-created folders. If broad folder browsing is ever required, that's a separate scope-upgrade decision (sensitive scope + verification), explicitly out of scope here.
```
