# Excalistore Plan 1 — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold the Excalistore Chrome extension repo with full tooling and a tested shared layer, so Plans 2 and 3 build on a green, lint-clean, type-safe base.

**Architecture:** WXT (Manifest V3) + React + TypeScript (strict). Pure, browser-free shared modules (`messages`, `excalidraw-format`) are unit-tested with Vitest; UI primitives (`theme`, `ui`) are component-tested with Testing Library/jsdom. Background, content, and popup entrypoints are minimal stubs here — real logic lands in Plans 2–3.

**Tech Stack:** WXT, React 19, TypeScript 5 (strict), Biome (lint+format), Vitest + @testing-library/react + jsdom, knip (dead code), lefthook (git hooks), commitlint (Conventional Commits), zod (envelope validation).

**Reference:** Spec at `docs/superpowers/specs/2026-06-17-excalistore-design.md`.

**Conventions:** Commits follow Conventional Commits (`type(scope): subject`). Branches `type/short-description`. Run all commands from repo root `D:\Documents\Programming\Projects\excalistore`.

---

## File Structure (created by this plan)

```
excalistore/
├── package.json
├── tsconfig.json
├── wxt.config.ts
├── biome.json
├── vitest.config.ts
├── knip.json
├── lefthook.yml
├── commitlint.config.js
├── .gitignore
├── .github/workflows/ci.yml
├── CLAUDE.md
├── README.md
├── docs/
│   ├── architecture.md
│   ├── features.md
│   ├── security.md
│   └── development.md
├── .claude/skills/            (installed skills — see Task 13)
├── entrypoints/
│   ├── background.ts          (stub)
│   ├── content.ts             (stub)
│   └── popup/                 (stub: index.html, main.tsx, App.tsx)
├── src/shared/
│   ├── messages.ts            (typed contracts)
│   ├── excalidraw-format.ts   (pure build/parse/validate/hash)
│   ├── theme.ts               (design tokens)
│   └── ui/
│       ├── Button.tsx
│       ├── IconButton.tsx
│       ├── Dialog.tsx
│       ├── ConfirmDialog.tsx
│       ├── TextField.tsx
│       ├── ListItem.tsx
│       ├── Badge.tsx
│       ├── Spinner.tsx
│       └── index.ts
└── tests/
    ├── excalidraw-format.test.ts
    ├── messages.test.ts
    ├── theme.test.ts
    └── ui/*.test.tsx
```

---

## Task 1: Initialize package and Node project

**Files:**
- Create: `package.json`
- Create: `.gitignore`

- [ ] **Step 1: Create `.gitignore`**

```
node_modules/
.output/
.wxt/
dist/
*.log
.DS_Store
stats.html
coverage/
```

- [ ] **Step 2: Create `package.json`**

```json
{
  "name": "excalistore",
  "version": "0.1.0",
  "description": "Chrome extension connecting excalidraw.com to Google Drive.",
  "type": "module",
  "private": true,
  "scripts": {
    "dev": "wxt",
    "build": "wxt build",
    "zip": "wxt zip",
    "compile": "tsc --noEmit",
    "lint": "biome check .",
    "lint:fix": "biome check --write .",
    "format": "biome format --write .",
    "test": "vitest run",
    "test:watch": "vitest",
    "knip": "knip",
    "postinstall": "wxt prepare",
    "prepare": "lefthook install"
  },
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@biomejs/biome": "^2.0.0",
    "@commitlint/cli": "^19.0.0",
    "@commitlint/config-conventional": "^19.0.0",
    "@testing-library/jest-dom": "^6.4.0",
    "@testing-library/react": "^16.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@wxt-dev/module-react": "^1.1.0",
    "jsdom": "^24.0.0",
    "knip": "^5.0.0",
    "lefthook": "^1.6.0",
    "typescript": "^5.5.0",
    "vitest": "^2.0.0",
    "wxt": "^0.19.0"
  }
}
```

- [ ] **Step 3: Install dependencies**

Run: `npm install`
Expected: dependencies install; `wxt prepare` runs via postinstall (creates `.wxt/`); `lefthook install` runs via prepare. No fatal errors. (Lefthook config added in Task 5 — a warning here is fine.)

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json .gitignore
git commit -m "chore: initialize node project and dependencies"
```

---

## Task 2: TypeScript strict config

**Files:**
- Create: `tsconfig.json`

- [ ] **Step 1: Create `tsconfig.json`**

```json
{
  "extends": "./.wxt/tsconfig.json",
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "exactOptionalPropertyTypes": true,
    "verbatimModuleSyntax": true,
    "jsx": "react-jsx",
    "types": ["vitest/globals", "@testing-library/jest-dom"],
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src", "tests", "entrypoints", "*.config.ts", "wxt.config.ts"]
}
```

- [ ] **Step 2: Verify typecheck runs (no source files yet, should pass trivially)**

Run: `npm run compile`
Expected: exits 0 (or only complains about missing files we create later — if it errors on `.wxt/tsconfig.json` missing, run `npx wxt prepare` first, then re-run).

- [ ] **Step 3: Commit**

```bash
git add tsconfig.json
git commit -m "chore: add strict typescript config"
```

---

## Task 3: WXT config and stub entrypoints

**Files:**
- Create: `wxt.config.ts`
- Create: `entrypoints/background.ts`
- Create: `entrypoints/content.ts`
- Create: `entrypoints/popup/index.html`
- Create: `entrypoints/popup/main.tsx`
- Create: `entrypoints/popup/App.tsx`

- [ ] **Step 1: Create `wxt.config.ts`**

```typescript
import { defineConfig } from "wxt";

// Manifest V3, minimal permissions. drive.file scope + identity for OAuth.
// host_permissions limited to excalidraw.com and Google APIs only.
export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  manifest: {
    name: "Excalistore",
    description: "Store and autosave Excalidraw diagrams in Google Drive.",
    permissions: ["identity", "storage"],
    host_permissions: [
      "https://excalidraw.com/*",
      "https://www.googleapis.com/*",
    ],
    // oauth2 client id is filled in Plan 2 (requires a Google Cloud client).
  },
});
```

- [ ] **Step 2: Create `entrypoints/background.ts` (stub)**

```typescript
// Background service worker — trusted core.
// Real auth/drive/gateway logic arrives in Plan 2.
export default defineBackground(() => {
  console.debug("[excalistore] background worker ready");
});
```

- [ ] **Step 3: Create `entrypoints/content.ts` (stub)**

```typescript
// Content script — injected into excalidraw.com.
// Scene bridge, panel UI, and autosave arrive in Plan 3.
export default defineContentScript({
  matches: ["https://excalidraw.com/*"],
  main() {
    console.debug("[excalistore] content script ready");
  },
});
```

- [ ] **Step 4: Create `entrypoints/popup/index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Excalistore</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 5: Create `entrypoints/popup/main.tsx`**

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";

const root = document.getElementById("root");
if (!root) throw new Error("popup root element missing");
ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

- [ ] **Step 6: Create `entrypoints/popup/App.tsx` (stub)**

```tsx
// Popup — connect/sign-in/sign-out UI arrives in Plan 2.
export function App() {
  return <main style={{ width: 280, padding: 16 }}>Excalistore</main>;
}
```

- [ ] **Step 7: Verify the extension builds**

Run: `npm run build`
Expected: WXT builds successfully, writes `.output/chrome-mv3/`. No errors.

- [ ] **Step 8: Commit**

```bash
git add wxt.config.ts entrypoints
git commit -m "feat: scaffold wxt manifest and stub entrypoints"
```

---

## Task 4: Biome lint + format

**Files:**
- Create: `biome.json`

- [ ] **Step 1: Create `biome.json`**

```json
{
  "$schema": "https://biomejs.dev/schemas/2.0.0/schema.json",
  "files": {
    "ignore": [".wxt/**", ".output/**", "node_modules/**", "coverage/**"]
  },
  "organizeImports": { "enabled": true },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "suspicious": { "noExplicitAny": "warn" },
      "style": { "useImportType": "error" }
    }
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100
  },
  "javascript": { "formatter": { "quoteStyle": "double" } }
}
```

- [ ] **Step 2: Run formatter then lint**

Run: `npm run lint:fix`
Expected: formats existing files, exits 0 (no remaining errors).

- [ ] **Step 3: Commit**

```bash
git add biome.json entrypoints wxt.config.ts
git commit -m "chore: add biome lint and format config"
```

---

## Task 5: Git hooks (lefthook) + commitlint

**Files:**
- Create: `lefthook.yml`
- Create: `commitlint.config.js`

- [ ] **Step 1: Create `commitlint.config.js`**

```javascript
export default { extends: ["@commitlint/config-conventional"] };
```

- [ ] **Step 2: Create `lefthook.yml`**

```yaml
pre-commit:
  parallel: true
  commands:
    biome:
      glob: "*.{js,ts,tsx,json}"
      run: npx biome check --no-errors-on-unmatched --files-ignore-unknown=true {staged_files}
    typecheck:
      run: npm run compile
    knip:
      run: npm run knip

commit-msg:
  commands:
    commitlint:
      run: npx commitlint --edit {1}
```

- [ ] **Step 3: Install hooks**

Run: `npx lefthook install`
Expected: "lefthook installed" — creates `.git/hooks/`.

- [ ] **Step 4: Verify commitlint rejects a bad message**

Run: `echo "bad message" | npx commitlint`
Expected: FAILS with errors about "subject may not be empty" / "type may not be empty".

- [ ] **Step 5: Commit**

```bash
git add lefthook.yml commitlint.config.js
git commit -m "chore: add lefthook git hooks and commitlint"
```

---

## Task 6: knip dead-code config

**Files:**
- Create: `knip.json`

- [ ] **Step 1: Create `knip.json`**

```json
{
  "$schema": "https://unpkg.com/knip@5/schema.json",
  "entry": [
    "entrypoints/**/*.{ts,tsx,html}",
    "wxt.config.ts",
    "*.config.{ts,js}"
  ],
  "project": ["src/**/*.{ts,tsx}", "entrypoints/**/*.{ts,tsx}"],
  "ignore": [".wxt/**", ".output/**"],
  "ignoreDependencies": ["@wxt-dev/module-react"]
}
```

- [ ] **Step 2: Run knip**

Run: `npm run knip`
Expected: exits 0 (no unused files/exports/deps at this point). If it flags `src/shared/ui/index.ts` re-exports later, those are consumed by entrypoints in Plan 3 — add to `ignore` only if truly unused.

- [ ] **Step 3: Commit**

```bash
git add knip.json
git commit -m "chore: add knip dead-code detection"
```

---

## Task 7: Vitest config + smoke test

**Files:**
- Create: `vitest.config.ts`
- Create: `tests/smoke.test.ts`

- [ ] **Step 1: Create `vitest.config.ts`**

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    setupFiles: [],
    environmentMatchGlobs: [["tests/ui/**", "jsdom"]],
    coverage: { provider: "v8", reporter: ["text", "lcov"] },
  },
  resolve: { alias: { "@": new URL("./src", import.meta.url).pathname } },
});
```

- [ ] **Step 2: Create `tests/smoke.test.ts`**

```typescript
import { describe, expect, it } from "vitest";

describe("test harness", () => {
  it("runs", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 3: Run tests**

Run: `npm test`
Expected: 1 passing test.

- [ ] **Step 4: Commit**

```bash
git add vitest.config.ts tests/smoke.test.ts
git commit -m "test: add vitest harness and smoke test"
```

---

## Task 8: Shared message contracts

**Files:**
- Create: `src/shared/messages.ts`
- Test: `tests/messages.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from "vitest";
import { type DriveFileMeta, isErrorResponse } from "@/shared/messages";

describe("messages", () => {
  it("DriveFileMeta shape is usable", () => {
    const meta: DriveFileMeta = {
      id: "abc",
      name: "diagram.excalidraw",
      modifiedTime: "2026-06-17T00:00:00Z",
      headRevisionId: "r1",
    };
    expect(meta.name).toBe("diagram.excalidraw");
  });

  it("isErrorResponse narrows error responses", () => {
    expect(isErrorResponse({ ok: false, error: "nope" })).toBe(true);
    expect(isErrorResponse({ ok: true, data: 1 })).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/messages.test.ts`
Expected: FAIL — cannot find module `@/shared/messages`.

- [ ] **Step 3: Write `src/shared/messages.ts`**

```typescript
// Typed request/response contracts shared by content script and background.
// Background is the only side that performs Drive/auth work.

export interface DriveFileMeta {
  id: string;
  name: string;
  modifiedTime: string;
  headRevisionId: string;
}

export type Request =
  | { type: "auth/status" }
  | { type: "auth/signIn" }
  | { type: "auth/signOut" }
  | { type: "drive/pickFolder" }
  | { type: "drive/list" }
  | { type: "drive/get"; id: string }
  | { type: "drive/create"; name: string; content: string }
  | { type: "drive/update"; id: string; content: string; prevRevision: string }
  | { type: "drive/rename"; id: string; name: string };

export type Ok<T> = { ok: true; data: T };
export type Err = { ok: false; error: string; code?: "conflict" | "unauthorized" | "unknown" };
export type Response<T> = Ok<T> | Err;

export function isErrorResponse(r: { ok: boolean }): r is Err {
  return r.ok === false;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/messages.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/shared/messages.ts tests/messages.test.ts
git commit -m "feat: add typed message contracts"
```

---

## Task 9: excalidraw-format — validation

**Files:**
- Create: `src/shared/excalidraw-format.ts`
- Test: `tests/excalidraw-format.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from "vitest";
import {
  type ExcalidrawFile,
  parseExcalidrawFile,
  validateExcalidrawFile,
} from "@/shared/excalidraw-format";

const valid: ExcalidrawFile = {
  type: "excalidraw",
  version: 2,
  source: "https://excalidraw.com",
  elements: [{ id: "e1", version: 3, type: "rectangle" }],
  appState: { viewBackgroundColor: "#ffffff" },
  files: {},
};

describe("validateExcalidrawFile", () => {
  it("accepts a well-formed file", () => {
    expect(() => validateExcalidrawFile(valid)).not.toThrow();
  });

  it("rejects wrong type", () => {
    expect(() => validateExcalidrawFile({ ...valid, type: "evil" })).toThrow();
  });

  it("rejects non-array elements", () => {
    expect(() => validateExcalidrawFile({ ...valid, elements: "x" })).toThrow();
  });

  it("parseExcalidrawFile parses a JSON string", () => {
    const parsed = parseExcalidrawFile(JSON.stringify(valid));
    expect(parsed.elements).toHaveLength(1);
  });

  it("parseExcalidrawFile throws on malformed JSON", () => {
    expect(() => parseExcalidrawFile("{not json")).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/excalidraw-format.test.ts`
Expected: FAIL — cannot find module `@/shared/excalidraw-format`.

- [ ] **Step 3: Write `src/shared/excalidraw-format.ts` (validation portion)**

```typescript
import { z } from "zod";

// The .excalidraw file envelope. Elements/appState are validated structurally
// (array / object) but not deeply — Excalidraw's element schema is large and
// versioned. Envelope validation is the security boundary before we write
// untrusted content into page storage.
const binaryFileSchema = z.object({
  mimeType: z.string(),
  id: z.string(),
  dataURL: z.string(),
  created: z.number().optional(),
  lastRetrieved: z.number().optional(),
});

const fileSchema = z.object({
  type: z.literal("excalidraw"),
  version: z.number(),
  source: z.string(),
  elements: z.array(z.record(z.unknown())),
  appState: z.record(z.unknown()),
  files: z.record(binaryFileSchema),
});

export type BinaryFile = z.infer<typeof binaryFileSchema>;
export type ExcalidrawFile = z.infer<typeof fileSchema>;

export function validateExcalidrawFile(value: unknown): asserts value is ExcalidrawFile {
  fileSchema.parse(value);
}

export function parseExcalidrawFile(json: string): ExcalidrawFile {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch (e) {
    throw new Error(`invalid JSON: ${(e as Error).message}`);
  }
  validateExcalidrawFile(raw);
  return raw;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/excalidraw-format.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/shared/excalidraw-format.ts tests/excalidraw-format.test.ts
git commit -m "feat: add excalidraw file validation and parsing"
```

---

## Task 10: excalidraw-format — build + hash

**Files:**
- Modify: `src/shared/excalidraw-format.ts`
- Modify: `tests/excalidraw-format.test.ts`

- [ ] **Step 1: Add failing tests for build + hash**

Append to `tests/excalidraw-format.test.ts`:

```typescript
import { buildExcalidrawFile, sceneHash } from "@/shared/excalidraw-format";

describe("buildExcalidrawFile", () => {
  it("assembles a valid file from parts including images", () => {
    const file = buildExcalidrawFile(
      [{ id: "e1", version: 1, type: "image", fileId: "f1" }],
      { viewBackgroundColor: "#fff" },
      { f1: { id: "f1", mimeType: "image/png", dataURL: "data:image/png;base64,AAAA" } },
    );
    expect(file.type).toBe("excalidraw");
    expect(file.version).toBe(2);
    expect(file.files.f1?.dataURL).toContain("base64");
    expect(() => validateExcalidrawFile(file)).not.toThrow();
  });
});

describe("sceneHash", () => {
  it("is stable for the same scene", () => {
    const a = buildExcalidrawFile([{ id: "e1", version: 2 }], {}, {});
    const b = buildExcalidrawFile([{ id: "e1", version: 2 }], {}, {});
    expect(sceneHash(a)).toBe(sceneHash(b));
  });

  it("changes when an element version bumps", () => {
    const a = buildExcalidrawFile([{ id: "e1", version: 2 }], {}, {});
    const b = buildExcalidrawFile([{ id: "e1", version: 3 }], {}, {});
    expect(sceneHash(a)).not.toBe(sceneHash(b));
  });

  it("changes when image files change", () => {
    const a = buildExcalidrawFile([], {}, {});
    const b = buildExcalidrawFile(
      [],
      {},
      { f1: { id: "f1", mimeType: "image/png", dataURL: "data:image/png;base64,AAAA" } },
    );
    expect(sceneHash(a)).not.toBe(sceneHash(b));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/excalidraw-format.test.ts`
Expected: FAIL — `buildExcalidrawFile` / `sceneHash` not exported.

- [ ] **Step 3: Append implementation to `src/shared/excalidraw-format.ts`**

```typescript
export function buildExcalidrawFile(
  elements: Array<Record<string, unknown>>,
  appState: Record<string, unknown>,
  files: Record<string, BinaryFile>,
): ExcalidrawFile {
  const file: ExcalidrawFile = {
    type: "excalidraw",
    version: 2,
    source: "https://excalidraw.com",
    elements,
    appState,
    files,
  };
  validateExcalidrawFile(file);
  return file;
}

// djb2 string hash — small, dependency-free, sufficient for change detection.
function djb2(input: string): string {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 33) ^ input.charCodeAt(i);
  }
  return (hash >>> 0).toString(16);
}

// Hash only the fields that represent visible scene state: element id+version
// and the set of file ids + their dataURL lengths. Cheap and stable.
export function sceneHash(file: ExcalidrawFile): string {
  const elementSig = file.elements
    .map((e) => `${String(e.id)}:${String(e.version)}`)
    .sort()
    .join(",");
  const fileSig = Object.values(file.files)
    .map((f) => `${f.id}:${f.dataURL.length}`)
    .sort()
    .join(",");
  return djb2(`${elementSig}|${fileSig}`);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/excalidraw-format.test.ts`
Expected: PASS (all excalidraw-format tests).

- [ ] **Step 5: Commit**

```bash
git add src/shared/excalidraw-format.ts tests/excalidraw-format.test.ts
git commit -m "feat: add excalidraw file builder and scene hash"
```

---

## Task 11: Theme tokens

**Files:**
- Create: `src/shared/theme.ts`
- Test: `tests/theme.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from "vitest";
import { type ThemeMode, themeVars } from "@/shared/theme";

describe("theme", () => {
  it("provides light and dark variable maps", () => {
    const light = themeVars("light");
    const dark = themeVars("dark");
    expect(light["--es-bg"]).toBeDefined();
    expect(dark["--es-bg"]).toBeDefined();
    expect(light["--es-bg"]).not.toBe(dark["--es-bg"]);
  });

  it("modes are typed", () => {
    const m: ThemeMode = "dark";
    expect(themeVars(m)["--es-text"]).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/theme.test.ts`
Expected: FAIL — cannot find module `@/shared/theme`.

- [ ] **Step 3: Write `src/shared/theme.ts`**

```typescript
// Design tokens mirrored loosely from Excalidraw's palette. Exposed as CSS
// custom properties applied to the Shadow DOM root, so all `ui` primitives
// style off `var(--es-*)` and theme-switch by swapping the variable map.
export type ThemeMode = "light" | "dark";

type Vars = Record<string, string>;

const light: Vars = {
  "--es-bg": "#ffffff",
  "--es-surface": "#f1f0ff",
  "--es-text": "#1b1b1f",
  "--es-muted": "#6a6a75",
  "--es-border": "#e0dfff",
  "--es-accent": "#6965db",
  "--es-accent-text": "#ffffff",
  "--es-danger": "#e03131",
  "--es-radius": "8px",
  "--es-shadow": "0 1px 4px rgba(0,0,0,0.1)",
};

const dark: Vars = {
  "--es-bg": "#232329",
  "--es-surface": "#2e2d39",
  "--es-text": "#e3e3e8",
  "--es-muted": "#9a99a5",
  "--es-border": "#3b3a47",
  "--es-accent": "#a8a5ff",
  "--es-accent-text": "#1b1b1f",
  "--es-danger": "#ff8787",
  "--es-radius": "8px",
  "--es-shadow": "0 1px 4px rgba(0,0,0,0.4)",
};

export function themeVars(mode: ThemeMode): Vars {
  return mode === "dark" ? dark : light;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/theme.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/shared/theme.ts tests/theme.test.ts
git commit -m "feat: add theme design tokens"
```

---

## Task 12: UI primitives

**Files:**
- Create: `src/shared/ui/Button.tsx`, `IconButton.tsx`, `Dialog.tsx`, `ConfirmDialog.tsx`, `TextField.tsx`, `ListItem.tsx`, `Badge.tsx`, `Spinner.tsx`, `index.ts`
- Create: `tests/ui/setup.ts`, `tests/ui/Button.test.tsx`, `tests/ui/ConfirmDialog.test.tsx`

- [ ] **Step 1: Create test setup `tests/ui/setup.ts`**

```typescript
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 2: Wire setup file into vitest config**

Modify `vitest.config.ts` — change `setupFiles: []` to:

```typescript
    setupFiles: ["tests/ui/setup.ts"],
```

- [ ] **Step 3: Write failing tests**

`tests/ui/Button.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Button } from "@/shared/ui/Button";

describe("Button", () => {
  it("renders label and fires onClick", async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Save</Button>);
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("does not fire when disabled", async () => {
    const onClick = vi.fn();
    render(
      <Button onClick={onClick} disabled>
        Save
      </Button>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onClick).not.toHaveBeenCalled();
  });
});
```

`tests/ui/ConfirmDialog.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ConfirmDialog } from "@/shared/ui/ConfirmDialog";

describe("ConfirmDialog", () => {
  it("renders message and resolves confirm/cancel", async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        title="Replace canvas?"
        message="You will lose current content."
        confirmLabel="Continue"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    expect(screen.getByText("You will lose current content.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(onConfirm).toHaveBeenCalledOnce();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 4: Add `@testing-library/user-event` dependency**

Run: `npm install -D @testing-library/user-event@^14.5.0`

- [ ] **Step 5: Run tests to verify they fail**

Run: `npx vitest run tests/ui`
Expected: FAIL — cannot find `Button` / `ConfirmDialog` modules.

- [ ] **Step 6: Write `src/shared/ui/Button.tsx`**

```tsx
import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "danger";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

const bg: Record<Variant, string> = {
  primary: "var(--es-accent)",
  secondary: "var(--es-surface)",
  danger: "var(--es-danger)",
};

export function Button({ variant = "primary", style, ...rest }: Props) {
  return (
    <button
      type="button"
      style={{
        background: bg[variant],
        color: variant === "secondary" ? "var(--es-text)" : "var(--es-accent-text)",
        border: "1px solid var(--es-border)",
        borderRadius: "var(--es-radius)",
        padding: "6px 12px",
        cursor: rest.disabled ? "not-allowed" : "pointer",
        opacity: rest.disabled ? 0.5 : 1,
        font: "inherit",
        ...style,
      }}
      {...rest}
    />
  );
}
```

- [ ] **Step 7: Write `src/shared/ui/IconButton.tsx`**

```tsx
import type { ButtonHTMLAttributes, ReactNode } from "react";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  children: ReactNode;
}

export function IconButton({ label, children, style, ...rest }: Props) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      style={{
        background: "transparent",
        border: "none",
        borderRadius: "var(--es-radius)",
        color: "var(--es-text)",
        cursor: "pointer",
        padding: 4,
        display: "inline-flex",
        ...style,
      }}
      {...rest}
    >
      {children}
    </button>
  );
}
```

- [ ] **Step 8: Write `src/shared/ui/Dialog.tsx`**

```tsx
import type { ReactNode } from "react";

interface Props {
  title: string;
  children: ReactNode;
  onClose?: () => void;
}

export function Dialog({ title, children, onClose }: Props) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        display: "grid",
        placeItems: "center",
        zIndex: 2147483647,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--es-bg)",
          color: "var(--es-text)",
          border: "1px solid var(--es-border)",
          borderRadius: "var(--es-radius)",
          boxShadow: "var(--es-shadow)",
          padding: 20,
          minWidth: 320,
          maxWidth: 420,
        }}
      >
        <h2 style={{ margin: "0 0 12px", fontSize: 16 }}>{title}</h2>
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 9: Write `src/shared/ui/ConfirmDialog.tsx`**

```tsx
import { Button } from "./Button";
import { Dialog } from "./Dialog";

interface Props {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = false,
  onConfirm,
  onCancel,
}: Props) {
  return (
    <Dialog title={title} onClose={onCancel}>
      <p style={{ margin: "0 0 16px", color: "var(--es-muted)" }}>{message}</p>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <Button variant="secondary" onClick={onCancel}>
          {cancelLabel}
        </Button>
        <Button variant={danger ? "danger" : "primary"} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}
```

- [ ] **Step 10: Write `src/shared/ui/TextField.tsx`**

```tsx
import type { InputHTMLAttributes } from "react";

export function TextField({ style, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      style={{
        background: "var(--es-bg)",
        color: "var(--es-text)",
        border: "1px solid var(--es-border)",
        borderRadius: "var(--es-radius)",
        padding: "6px 8px",
        font: "inherit",
        width: "100%",
        boxSizing: "border-box",
        ...style,
      }}
      {...rest}
    />
  );
}
```

- [ ] **Step 11: Write `src/shared/ui/ListItem.tsx`**

```tsx
import type { ReactNode } from "react";

interface Props {
  active?: boolean;
  onClick?: () => void;
  children: ReactNode;
}

export function ListItem({ active = false, onClick, children }: Props) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onClick?.();
      }}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 10px",
        borderRadius: "var(--es-radius)",
        background: active ? "var(--es-surface)" : "transparent",
        color: "var(--es-text)",
        cursor: "pointer",
      }}
    >
      {children}
    </div>
  );
}
```

- [ ] **Step 12: Write `src/shared/ui/Badge.tsx`**

```tsx
import type { ReactNode } from "react";

type Tone = "neutral" | "success" | "danger";

const colors: Record<Tone, string> = {
  neutral: "var(--es-muted)",
  success: "var(--es-accent)",
  danger: "var(--es-danger)",
};

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span style={{ fontSize: 12, color: colors[tone] }}>{children}</span>
  );
}
```

- [ ] **Step 13: Write `src/shared/ui/Spinner.tsx`**

```tsx
export function Spinner({ size = 16 }: { size?: number }) {
  return (
    <span
      role="status"
      aria-label="loading"
      style={{
        display: "inline-block",
        width: size,
        height: size,
        border: "2px solid var(--es-border)",
        borderTopColor: "var(--es-accent)",
        borderRadius: "50%",
        animation: "es-spin 0.7s linear infinite",
      }}
    />
  );
}
```

- [ ] **Step 14: Write `src/shared/ui/index.ts`**

```typescript
export { Badge } from "./Badge";
export { Button } from "./Button";
export { ConfirmDialog } from "./ConfirmDialog";
export { Dialog } from "./Dialog";
export { IconButton } from "./IconButton";
export { ListItem } from "./ListItem";
export { Spinner } from "./Spinner";
export { TextField } from "./TextField";
```

- [ ] **Step 15: Run tests to verify they pass**

Run: `npx vitest run tests/ui`
Expected: PASS (Button 2 tests, ConfirmDialog 1 test).

- [ ] **Step 16: Verify lint, typecheck, knip clean**

Run: `npm run lint:fix && npm run compile && npm run knip`
Expected: all exit 0. (If knip flags unused primitives, add `src/shared/ui/index.ts` to knip `entry` — these are public API consumed in Plan 3.)

- [ ] **Step 17: Commit**

```bash
git add src/shared/ui tests/ui vitest.config.ts package.json package-lock.json
git commit -m "feat: add themed ui primitive components"
```

---

## Task 13: Install skills

**Files:**
- Create: `.claude/skills/` (downloaded skill folders)

- [ ] **Step 1: Create skills directory and fetch skills**

Skills to install (each as `.claude/skills/<name>/SKILL.md` + assets):
- `frontend-design` — from anthropics/skills (https://www.skills.sh/anthropics/skills/frontend-design)
- `chrome-extension-development` — from mindrally (https://www.skills.sh/mindrally/skills/chrome-extension-development)
- `chrome-extension-wxt` — from tenequm/skills (https://github.com/tenequm/skills)
- `biome` — from tenequm/skills

Run (clone tenequm and copy the two relevant skills):

```bash
git clone --depth 1 https://github.com/tenequm/skills /tmp/tenequm-skills
mkdir -p .claude/skills
cp -r /tmp/tenequm-skills/*/chrome-extension-wxt .claude/skills/ 2>/dev/null || true
cp -r /tmp/tenequm-skills/*/biome .claude/skills/ 2>/dev/null || true
```

For the anthropics and mindrally skills, fetch via their skills.sh install command or copy the SKILL.md manually if the CLI is unavailable. If any source path differs, locate the `SKILL.md` inside the cloned repo and copy its containing folder into `.claude/skills/`.

- [ ] **Step 2: Verify each skill folder has a SKILL.md**

Run: `ls .claude/skills/*/SKILL.md`
Expected: lists a SKILL.md for each installed skill. (If a source was unavailable, note it in `docs/development.md` and proceed — skills are advisory, not build-blocking.)

- [ ] **Step 3: Commit**

```bash
git add .claude/skills
git commit -m "chore: install project skills"
```

---

## Task 14: Docs + CLAUDE.md

**Files:**
- Create: `CLAUDE.md`, `README.md`, `docs/architecture.md`, `docs/features.md`, `docs/security.md`, `docs/development.md`

- [ ] **Step 1: Create `CLAUDE.md`**

```markdown
# Excalistore — Project Rules

Chrome extension (MV3) connecting excalidraw.com to Google Drive. See the spec
at `docs/superpowers/specs/2026-06-17-excalistore-design.md`.

## Stack & conventions
- WXT + React + TypeScript (strict). Biome for lint+format. Vitest for tests.
  knip for dead code. lefthook + commitlint for hooks.
- OAuth scope `drive.file` only. All Drive/auth calls happen in the background
  service worker — never in the content script or panel.
- Validate every `.excalidraw` payload before writing it into page storage.

## Docs discipline
- After any change, update the corresponding doc: architecture change →
  `docs/architecture.md`; security change → `docs/security.md`; setup change →
  `docs/development.md`.
- After shipping a feature, move it out of "Next to pick up" in
  `docs/features.md` and document its behavior.

## Commits & branches
- Commits: Conventional Commits — `type(scope): subject`; types
  `feat|fix|docs|chore|refactor|test|build|ci`. Enforced by commitlint.
- Branches: `type/short-description` (e.g. `feat/drive-autosave`).
```

- [ ] **Step 2: Create `docs/architecture.md`**

Copy the "Architecture", "Components", "Data Flow", and "Auth / Session
Lifecycle" sections verbatim from the spec
(`docs/superpowers/specs/2026-06-17-excalistore-design.md`), under a top heading
`# Architecture`. This is the living architecture doc; update it as code changes.

- [ ] **Step 3: Create `docs/security.md`**

Copy the "Security" section verbatim from the spec under `# Security Posture`.

- [ ] **Step 4: Create `docs/features.md`**

```markdown
# Features

## Next to pick up
- Change folder without disconnecting.
- Thumbnail previews.
- Conflict resolution UI (currently blocks + warns).
- Delete / move diagrams, subfolders.
- Self-hosted Excalidraw hosts.
- Cross-browser (Edge / Firefox via PKCE).
- Playwright E2E.

## Shipped
_(Move items here as they ship, with a short behavior description.)_

- Foundation: repo scaffold, tooling, shared layer (messages, excalidraw-format,
  theme, ui primitives). No user-facing features yet.
```

- [ ] **Step 5: Create `docs/development.md`**

```markdown
# Development

## Setup
1. `npm install`
2. `npm run dev` — starts WXT dev; load `.output/chrome-mv3` as an unpacked
   extension at `chrome://extensions` (Developer mode on).

## Commands
- `npm run build` — production build.
- `npm test` — run Vitest once. `npm run test:watch` for watch mode.
- `npm run lint` / `npm run lint:fix` — Biome.
- `npm run compile` — TypeScript typecheck.
- `npm run knip` — dead-code check.

## Google OAuth (needed from Plan 2 on)
- Create a Google Cloud project, enable the Drive API and Picker API.
- Create an OAuth client ID of type "Chrome extension" with the extension ID.
- Add the client id to `wxt.config.ts` manifest `oauth2` with scope
  `https://www.googleapis.com/auth/drive.file`.

## Manual E2E checklist
_(Filled in as features land in Plans 2–3.)_
```

- [ ] **Step 6: Create `README.md`**

```markdown
# Excalistore

Chrome extension that stores and autosaves [Excalidraw](https://excalidraw.com)
diagrams in your Google Drive, with an in-page panel to browse, open, create, and
rename them. Minimal OAuth scope (`drive.file`), security-first.

Status: in development. See `docs/` for architecture, features, security, and
development setup.
```

- [ ] **Step 7: Verify lint passes on markdown-adjacent config and commit**

Run: `npm run lint`
Expected: exits 0.

- [ ] **Step 8: Commit**

```bash
git add CLAUDE.md README.md docs/architecture.md docs/features.md docs/security.md docs/development.md
git commit -m "docs: add project rules, architecture, features, security, dev docs"
```

---

## Task 15: CI workflow

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Create `.github/workflows/ci.yml`**

```yaml
name: CI
on:
  pull_request:
  push:
    branches: [main]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npx biome ci .
      - run: npm run compile
      - run: npm test
      - run: npm run knip
      - run: npm audit --omit=dev --audit-level=high
      - run: npm run build
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add lint, typecheck, test, knip, audit, build pipeline"
```

---

## Task 16: Final foundation verification

- [ ] **Step 1: Run the full local pipeline**

Run: `npm run lint && npm run compile && npm test && npm run knip && npm run build`
Expected: every step exits 0; build writes `.output/chrome-mv3/`.

- [ ] **Step 2: Load the unpacked extension manually**

Open `chrome://extensions`, enable Developer mode, "Load unpacked" →
`.output/chrome-mv3`. Expected: Excalistore loads with no errors; popup shows
"Excalistore"; visiting excalidraw.com logs "content script ready" in the
console.

- [ ] **Step 3: Confirm completion**

Foundation complete. Plan 2 (Drive core) can begin.

---

## Self-Review

- **Spec coverage (Plan 1 portion):** tooling (Biome, Vitest, knip, lefthook,
  commitlint, CI) ✓; shared layer `messages` ✓, `excalidraw-format` incl.
  embedded-image build + hash ✓, `theme` ✓, `ui` primitives ✓; skills ✓; docs +
  CLAUDE.md with doc-update + feature-roadmap rules ✓; MV3 manifest with minimal
  permissions ✓. Drive/auth/scene-bridge/panel/autosave/lifecycle are
  intentionally deferred to Plans 2–3.
- **Placeholders:** none — every config and module has full content. Docs tasks
  that "copy from spec" reference exact existing sections.
- **Type consistency:** `ExcalidrawFile`, `BinaryFile`, `DriveFileMeta`,
  `Response<T>`, `ThemeMode` defined once and reused; `buildExcalidrawFile` /
  `sceneHash` / `validateExcalidrawFile` / `parseExcalidrawFile` names consistent
  across tasks.
```
