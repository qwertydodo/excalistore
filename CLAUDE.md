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
- **Icon buttons are self-describing:** every `IconButton` must have an
  `aria-label`. `IconButton` renders a `title` hover tooltip from that
  `aria-label` automatically (pass an explicit `title` only to override) —
  don't add ad-hoc `title` attributes that just duplicate the label, and never
  ship an icon-only button with no `aria-label`/tooltip.
- **`reset.css` is UA-reset only** (remove browser margins/padding/borders on
  elements, set `box-sizing`, etc.). Custom design-token styles — even
  universal ones — belong in the component that owns the element, not in
  `reset.css`.
- **Tests are colocated** beside the code they test (e.g. `Button/Button.test.tsx`,
  `excalidraw-format.test.ts` next to `excalidraw-format.ts`). No top-level `tests/`
  directory.
- **Check for an existing test helper before writing new mock/fake/stub
  scaffolding.** `src/shared/lib/testUtils.ts` holds generic, project-wide
  test doubles (`stubFetch`, `stubChromeStorageLocal`, `stubSessionStorage`);
  `entrypoints/content/lib/testUtils.ts` holds ones scoped to that
  entrypoint (e.g. `createFakeSceneBridgeDeps`, since `SceneBridgeDeps` is
  entrypoint-local and `shared/` can't import it). Before hand-rolling a fake
  in a new `*.test.ts` file, check whether one of these two files already
  covers it, or should gain a new export instead of the test file growing
  its own copy — this is the same "group small helpers by domain, don't
  duplicate" rule as everywhere else, just for tests specifically.
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
- **Zustand for cross-hook/cross-component state:** when a piece of state
  needs to be read or written by more than one hook or component that isn't
  in a direct parent/child relationship, put it in a zustand store instead of
  lifting it into the nearest common ancestor and threading it down as props.
  Stores live in a `stores/` subfolder of the slice's `model/` segment (e.g.
  `entrypoints/content/model/stores/diagramLibraryStore.ts`), one file per
  store, name `use<Domain>Store`. Any hook or component that needs a field or
  action reads it **directly** off the store — never re-select a value in a
  parent just to pass it down as a prop/param when the child could import the
  store itself; that's props drilling with extra steps. When a
  component/hook needs 2+ fields from the same store, select them in one call
  with `useShallow` from `zustand/react/shallow`
  (`const { a, b } = useStore(useShallow((s) => ({ a: s.a, b: s.b })))`)
  instead of one `useStore((s) => s.x)` call per field. Plain
  `chrome.storage.local` read/write wrappers (no in-memory reactive state) are
  a different thing — not zustand — but still grouped one-file-per-concern
  under `stores/` since they're conceptually "the persisted store" too (e.g.
  `entrypoints/content/model/stores/sessionStore.ts`).

## Claude Code skills
- `.claude/skills/` is the only source of truth for installed skills — never
  let `npx skills add` (or anything else) create or repopulate a top-level
  `.agents/` folder. If a future `skills add` symlinks a skill into
  `.agents/skills/*` instead of writing it directly under `.claude/skills/*`,
  dereference the symlink (copy the real files into `.claude/skills/<name>`,
  delete the symlink) and delete `.agents/` again.

## Context7 MCP
- `.mcp.json` registers the `context7` MCP server for this project only. For
  library/framework/SDK/API/CLI docs (syntax, config, version migration,
  setup) use `mcp__context7__query-docs` (resolve library ID via
  `mcp__context7__resolve-library-id` first) instead of `WebFetch`/`WebSearch`
  or memory — even for well-known libs, since training data can be stale.

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
  `model/types.ts`). **Exception:** a file that is genuinely cross-cutting,
  non-domain infrastructure (no single domain owns it) is named
  `<what>Utils.ts` — always `Utils`, never `Helpers`/`Helper` — e.g.
  `shared/lib/typeUtils.ts` (generic TS type helpers), `shared/lib/testUtils.ts`
  (test-only mocks/stubs shared across suites). This is a narrow exception for
  files with no domain to be named after, not a license to reach for `utils.ts`
  as a catch-all — most new code still belongs in a domain-named file.
- **`lib/` segments split hooks from plain functions** when a slice's `lib/`
  has both: React hooks (and their colocated tests) live under `lib/hooks/`
  (e.g. `shared/lib/hooks/useDebounce.ts`); plain functions stay directly in
  `lib/`. Don't create `lib/hooks/` in a slice that has no hooks to put there.
- `shared/api/` contains transport layer init only — e.g. `shared/api/google/googleClient.ts` is the ky singleton. All API methods, mappings, and domain logic live in the corresponding entity slice as a **repository object** (`entities/<provider>/<domain>/api/<domain>Repo.ts`). Example: `entities/google/drive/api/driveRepo.ts` for Drive CRUD, `entities/google/auth/api/authRepo.ts` for OAuth revoke. Services and feature code call repo methods only — never `googleClient` directly. Group entity slices by provider when multiple domains share the same transport (e.g. `entities/google/drive/` and `entities/google/auth/` both use `googleClient`).
- Theme tokens live in CSS custom properties (`src/shared/config/theme.css`),
  not JS objects — switch themes via the `data-theme` attribute, not by
  swapping a JS variable map. Two layers: **primitive** (`--es-color-*`, raw
  hex, never used in components) and **semantic** (purpose-named, reference
  primitives, switch per theme). Semantic naming convention:
  `--es-color-bg-*` (backgrounds), `--es-color-text-*` (text),
  `--es-color-border*` (borders), `--es-color-interactive-*` (action/brand),
  `--es-color-status-*` (status foregrounds), `--es-color-overlay`.
  Components consume semantic tokens only. Component-level tokens are
  intentionally avoided — add a semantic token instead.
- **Never use a primitive token in component CSS.** If no semantic token covers
  the needed value, add one to `src/shared/config/theme.css` with both light
  and dark values, then reference it from the component. Never shortcut directly
  to `--es-color-*` primitives or raw hex in a `.module.css` file.
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
- On task start, create a branch off `main` (`git switch -c <branch>`) and
  work there. Never work directly on `main` (the pre-commit hook blocks it
  anyway). Parallel work in separate worktrees is fine — see
  `superpowers:using-git-worktrees`.
- **After opening a PR, wait for all checks to finish** (CI `check` and
  CodeRabbit review) before doing anything else with it. If the CI pipeline
  fails or CodeRabbit raises a problem, analyze it and report the analysis to
  the user — wait for their decision on what to do, never fix or dismiss it
  unilaterally. Once every check is green and CodeRabbit has no findings, ask
  the user for merge approval before merging — never merge automatically.
  Only skip asking if the user has explicitly told you to bypass approval for
  that PR.
