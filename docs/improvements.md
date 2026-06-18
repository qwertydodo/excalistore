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

---

## Notes / open questions

- Items 1, 2, 5 are a UI pass (in-page panel polish + theming) and could be one
  plan.
- Items 3 + 6 are correctness bugs and should likely go first (data loss + can't
  type are the worst UX).
- Item 4 expands the folder model (multi-folder) — revisit the `drive.file`
  app-owned-folder design; creating folders is fine under `drive.file`, but
  organizing arbitrary existing content is still scope-limited (see
  `docs/security.md`).
