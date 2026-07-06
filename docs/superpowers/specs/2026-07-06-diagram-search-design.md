# Diagram panel search — design

## Problem

The diagram panel (`entrypoints/content/ui/DiagramPanel`) lists every diagram
in a flat, alphabetically-sorted list with no way to filter it. As the number
of diagrams grows, finding one by scrolling becomes tedious. We want a search
box at the top of the panel that filters the visible list by name as the user
types.

## Scope

Client-side filtering of the diagram list already held in memory
(`files: DriveFile[]` passed into `DiagramPanel`). No new Drive API calls —
all diagrams are already loaded into the panel today, so there is nothing to
search that isn't already in `files`.

## Components

### `useDebounce` (new, `src/shared/lib/useDebounce.ts`)

Generic, reusable debounce hook, not specific to search or diagrams:

```ts
function useDebounce<T>(value: T, delayMs: number): T;
```

Returns `value`, updated only after it has been stable for `delayMs`.
Standard `useEffect` + `setTimeout` implementation; cleans up the pending
timeout on unmount or when `value`/`delayMs` change.

### `useTextSearch` (new, `src/shared/lib/useTextSearch.ts`)

Generic text-search/filter hook. Reusable anywhere a list needs "type to
filter" behavior — not diagram-specific:

```ts
type UseTextSearchOptions<T> = {
  getText: (item: T) => string;
  minChars?: number; // default 3
  debounceMs?: number; // default 300
  initialQuery?: string; // hydrate query after async load; undefined = not yet loaded, no-op
};

function useTextSearch<T>(
  data: T[],
  options: UseTextSearchOptions<T>,
): {
  query: string;
  onQueryChange: (value: string) => void;
  results: T[];
};
```

Behavior:
- `query` is the raw, un-debounced input value (so the field itself feels
  instant as the user types).
- The hook debounces `query` internally via `useDebounce` using
  `options.debounceMs`.
- While the debounced query's length is below `options.minChars`, `results`
  is `data` unchanged (no filtering applied yet).
- Once the debounced query's length reaches `options.minChars`, `results` is
  `data` filtered by
  `options.getText(item).toLowerCase().includes(debouncedQuery.toLowerCase())`
  (case-insensitive substring match). `Array.prototype.filter` preserves
  order, so `results` stays in whatever order `data` was passed in — no
  re-sort inside the hook.
- An internal effect watches `options.initialQuery`: whenever it changes
  from `undefined` to a defined string, `query` is set to that value. This
  lets a caller hydrate the query from async storage after mount without the
  hook itself knowing anything about where that value came from.

### `TextField` icon slots (extend existing, `src/shared/ui/TextField`)

Add an optional `icon` prop to the existing `TextField` primitive so any
consumer can render icons inside the input's bounds (not just search). The
click callback lives inside the icon slot itself, not as a sibling prop:

```ts
type IconSlot = IconName | { name: IconName; onClick: () => void };

type TextFieldProps = /* existing props */ & {
  icon?: {
    start?: IconSlot;
    end?: IconSlot;
  };
};
```

- `icon.start` / `icon.end` render inside the input's padding via absolute
  positioning in CSS (`TextField.module.css`), matching input height —
  visually inside the field, not beside it.
- A slot given as a bare `IconName` is decorative (`aria-hidden`, no
  interaction). A slot given as `{ name, onClick }` renders as a clickable
  icon button instead.
- `Icon.tsx`'s `ICONS` map gains two entries: `search` (lucide `Search`) and
  `x` (lucide `X`).

### `SearchField` (new, `src/shared/ui/SearchField`)

Thin, generic composition on top of `TextField` — still has no diagram
knowledge, belongs in `shared/ui` per the "shared/ui is the source of truth
for interactive behaviour" rule. Mirrors `TextField`'s own requirements
(`name` required) since more than one search field can exist on the page at
once (each needs a distinct `name`, same as any other form field):

```ts
type SearchFieldProps = {
  name: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  "aria-label": string;
};
```

Renders a `TextField` with
`icon={{ start: "search", end: value ? { name: "x", onClick: () => onChange("") } : undefined }}`.

### `useDiagramSearch` (new, `entrypoints/content/model/useDiagramSearch.ts`)

Diagram-specific composition that adds persistence on top of the generic
`useTextSearch`, so the generic hook stays free of `chrome.storage` coupling.
Mirrors the existing `usePanelVisibility` / `panelState.ts` pattern (start
with no persisted value, load it async, save on change; tolerate storage
rejections):

```ts
// entrypoints/content/model/searchState.ts — same shape as panelState.ts
const KEY = "diagramSearchQuery";
getDiagramSearchQuery(): Promise<string>; // "" on read failure
setDiagramSearchQuery(query: string): Promise<void>; // best-effort
```

```ts
export const useDiagramSearch = (files: DriveFile[]) => {
  const [initialQuery, setInitialQuery] = useState<string | undefined>(undefined);
  useEffect(() => {
    getDiagramSearchQuery().then(setInitialQuery);
  }, []);

  const { query, onQueryChange, results } = useTextSearch(files, {
    getText: (f) => f.name,
    minChars: 3,
    initialQuery,
  });

  // Persist the debounced value, not every keystroke — writing to
  // chrome.storage on every keypress is unnecessary churn, and the reload
  // that actually needs this (opening a diagram) is a discrete action, never
  // mid-keystroke.
  const debouncedQuery = useDebounce(query, 300);
  useEffect(() => {
    setDiagramSearchQuery(debouncedQuery);
  }, [debouncedQuery]);

  return { query, onQueryChange, results };
};
```

### Behavior notes

- **A diagram is created while a search is active**: `files` is a plain prop:
  every render recomputes `ordered`/`results` regardless of `query`. A newly
  created diagram appears immediately if it matches the current filter;
  otherwise it simply doesn't show until the query is cleared/changed. No
  special-casing needed.
- **Opening a diagram**: `onRowOpen` already causes a full tab reload
  (`DiagramPanel.tsx`, `onOpen` "resolves into a tab reload on success"),
  which wipes all in-memory state including `query`. This is the actual
  reason the query needs persisting — same reason `usePanelVisibility`
  persists collapsed/expanded across that same reload.
- **Does the filter survive that reload?** Yes — `useDiagramSearch` rehydrates
  `query` from `chrome.storage.local` after the reload, same as
  `usePanelVisibility` rehydrates `isVisible`.

This requires `useTextSearch` to accept an `initialQuery?: string` option
(undefined = not yet loaded, no-op): when `initialQuery` changes from
`undefined` to a loaded value, an internal effect adopts it as the current
`query`. This is the same "start empty, hydrate async" shape
`usePanelVisibility` already uses for `isVisible`, just generalized into the
reusable hook.

### `DiagramPanel` wiring

```ts
const { query, onQueryChange, results } = useDiagramSearch(ordered);
```

(`ordered` is the existing name-sorted array already computed in
`DiagramPanel`; filtering runs after sorting so `results` stays sorted.
`useDiagramSearch` is called directly in `DiagramPanel` — "own state where
it's used" — not threaded down from a parent.)

A new row is inserted between the panel header and the list:

```tsx
<SearchField
  name="diagram-search"
  value={query}
  onChange={onQueryChange}
  placeholder="Type 3+ characters to search"
  aria-label="Search diagrams"
/>
```

The list renders `results` instead of `ordered`.

## Empty states

Four distinct cases in the render body, in priority order:

1. `isLoading` → spinner (existing, unchanged).
2. `files.length === 0` → "No diagrams yet" (existing, unchanged).
3. `query.length > 0 && query.length < 3` → full list still shown
   (`useTextSearch` hasn't started filtering yet — no special empty state).
4. `results.length === 0` (query at/above 3 chars, no matches) → new text:
   `No diagrams match "{query}"`.

## Docs to update (after shipping)

- `docs/features.md`: move the existing "Client-side file search" bullet
  (already listed under "Next to pick up") into "Shipped", with a behavior
  description covering the 3-char minimum, debounce, and query persistence.
- `docs/architecture.md`: mention the new `shared/lib` hooks (`useDebounce`,
  `useTextSearch`) alongside the existing `shared/lib` entries, and the new
  `SearchField` alongside `TextField` in the `shared/ui` list (~line 251).

## Out of scope

- Searching diagrams not already loaded into the panel (Drive-side search).
- Fuzzy/typo-tolerant matching — plain case-insensitive substring only.
