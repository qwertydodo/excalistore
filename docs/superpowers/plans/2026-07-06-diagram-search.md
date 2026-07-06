# Diagram Panel Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a search box to the top of the diagram panel that filters the already-loaded diagram list by name, client-side, with a 3-character minimum, debounced input, and the query persisted across the tab reload that opening a diagram triggers.

**Architecture:** Two new generic hooks in `shared/lib` (`useDebounce`, `useTextSearch`) with no diagram or Chrome-extension knowledge; a `TextField` extension (icon slots) and a new `SearchField` in `shared/ui`, equally generic; a diagram-specific composition hook (`useDiagramSearch`) in `entrypoints/content/model` that adds `chrome.storage.local` persistence on top, mirroring the existing `usePanelVisibility`/`panelState.ts` pattern; `DiagramPanel` wires it all together.

**Tech Stack:** React 19, TypeScript strict, Vitest + Testing Library (`renderHook`, fake timers), CSS Modules, lucide-react icons.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-06-diagram-search-design.md` — read it first; this plan implements it exactly, with one correctness change from the spec's pseudo-code noted in Task 7 (persistence is driven only by user-initiated query changes, not by the combined `query` value — see that task's note for why the spec's version has a race).
- Minimum search length: 3 characters (`minChars: 3`).
- Debounce: 300ms (`debounceMs: 300`), reused for both the live filter and the storage write.
- Match rule: case-insensitive substring (`getText(item).toLowerCase().includes(query.toLowerCase())`).
- Placeholder copy: exactly `Type 3+ characters to search`.
- No-match copy: exactly `No diagrams match "{query}"` (double quotes around the literal query).
- `SearchField` requires `name` (string) and `aria-label` (string) — never optional, per `TextField`'s own existing convention and because more than one search field can exist on a page.
- Every icon-only clickable control needs an `aria-label` (project-wide rule already enforced for `IconButton`) — the `TextField` end-icon clear button must supply one via its `IconSlot` object, not omit it.
- Tests for a hook or component under `src/shared/lib/**` or `entrypoints/**/model/**` (i.e. NOT under `shared/ui/**` or `entrypoints/**/ui/**`) run under Vitest's `"node"` project by default (see `vitest.config.ts`) — any test using `renderHook`/`render` needs a `// @vitest-environment jsdom` pragma as its first line, exactly like `entrypoints/content/model/useActiveDiagram.test.ts` already does.
- No new CSS theme tokens are needed anywhere in this plan — icon color uses the existing `--es-color-text-secondary` token, and end-icon spacing reuses the existing `--es-interactive-height-sm` token.
- Test mocks/stubs belong in `src/shared/lib/testHelpers.ts` (already has `stubChromeStorageLocal`) — do not create new one-off helper files.

---

### Task 1: `useDebounce` hook

**Files:**
- Create: `src/shared/lib/useDebounce.ts`
- Create: `src/shared/lib/useDebounce.test.ts`
- Modify: `src/shared/lib/index.ts`

**Interfaces:**
- Produces: `useDebounce<T>(value: T, delayMs: number): T` — returns `value`, updated only after it has held steady for `delayMs`.

- [ ] **Step 1: Write the failing test**

```ts
// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDebounce } from "./useDebounce";

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("useDebounce", () => {
  it("returns the initial value immediately", () => {
    const { result } = renderHook(() => useDebounce("a", 300));
    expect(result.current).toBe("a");
  });

  it("holds the previous value until delayMs elapses", () => {
    const { result, rerender } = renderHook(({ value }) => useDebounce(value, 300), {
      initialProps: { value: "a" },
    });
    rerender({ value: "ab" });
    expect(result.current).toBe("a");
    act(() => {
      vi.advanceTimersByTime(299);
    });
    expect(result.current).toBe("a");
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current).toBe("ab");
  });

  it("resets the timer on rapid changes, settling only on the final value", () => {
    const { result, rerender } = renderHook(({ value }) => useDebounce(value, 300), {
      initialProps: { value: "a" },
    });
    rerender({ value: "ab" });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    rerender({ value: "abc" });
    act(() => {
      vi.advanceTimersByTime(299);
    });
    expect(result.current).toBe("a");
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current).toBe("abc");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/shared/lib/useDebounce.test.ts`
Expected: FAIL — `Cannot find module './useDebounce'` (or similar), since the module doesn't exist yet.

- [ ] **Step 3: Write the implementation**

```ts
// src/shared/lib/useDebounce.ts
import { useEffect, useState } from "react";

export const useDebounce = <T,>(value: T, delayMs: number): T => {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
};
```

- [ ] **Step 4: Export it from the shared/lib barrel**

```ts
// src/shared/lib/index.ts
export * from "./dateFormat";
export * from "./typeUtils";
export * from "./useDebounce";
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/shared/lib/useDebounce.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add src/shared/lib/useDebounce.ts src/shared/lib/useDebounce.test.ts src/shared/lib/index.ts
git commit -m "feat(shared/lib): add useDebounce hook"
```

---

### Task 2: `useTextSearch` hook

**Files:**
- Create: `src/shared/lib/useTextSearch.ts`
- Create: `src/shared/lib/useTextSearch.test.ts`
- Modify: `src/shared/lib/index.ts`

**Interfaces:**
- Consumes: `useDebounce<T>(value: T, delayMs: number): T` (Task 1).
- Produces:
  ```ts
  type UseTextSearchOptions<T> = {
    getText: (item: T) => string;
    minChars?: number; // default 3
    debounceMs?: number; // default 300
    initialQuery?: string;
  };
  type UseTextSearchResult<T> = {
    query: string;
    onQueryChange: (value: string) => void;
    results: T[];
  };
  useTextSearch<T>(data: T[], options: UseTextSearchOptions<T>): UseTextSearchResult<T>
  ```

- [ ] **Step 1: Write the failing test**

```ts
// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTextSearch } from "./useTextSearch";

type Item = { id: string; name: string };
const items: Item[] = [
  { id: "1", name: "beta" },
  { id: "2", name: "alpha" },
  { id: "3", name: "Alphabet" },
];

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("useTextSearch", () => {
  it("returns all data, in original order, below minChars", () => {
    const { result } = renderHook(() => useTextSearch(items, { getText: (i) => i.name }));
    expect(result.current.results).toEqual(items);
  });

  it("does not filter until the debounce window elapses", () => {
    const { result } = renderHook(() => useTextSearch(items, { getText: (i) => i.name }));
    act(() => result.current.onQueryChange("alp"));
    act(() => {
      vi.advanceTimersByTime(299);
    });
    expect(result.current.results).toEqual(items);
  });

  it("filters case-insensitively, preserving original order, once minChars is reached and the debounce elapses", () => {
    const { result } = renderHook(() => useTextSearch(items, { getText: (i) => i.name }));
    act(() => result.current.onQueryChange("ALP"));
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(result.current.results).toEqual([items[1], items[2]]);
  });

  it("hydrates the query once initialQuery transitions from undefined to a value", () => {
    const { result, rerender } = renderHook(
      ({ initialQuery }: { initialQuery?: string }) =>
        useTextSearch(items, { getText: (i) => i.name, initialQuery }),
      { initialProps: { initialQuery: undefined } },
    );
    expect(result.current.query).toBe("");
    rerender({ initialQuery: "beta" });
    expect(result.current.query).toBe("beta");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/shared/lib/useTextSearch.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
// src/shared/lib/useTextSearch.ts
import { useEffect, useState } from "react";
import { useDebounce } from "./useDebounce";

export type UseTextSearchOptions<T> = {
  getText: (item: T) => string;
  minChars?: number;
  debounceMs?: number;
  initialQuery?: string;
};

export type UseTextSearchResult<T> = {
  query: string;
  onQueryChange: (value: string) => void;
  results: T[];
};

export const useTextSearch = <T,>(
  data: T[],
  options: UseTextSearchOptions<T>,
): UseTextSearchResult<T> => {
  const { getText, minChars = 3, debounceMs = 300, initialQuery } = options;
  const [query, setQuery] = useState(initialQuery ?? "");
  const debouncedQuery = useDebounce(query, debounceMs);

  // Hydrate from async-loaded storage: initialQuery starts undefined (not
  // loaded yet) and later flips to a defined string once the caller's
  // storage read resolves — adopt it when that happens.
  useEffect(() => {
    if (initialQuery !== undefined) setQuery(initialQuery);
  }, [initialQuery]);

  const onQueryChange = (value: string) => setQuery(value);

  const results =
    debouncedQuery.length < minChars
      ? data
      : data.filter((item) => getText(item).toLowerCase().includes(debouncedQuery.toLowerCase()));

  return { query, onQueryChange, results };
};
```

- [ ] **Step 4: Export it from the shared/lib barrel**

```ts
// src/shared/lib/index.ts
export * from "./dateFormat";
export * from "./typeUtils";
export * from "./useDebounce";
export * from "./useTextSearch";
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/shared/lib/useTextSearch.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 6: Commit**

```bash
git add src/shared/lib/useTextSearch.ts src/shared/lib/useTextSearch.test.ts src/shared/lib/index.ts
git commit -m "feat(shared/lib): add useTextSearch hook"
```

---

### Task 3: Add `search`/`x` icons

**Files:**
- Modify: `src/shared/ui/Icon/Icon.tsx`
- Modify: `src/shared/ui/Icon/Icon.stories.tsx`

**Interfaces:**
- Produces: `IconName` gains `"search"` and `"x"` as valid values.

No test file exists for `Icon` today (it's a pure lookup table) — this task skips the TDD ceremony and edits directly, matching that existing convention.

- [ ] **Step 1: Add the two icons to the lookup map**

```tsx
// src/shared/ui/Icon/Icon.tsx (full new top section)
import { Cloud, FolderOpen, Minus, Pencil, Search, Trash2, X } from "lucide-react";
import type { AriaAttributes } from "react";

const ICONS = {
  minus: Minus,
  edit: Pencil,
  trash: Trash2,
  folderOpen: FolderOpen,
  cloud: Cloud,
  search: Search,
  x: X,
} as const;
```

Leave the rest of `Icon.tsx` (`IconName`, `IconSize`, `SIZE_PX`, `IconProps`, `Icon` component) unchanged.

- [ ] **Step 2: Update the Storybook file**

```tsx
// src/shared/ui/Icon/Icon.stories.tsx
import type { Meta, StoryObj } from "@storybook/react";
import { Icon } from "./Icon";

const meta: Meta<typeof Icon> = {
  title: "shared/ui/Icon",
  component: Icon,
  tags: ["autodocs"],
  argTypes: {
    name: {
      control: "select",
      options: ["minus", "edit", "trash", "folderOpen", "cloud", "search", "x"],
    },
    size: { control: "radio", options: ["sm", "md", "lg"] },
  },
  args: {
    name: "edit",
    size: "sm",
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Minus: Story = { args: { name: "minus" } };

export const Edit: Story = { args: { name: "edit" } };

export const Trash: Story = { args: { name: "trash" } };

export const FolderOpen: Story = { args: { name: "folderOpen" } };

export const Cloud: Story = { args: { name: "cloud" } };

export const Search: Story = { args: { name: "search" } };

export const Clear: Story = { args: { name: "x" } };

export const AllIcons: Story = {
  render: () => (
    <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
      <Icon name="minus" />
      <Icon name="edit" />
      <Icon name="trash" />
      <Icon name="folderOpen" />
      <Icon name="cloud" />
      <Icon name="search" />
      <Icon name="x" />
    </div>
  ),
};

export const Sizes: Story = {
  render: () => (
    <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
      <Icon name="edit" size="sm" />
      <Icon name="edit" size="md" />
      <Icon name="edit" size="lg" />
    </div>
  ),
};
```

- [ ] **Step 3: Typecheck**

Run: `npm run compile`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/shared/ui/Icon/Icon.tsx src/shared/ui/Icon/Icon.stories.tsx
git commit -m "feat(shared/ui): add search and clear icons"
```

---

### Task 4: `TextField` icon slots

**Files:**
- Modify: `src/shared/ui/TextField/TextField.tsx`
- Modify: `src/shared/ui/TextField/TextField.module.css`
- Modify: `src/shared/ui/TextField/TextField.stories.tsx`
- Create: `src/shared/ui/TextField/TextField.test.tsx`

**Interfaces:**
- Consumes: `Icon`, `IconName` (`../Icon`), `IconButton` (`../IconButton`) — both already exist.
- Produces:
  ```ts
  export type IconSlot = IconName | { name: IconName; onClick: () => void; "aria-label": string };
  // TextFieldProps gains: icon?: { start?: IconSlot; end?: IconSlot }
  ```
  A bare `IconName` renders decoratively (`aria-hidden`); the `{ name, onClick, "aria-label" }` form renders as a clickable button. `TextField` renders with no wrapper element when `icon` is omitted (existing markup/behavior unchanged).

- [ ] **Step 1: Write the failing test**

```tsx
// src/shared/ui/TextField/TextField.test.tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TextField } from "./TextField";

describe("TextField", () => {
  it("renders without a wrapper element when no icon is given", () => {
    const { container } = render(<TextField name="q" />);
    expect(container.firstChild).toBe(container.querySelector("input"));
  });

  it("renders a decorative start icon, hidden from the accessibility tree", () => {
    render(<TextField name="q" icon={{ start: "search" }} />);
    expect(document.querySelector("svg")).toHaveAttribute("aria-hidden");
  });

  it("renders a clickable end icon that fires its callback and exposes its aria-label", async () => {
    const onClick = vi.fn();
    render(
      <TextField name="q" icon={{ end: { name: "x", onClick, "aria-label": "Clear" } }} />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(onClick).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/shared/ui/TextField/TextField.test.tsx`
Expected: FAIL — `icon` prop doesn't exist yet / no `svg`/`button` rendered.

- [ ] **Step 3: Write the implementation**

```tsx
// src/shared/ui/TextField/TextField.tsx
import clsx from "clsx";
import type { InputHTMLAttributes } from "react";
import { Box } from "../Box";
import { Icon, type IconName } from "../Icon";
import { IconButton } from "../IconButton";
import styles from "./TextField.module.css";

type Size = "sm" | "md";

export type IconSlot = IconName | { name: IconName; onClick: () => void; "aria-label": string };

type TextFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "name" | "size"> & {
  name: string;
  size?: Size;
  icon?: {
    start?: IconSlot;
    end?: IconSlot;
  };
};

const renderIconSlot = (slot: IconSlot, position: "start" | "end") => {
  const positionClass = position === "start" ? styles.iconStart : styles.iconEnd;
  if (typeof slot === "string") {
    return <Icon name={slot} size="sm" className={positionClass} aria-hidden />;
  }
  return (
    <IconButton
      icon={slot.name}
      aria-label={slot["aria-label"]}
      onClick={slot.onClick}
      size="sm"
      variant="ghost"
      className={positionClass}
    />
  );
};

export const TextField = ({ className, size = "md", icon, ...rest }: TextFieldProps) => {
  const input = (
    <Box
      as="input"
      border="thin"
      radius="md"
      className={clsx(
        styles.textField,
        styles[size],
        icon?.start && styles.hasIconStart,
        icon?.end && styles.hasIconEnd,
        !icon && className,
      )}
      {...(rest as InputHTMLAttributes<HTMLInputElement>)}
    />
  );

  if (!icon) return input;

  return (
    <div className={clsx(styles.wrapper, className)}>
      {input}
      {icon.start ? renderIconSlot(icon.start, "start") : null}
      {icon.end ? renderIconSlot(icon.end, "end") : null}
    </div>
  );
};
```

- [ ] **Step 4: Add the icon-slot CSS**

Append to `src/shared/ui/TextField/TextField.module.css`:

```css
.wrapper {
  position: relative;
  display: inline-flex;
  width: 100%;
}
.hasIconStart {
  padding-left: calc(var(--es-space-2) * 2 + 14px);
}
.hasIconEnd {
  padding-right: var(--es-interactive-height-sm);
}
.iconStart {
  position: absolute;
  left: var(--es-space-2);
  top: 50%;
  transform: translateY(-50%);
  color: var(--es-color-text-secondary);
  pointer-events: none;
}
.iconEnd {
  position: absolute;
  right: 0;
  top: 50%;
  transform: translateY(-50%);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/shared/ui/TextField/TextField.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 6: Add a Storybook story for the new prop**

Append to `src/shared/ui/TextField/TextField.stories.tsx` (after `Small`):

```tsx
export const WithIcons: Story = {
  args: {
    icon: { start: "search", end: { name: "x", onClick: () => {}, "aria-label": "Clear" } },
  },
};
```

- [ ] **Step 7: Typecheck the whole project**

Run: `npm run compile`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/shared/ui/TextField/TextField.tsx src/shared/ui/TextField/TextField.module.css src/shared/ui/TextField/TextField.stories.tsx src/shared/ui/TextField/TextField.test.tsx
git commit -m "feat(shared/ui): add icon slots to TextField"
```

---

### Task 5: `SearchField` component

**Files:**
- Create: `src/shared/ui/SearchField/SearchField.tsx`
- Create: `src/shared/ui/SearchField/index.ts`
- Create: `src/shared/ui/SearchField/SearchField.test.tsx`
- Create: `src/shared/ui/SearchField/SearchField.stories.tsx`
- Modify: `src/shared/ui/index.ts`

**Interfaces:**
- Consumes: `TextField` (Task 4), `IconSlot` shape (not imported — constructed inline, structurally typed).
- Produces:
  ```ts
  type SearchFieldProps = {
    name: string;
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    "aria-label": string;
  };
  ```

- [ ] **Step 1: Write the failing test**

```tsx
// src/shared/ui/SearchField/SearchField.test.tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SearchField } from "./SearchField";

describe("SearchField", () => {
  it("calls onChange as the user types", async () => {
    const onChange = vi.fn();
    render(<SearchField name="search" value="" onChange={onChange} aria-label="Search diagrams" />);
    await userEvent.type(screen.getByRole("textbox", { name: "Search diagrams" }), "a");
    expect(onChange).toHaveBeenCalledWith("a");
  });

  it("shows no clear button when the value is empty", () => {
    render(<SearchField name="search" value="" onChange={vi.fn()} aria-label="Search diagrams" />);
    expect(screen.queryByRole("button", { name: "Clear search" })).not.toBeInTheDocument();
  });

  it("clears the value when the clear button is clicked", async () => {
    const onChange = vi.fn();
    render(
      <SearchField name="search" value="abc" onChange={onChange} aria-label="Search diagrams" />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(onChange).toHaveBeenCalledWith("");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/shared/ui/SearchField/SearchField.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```tsx
// src/shared/ui/SearchField/SearchField.tsx
import { TextField } from "../TextField";

type SearchFieldProps = {
  name: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  "aria-label": string;
};

export const SearchField = ({
  name,
  value,
  onChange,
  placeholder,
  "aria-label": ariaLabel,
}: SearchFieldProps) => {
  return (
    <TextField
      name={name}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      aria-label={ariaLabel}
      icon={{
        start: "search",
        end: value
          ? { name: "x", onClick: () => onChange(""), "aria-label": "Clear search" }
          : undefined,
      }}
    />
  );
};
```

```ts
// src/shared/ui/SearchField/index.ts
export { SearchField } from "./SearchField";
```

- [ ] **Step 4: Export from the shared/ui barrel**

```ts
// src/shared/ui/index.ts (insert alphabetically, between ListItem and Spinner)
export type { Tone } from "./Badge";
export { Badge } from "./Badge";
export type { BorderWidth, BoxProps, Radius, Shadow, Space } from "./Box";
export { Box } from "./Box";
export type { Variant, Width } from "./Button";
export { Button } from "./Button";
export { ConfirmDialog } from "./ConfirmDialog";
export { Dialog } from "./Dialog";
export { Heading } from "./Heading";
export { Icon } from "./Icon";
export type { IconButtonProps } from "./IconButton";
export { IconButton } from "./IconButton";
export { ListItem } from "./ListItem";
export { SearchField } from "./SearchField";
export { Spinner } from "./Spinner";
export type { StackProps } from "./Stack";
export { Stack } from "./Stack";
export type { TextColor, TextProps, TextSize } from "./Text";
export { Text } from "./Text";
export { TextField } from "./TextField";
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/shared/ui/SearchField/SearchField.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 6: Add a Storybook file**

```tsx
// src/shared/ui/SearchField/SearchField.stories.tsx
import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { SearchField } from "./SearchField";

const meta: Meta<typeof SearchField> = {
  title: "shared/ui/SearchField",
  component: SearchField,
  tags: ["autodocs"],
  args: {
    name: "search",
    placeholder: "Type 3+ characters to search",
    "aria-label": "Search diagrams",
  },
  decorators: [
    (Story) => (
      <div style={{ width: "280px" }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {
  render: (args) => {
    const [value, setValue] = useState("");
    return <SearchField {...args} value={value} onChange={setValue} />;
  },
};

export const WithValue: Story = {
  render: (args) => {
    const [value, setValue] = useState("diagram");
    return <SearchField {...args} value={value} onChange={setValue} />;
  },
};
```

- [ ] **Step 7: Typecheck**

Run: `npm run compile`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/shared/ui/SearchField src/shared/ui/index.ts
git commit -m "feat(shared/ui): add SearchField component"
```

---

### Task 6: `searchState` persistence helpers

**Files:**
- Create: `entrypoints/content/model/searchState.ts`
- Create: `entrypoints/content/model/searchState.test.ts`

**Interfaces:**
- Produces:
  ```ts
  getDiagramSearchQuery(): Promise<string>; // "" on read failure or when nothing is stored
  setDiagramSearchQuery(query: string): Promise<void>; // best-effort
  ```

This exactly mirrors `entrypoints/content/model/panelState.ts` (same file already read in full during brainstorming) — same shape, different key and value type.

- [ ] **Step 1: Write the failing test**

```ts
// entrypoints/content/model/searchState.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stubChromeStorageLocal } from "@/shared/lib/testHelpers";
import { getDiagramSearchQuery, setDiagramSearchQuery } from "./searchState";

let local: ReturnType<typeof stubChromeStorageLocal>["local"];
beforeEach(() => {
  ({ local } = stubChromeStorageLocal());
});
afterEach(() => vi.restoreAllMocks());

describe("searchState", () => {
  it("defaults to an empty string when nothing is stored", async () => {
    await expect(getDiagramSearchQuery()).resolves.toBe("");
  });

  it("round-trips the query", async () => {
    await setDiagramSearchQuery("meeting");
    await expect(getDiagramSearchQuery()).resolves.toBe("meeting");
  });

  it("returns an empty string when storage.get rejects", async () => {
    local.get.mockImplementationOnce(async () => {
      throw new Error("context invalidated");
    });
    await expect(getDiagramSearchQuery()).resolves.toBe("");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run entrypoints/content/model/searchState.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
// entrypoints/content/model/searchState.ts
const KEY = "diagramSearchQuery";

// The panel's search query — persisted so it survives the writeScene→reload
// that opening a diagram triggers. Tolerates storage rejections (context
// invalidation), same as panelState.ts.
export const getDiagramSearchQuery = async (): Promise<string> => {
  try {
    return ((await chrome.storage.local.get(KEY))[KEY] as string | undefined) ?? "";
  } catch {
    return "";
  }
};

export const setDiagramSearchQuery = async (query: string): Promise<void> => {
  try {
    await chrome.storage.local.set({ [KEY]: query });
  } catch {
    // Best-effort; the panel just won't remember the query next reload.
  }
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run entrypoints/content/model/searchState.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add entrypoints/content/model/searchState.ts entrypoints/content/model/searchState.test.ts
git commit -m "feat(content): persist the diagram search query"
```

---

### Task 7: `useDiagramSearch` hook

**Files:**
- Create: `entrypoints/content/model/useDiagramSearch.ts`
- Create: `entrypoints/content/model/useDiagramSearch.test.ts`

**Interfaces:**
- Consumes: `useTextSearch`, `useDebounce` (`@/shared/lib`, Tasks 1–2); `getDiagramSearchQuery`, `setDiagramSearchQuery` (`./searchState`, Task 6); `DriveFile` (`@/entities/google/drive`).
- Produces: `useDiagramSearch(files: DriveFile[]): { query: string; onQueryChange: (value: string) => void; results: DriveFile[] }`.

**Correctness note — deviates from the spec's pseudo-code:** the spec's version debounces the combined `query` (the same value `useTextSearch` also hydrates from `initialQuery`) and persists that. That races: `query` starts at `""`, and the moment `initialQuery` resolves and `query` jumps to the persisted value, `useDebounce`'s internal timer restarts from scratch — so `debouncedQuery` briefly still reads `""` on the very render where the persist effect's other dependency (`initialQuery`) just became defined, writing `""` over the real value. The fix: track a **separate** `userQuery` state that only `onQueryChange` (the user-facing setter) ever writes to; debounce and persist *that*, not the hydration-affected `query`. Hydration never touches `userQuery`, so it can never trigger a write — the persistence path is now driven exclusively by user input, matching the spec's actual intent ("save what the user typed") without the race.

- [ ] **Step 1: Write the failing test**

```ts
// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stubChromeStorageLocal } from "@/shared/lib/testHelpers";
import { getDiagramSearchQuery, setDiagramSearchQuery } from "./searchState";
import { useDiagramSearch } from "./useDiagramSearch";

type Item = { id: string; name: string; modifiedTime: string; headRevisionId: string };
const files: Item[] = [
  { id: "1", name: "beta.excalidraw", modifiedTime: "", headRevisionId: "" },
  { id: "2", name: "alpha.excalidraw", modifiedTime: "", headRevisionId: "" },
];

const flush = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};

beforeEach(() => {
  stubChromeStorageLocal();
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("useDiagramSearch", () => {
  it("starts with an empty query and the full, unfiltered list", async () => {
    const { result } = renderHook(() => useDiagramSearch(files));
    await flush();
    expect(result.current.query).toBe("");
    expect(result.current.results).toEqual(files);
  });

  it("filters after minChars is reached and the debounce window elapses", async () => {
    const { result } = renderHook(() => useDiagramSearch(files));
    await flush();
    act(() => result.current.onQueryChange("alp"));
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(result.current.results).toEqual([files[1]]);
  });

  it("persists the debounced query to storage", async () => {
    const { result } = renderHook(() => useDiagramSearch(files));
    await flush();
    act(() => result.current.onQueryChange("alp"));
    act(() => {
      vi.advanceTimersByTime(300);
    });
    await flush();
    await expect(getDiagramSearchQuery()).resolves.toBe("alp");
  });

  it("rehydrates a persisted query on mount", async () => {
    await setDiagramSearchQuery("beta");
    const { result } = renderHook(() => useDiagramSearch(files));
    await flush();
    expect(result.current.query).toBe("beta");
  });

  it("never writes to storage from hydration alone, even after the debounce window elapses", async () => {
    await setDiagramSearchQuery("beta");
    renderHook(() => useDiagramSearch(files));
    await flush(); // initialQuery resolves, query adopts "beta" — no onQueryChange call made
    act(() => {
      vi.advanceTimersByTime(300);
    });
    await flush();
    await expect(getDiagramSearchQuery()).resolves.toBe("beta");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run entrypoints/content/model/useDiagramSearch.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
// entrypoints/content/model/useDiagramSearch.ts
import { useEffect, useState } from "react";
import type { DriveFile } from "@/entities/google/drive";
import { useDebounce, useTextSearch } from "@/shared/lib";
import { getDiagramSearchQuery, setDiagramSearchQuery } from "./searchState";

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

  // Persistence is driven only by user-initiated changes (userQuery), never
  // by hydration adopting initialQuery into `query` — otherwise the
  // hydration jump would race useDebounce's restarted timer and briefly
  // write "" over the just-loaded value. userQuery starts undefined and
  // stays that way until the user actually types, so hydration alone can
  // never trigger a write.
  const [userQuery, setUserQuery] = useState<string | undefined>(undefined);
  const onSearchQueryChange = (value: string) => {
    onQueryChange(value);
    setUserQuery(value);
  };
  const debouncedUserQuery = useDebounce(userQuery, 300);
  useEffect(() => {
    if (debouncedUserQuery === undefined) return;
    setDiagramSearchQuery(debouncedUserQuery);
  }, [debouncedUserQuery]);

  return { query, onQueryChange: onSearchQueryChange, results };
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run entrypoints/content/model/useDiagramSearch.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add entrypoints/content/model/useDiagramSearch.ts entrypoints/content/model/useDiagramSearch.test.ts
git commit -m "feat(content): add useDiagramSearch hook"
```

---

### Task 8: Wire search into `DiagramPanel`

**Files:**
- Modify: `entrypoints/content/ui/DiagramPanel/DiagramPanel.tsx`
- Modify: `entrypoints/content/ui/DiagramPanel/DiagramPanel.test.tsx`

**Interfaces:**
- Consumes: `SearchField` (`@/shared/ui`, Task 5), `useDiagramSearch` (`../../model/useDiagramSearch`, Task 7).

- [ ] **Step 1: Write the failing tests**

Add `waitFor` to the existing `@testing-library/react` import and append these four `it` blocks inside the existing `describe("DiagramPanel", ...)` block in `entrypoints/content/ui/DiagramPanel/DiagramPanel.test.tsx` (right before the closing `});` that currently follows the `"shows 'No diagrams yet'..."` test):

```tsx
// change the import line to:
import { render, screen, waitFor } from "@testing-library/react";
```

```tsx
  it("shows all diagrams while fewer than 3 characters are typed", async () => {
    await renderExpanded();
    await userEvent.type(screen.getByRole("textbox", { name: /search diagrams/i }), "al");
    expect(screen.getByText("alpha")).toBeInTheDocument();
    expect(screen.getByText("beta")).toBeInTheDocument();
  });

  it("filters the list once 3+ characters are typed", async () => {
    await renderExpanded();
    await userEvent.type(screen.getByRole("textbox", { name: /search diagrams/i }), "alp");
    await waitFor(() => expect(screen.queryByText("beta")).not.toBeInTheDocument());
    expect(screen.getByText("alpha")).toBeInTheDocument();
  });

  it("shows a no-match message when nothing matches", async () => {
    await renderExpanded();
    await userEvent.type(screen.getByRole("textbox", { name: /search diagrams/i }), "zzz");
    await screen.findByText('No diagrams match "zzz"');
  });

  it("clears the filter via the clear button", async () => {
    await renderExpanded();
    await userEvent.type(screen.getByRole("textbox", { name: /search diagrams/i }), "alp");
    await waitFor(() => expect(screen.queryByText("beta")).not.toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: /clear search/i }));
    expect(screen.getByText("beta")).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run entrypoints/content/ui/DiagramPanel/DiagramPanel.test.tsx`
Expected: FAIL — no element with role `textbox`/name `Search diagrams` exists yet.

- [ ] **Step 3: Wire `useDiagramSearch` and `SearchField` into `DiagramPanel`**

In `entrypoints/content/ui/DiagramPanel/DiagramPanel.tsx`:

Replace the top of the file (the import block):

```tsx
import { useState } from "react";
import type { DriveFile } from "@/entities/google/drive";
import { Badge, Button, Heading, IconButton, Spinner, Stack, Text, type Tone } from "@/shared/ui";
import type { SaveStatus } from "../../lib/autosaveController";
import type { ActiveDiagram } from "../../model/useActiveDiagram";
import { usePanelVisibility } from "../../model/usePanelVisibility";
import { CreateDiagramForm } from "../CreateDiagramForm";
import { DiagramRow } from "../DiagramRow";
import styles from "./DiagramPanel.module.css";
```

with:

```tsx
import { useState } from "react";
import type { DriveFile } from "@/entities/google/drive";
import {
  Badge,
  Button,
  Heading,
  IconButton,
  SearchField,
  Spinner,
  Stack,
  Text,
  type Tone,
} from "@/shared/ui";
import type { SaveStatus } from "../../lib/autosaveController";
import type { ActiveDiagram } from "../../model/useActiveDiagram";
import { useDiagramSearch } from "../../model/useDiagramSearch";
import { usePanelVisibility } from "../../model/usePanelVisibility";
import { CreateDiagramForm } from "../CreateDiagramForm";
import { DiagramRow } from "../DiagramRow";
import styles from "./DiagramPanel.module.css";
```

Replace:

```ts
  // Stable order: sort by name so saving/opening a diagram never reshuffles the
  // list (sorting by modifiedTime would jump the active item to the top).
  const ordered = [...files].sort((a, b) => a.name.localeCompare(b.name));
```

with:

```ts
  // Stable order: sort by name so saving/opening a diagram never reshuffles the
  // list (sorting by modifiedTime would jump the active item to the top).
  const ordered = [...files].sort((a, b) => a.name.localeCompare(b.name));
  const { query, onQueryChange, results } = useDiagramSearch(ordered);
```

Replace the header block:

```tsx
      <Stack as="header" direction="row" align="center" justify="between">
        <Heading>Diagrams</Heading>
        <Stack direction="row" align="center" gap="2">
          <Badge tone={STATUS_TONE[saveStatus]}>{STATUS_LABEL[saveStatus]}</Badge>
          <IconButton icon="minus" aria-label="Collapse panel" onClick={toggleVisibility} />
        </Stack>
      </Stack>

      {error ? (
```

with:

```tsx
      <Stack as="header" direction="row" align="center" justify="between">
        <Heading>Diagrams</Heading>
        <Stack direction="row" align="center" gap="2">
          <Badge tone={STATUS_TONE[saveStatus]}>{STATUS_LABEL[saveStatus]}</Badge>
          <IconButton icon="minus" aria-label="Collapse panel" onClick={toggleVisibility} />
        </Stack>
      </Stack>

      <SearchField
        name="diagram-search"
        value={query}
        onChange={onQueryChange}
        placeholder="Type 3+ characters to search"
        aria-label="Search diagrams"
      />

      {error ? (
```

Replace the list-rendering block:

```tsx
      {isLoading ? (
        <Stack direction="row" justify="center" padding="4">
          <Spinner />
        </Stack>
      ) : ordered.length === 0 ? (
        <Text size="sm" color="muted">
          No diagrams yet
        </Text>
      ) : (
        <Stack as="ul" gap="1" className={styles.list}>
          {ordered.map((f) => (
```

with:

```tsx
      {isLoading ? (
        <Stack direction="row" justify="center" padding="4">
          <Spinner />
        </Stack>
      ) : files.length === 0 ? (
        <Text size="sm" color="muted">
          No diagrams yet
        </Text>
      ) : results.length === 0 ? (
        <Text size="sm" color="muted">
          No diagrams match "{query}"
        </Text>
      ) : (
        <Stack as="ul" gap="1" className={styles.list}>
          {results.map((f) => (
```

(The closing `))}` / `</Stack>` / `)}` structure below is unchanged — only the condition and the array being mapped change.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run entrypoints/content/ui/DiagramPanel/DiagramPanel.test.tsx`
Expected: PASS (all tests, including the 4 new ones)

- [ ] **Step 5: Run the full test suite and typecheck**

Run: `npm test && npm run compile`
Expected: all green, no type errors.

- [ ] **Step 6: Commit**

```bash
git add entrypoints/content/ui/DiagramPanel/DiagramPanel.tsx entrypoints/content/ui/DiagramPanel/DiagramPanel.test.tsx
git commit -m "feat(content): add search to the diagram panel"
```

---

### Task 9: Update docs

**Files:**
- Modify: `docs/features.md`
- Modify: `docs/architecture.md`

- [ ] **Step 1: Move the search bullet from "Next to pick up" to "Shipped" in `docs/features.md`**

Remove this bullet from the "Next to pick up" list:

```
- Client-side file search: a filter box in the panel that narrows the
  already-loaded file list by name. Purely local — no protocol change, works
  because `listFolder` always returns the complete list. Independent of (and
  much cheaper than) the large-folder search below.
```

Add this entry as a new last line, directly after the existing last bullet
("Persisted panel collapse: ..."), with no blank line before it (that part of
the "Shipped" section packs bullets tightly, no blank lines between them —
unlike the first two entries at the top of the section):

```
- Client-side diagram search: a search box at the top of the panel filters
  the already-loaded diagram list by name (case-insensitive substring),
  once the query reaches 3 characters. Input is debounced 300ms before
  filtering (and before persisting). The query is persisted to
  `chrome.storage.local` so it survives the tab reload that opening a
  diagram triggers. Purely local — no protocol change; works because
  `listFolder` already returns the complete list.
```

- [ ] **Step 2: Mention the new pieces in `docs/architecture.md`**

In the `### Shared layer` section, change:

```
- **`shared/ui`** — primitive components rendered in Shadow DOM: `Button`,
  `Dialog`/`ConfirmDialog`, `TextField`, `ListItem`, `Badge`, `Spinner`, plus
```

to:

```
- **`shared/ui`** — primitive components rendered in Shadow DOM: `Button`,
  `Dialog`/`ConfirmDialog`, `TextField`, `SearchField`, `ListItem`, `Badge`,
  `Spinner`, plus
```

Immediately after that bullet's existing paragraph (ends "...are composed from these."), add a new bullet:

```
- **`shared/lib`** — cross-cutting hooks and utilities: `useDebounce`,
  `useTextSearch` (generic type-to-filter hook, used by the diagram panel's
  search box), plus `dateFormat`/`typeUtils`.
```

- [ ] **Step 3: Commit**

```bash
git add docs/features.md docs/architecture.md
git commit -m "docs: document the diagram search feature"
```
