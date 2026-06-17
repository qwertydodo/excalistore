# Excalistore — Project Rules

Chrome extension (MV3) connecting excalidraw.com to Google Drive. See the spec
at `docs/superpowers/specs/2026-06-17-excalistore-design.md`.

## Stack & conventions
- WXT + React + TypeScript (strict). Biome for lint+format. Vitest for tests.
  knip for dead code. lefthook + commitlint for hooks.
- OAuth scope `drive.file` only. All Drive/auth calls happen in the background
  service worker — never in the content script or panel.
- Validate every `.excalidraw` payload before writing it into page storage.
- **UI components:** one folder per component
  (`ui/<Name>/<Name>.tsx` + `<Name>.module.css` + `index.ts`). Styling lives in
  **CSS Modules** referencing theme vars `var(--es-*)`. No inline `style` props
  except genuinely dynamic values that can't be a class (document the exception).
- **Tests are colocated** beside the code they test (e.g. `Button/Button.test.tsx`,
  `excalidraw-format.test.ts` next to `excalidraw-format.ts`). No top-level `tests/`
  directory.

## Architecture (FSD)
- Simplified Feature-Sliced Design under `src/`: layers `shared → entities →
  features → widgets` import only from layers strictly below (never sideways,
  never up). `entrypoints/` is the app/composition root and may import any
  layer.
- Slices on the same layer do not import each other.
- Segments within a slice: `ui` (components), `api` (transport/contracts),
  `model` (types/state), `lib` (pure helpers), `config` (tokens/constants).
  Each segment exposes a barrel `index.ts` as its public API — import from the
  barrel, not internal files.
- Module files are **camelCase** (`excalidrawFormat.ts`); React components are
  **PascalCase** (`Button.tsx`).
- Theme tokens live in CSS custom properties (`src/shared/config/theme.css`),
  not JS objects — switch themes via the `data-theme` attribute, not by
  swapping a JS variable map.

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
