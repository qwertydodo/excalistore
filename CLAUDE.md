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
- Follows Feature-Sliced Design v2.1 (`.agents/skills/feature-sliced-design`,
  installed via `npx skills add`) as the source of truth for where new code
  belongs, on top of the project-specific conventions below.
- Simplified Feature-Sliced Design under `src/`: layers `shared → entities →
  features → widgets` import only from layers strictly below (never sideways,
  never up). `entrypoints/` (background, content, popup) plays the role of
  FSD's `app` layer — it's the composition root and may import any layer.
  This project has no `pages/` layer: it's a non-routed extension with three
  independent composition roots, not a multi-page app.
- Slices on the same layer do not import each other.
- Segments within a slice: `ui` (components), `api` (transport/contracts),
  `model` (types/state), `lib` (pure helpers), `config` (tokens/constants).
  Each segment exposes a barrel `index.ts` as its public API — import from the
  barrel, not internal files.
- Module files are **camelCase** (`excalidrawFormat.ts`); React components are
  **PascalCase** (`Button.tsx`). Name files by domain, never by technical role
  (no `types.ts`/`utils.ts`/`helpers.ts` — e.g. `shared/api/driveFile.ts`, not
  `model/types.ts`).
- CRUD operations and thin DTO-only wrappers (no real business logic) belong
  in `shared/api/`, not `entities/`. Only create an entity slice for a domain
  model with real logic and multiple consumers (e.g. `entities/diagram`'s
  `.excalidraw` envelope validation). A single-consumer CRUD client with no
  domain logic — e.g. the Drive REST client — lives in `shared/api/` instead.
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
