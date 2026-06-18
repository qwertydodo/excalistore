# Excalistore Plan 4 — Panel, Autosave & Session

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the user-facing in-page experience on excalidraw.com: a React panel (rendered in a Shadow DOM, styled with the shared `ui` primitives + theme) that lists the connected folder's diagrams and lets the user open, create, and rename them; debounced autosave with the conflict guard; the safe sign-out lifecycle (flush → clear canvas → revoke); involuntary-logout (401) handling that keeps the local scene; and a theme mirror that tracks Excalidraw's light/dark mode.

**Architecture:** Feature-Sliced. New pure/testable features: `features/autosave` (a debounced controller over injected `getHash`/`save`), `features/session` (active-file pointer persisted in `chrome.storage.local`). `shared/api` gains a `RequestError` that preserves the gateway's error `code` (so the panel can distinguish `conflict` / `unauthorized` / `unknown`). `widgets/diagramPanel` is the presentational panel + dialogs, composed only from `shared/ui`. The stateful orchestration that wires messaging + `sceneBridge` (Plan 3) + autosave + session lives in the **app layer** (`entrypoints/content.tsx`), which may import any layer — keeping the widget presentational and FSD-clean. The OAuth token never leaves the background worker; the panel talks to it only via typed `sendToBackground` messages.

**Tech Stack:** WXT (content-script Shadow DOM UI), React 19, TS strict, Biome, Vitest + Testing Library (jsdom), knip, lefthook.

**Reference:** Spec `docs/superpowers/specs/2026-06-17-excalistore-design.md` (Components → Content script → `panel`/`autosave`; Data Flow; Auth/Session Lifecycle). Builds directly on Plan 3 (`features/sceneBridge`, `entities/diagram` `ActiveFile`, gateway `drive/get|create|update|rename`), merged to `main`.

**Branch:** `feat/panel-autosave` (create off `main`).

**Conventions (from CLAUDE.md):** FSD layers import downward only (`shared → entities → features → widgets`; `entrypoints/` may import any); module files camelCase, components PascalCase; **CSS Modules** referencing `var(--es-*)`, no inline `style` except genuinely dynamic values (document the exception); colocated tests; Conventional Commits; do not bypass git hooks.

---

## Windows / line-endings note (applies to EVERY task)

Windows dev: the Write tool emits CRLF, Biome requires LF. **Before every `git commit`** run `npx biome check --write .`, then re-`git add`. If the lefthook/biome `pre-commit` hook blocks a commit on formatting, run `npx biome check --write .`, re-stage, re-commit. **Never** use `--no-verify`. Note the hook runs `tsc --noEmit` over the whole project, so a commit can fail on a not-yet-written consumer — order tasks so each commit type-checks (this plan is ordered that way).

---

## Shared UI primitive signatures (already built — use as-is, do not modify)

- `Button({ variant?: "primary"|"secondary"|"danger", ...buttonAttrs })`
- `Badge({ tone?: "neutral"|"success"|"danger", children })`
- `ListItem({ active?: boolean, onClick?, children })`
- `TextField(inputAttrs)` (spreads onto `<input>`)
- `Spinner({ size?: number })`
- `Dialog({ title, children, onClose? })`
- `ConfirmDialog({ title, message, confirmLabel?, cancelLabel?, danger?, onConfirm, onCancel })`

All exported from the `@/shared/ui` barrel.

---

## File Structure (added by this plan)

```
src/
  shared/api/
    sendMessage.ts + sendMessage.test.ts      # RequestError preserving error code
  features/
    autosave/
      lib/{autosaveController.ts, autosaveController.test.ts, index.ts}
      index.ts
    session/
      lib/{activeFileStore.ts, activeFileStore.test.ts, index.ts}
      index.ts
  widgets/
    diagramPanel/
      DiagramPanel/{DiagramPanel.tsx, DiagramPanel.module.css, DiagramPanel.test.tsx, index.ts}
      index.ts
entrypoints/
  content.tsx                                  # replaces content.ts: Shadow DOM mount + orchestration
```

---

## Task 1: `RequestError` — preserve the gateway error code

`sendToBackground` currently throws a bare `Error(res.error)`, discarding `code`. The panel needs `code` to tell `conflict` (autosave badge) and `unauthorized` (session-expired) apart.

**Files:**
- Modify: `src/shared/api/sendMessage.ts`
- Modify: `src/shared/api/sendMessage.test.ts`

- [x] **Step 1: Add failing tests**

Replace the body of `sendMessage.test.ts` with (keeps the two existing cases, adds the code-preservation case):

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RequestError, sendToBackground } from "./sendMessage";

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

  it("throws RequestError carrying the code on error response", async () => {
    runtime.sendMessage.mockResolvedValue({ ok: false, error: "nope", code: "unauthorized" });
    await expect(sendToBackground({ type: "auth/status" })).rejects.toMatchObject({
      message: "nope",
      code: "unauthorized",
    });
    await expect(sendToBackground({ type: "auth/status" })).rejects.toBeInstanceOf(RequestError);
  });

  it("defaults the code to unknown when omitted", async () => {
    runtime.sendMessage.mockResolvedValue({ ok: false, error: "boom" });
    await expect(sendToBackground({ type: "auth/status" })).rejects.toMatchObject({ code: "unknown" });
  });
});
```

- [x] **Step 2: Run to verify it fails**

Run: `npx vitest run src/shared/api/sendMessage.test.ts`
Expected: FAIL — `RequestError` not exported.

- [x] **Step 3: Update `sendMessage.ts`**

```typescript
import { type Err, isErrorResponse, type Request, type Response } from "./messages";

type ErrCode = NonNullable<Err["code"]>;

// Carries the gateway's error code so callers can branch on conflict /
// unauthorized / unknown without string-matching the message.
export class RequestError extends Error {
  readonly code: ErrCode;
  constructor(message: string, code: ErrCode) {
    super(message);
    this.name = "RequestError";
    this.code = code;
  }
}

// Thin typed wrapper around chrome.runtime.sendMessage used by popup + content
// script. Throws RequestError on error responses so callers use try/catch.
export async function sendToBackground<T>(request: Request): Promise<T> {
  const res = (await chrome.runtime.sendMessage(request)) as Response<T>;
  if (isErrorResponse(res)) throw new RequestError(res.error, res.code ?? "unknown");
  return res.data;
}
```

- [x] **Step 4: Run to verify it passes**

Run: `npx vitest run src/shared/api/sendMessage.test.ts`
Expected: PASS.

- [x] **Step 5: Verify + commit**

Run: `npm run lint && npm run compile`

```bash
npx biome check --write .
git add src/shared/api/sendMessage.ts src/shared/api/sendMessage.test.ts
git commit -m "feat: preserve gateway error code via RequestError"
```

---

## Task 2: Active-file session store

Persist the `ActiveFile` pointer in `chrome.storage.local` so it survives the `writeScene` → tab reload. Content scripts may use `chrome.storage` directly (it is local session state, not a Drive secret).

**Files:**
- Create: `src/features/session/lib/activeFileStore.ts`, `activeFileStore.test.ts`, `index.ts`
- Create: `src/features/session/index.ts`

- [x] **Step 1: Write the failing test `activeFileStore.test.ts`**

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearActiveFile, getActiveFile, setActiveFile } from "./activeFileStore";

const store: Record<string, unknown> = {};
const local = {
  get: vi.fn(async (key: string) => ({ [key]: store[key] })),
  set: vi.fn(async (obj: Record<string, unknown>) => {
    Object.assign(store, obj);
  }),
  remove: vi.fn(async (key: string) => {
    delete store[key];
  }),
};

beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k];
  (globalThis as unknown as { chrome: unknown }).chrome = { storage: { local } };
  local.get.mockClear();
  local.set.mockClear();
  local.remove.mockClear();
});
afterEach(() => vi.restoreAllMocks());

describe("activeFileStore", () => {
  it("returns null when nothing is stored", async () => {
    await expect(getActiveFile()).resolves.toBeNull();
  });

  it("round-trips a valid pointer", async () => {
    const af = { id: "1", name: "a.excalidraw", loadedRevision: "r" };
    await setActiveFile(af);
    await expect(getActiveFile()).resolves.toEqual(af);
  });

  it("returns null for a malformed stored value", async () => {
    store.activeFile = { id: "1" };
    await expect(getActiveFile()).resolves.toBeNull();
  });

  it("clears the pointer", async () => {
    await setActiveFile({ id: "1", name: "a", loadedRevision: "r" });
    await clearActiveFile();
    await expect(getActiveFile()).resolves.toBeNull();
  });
});
```

- [x] **Step 2: Run to verify it fails**

Run: `npx vitest run src/features/session/lib/activeFileStore.test.ts`
Expected: FAIL — module not found.

- [x] **Step 3: Write `activeFileStore.ts`**

```typescript
import { type ActiveFile, isActiveFile } from "@/entities/diagram";

const KEY = "activeFile";

// The active-file pointer survives the writeScene→reload via chrome.storage.local.
export async function getActiveFile(): Promise<ActiveFile | null> {
  const value = (await chrome.storage.local.get(KEY))[KEY];
  return isActiveFile(value) ? value : null;
}

export async function setActiveFile(file: ActiveFile): Promise<void> {
  await chrome.storage.local.set({ [KEY]: file });
}

export async function clearActiveFile(): Promise<void> {
  await chrome.storage.local.remove(KEY);
}
```

- [x] **Step 4: Barrels**

`src/features/session/lib/index.ts`: `export * from "./activeFileStore";`
`src/features/session/index.ts`: `export * from "./lib";`

- [x] **Step 5: Run to verify it passes**

Run: `npx vitest run src/features/session/lib/activeFileStore.test.ts`
Expected: PASS.

- [x] **Step 6: Verify + commit**

Run: `npm run lint && npm run compile && npm run knip`
(If knip flags `src/features/session/index.ts` as unused — it's consumed by `content.tsx` in Task 5 — add it to the `entry` array in `knip.json`.)

```bash
npx biome check --write .
git add src/features/session knip.json
git commit -m "feat: persist active file pointer in session store"
```

---

## Task 3: Autosave controller

A pure, fake-clock-testable debounced autosaver. It polls a `getHash` for scene changes; once the scene has been stable-but-different for `delayMs`, it calls `save`. The clock (`now`) and the poll trigger (`tick`) are injectable so tests drive it deterministically without real timers. `start()` wires `tick` to a real interval; `flush()` forces an immediate save (used by sign-out).

**Files:**
- Create: `src/features/autosave/lib/autosaveController.ts`, `autosaveController.test.ts`, `index.ts`
- Create: `src/features/autosave/index.ts`

- [x] **Step 1: Write the failing test `autosaveController.test.ts`**

```typescript
import { describe, expect, it, vi } from "vitest";
import { createAutosave } from "./autosaveController";

function setup(over: Partial<Parameters<typeof createAutosave>[0]> = {}) {
  let clock = 0;
  const statuses: string[] = [];
  const ctrl = createAutosave({
    getHash: vi.fn(async () => "h0"),
    save: vi.fn(async () => undefined),
    onStatus: (s) => statuses.push(s),
    delayMs: 2500,
    pollMs: 1000,
    now: () => clock,
    ...over,
  });
  return { ctrl, statuses, advance: (ms: number) => (clock += ms) };
}

describe("createAutosave", () => {
  it("does not save while the scene is unchanged", async () => {
    const save = vi.fn(async () => undefined);
    const { ctrl } = setup({ getHash: vi.fn(async () => "same"), save });
    ctrl.start();
    await ctrl.tick();
    await ctrl.tick();
    expect(save).not.toHaveBeenCalled();
    ctrl.stop();
  });

  it("saves after the scene stays changed for the debounce window", async () => {
    const save = vi.fn(async () => undefined);
    const getHash = vi.fn(async () => "h1"); // differs from baseline h0
    const { ctrl, statuses, advance } = setup({ getHash, save });
    ctrl.markSaved("h0"); // baseline
    await ctrl.tick(); // sees change at t=0, starts the debounce
    expect(save).not.toHaveBeenCalled();
    advance(2500);
    await ctrl.tick(); // debounce elapsed → save
    expect(save).toHaveBeenCalledOnce();
    expect(statuses).toContain("saving");
    expect(statuses).toContain("saved");
  });

  it("reports conflict status when save throws a conflict", async () => {
    const save = vi.fn(async () => {
      throw new Error("conflict: remote revision changed");
    });
    const { ctrl, statuses, advance } = setup({ getHash: vi.fn(async () => "h1"), save });
    ctrl.markSaved("h0");
    await ctrl.tick();
    advance(2500);
    await ctrl.tick();
    expect(statuses).toContain("conflict");
    expect(statuses).not.toContain("saved");
  });

  it("reports error status on a generic failure", async () => {
    const save = vi.fn(async () => {
      throw new Error("network down");
    });
    const { ctrl, statuses, advance } = setup({ getHash: vi.fn(async () => "h1"), save });
    ctrl.markSaved("h0");
    await ctrl.tick();
    advance(2500);
    await ctrl.tick();
    expect(statuses).toContain("error");
  });

  it("flush() saves immediately when dirty", async () => {
    const save = vi.fn(async () => undefined);
    const { ctrl } = setup({ getHash: vi.fn(async () => "h1"), save });
    ctrl.markSaved("h0");
    await ctrl.flush();
    expect(save).toHaveBeenCalledOnce();
  });

  it("flush() is a no-op when clean", async () => {
    const save = vi.fn(async () => undefined);
    const { ctrl } = setup({ getHash: vi.fn(async () => "h0"), save });
    ctrl.markSaved("h0");
    await ctrl.flush();
    expect(save).not.toHaveBeenCalled();
  });
});
```

- [x] **Step 2: Run to verify it fails**

Run: `npx vitest run src/features/autosave/lib/autosaveController.test.ts`
Expected: FAIL — module not found.

- [x] **Step 3: Write `autosaveController.ts`**

```typescript
export type SaveStatus = "idle" | "saving" | "saved" | "error" | "conflict";

export interface AutosaveOptions {
  getHash: () => Promise<string>;
  save: () => Promise<void>;
  onStatus: (status: SaveStatus) => void;
  delayMs?: number;
  pollMs?: number;
  now?: () => number;
}

export interface AutosaveController {
  start: () => void;
  stop: () => void;
  tick: () => Promise<void>;
  flush: () => Promise<void>;
  markSaved: (hash: string) => void;
}

// Debounced autosave: a change must persist for delayMs before we write, so we
// don't spam Drive mid-stroke. Clock + tick are injectable for deterministic
// tests; start() drives tick on a real interval.
export function createAutosave(opts: AutosaveOptions): AutosaveController {
  const delayMs = opts.delayMs ?? 2500;
  const pollMs = opts.pollMs ?? 1000;
  const now = opts.now ?? Date.now;

  let savedHash: string | null = null;
  let dirtySince: number | null = null;
  let saving = false;
  let timer: ReturnType<typeof setInterval> | null = null;

  async function runSave(hash: string): Promise<void> {
    saving = true;
    opts.onStatus("saving");
    try {
      await opts.save();
      savedHash = hash;
      dirtySince = null;
      opts.onStatus("saved");
    } catch (e) {
      opts.onStatus(/conflict/i.test((e as Error).message) ? "conflict" : "error");
    } finally {
      saving = false;
    }
  }

  async function tick(): Promise<void> {
    if (saving) return;
    const hash = await opts.getHash();
    if (savedHash === null) {
      savedHash = hash; // first observation = baseline
      return;
    }
    if (hash === savedHash) {
      dirtySince = null;
      return;
    }
    if (dirtySince === null) dirtySince = now();
    if (now() - dirtySince >= delayMs) await runSave(hash);
  }

  async function flush(): Promise<void> {
    if (saving) return;
    const hash = await opts.getHash();
    if (savedHash !== null && hash !== savedHash) await runSave(hash);
  }

  return {
    start() {
      if (timer === null) timer = setInterval(() => void tick(), pollMs);
    },
    stop() {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
    },
    tick,
    flush,
    markSaved(hash: string) {
      savedHash = hash;
      dirtySince = null;
    },
  };
}
```

- [x] **Step 4: Barrels**

`src/features/autosave/lib/index.ts`: `export * from "./autosaveController";`
`src/features/autosave/index.ts`: `export * from "./lib";`

- [x] **Step 5: Run to verify it passes**

Run: `npx vitest run src/features/autosave/lib/autosaveController.test.ts`
Expected: PASS.

- [x] **Step 6: Verify + commit**

Run: `npm run lint && npm run compile && npm run knip`
(Add `src/features/autosave/index.ts` to knip `entry` if flagged.)

```bash
npx biome check --write .
git add src/features/autosave knip.json
git commit -m "feat: add debounced autosave controller with conflict status"
```

---

## Task 4: DiagramPanel widget (presentational)

A pure presentational panel + its inline rename editor. All state/effects live in the content-script container (Task 5); this component just renders props and calls handlers. Composed only from `@/shared/ui`. Sign-out and replace-canvas **dialogs** are rendered by the container (they need orchestration), so the panel exposes `onSignOut`/`onOpen`/`onCreate`/`onRename` callbacks and a `saveStatus` for the badge.

**Files:**
- Create: `src/widgets/diagramPanel/DiagramPanel/DiagramPanel.tsx`, `.module.css`, `.test.tsx`, `index.ts`
- Create: `src/widgets/diagramPanel/index.ts`

- [x] **Step 1: Write the failing test `DiagramPanel.test.tsx`**

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DiagramPanel } from "./DiagramPanel";

const files = [
  { id: "1", name: "alpha.excalidraw", modifiedTime: "2026-06-18T10:00:00Z", headRevisionId: "r1" },
  { id: "2", name: "beta.excalidraw", modifiedTime: "2026-06-18T09:00:00Z", headRevisionId: "r2" },
];

function props(over = {}) {
  return {
    files,
    activeId: "1",
    saveStatus: "saved" as const,
    loading: false,
    onOpen: vi.fn(),
    onCreate: vi.fn(),
    onRename: vi.fn(),
    onSignOut: vi.fn(),
    ...over,
  };
}

describe("DiagramPanel", () => {
  it("lists files and marks the active one", () => {
    render(<DiagramPanel {...props()} />);
    expect(screen.getByText("alpha.excalidraw")).toBeInTheDocument();
    expect(screen.getByText("beta.excalidraw")).toBeInTheDocument();
  });

  it("opens a file on click", async () => {
    const onOpen = vi.fn();
    render(<DiagramPanel {...props({ onOpen })} />);
    await userEvent.click(screen.getByText("beta.excalidraw"));
    expect(onOpen).toHaveBeenCalledWith("2");
  });

  it("creates a new diagram with the entered name", async () => {
    const onCreate = vi.fn();
    render(<DiagramPanel {...props({ onCreate })} />);
    await userEvent.click(screen.getByRole("button", { name: /new/i }));
    await userEvent.type(screen.getByPlaceholderText(/name/i), "gamma");
    await userEvent.click(screen.getByRole("button", { name: /^create$/i }));
    expect(onCreate).toHaveBeenCalledWith("gamma");
  });

  it("shows a conflict badge", () => {
    render(<DiagramPanel {...props({ saveStatus: "conflict" })} />);
    expect(screen.getByText(/conflict/i)).toBeInTheDocument();
  });

  it("signs out", async () => {
    const onSignOut = vi.fn();
    render(<DiagramPanel {...props({ onSignOut })} />);
    await userEvent.click(screen.getByRole("button", { name: /sign out/i }));
    expect(onSignOut).toHaveBeenCalledOnce();
  });
});
```

- [x] **Step 2: Run to verify it fails**

Run: `npx vitest run src/widgets/diagramPanel/DiagramPanel/DiagramPanel.test.tsx`
Expected: FAIL — module not found.

- [x] **Step 3: Write `DiagramPanel.tsx`**

```tsx
import { useState } from "react";
import type { DriveFileMeta } from "@/shared/api";
import type { SaveStatus } from "@/features/autosave";
import { Badge, Button, ListItem, Spinner, TextField } from "@/shared/ui";
import styles from "./DiagramPanel.module.css";

interface Props {
  files: DriveFileMeta[];
  activeId: string | null;
  saveStatus: SaveStatus;
  loading: boolean;
  onOpen: (id: string) => void;
  onCreate: (name: string) => void;
  onRename: (id: string, name: string) => void;
  onSignOut: () => void;
}

const STATUS_TONE: Record<SaveStatus, "neutral" | "success" | "danger"> = {
  idle: "neutral",
  saving: "neutral",
  saved: "success",
  error: "danger",
  conflict: "danger",
};

const STATUS_LABEL: Record<SaveStatus, string> = {
  idle: "Idle",
  saving: "Saving…",
  saved: "Saved",
  error: "Save failed",
  conflict: "Conflict — not saved",
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString();
}

export function DiagramPanel({
  files,
  activeId,
  saveStatus,
  loading,
  onOpen,
  onCreate,
  onRename,
  onSignOut,
}: Props) {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  function submitCreate() {
    const name = newName.trim();
    if (!name) return;
    onCreate(name);
    setNewName("");
    setCreating(false);
  }

  function submitRename(id: string) {
    const name = renameValue.trim();
    if (name) onRename(id, name);
    setRenamingId(null);
  }

  return (
    <section className={styles.root} aria-label="Excalistore diagrams">
      <header className={styles.header}>
        <h2 className={styles.title}>Diagrams</h2>
        <Badge tone={STATUS_TONE[saveStatus]}>{STATUS_LABEL[saveStatus]}</Badge>
      </header>

      {loading ? (
        <div className={styles.loading}>
          <Spinner />
        </div>
      ) : (
        <ul className={styles.list}>
          {files.map((f) => (
            <li key={f.id}>
              {renamingId === f.id ? (
                <form
                  className={styles.renameRow}
                  onSubmit={(e) => {
                    e.preventDefault();
                    submitRename(f.id);
                  }}
                >
                  <TextField
                    aria-label="Rename diagram"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    // biome-ignore lint/a11y/noAutofocus: focus the inline editor the user just opened.
                    autoFocus
                  />
                  <Button type="submit">Save</Button>
                </form>
              ) : (
                <ListItem active={f.id === activeId} onClick={() => onOpen(f.id)}>
                  <span className={styles.name}>{f.name}</span>
                  <span className={styles.meta}>{formatDate(f.modifiedTime)}</span>
                  <button
                    type="button"
                    className={styles.renameBtn}
                    aria-label={`Rename ${f.name}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setRenamingId(f.id);
                      setRenameValue(f.name);
                    }}
                  >
                    Rename
                  </button>
                </ListItem>
              )}
            </li>
          ))}
        </ul>
      )}

      <footer className={styles.footer}>
        {creating ? (
          <form
            className={styles.createRow}
            onSubmit={(e) => {
              e.preventDefault();
              submitCreate();
            }}
          >
            <TextField
              placeholder="Diagram name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              // biome-ignore lint/a11y/noAutofocus: focus the create field the user just opened.
              autoFocus
            />
            <Button type="submit">Create</Button>
            <Button variant="secondary" onClick={() => setCreating(false)}>
              Cancel
            </Button>
          </form>
        ) : (
          <Button onClick={() => setCreating(true)}>New diagram</Button>
        )}
        <Button variant="secondary" onClick={onSignOut}>
          Sign out
        </Button>
      </footer>
    </section>
  );
}
```

- [x] **Step 4: Write `DiagramPanel.module.css`**

```css
.root {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 260px;
  max-height: 70vh;
  padding: 12px;
  background: var(--es-bg);
  color: var(--es-text);
  border: 1px solid var(--es-border);
  border-radius: var(--es-radius);
  box-shadow: var(--es-shadow);
  font: 13px/1.4 system-ui, sans-serif;
}
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.title {
  margin: 0;
  font-size: 14px;
}
.list {
  list-style: none;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.meta {
  color: var(--es-muted);
  font-size: 11px;
}
.renameBtn {
  border: none;
  background: none;
  color: var(--es-accent);
  cursor: pointer;
  font-size: 11px;
}
.renameRow,
.createRow {
  display: flex;
  gap: 4px;
  align-items: center;
}
.loading {
  display: flex;
  justify-content: center;
  padding: 16px;
}
.footer {
  display: flex;
  flex-direction: column;
  gap: 6px;
  border-top: 1px solid var(--es-border);
  padding-top: 8px;
}
```

- [x] **Step 5: Barrels**

`src/widgets/diagramPanel/DiagramPanel/index.ts`: `export { DiagramPanel } from "./DiagramPanel";`
`src/widgets/diagramPanel/index.ts`: `export * from "./DiagramPanel";`

- [x] **Step 6: Run to verify it passes**

Run: `npx vitest run src/widgets/diagramPanel/DiagramPanel/DiagramPanel.test.tsx`
Expected: PASS. (jsdom for `src/widgets/**` is already configured in `vitest.config.ts` from Plan 2.)

- [x] **Step 7: Verify + commit**

Run: `npm run lint && npm run compile && npm run knip`
(Add `src/widgets/diagramPanel/index.ts` to knip `entry` if flagged — consumed by `content.tsx` in Task 5.)

```bash
npx biome check --write .
git add src/widgets/diagramPanel knip.json
git commit -m "feat: add diagram panel widget"
```

---

## Task 5: Content-script Shadow DOM mount + orchestration

The app-layer integration: mount the panel in a Shadow DOM on excalidraw.com, and wire messaging + `sceneBridge` + autosave + session + theme mirror. This is the integration surface — **verified manually** (Task 6), not unit-tested (a real DOM + extension runtime + Drive are needed). Keep logic delegated to the already-tested features so this file stays thin.

**IMPORTANT — verify the WXT API for the installed version (0.19.x) before writing:** check how `createShadowRootUi` is imported and called in `node_modules/wxt` (the export and its options, esp. `cssInjectionMode` on `defineContentScript` and the `onMount`/`position` options on `createShadowRootUi`). Adjust the import path / option names below to match the installed version. The shape below matches WXT 0.19's documented React + Shadow DOM pattern; confirm, don't assume.

**Files:**
- Delete: `entrypoints/content.ts`
- Create: `entrypoints/content.tsx`

- [x] **Step 1: Replace the content entrypoint**

Remove `entrypoints/content.ts` and create `entrypoints/content.tsx`:

```tsx
import { createRoot } from "react-dom/client";
import { StrictMode, useCallback, useEffect, useRef, useState } from "react";
import {
  buildExcalidrawFile,
  parseExcalidrawFile,
  sceneHash,
} from "@/entities/diagram";
import { createAutosave, type SaveStatus } from "@/features/autosave";
import {
  clearScene,
  currentSceneHash,
  defaultSceneBridgeDeps,
  readScene,
  readTheme,
  writeScene,
} from "@/features/sceneBridge";
import { clearActiveFile, getActiveFile, setActiveFile } from "@/features/session";
import { RequestError, sendToBackground } from "@/shared/api";
import type { ConnectionStatus, DiagramContent, DriveFileMeta } from "@/shared/api";
import { THEME_ATTR } from "@/shared/config";
import { ConfirmDialog } from "@/shared/ui";
import { DiagramPanel } from "@/widgets/diagramPanel";
// Import the panel + dialog styles so WXT injects them into the shadow root.
import "@/shared/config/theme.css";

const bridge = defaultSceneBridgeDeps();

function PanelApp({ host }: { host: HTMLElement }) {
  const [status, setStatus] = useState<ConnectionStatus>({ connected: false });
  const [files, setFiles] = useState<DriveFileMeta[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [loading, setLoading] = useState(false);
  const [signOutOpen, setSignOutOpen] = useState(false);
  const revisionRef = useRef<string | null>(null);

  // Mirror Excalidraw's theme onto the shadow host.
  useEffect(() => {
    const apply = () => host.setAttribute(THEME_ATTR, readTheme(bridge));
    apply();
    const id = setInterval(apply, 1000);
    return () => clearInterval(id);
  }, [host]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const list = await sendToBackground<DriveFileMeta[]>({ type: "drive/list" });
      setFiles(list);
    } catch (e) {
      if (e instanceof RequestError && e.code === "unauthorized") {
        setStatus({ connected: false });
      }
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
      if (active) {
        setActiveId(active.id);
        revisionRef.current = active.loadedRevision;
      }
      if (s.connected) await refresh();
    })();
  }, [refresh]);

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
    void currentSceneHash(bridge).then((h) => autosave.markSaved(h));
    autosave.start();
    return () => autosave.stop();
  }, [activeId]);

  const onOpen = useCallback(async (id: string) => {
    const { meta, content } = await sendToBackground<DiagramContent>({ type: "drive/get", id });
    const file = parseExcalidrawFile(content); // validates before write
    await setActiveFile({ id: meta.id, name: meta.name, loadedRevision: meta.headRevisionId });
    await writeScene(file, bridge); // reloads the tab
  }, []);

  const onCreate = useCallback(
    async (name: string) => {
      const fileName = name.endsWith(".excalidraw") ? name : `${name}.excalidraw`;
      const empty = buildExcalidrawFile([], { theme: readTheme(bridge) }, {});
      const meta = await sendToBackground<DriveFileMeta>({
        type: "drive/create",
        name: fileName,
        content: JSON.stringify(empty),
      });
      await setActiveFile({ id: meta.id, name: meta.name, loadedRevision: meta.headRevisionId });
      await writeScene(empty, bridge); // reloads
    },
    [],
  );

  const onRename = useCallback(
    async (id: string, name: string) => {
      const fileName = name.endsWith(".excalidraw") ? name : `${name}.excalidraw`;
      await sendToBackground<DriveFileMeta>({ type: "drive/rename", id, name: fileName });
      await refresh();
    },
    [refresh],
  );

  const doSignOut = useCallback(async () => {
    setSignOutOpen(false);
    // Flush the active file before clearing, per the safe sign-out contract.
    if (activeId) {
      try {
        const scene = await readScene(bridge);
        await sendToBackground({
          type: "drive/update",
          id: activeId,
          content: JSON.stringify(scene),
          prevRevision: revisionRef.current ?? "",
        });
      } catch {
        // Best-effort flush; sign-out proceeds regardless.
      }
    }
    await sendToBackground({ type: "auth/signOut" });
    await clearActiveFile();
    setStatus({ connected: false });
    setActiveId(null);
    await clearScene(bridge); // clears canvas + reloads
  }, [activeId]);

  if (!status.connected) {
    return (
      <p style={{ padding: 12, font: "13px system-ui" }}>
        {/* dynamic: nothing — kept minimal; full disconnected UI lives in the popup */}
        Excalistore: open the extension popup to connect Google Drive.
      </p>
    );
  }

  return (
    <>
      <DiagramPanel
        files={files}
        activeId={activeId}
        saveStatus={saveStatus}
        loading={loading}
        onOpen={onOpen}
        onCreate={onCreate}
        onRename={onRename}
        onSignOut={() => setSignOutOpen(true)}
      />
      {signOutOpen && (
        <ConfirmDialog
          title="Sign out of Excalistore?"
          message="This saves the current diagram to Drive and clears the canvas. Continue?"
          confirmLabel="Save & sign out"
          danger
          onConfirm={doSignOut}
          onCancel={() => setSignOutOpen(false)}
        />
      )}
    </>
  );
}

export default defineContentScript({
  matches: ["https://excalidraw.com/*"],
  cssInjectionMode: "ui",
  async main(ctx) {
    const ui = await createShadowRootUi(ctx, {
      name: "excalistore-panel",
      position: "inline",
      anchor: "body",
      onMount(container) {
        // Host the panel fixed in a corner; the host element carries the theme attr.
        const host = container as HTMLElement;
        host.style.position = "fixed";
        host.style.top = "64px";
        host.style.right = "16px";
        host.style.zIndex = "1000";
        const root = createRoot(container);
        root.render(
          <StrictMode>
            <PanelApp host={host} />
          </StrictMode>,
        );
        return root;
      },
      onRemove(root) {
        root?.unmount();
      },
    });
    ui.mount();
  },
});
```

**Notes for the implementer:**
- The two `style={{...}}` inline uses are the documented dynamic-value exception (CSS Modules can't target the WXT-generated shadow host element; positioning the host is genuinely dynamic). If the disconnected `<p>`'s inline style trips Biome's a11y/style rules, move it to a CSS-module class instead — only the host positioning truly needs inline styles.
- If `THEME_ATTR` isn't exported from `@/shared/config`, it lives in `src/shared/config/theme.ts` (`export const THEME_ATTR = "data-theme"`); confirm it's re-exported by the config barrel (it is, via `export * from "./theme"`).
- Confirm `parseExcalidrawFile` and `buildExcalidrawFile` are exported from `@/entities/diagram` (they are, from Plan 1).

- [x] **Step 2: Build to verify the integration compiles + bundles**

Run: `npm run lint && npm run compile && npm run build`
Expected: exit 0; `wxt build` emits `content-scripts/content.js` and now bundles React + the panel + `idb-keyval` into the content script. If `createShadowRootUi` / option names mismatch the installed WXT, fix per the real API and re-run.

- [x] **Step 3: Commit**

```bash
npx biome check --write .
git add entrypoints/content.tsx entrypoints/content.ts
git commit -m "feat: mount in-page diagram panel with autosave and safe sign-out"
```

---

## Task 6: Manual E2E + docs

**Files:**
- Modify: `docs/features.md`, `docs/development.md`, `docs/architecture.md`

- [x] **Step 1: Manual E2E (requires the real Google Cloud client — pending the user's `.env`)**

Add to `docs/development.md` an **unchecked** checklist (do not fabricate results — the implementer cannot run this without `WXT_OAUTH_CLIENT_ID` + `WXT_PICKER_API_KEY`):

```markdown
### Panel / autosave / sign-out manual E2E (Plan 4)

Requires `WXT_OAUTH_CLIENT_ID` + `WXT_PICKER_API_KEY` in `.env`. Pending user run.

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
```

- [x] **Step 2: `docs/features.md`**

Move into "Shipped" with behavior notes: open diagram (replace-canvas), create, rename, debounced autosave + conflict guard, safe sign-out (flush→clear), involuntary-logout handling, theme mirror. Remove them from "Next to pick up". Leave genuinely-future items (change folder without disconnecting, thumbnails, conflict-resolution UI, delete/move, cross-browser, Playwright) under "Next to pick up".

- [x] **Step 3: `docs/architecture.md`**

Add `features/{autosave,session}` and `widgets/diagramPanel` to the FSD layout; note the content-script Shadow DOM mount in `entrypoints/content.tsx`, the autosave→gateway→`drive/update` flow with the `loadedRevision` conflict guard, the active-file persistence across reload, and the theme mirror. Note `RequestError` carries the gateway error code to the panel.

- [x] **Step 4: Commit**

```bash
npx biome check --write .
git add docs/features.md docs/development.md docs/architecture.md
git commit -m "docs: record panel, autosave, and session lifecycle (plan 4)"
```

---

## Self-Review

- **Spec coverage (Plan 4 portion):** in-page panel listing names + modified date ✓ (Task 4); active-file indicator ✓ (`activeId`); save-status badge ✓ (`saveStatus`); open (replace-canvas confirm) / create / rename ✓ (Task 5 handlers + Task 4 UI); debounced autosave ~2.5s ✓ (Task 3); conflict guard surfaced as a badge, no silent overwrite ✓ (Tasks 1+3+5, `prevRevision` + `code: "conflict"`); safe sign-out flush→clear→revoke ✓ (Task 5 `doSignOut`); involuntary 401 → disconnected without clearing scene ✓ (Task 5 `refresh` catch + `RequestError`); theme mirror light/dark ✓ (Task 5 effect + `readTheme`); embedded-image fidelity via `sceneBridge`/`filesDb` ✓ (Plan 3, exercised here). Conflict-resolution UI is explicitly deferred (v1 blocks + warns).
- **Placeholders:** none in the testable code (Tasks 1–4 have complete code + tests). Task 5 is integration code, complete, with one flagged verification point (the WXT `createShadowRootUi` API for the installed version) — handled as an explicit "verify against node_modules" instruction, mirroring how Plan 2/3 treated the Picker and IndexedDB boundaries.
- **Type consistency:** `SaveStatus` defined once (Task 3) and consumed by the panel + container; `RequestError`/`ErrCode` (Task 1) used in the container's 401 branch; `ActiveFile`/`isActiveFile` (Plan 3) used by the session store; `DriveFileMeta`/`DiagramContent`/`ConnectionStatus`/`Request` from `shared/api`; `readScene`/`writeScene`/`clearScene`/`currentSceneHash`/`readTheme`/`defaultSceneBridgeDeps` from `sceneBridge` (Plan 3); `buildExcalidrawFile`/`parseExcalidrawFile`/`sceneHash` from `entities/diagram` (Plan 1). Names match across tasks.
- **Known follow-ups (post-Plan 4 / roadmap):** change folder without disconnect; thumbnails; a real conflict-resolution UI (reload-remote / overwrite / save-as); delete/move; theme mirror via a precise `MutationObserver` on Excalidraw's root instead of the 1s poll; debounce the autosave poll off real edit events if Excalidraw later exposes them; Playwright E2E.
```
