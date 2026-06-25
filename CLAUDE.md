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
- **`shared/ui` is the source of truth for interactive behaviour.** Never use
  a raw `<button>`, `<input>`, or `<a>` in feature/entrypoint code when a
  `shared/ui` component covers the use case (`Button`, `IconButton`, `ListItem`,
  `TextField`, …). Focus rings, hover states, and disabled styles live in the
  shared primitive's own CSS — adding them to feature CSS means they'll drift.
  When no existing primitive fits, add one to `shared/ui` rather than styling
  an ad-hoc element in place.
- **`reset.css` is UA-reset only** (remove browser margins/padding/borders on
  elements, set `box-sizing`, etc.). Custom design-token styles — even
  universal ones — belong in the component that owns the element, not in
  `reset.css`.
- **Tests are colocated** beside the code they test (e.g. `Button/Button.test.tsx`,
  `excalidraw-format.test.ts` next to `excalidraw-format.ts`). No top-level `tests/`
  directory.
- **TypeScript style:** prefer `type` over `interface` everywhere; use
  `interface` only when something specifically needs it (e.g. declaration
  merging). A component's `XProps` type must be the type of the actual root
  object the component receives as props — never the type of a nested field
  inside it. If a component takes `{ diagram }`, `DiagramPanelProps` is
  `{ diagram: Diagram }`; the nested shape gets its own name (`Diagram`), not
  `DiagramPanelProps`. When a type's fields are a subset of another type
  already defined nearby (e.g. a hook's params vs. another hook's return
  shape), derive it with `Pick`/`Omit` from that type instead of
  hand-copying the fields.
- **Boolean naming:** boolean variables, props, and state must start with
  `is`/`are`/`should`/`has` etc. — e.g. `isLoading` not `loading`,
  `isVisible` not `collapsed`.
- **No raw `useState` setters across a boundary:** never pass a `useState`
  setter directly as a prop, callback, or hook param — wrap it in a
  same-shaped callback first. Keep the real setter named `setX` per React
  convention; give the wrapper a new name and expose/pass that instead. Name
  these wrappers `onXChange` — never `handleX` (rename around any collision
  with a same-named prop instead, e.g. a local open-handler that forwards to
  an `onOpen` prop becomes `onRowOpen`, not `handleOpen`).
- **Own state where it's used:** don't thread state (or the hook that holds
  it) through a parent/composition root if nothing above needs to read or
  control it — call the hook directly in the component that needs it. e.g. a
  panel's own open/collapsed state belongs in a hook the panel widget calls
  itself, not in `entrypoints/*/App.tsx` passed down as props.

## Claude Code skills
- `.claude/skills/` is the only source of truth for installed skills — never
  let `npx skills add` (or anything else) create or repopulate a top-level
  `.agents/` folder. If a future `skills add` symlinks a skill into
  `.agents/skills/*` instead of writing it directly under `.claude/skills/*`,
  dereference the symlink (copy the real files into `.claude/skills/<name>`,
  delete the symlink) and delete `.agents/` again.

## Architecture (FSD)
- Follows Feature-Sliced Design v2.1 (`.claude/skills/feature-sliced-design`,
  installed via `npx skills add`) as the source of truth for where new code
  belongs, on top of the project-specific conventions below.
- Simplified Feature-Sliced Design under `src/`: layers `shared → entities →
  features → widgets` import only from layers strictly below (never sideways,
  never up). `entrypoints/` (background, content, popup) plays the role of
  FSD's `app` layer — it's the composition root and may import any layer.
  This project has no `pages/` layer: it's a non-routed extension with three
  independent composition roots, not a multi-page app.
- Slices on the same layer do not import each other.
- `widgets/` stays empty until something is actually reused by a second
  composition root (`entrypoints/content`, `entrypoints/popup`, ...). Until
  then, page-local UI — components and the hooks they alone use — lives
  directly under the owning entrypoint's own `ui/`/`model/` folders, not
  under `src/widgets/`. A single-consumer composed block (e.g. a panel
  composing several sub-components) is still page-local, not a widget —
  reuse count decides the promotion, not size. Promote to `widgets/` (or
  pull shared logic into `features/`) only once a second composition root
  actually needs it.
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
- **CSS reset:** `src/shared/config/reset.css` is imported first in every
  entrypoint (`content/index.tsx`, `popup/main.tsx`). It resets UA defaults
  for `ul`/`ol`, headings, `p`, form elements, etc. Never re-reset these
  manually inside component CSS — trust the reset instead.

## Docs discipline
- After any change, update the corresponding doc: architecture change →
  `docs/architecture.md`; security change → `docs/security.md`; setup change →
  `docs/development.md`.
- After any change that affects project description, stack, features, setup, or
  security posture — update `README.md` accordingly.
- After shipping a feature, move it out of "Next to pick up" in
  `docs/features.md` and document its behavior.
- After a big refactor that establishes a new convention not yet captured
  here, ask the user whether to add it as a rule to this file — don't add it
  unasked.

## Commits & branches
- Commits: Conventional Commits — `type(scope): subject`; types
  `feat|fix|docs|chore|refactor|test|build|ci`. Enforced by commitlint.
- Branches: `type/short-description` (e.g. `feat/drive-autosave`).
- **Worktree workflow:** every task runs in a dedicated git worktree.
  On task start: `git worktree add ../excalistore-<branch> -b <branch>`,
  work there, then merge into `main` and remove the worktree:
  `git worktree remove ../excalistore-<branch>`. Never work directly on
  `main` (the pre-commit hook blocks it anyway).
