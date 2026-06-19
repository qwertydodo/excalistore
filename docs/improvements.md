# Improvements backlog

Captured from live testing. Status as of the 2026-06-18 fixes pass.

**Done:** #3 (save before switching diagrams) and #6 (panel inputs no longer
trigger Excalidraw shortcuts) — commit `139000e`. Several robustness items from
the separate review-fixes pass also landed (`b0b63d7`).
**Remaining:** #1, #2, #5 (UI/theming polish). #4 (folder model) deferred — needs
design.

## 1. Move login/connect into the excalidraw.com page

The connect UI currently lives in the extension **popup**. It should be on the
**excalidraw.com page itself** (in the in-page panel / Shadow DOM), so the whole
flow — connect, folder, diagram list — is in one place and the user never has to
open the toolbar popup.

- Move the "Connect Google Drive" + folder-name UI from `widgets/popupConnect`
  (popup) into the in-page panel (`widgets/diagramPanel` / `entrypoints/content.tsx`).
- The popup can become a thin status/shortcut, or be removed.
- Note: interactive `getAuthToken` is triggered from the page via the background
  gateway (already how `drive/connect` works), so this is mostly a UI relocation.

## 2. Login styling is broken

The connect UI styles don't render correctly. Fix the styling so the connect
state looks intentional (matches the rest of the panel / Excalidraw theme). Tie
in with item 1 (the relocated in-page connect should be styled from the start).

## 3. Autosave on switching diagrams — DONE (139000e)

When the user clicks from one diagram to another, the current diagram must be
**saved before switching** (flush autosave / explicit save), so unsaved edits
aren't lost on open. Today `onOpen` writes the new scene directly without
flushing the current one.

- Flush the active file's pending changes before `writeScene` of the newly
  opened diagram.
- Relates to the dropped "replace-canvas Save/Discard/Cancel" guard — decide
  whether switching auto-saves silently or prompts.

## 4. Create folders + open/close diagrams from the panel

- **Create folders:** let the user create additional folders (beyond the single
  app folder) from the panel, and organize diagrams. (Currently one app-owned
  folder, set at connect.)
- **Open / close diagrams:** explicit open and a way to "close" the active
  diagram (clear active state / return to a neutral canvas) from the panel.

## 7. Subfolders aren't shown — list is flat, root of the folder only

`listFolder` queries `'<folderId>' in parents`, which returns only direct
children of the connected folder. Diagrams inside a **subfolder** don't appear,
and there's no way to navigate into subfolders.

- Decide the model: either (a) show subfolders as navigable entries in the panel
  (breadcrumb / drill-in), or (b) recurse and flat-list all `.excalidraw` files
  under the folder tree (with a path label), or (c) keep flat but document that
  only the top level is shown.
- Under `drive.file`, the app can only see folders/files it created or that were
  opened via it — so a subfolder created in Drive's own UI inside the app folder
  is visible to the app (it's a descendant the app can access once listed), but
  arbitrary pre-existing trees still aren't. Verify the scope behavior when
  designing this.
- Part of the **#4 folder model** rework — design together.

## 5. Hover styling should match Excalidraw

Panel items (and buttons) on hover should use the **same hover styling as
Excalidraw's native UI** — match its hover background, radius, transition — so
the panel feels native, not bolted on.

## 6. Input fields steal keystrokes — Excalidraw shortcuts fire — DONE (139000e)

Fixed by stopping `keydown`/`keyup` propagation at the panel root so keys never
reach Excalidraw's document-level shortcut handlers. NOTE: if Excalidraw turns
out to listen in the **capture** phase, this bubble-phase stop won't catch it —
verify by typing in the create/rename fields; if a tool still activates, escalate
to a capture-phase guard.

Bug: when typing into a panel input (folder name, diagram name, rename), the
keystrokes trigger **Excalidraw's element shortcuts** instead of going into the
field — can't type normally (e.g. pressing a letter selects a tool).

- Excalidraw's global keydown handlers are catching keys before/through the
  panel. Stop propagation of keyboard events from panel inputs (e.g.
  `onKeyDown`/`onKeyUp` `stopPropagation`), or otherwise isolate the Shadow DOM
  input focus from Excalidraw's document-level shortcut listeners.
- Verify across the folder-name field, create-diagram field, and rename field.

## 8. `useThemeSync` polls every 1s — wasteful

`useThemeSync` (`entrypoints/content/model/useThemeSync.ts`) mirrors Excalidraw's
theme onto the shadow host via a 1s `setInterval` poll. This is necessary today
— Excalidraw exposes no theme-change event — but wasteful for something that
changes rarely (only on explicit user theme toggle).

- Candidate fix: an event-driven rewrite, e.g. a `storage` event listener (if
  Excalidraw's theme lives in `localStorage` and fires that event) instead of
  polling.
- Needs manual in-browser verification across isolated worlds (content script
  vs. page) before changing — not done in this pass.

---

## Notes / open questions

- Items 1, 2, 5 are a UI pass (in-page panel polish + theming) and could be one
  plan.
- Items 3 + 6 are correctness bugs and should likely go first (data loss + can't
  type are the worst UX).
- Items 4 + 7 are the **folder model** rework (multi-folder, subfolder
  navigation/recursion) — design them together; revisit the `drive.file`
  app-owned-folder design. Creating folders is fine under `drive.file`, but
  organizing arbitrary existing content is still scope-limited (see
  `docs/security.md`).
