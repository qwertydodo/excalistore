# Excalistore Plan 5 — Sandboxed Google Picker (MV3 fix)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make folder selection work under Manifest V3. MV3 forbids remote scripts in an extension page's `script-src` (locked to `'self'`), so the original Picker — which injected `https://apis.google.com/js/api.js` into the popup — cannot run. Move the Picker into an MV3 **sandboxed page** (which gets its own CSP that *can* load remote scripts), embed that page as an iframe in the popup, and bridge the OAuth token in / chosen folder out via `postMessage`.

**Architecture:** A new sandbox HTML entrypoint (`entrypoints/sandbox/`) loads `apis.google.com` and runs the Picker. `features/pickFolder` is reworked: instead of loading gapi in-page, `pickFolder(token, apiKey, appId)` now creates an iframe to `sandbox.html`, hands it the token over `postMessage`, and resolves with the chosen `{id, name}`. The public signature is unchanged, so `entrypoints/popup/App.tsx`, `widgets/popupConnect`, and the gateway are untouched. The token reaches only the popup + its sandboxed child iframe for the duration of the pick — never the content script, never persisted.

**Tech Stack:** WXT (HTML + sandbox entrypoints), TS strict, Biome, Vitest, knip, lefthook. Google Picker via `apis.google.com` (in the sandbox only).

**Reference:** Spec `docs/superpowers/specs/2026-06-17-excalistore-design.md` (Drive scope / Picker). Supersedes the Plan 2 "scoped script-src CSP exception", which is invalid under MV3. Builds on Plans 1–4 (merged) + the post-Plan-4 fixes (pinned key, env-loaded client id, MV3 `script-src 'self'` CSP).

**Branch:** `feat/sandboxed-picker` (create off `main`).

**Conventions (from CLAUDE.md):** FSD layers import downward only; module files camelCase; Conventional Commits; do not bypass git hooks.

---

## Windows / line-endings note (applies to EVERY task)

Windows dev: the Write tool emits CRLF, Biome requires LF. **Before every `git commit`** run `npx biome check --write .`, then re-`git add`. If the lefthook/biome `pre-commit` hook blocks on formatting, run `npx biome check --write .`, re-stage, re-commit. **Never** use `--no-verify`. The hook runs `tsc --noEmit` + `knip` over the whole project.

---

## Background: the MV3 Picker pattern

- **Extension pages** (popup, options, background) are CSP-locked: `script-src 'self'`. No remote scripts. This is non-negotiable in MV3.
- **Sandboxed pages** (declared in `manifest.sandbox.pages`) run with an opaque origin and a *separate* CSP (`content_security_policy.sandbox`) that **may** allow remote scripts. They **cannot** use `chrome.*` APIs — they only `postMessage` with their embedder.
- So: popup (trusted, has the token) ⇄ `postMessage` ⇄ sandbox iframe (loads `apis.google.com`, runs Picker). The sandbox returns the chosen folder; the popup persists it via the gateway (`drive/setConnection`, unchanged).

The sandbox CSP and `<iframe sandbox>` token list are **tuned against real Picker traffic** — treat them as a manually-verified boundary (like Plan 3's `filesDb`). If the Picker shows CSP violations in the sandbox console, widen the offending directive and rebuild; the values below are a working starting point.

---

## File Structure (added / changed by this plan)

```
entrypoints/
  sandbox/
    index.html            # loads apis.google.com + the picker bundle (sandboxed page)
    main.ts               # postMessage protocol + Picker invocation
src/
  features/pickFolder/
    lib/
      picker.ts           # REWORK: iframe + postMessage bridge (same signature)
      pickerProtocol.ts   # shared message types + nonce helper (+ test)
      pickerProtocol.test.ts
      index.ts            # (export protocol types if useful)
wxt.config.ts             # manifest.sandbox.pages + content_security_policy.sandbox
docs/security.md          # replace the invalid "script-src exception" note
```

---

## Task 1: Shared picker message protocol

A tiny typed protocol shared by the popup bridge and the sandbox, plus a guard. This is the only unit-testable part (the gapi/iframe sides are integration-verified).

**Files:**
- Create: `src/features/pickFolder/lib/pickerProtocol.ts`, `pickerProtocol.test.ts`

- [x] **Step 1: Write the failing test `pickerProtocol.test.ts`**

```typescript
import { describe, expect, it } from "vitest";
import { isPickerMessage, PICKER_CHANNEL } from "./pickerProtocol";

describe("isPickerMessage", () => {
  it("accepts a well-formed message on our channel", () => {
    expect(
      isPickerMessage({ channel: PICKER_CHANNEL, type: "picker:ready", nonce: "n1" }),
    ).toBe(true);
  });

  it("rejects foreign / malformed messages", () => {
    expect(isPickerMessage(null)).toBe(false);
    expect(isPickerMessage({ type: "picker:ready", nonce: "n1" })).toBe(false); // no channel
    expect(isPickerMessage({ channel: "other", type: "picker:ready", nonce: "n1" })).toBe(false);
    expect(isPickerMessage({ channel: PICKER_CHANNEL, type: "picker:ready" })).toBe(false); // no nonce
  });
});
```

- [x] **Step 2: Run to verify it fails**

Run: `npx vitest run src/features/pickFolder/lib/pickerProtocol.test.ts`
Expected: FAIL — module not found.

- [x] **Step 3: Write `pickerProtocol.ts`**

```typescript
// Messages exchanged between the popup (embedder) and the sandboxed picker
// iframe. The shared channel tag + a per-pick nonce let each side ignore
// unrelated window messages.
export const PICKER_CHANNEL = "excalistore-picker";

export interface PickedFolder {
  id: string;
  name: string;
}

export type PickerMessage =
  | { channel: typeof PICKER_CHANNEL; type: "picker:ready"; nonce: string }
  | {
      channel: typeof PICKER_CHANNEL;
      type: "picker:open";
      nonce: string;
      token: string;
      apiKey: string;
      appId: string;
    }
  | { channel: typeof PICKER_CHANNEL; type: "picker:picked"; nonce: string; folder: PickedFolder }
  | { channel: typeof PICKER_CHANNEL; type: "picker:cancel"; nonce: string }
  | { channel: typeof PICKER_CHANNEL; type: "picker:error"; nonce: string; message: string };

export function isPickerMessage(value: unknown): value is PickerMessage {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return v.channel === PICKER_CHANNEL && typeof v.type === "string" && typeof v.nonce === "string";
}
```

- [x] **Step 4: Run to verify it passes**

Run: `npx vitest run src/features/pickFolder/lib/pickerProtocol.test.ts`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
npx biome check --write .
git add src/features/pickFolder/lib/pickerProtocol.ts src/features/pickFolder/lib/pickerProtocol.test.ts
git commit -m "feat: add picker postMessage protocol"
```

---

## Task 2: Rework `pickFolder` as an iframe + postMessage bridge

Replace the in-page gapi loader. Same exported signature → no popup changes.

**Files:**
- Modify (full rewrite): `src/features/pickFolder/lib/picker.ts`
- Modify: `src/features/pickFolder/lib/index.ts` (export protocol too, optional)

- [x] **Step 1: Rewrite `picker.ts`** (implemented with the ready-handshake fix from the Task 3 note: `picker:ready` is special-cased before the nonce-match check)

```typescript
import { isPickerMessage, PICKER_CHANNEL, type PickedFolder } from "./pickerProtocol";

export type { PickedFolder } from "./pickerProtocol";

// Folder selection under MV3: the Picker can only load apis.google.com from a
// sandboxed page, so we embed sandbox.html as a full-popup iframe, hand it the
// OAuth token over postMessage, and resolve with the chosen folder. The token
// lives only in the popup + this child iframe for the pick's duration.
export function pickFolder(
  token: string,
  apiKey: string,
  appId: string,
): Promise<PickedFolder | null> {
  return new Promise((resolve) => {
    const nonce =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : String(Date.now() + Math.random());

    const iframe = document.createElement("iframe");
    iframe.src = chrome.runtime.getURL("sandbox.html");
    iframe.title = "Choose a Google Drive folder";
    iframe.style.cssText =
      "position:fixed;top:0;left:0;width:100%;height:100%;border:0;z-index:2147483647;background:#fff;";

    // The popup window only sizes up to its content, so widen the body while the
    // picker is open (Chrome popups expand up to ~800x600).
    const prevWidth = document.body.style.minWidth;
    const prevHeight = document.body.style.minHeight;
    document.body.style.minWidth = "640px";
    document.body.style.minHeight = "520px";

    function cleanup(): void {
      window.removeEventListener("message", onMessage);
      iframe.remove();
      document.body.style.minWidth = prevWidth;
      document.body.style.minHeight = prevHeight;
    }

    function post(message: Record<string, unknown>): void {
      iframe.contentWindow?.postMessage({ channel: PICKER_CHANNEL, ...message }, "*");
    }

    function onMessage(event: MessageEvent): void {
      if (event.source !== iframe.contentWindow) return;
      const data = event.data;
      if (!isPickerMessage(data) || data.nonce !== nonce) return;
      switch (data.type) {
        case "picker:ready":
          post({ type: "picker:open", nonce, token, apiKey, appId });
          break;
        case "picker:picked":
          cleanup();
          resolve(data.folder);
          break;
        case "picker:cancel":
        case "picker:error":
          cleanup();
          resolve(null);
          break;
      }
    }

    window.addEventListener("message", onMessage);
    document.body.appendChild(iframe);
  });
}
```

- [x] **Step 2: Update the lib barrel**

`src/features/pickFolder/lib/index.ts` — ensure it re-exports the picker (and optionally the protocol):

```typescript
export * from "./picker";
export * from "./pickerProtocol";
```

- [x] **Step 3: Verify types + lint**

Run: `npm run lint && npm run compile`
Expected: exit 0. (The old `google`/`gapi` global usage is gone from `picker.ts`; if `@types/gapi`/`@types/google.picker` become unused as a result, that's handled in Task 3 where the sandbox uses them — leave them installed.)

- [x] **Step 4: Commit**

```bash
npx biome check --write .
git add src/features/pickFolder/lib/picker.ts src/features/pickFolder/lib/index.ts
git commit -m "feat: drive picker via sandboxed iframe bridge"
```

---

## Task 3: Sandbox entrypoint (the page that runs Picker)

**Files:**
- Create: `entrypoints/sandbox/index.html`
- Create: `entrypoints/sandbox/main.ts`

- [x] **Step 1: Create `entrypoints/sandbox/index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Excalistore folder picker</title>
    <!-- First-party Google API loader; allowed by the sandbox CSP (Task 4). -->
    <script src="https://apis.google.com/js/api.js"></script>
  </head>
  <body>
    <script type="module" src="./main.ts"></script>
  </body>
</html>
```

- [x] **Step 2: Create `entrypoints/sandbox/main.ts`**

```typescript
import { isPickerMessage, PICKER_CHANNEL, type PickedFolder } from "@/features/pickFolder";

// Runs inside the MV3 sandboxed iframe. Loads the Picker (apis.google.com is
// permitted here only), then reports the chosen folder to the embedding popup.
// No chrome.* APIs are available in a sandbox — communication is postMessage.

function postToParent(message: Record<string, unknown>): void {
  window.parent.postMessage({ channel: PICKER_CHANNEL, ...message }, "*");
}

function loadPickerLib(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof gapi === "undefined") {
      reject(new Error("gapi failed to load"));
      return;
    }
    gapi.load("picker", { callback: () => resolve() });
  });
}

function openPicker(nonce: string, token: string, apiKey: string, appId: string): void {
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
        const folder: PickedFolder | null = doc ? { id: doc.id, name: doc.name ?? "" } : null;
        if (folder) postToParent({ type: "picker:picked", nonce, folder });
        else postToParent({ type: "picker:cancel", nonce });
      } else if (data.action === google.picker.Action.CANCEL) {
        postToParent({ type: "picker:cancel", nonce });
      }
    })
    .build();
  picker.setVisible(true);
}

window.addEventListener("message", async (event: MessageEvent) => {
  const data = event.data;
  if (!isPickerMessage(data) || data.type !== "picker:open") return;
  const { nonce, token, apiKey, appId } = data;
  try {
    await loadPickerLib();
    openPicker(nonce, token, apiKey, appId);
  } catch (e) {
    postToParent({ type: "picker:error", nonce, message: (e as Error).message });
  }
});

// Tell the embedder we're listening so it sends the token + opens the picker.
// A fixed handshake nonce is fine here; the real per-pick nonce arrives in
// picker:open and is echoed on every reply.
postToParent({ type: "picker:ready", nonce: "ready" });
```

**Note on the ready handshake:** `picker.ts` only acts on a `picker:ready` whose `nonce` equals the pick's nonce. To keep the handshake simple, have `picker.ts` send `picker:open` on `picker:ready` **regardless of the ready message's nonce** — change the `case "picker:ready"` guard so it ignores the nonce for `ready` only. Implement it as: in `onMessage`, before the `nonce` check, special-case `data.type === "picker:ready"` → `post open` and return. Adjust `picker.ts` accordingly (move the ready handling above the `data.nonce !== nonce` check). Re-run `npm run compile` after the tweak.

- [x] **Step 3: Verify `gapi`/`google.picker` types resolve** — confirmed: both `@types/gapi` and `@types/google.picker` are in `devDependencies` AND already listed in `tsconfig.json`'s `compilerOptions.types` (`["vitest/globals", "@testing-library/jest-dom", "chrome", "gapi", "google.picker"]`). `npm run compile` passed with zero errors; no shim needed.

- [x] **Step 4: Commit**

```bash
npx biome check --write .
git add entrypoints/sandbox src/features/pickFolder/lib/picker.ts
git commit -m "feat: add sandboxed picker page"
```

---

## Task 4: Manifest sandbox config + CSP + docs

**Files:**
- Modify: `wxt.config.ts`
- Modify: `docs/security.md`

- [x] **Step 1: Add `sandbox` + sandbox CSP to `wxt.config.ts`**

In the `manifest` object, alongside the existing `content_security_policy.extension_pages`, add the sandbox page list and its CSP:

```typescript
    sandbox: {
      pages: ["sandbox.html"],
    },
    content_security_policy: {
      extension_pages:
        "script-src 'self'; object-src 'self'; frame-src https://docs.google.com https://accounts.google.com;",
      // Sandboxed pages get their own CSP that MAY load remote scripts. This is
      // where the Google Picker lives (apis.google.com). Tuned against real
      // Picker traffic; widen a directive if the sandbox console shows a CSP
      // violation. The OAuth token only reaches here via postMessage from the popup.
      sandbox:
        "sandbox allow-scripts allow-same-origin allow-popups allow-forms; " +
        "script-src 'self' 'unsafe-inline' https://apis.google.com https://*.gstatic.com; " +
        "frame-src https://*.google.com https://*.googleusercontent.com; " +
        "connect-src https://*.googleapis.com https://*.google.com; " +
        "img-src https://*.gstatic.com https://*.googleusercontent.com https://*.google.com data:; " +
        "style-src 'self' 'unsafe-inline' https://*.gstatic.com;",
    },
```

- [x] **Step 2: Build and verify the manifest** — `sandbox.pages` = `["sandbox.html"]`; `content_security_policy.sandbox` present; `extension_pages` still `script-src 'self'`; `.output/chrome-mv3/sandbox.html` exists. WXT emitted the file at exactly `sandbox.html` (no rename needed).

Run: `npm run build`
Then verify:

```bash
node -e "const m=require('./.output/chrome-mv3/manifest.json'); console.log('sandbox:', JSON.stringify(m.sandbox)); console.log('csp:', JSON.stringify(m.content_security_policy));"
```

Expected: `sandbox.pages` includes `sandbox.html`; `content_security_policy.sandbox` present; `extension_pages` still `script-src 'self'`. Confirm `.output/chrome-mv3/sandbox.html` exists in the build output.

- [x] **Step 3: Rewrite the Picker section of `docs/security.md`**

Replace the old "single script-src exception" wording. New content: MV3 forbids remote scripts on extension pages (`script-src 'self'`), so the Picker runs in a **sandboxed page** with its own CSP allowing `apis.google.com`. Explain the trust boundary: the OAuth token reaches the sandbox only via `postMessage` from the popup for the pick's duration, the sandbox has no `chrome.*` access, and `drive.file` keeps Drive exposure to the picked folder + app-created files. Note the sandbox CSP is tuned against real Picker traffic and may need widening.

- [x] **Step 4: Commit**

```bash
npx biome check --write .
git add wxt.config.ts docs/security.md
git commit -m "feat: declare sandboxed picker page and csp"
```

---

## Task 5: Full verification + dev note

**Files:**
- Modify: `docs/development.md`

- [x] **Step 1: Full suite** — lint, compile, knip, test (69/69 across 15 files), build all exit 0.

Run: `npm run lint && npm run compile && npm run knip && npm test && npm run build`
Expected: exit 0. The protocol test (Task 1) passes; the sandbox/iframe sides are integration-verified, not unit-tested.

- [x] **Step 2: Add a sandbox-picker note to `docs/development.md`**

Under the Picker / Google OAuth area, add: folder selection now uses a sandboxed page (`sandbox.html`) embedded as an iframe in the popup. If "Connect" shows a blank/broken Picker, open the popup's devtools, then the sandbox iframe's context, and check the console for CSP violations — widen the offending directive in `wxt.config.ts` `content_security_policy.sandbox` and rebuild. Confirm `WXT_PICKER_API_KEY` (Picker API enabled) and that the OAuth client's app/project matches the API key's project.

- [x] **Step 3: Commit**

```bash
npx biome check --write .
git add docs/development.md
git commit -m "docs: note sandboxed picker debugging"
```

---

## Self-Review

- **Spec coverage:** folder selection via Google Picker with `drive.file` ✓ — now MV3-legal via a sandboxed page; token stays in popup + sandbox child only ✓; `pickFolder` signature unchanged so popup/gateway untouched ✓.
- **Placeholders:** none. The sandbox CSP + `<iframe sandbox>` tokens are real values flagged as a tunable boundary (mirrors Plan 3 `filesDb` / Plan 2 Picker treatment), with a concrete debug procedure in `docs/development.md`.
- **Type consistency:** `PickedFolder`/`PickerMessage`/`isPickerMessage`/`PICKER_CHANNEL` defined once (Task 1), reused by `picker.ts` (popup side) and the sandbox `main.ts`. `pickFolder(token, apiKey, appId): Promise<PickedFolder | null>` identical to the previous signature.
- **Known follow-ups:** Picker UX is constrained by the popup window size (~640×520 max) — a dedicated connect tab/window would be roomier (roadmap); the sandbox CSP may need widening after first real run; if Chrome later tightens sandbox behavior, revisit. The referrer restriction on the Picker API key (`chrome-extension://<id>/*`) interacts with the sandbox's opaque origin — if Picker fails with the referrer restriction on, loosen to API-restriction-only (documented in security.md).
```
