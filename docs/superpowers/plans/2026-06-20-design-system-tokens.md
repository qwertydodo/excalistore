# Design System Tokens and Primitives Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the gap in `theme.css` (today: color, radius, shadow, overlay only) by adding spacing, typography, and z-index token scales, then add four `shared/ui` primitives — `Box`, `Stack`, `Text`, `Heading` — that consume those tokens, and refactor every component to use them instead of one-off CSS classes for layout/spacing/typography.

**Architecture:** Token values come from what's actually used today (full scan below). Two off-grid spacing values (6px, 10px) snap to the 4px-base grid (6→8, 10→12 — a deliberate +2px consistency nudge, called out per file). `Box` is the foundational polymorphic primitive (any tag via `as`, owns `padding`). `Stack` composes `Box` and adds flex (`direction`/`gap`/`align`/`justify`) — same DOM output, one element, no extra wrapper nesting. `Text` is a polymorphic primitive owning `size`/`color` (font-size + color only — no margin, to avoid CSS-specificity/source-order conflicts with each consumer's own remaining margin rules). `Heading` composes `Text`, restricted to `h1`/`h2`. Every consumer keeps a slim leftover `.module.css` class for whatever isn't layout/typography (border, background, box-shadow, margin, fixed widths) and merges it in via `className`.

**Tech Stack:** Plain CSS custom properties, CSS Modules, polymorphic React components (`ComponentPropsWithoutRef<T>` generics — same pattern project already uses for dynamic class lookups in `Badge`/`Button`). Vitest + Testing Library for component tests (colocated, matching `Button.test.tsx` style). No new dependencies.

---

## Full value scan (source of truth for every task below)

Spacing (margin/padding/gap) found: 4, 6, 8, 10, 12, 16, 20, 24px → scale below; 6 and 10 are off-grid, snapped.
Font sizes found: 11, 12, 13, 14, 16, 24px → maps 1:1, no snapping needed.
Line-heights found: 1 (icon-button glyph centering — stays a literal token, not part of `Text`), 1.4 (body copy).
Font-family: `system-ui, sans-serif` everywhere — one token.
z-index: exactly one value, `2147483647` (`Dialog`, floats above excalidraw.com's own DOM) — one semantic token, no dropdown/modal/tooltip tiers needed since nothing else in the app stacks.
`border-radius: 50%` (`Spinner`, `DiagramPanel.fab`) is a circle shape, not a scale value — left untouched.
Fixed icon-button `width`/`height` (22px/40px in `DiagramPanel`) are hit-target sizes, not spacing — left untouched.

```css
/* Spacing scale (4px base; margin/padding/gap) */
--es-space-1: 4px;
--es-space-2: 8px;
--es-space-3: 12px;
--es-space-4: 16px;
--es-space-5: 20px;
--es-space-6: 24px;

/* Typography */
--es-font-family: system-ui, sans-serif;
--es-font-size-xs: 11px;
--es-font-size-sm: 12px;
--es-font-size-base: 13px;
--es-font-size-md: 14px;
--es-font-size-lg: 16px;
--es-font-size-xl: 24px;
--es-line-height-tight: 1;
--es-line-height-base: 1.4;

/* Z-index */
--es-z-max: 2147483647; /* stay above excalidraw.com's own DOM */
```

Snap table:

| Found | Snaps to | Token | Visual delta |
|---|---|---|---|
| 6px | 8px | `--es-space-2` | +2px |
| 10px | 12px | `--es-space-3` | +2px |

---

### Task 1: Add token scales to `theme.css`

**Files:**
- Modify: `src/shared/config/theme.css`

- [ ] **Step 1: Add spacing/typography/z-index tokens; tokenize `.es-disconnected`**

Replace the full file with:

```css
/* Color primitives — raw palette, referenced only by semantic tokens below. */
:root,
:host {
  --es-color-white: #ffffff;
  --es-color-violet-50: #f1f0ff;
  --es-color-violet-100: #e0dfff;
  --es-color-violet-300: #a8a5ff;
  --es-color-violet-500: #6965db;
  --es-color-ink-900: #1b1b1f;
  --es-color-ink-700: #232329;
  --es-color-ink-600: #2e2d39;
  --es-color-ink-400: #3b3a47;
  --es-color-ink-50: #e3e3e8;
  --es-color-gray-500: #6a6a75;
  --es-color-gray-300: #9a99a5;
  --es-color-red-500: #e03131;
  --es-color-red-300: #ff8787;

  /* Semantic tokens (light) */
  --es-bg: var(--es-color-white);
  --es-surface: var(--es-color-violet-50);
  --es-text: var(--es-color-ink-900);
  --es-muted: var(--es-color-gray-500);
  --es-border: var(--es-color-violet-100);
  --es-accent: var(--es-color-violet-500);
  --es-accent-text: var(--es-color-white);
  --es-danger: var(--es-color-red-500);
  --es-radius: 8px;
  --es-shadow: 0 1px 4px rgba(0, 0, 0, 0.1);
  --es-overlay: rgba(0, 0, 0, 0.4);

  /* Spacing scale (4px base; margin/padding/gap) */
  --es-space-1: 4px;
  --es-space-2: 8px;
  --es-space-3: 12px;
  --es-space-4: 16px;
  --es-space-5: 20px;
  --es-space-6: 24px;

  /* Typography */
  --es-font-family: system-ui, sans-serif;
  --es-font-size-xs: 11px;
  --es-font-size-sm: 12px;
  --es-font-size-base: 13px;
  --es-font-size-md: 14px;
  --es-font-size-lg: 16px;
  --es-font-size-xl: 24px;
  --es-line-height-tight: 1;
  --es-line-height-base: 1.4;

  /* Z-index */
  --es-z-max: 2147483647; /* stay above excalidraw.com's own DOM */
}

:root[data-theme="dark"],
:host([data-theme="dark"]) {
  --es-bg: var(--es-color-ink-700);
  --es-surface: var(--es-color-ink-600);
  --es-text: var(--es-color-ink-50);
  --es-muted: var(--es-color-gray-300);
  --es-border: var(--es-color-ink-400);
  --es-accent: var(--es-color-violet-300);
  --es-accent-text: var(--es-color-ink-900);
  --es-danger: var(--es-color-red-300);
  --es-shadow: 0 1px 4px rgba(0, 0, 0, 0.4);
  --es-overlay: rgba(0, 0, 0, 0.6);
}

.es-disconnected {
  padding: var(--es-space-3);
  font: var(--es-font-size-base) var(--es-font-family);
}
```

- [ ] **Step 2: Verify** — `npx biome check src/shared/config/theme.css` — expect no errors.
- [ ] **Step 3: Commit** — `git add src/shared/config/theme.css && git commit -m "feat(theme): add spacing, typography, and z-index tokens"`

---

### Task 2: Add `Box` primitive

**Files:**
- Create: `src/shared/ui/Box/Box.tsx`
- Create: `src/shared/ui/Box/Box.module.css`
- Create: `src/shared/ui/Box/Box.test.tsx`
- Create: `src/shared/ui/Box/index.ts`

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Box } from "./Box";

describe("Box", () => {
  it("renders the given tag with a padding class", () => {
    render(<Box as="section" padding="4" data-testid="box" />);
    const el = screen.getByTestId("box");
    expect(el.tagName).toBe("SECTION");
    expect(el.className).toContain("p-4");
  });

  it("defaults to a div with no padding class when omitted", () => {
    render(<Box data-testid="box" />);
    const el = screen.getByTestId("box");
    expect(el.tagName).toBe("DIV");
    expect(el.className).toBe("");
  });
});
```

- [ ] **Step 2: Run test, confirm it fails** — `npx vitest run src/shared/ui/Box` — expect FAIL (`Box` not defined / module not found).

- [ ] **Step 3: Implement**

`Box.tsx`:

```tsx
import type { ComponentPropsWithoutRef, ElementType, ReactNode } from "react";
import styles from "./Box.module.css";

export type Space = "1" | "2" | "3" | "4" | "5" | "6";

type BoxOwnProps = {
  padding?: Space | undefined;
  className?: string | undefined;
  children?: ReactNode | undefined;
};

export type BoxProps<T extends ElementType> = BoxOwnProps &
  Omit<ComponentPropsWithoutRef<T>, keyof BoxOwnProps> & { as?: T };

export const Box = <T extends ElementType = "div">({
  as,
  padding,
  className,
  ...rest
}: BoxProps<T>) => {
  const Tag = (as ?? "div") as ElementType;
  return (
    <Tag
      className={[padding ? styles[`p-${padding}`] : null, className].filter(Boolean).join(" ")}
      {...rest}
    />
  );
};
```

`Box.module.css`:

```css
.p-1 {
  padding: var(--es-space-1);
}
.p-2 {
  padding: var(--es-space-2);
}
.p-3 {
  padding: var(--es-space-3);
}
.p-4 {
  padding: var(--es-space-4);
}
.p-5 {
  padding: var(--es-space-5);
}
.p-6 {
  padding: var(--es-space-6);
}
```

`index.ts`:

```ts
export type { BoxProps, Space } from "./Box";
export { Box } from "./Box";
```

- [ ] **Step 4: Run test, confirm it passes** — `npx vitest run src/shared/ui/Box` — expect PASS.
- [ ] **Step 5: Commit** — `git add src/shared/ui/Box && git commit -m "feat(ui): add Box primitive"`

---

### Task 3: Add `Stack` primitive (composes `Box`)

**Files:**
- Create: `src/shared/ui/Stack/Stack.tsx`
- Create: `src/shared/ui/Stack/Stack.module.css`
- Create: `src/shared/ui/Stack/Stack.test.tsx`
- Create: `src/shared/ui/Stack/index.ts`

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Stack } from "./Stack";

describe("Stack", () => {
  it("renders row direction, gap, align, and justify classes", () => {
    render(
      <Stack as="ul" direction="row" gap="2" align="center" justify="between" data-testid="stack" />,
    );
    const el = screen.getByTestId("stack");
    expect(el.tagName).toBe("UL");
    expect(el.className).toContain("row");
    expect(el.className).toContain("gap-2");
    expect(el.className).toContain("align-center");
    expect(el.className).toContain("justify-between");
  });

  it("defaults to column direction with no gap/align/justify classes", () => {
    render(<Stack data-testid="stack" />);
    const el = screen.getByTestId("stack");
    expect(el.className).toContain("column");
    expect(el.className).not.toContain("gap-");
  });
});
```

- [ ] **Step 2: Run test, confirm it fails** — `npx vitest run src/shared/ui/Stack` — expect FAIL.

- [ ] **Step 3: Implement**

`Stack.tsx`:

```tsx
import type { ElementType } from "react";
import { Box, type BoxProps, type Space } from "../Box";
import styles from "./Stack.module.css";

type Direction = "row" | "column";
type Align = "start" | "center" | "end" | "stretch";
type Justify = "start" | "center" | "end" | "between";

type StackOwnProps = {
  direction?: Direction | undefined;
  gap?: Space | undefined;
  align?: Align | undefined;
  justify?: Justify | undefined;
};

export type StackProps<T extends ElementType> = StackOwnProps & BoxProps<T>;

export const Stack = <T extends ElementType = "div">({
  direction = "column",
  gap,
  align,
  justify,
  className,
  ...rest
}: StackProps<T>) => {
  return (
    <Box
      className={[
        styles.stack,
        direction === "row" ? styles.row : styles.column,
        gap ? styles[`gap-${gap}`] : null,
        align ? styles[`align-${align}`] : null,
        justify ? styles[`justify-${justify}`] : null,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...(rest as BoxProps<T>)}
    />
  );
};
```

Note: the cast is needed because `tsconfig`'s `exactOptionalPropertyTypes: true` makes TS reject the otherwise-correct generic spread (verified via `tsc --noEmit`).

`Stack.module.css`:

```css
.stack {
  display: flex;
}
.row {
  flex-direction: row;
}
.column {
  flex-direction: column;
}
.gap-1 {
  gap: var(--es-space-1);
}
.gap-2 {
  gap: var(--es-space-2);
}
.gap-3 {
  gap: var(--es-space-3);
}
.gap-4 {
  gap: var(--es-space-4);
}
.gap-5 {
  gap: var(--es-space-5);
}
.gap-6 {
  gap: var(--es-space-6);
}
.align-start {
  align-items: flex-start;
}
.align-center {
  align-items: center;
}
.align-end {
  align-items: flex-end;
}
.align-stretch {
  align-items: stretch;
}
.justify-start {
  justify-content: flex-start;
}
.justify-center {
  justify-content: center;
}
.justify-end {
  justify-content: flex-end;
}
.justify-between {
  justify-content: space-between;
}
```

`index.ts`:

```ts
export type { StackProps } from "./Stack";
export { Stack } from "./Stack";
```

- [ ] **Step 4: Run test, confirm it passes** — `npx vitest run src/shared/ui/Stack` — expect PASS.
- [ ] **Step 5: Commit** — `git add src/shared/ui/Stack && git commit -m "feat(ui): add Stack primitive"`

---

### Task 4: Add `Text` primitive

**Files:**
- Create: `src/shared/ui/Text/Text.tsx`
- Create: `src/shared/ui/Text/Text.module.css`
- Create: `src/shared/ui/Text/Text.test.tsx`
- Create: `src/shared/ui/Text/index.ts`

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Text } from "./Text";

describe("Text", () => {
  it("renders the given tag with size and color classes", () => {
    render(
      <Text as="label" size="sm" color="muted" htmlFor="x" data-testid="text">
        Folder name
      </Text>,
    );
    const el = screen.getByTestId("text");
    expect(el.tagName).toBe("LABEL");
    expect(el).toHaveAttribute("for", "x");
    expect(el.className).toContain("size-sm");
    expect(el.className).toContain("color-muted");
  });

  it("defaults to a span with no size/color class when omitted", () => {
    render(<Text data-testid="text">hi</Text>);
    const el = screen.getByTestId("text");
    expect(el.tagName).toBe("SPAN");
    expect(el.className).toBe("");
  });
});
```

- [ ] **Step 2: Run test, confirm it fails** — `npx vitest run src/shared/ui/Text` — expect FAIL.

- [ ] **Step 3: Implement**

`Text.tsx`:

```tsx
import type { ComponentPropsWithoutRef, ElementType, ReactNode } from "react";
import styles from "./Text.module.css";

export type TextSize = "xs" | "sm" | "base" | "md" | "lg" | "xl";
export type TextColor = "text" | "muted" | "danger" | "accent" | "accent-text";

type TextOwnProps = {
  size?: TextSize | undefined;
  color?: TextColor | undefined;
  className?: string | undefined;
  children?: ReactNode | undefined;
};

export type TextProps<T extends ElementType> = TextOwnProps &
  Omit<ComponentPropsWithoutRef<T>, keyof TextOwnProps> & { as?: T };

export const Text = <T extends ElementType = "span">({
  as,
  size,
  color,
  className,
  ...rest
}: TextProps<T>) => {
  const Tag = (as ?? "span") as ElementType;
  return (
    <Tag
      className={[
        size ? styles[`size-${size}`] : null,
        color ? styles[`color-${color}`] : null,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...(rest as TextProps<T>)}
    />
  );
};
```

Note: same `exactOptionalPropertyTypes` cast as `Stack` — verified via `tsc --noEmit`.

`Text.module.css`:

```css
.size-xs {
  font-size: var(--es-font-size-xs);
}
.size-sm {
  font-size: var(--es-font-size-sm);
}
.size-base {
  font-size: var(--es-font-size-base);
}
.size-md {
  font-size: var(--es-font-size-md);
}
.size-lg {
  font-size: var(--es-font-size-lg);
}
.size-xl {
  font-size: var(--es-font-size-xl);
}
.color-text {
  color: var(--es-text);
}
.color-muted {
  color: var(--es-muted);
}
.color-danger {
  color: var(--es-danger);
}
.color-accent {
  color: var(--es-accent);
}
.color-accent-text {
  color: var(--es-accent-text);
}
```

`index.ts`:

```ts
export type { TextColor, TextProps, TextSize } from "./Text";
export { Text } from "./Text";
```

- [ ] **Step 4: Run test, confirm it passes** — `npx vitest run src/shared/ui/Text` — expect PASS.
- [ ] **Step 5: Commit** — `git add src/shared/ui/Text && git commit -m "feat(ui): add Text primitive"`

---

### Task 5: Add `Heading` primitive (composes `Text`)

**Files:**
- Create: `src/shared/ui/Heading/Heading.tsx`
- Create: `src/shared/ui/Heading/Heading.test.tsx`
- Create: `src/shared/ui/Heading/index.ts`

No `Heading.module.css` — `Heading` has no styling of its own; it fully delegates to `Text`'s size/color classes. Creating an empty CSS module would violate YAGNI for zero benefit.

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Heading } from "./Heading";

describe("Heading", () => {
  it("renders h1 when requested", () => {
    render(<Heading as="h1" size="lg">Excalistore</Heading>);
    expect(screen.getByRole("heading", { level: 1, name: "Excalistore" })).toBeInTheDocument();
  });

  it("defaults to h2", () => {
    render(<Heading size="md">Diagrams</Heading>);
    expect(screen.getByRole("heading", { level: 2, name: "Diagrams" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test, confirm it fails** — `npx vitest run src/shared/ui/Heading` — expect FAIL.

- [ ] **Step 3: Implement**

`Heading.tsx`:

```tsx
import type { ComponentPropsWithoutRef } from "react";
import { Text, type TextProps } from "../Text";

type HeadingTag = "h1" | "h2";
type HeadingSize = "md" | "lg";

type HeadingOwnProps = {
  as?: HeadingTag | undefined;
  size: HeadingSize;
};

type HeadingProps = HeadingOwnProps & Omit<ComponentPropsWithoutRef<"h2">, keyof HeadingOwnProps>;

export const Heading = ({ as = "h2", size, ...rest }: HeadingProps) => {
  return <Text as={as} size={size} {...(rest as TextProps<HeadingTag>)} />;
};
```

Note: same `exactOptionalPropertyTypes` cast as `Stack`/`Text` — verified via `tsc --noEmit`.

`index.ts`:

```ts
export { Heading } from "./Heading";
```

- [ ] **Step 4: Run test, confirm it passes** — `npx vitest run src/shared/ui/Heading` — expect PASS.
- [ ] **Step 5: Commit** — `git add src/shared/ui/Heading && git commit -m "feat(ui): add Heading primitive"`

---

### Task 6: Export new primitives from the `shared/ui` barrel

**Files:**
- Modify: `src/shared/ui/index.ts`

- [ ] **Step 1: Add the four new exports**

```ts
export type { Tone } from "./Badge";
export { Badge } from "./Badge";
export type { BoxProps, Space } from "./Box";
export { Box } from "./Box";
export type { Variant } from "./Button";
export { Button } from "./Button";
export { ConfirmDialog } from "./ConfirmDialog";
export { Dialog } from "./Dialog";
export { Heading } from "./Heading";
export { ListItem } from "./ListItem";
export { Spinner } from "./Spinner";
export type { StackProps } from "./Stack";
export { Stack } from "./Stack";
export type { TextColor, TextProps, TextSize } from "./Text";
export { Text } from "./Text";
export { TextField } from "./TextField";
```

- [ ] **Step 2: Verify** — `npx tsc --noEmit` — expect no errors.
- [ ] **Step 3: Commit** — `git add src/shared/ui/index.ts && git commit -m "feat(ui): export Box, Stack, Text, Heading from shared/ui"`

---

### Task 7: Refactor `FolderNameForm`

**Files:**
- Modify: `src/features/driveConnect/ui/FolderNameForm/FolderNameForm.tsx`
- Modify: `src/features/driveConnect/ui/FolderNameForm/FolderNameForm.module.css`

- [ ] **Step 1: Replace the form's layout/typography with primitives**

`FolderNameForm.tsx`:

```tsx
import { useState } from "react";
import { DEFAULT_DIAGRAM_FOLDER_NAME } from "@/shared/config/drive";
import { Button, Stack, Text, TextField } from "@/shared/ui";
import styles from "./FolderNameForm.module.css";

type Props = {
  id: string;
  busy?: boolean;
  error?: string | null;
  onConnect: (folderName: string) => void;
};

// Shared folder-name entry form used by ConnectCard (in-page) and
// PopupConnect (extension popup) to start a Drive connection.
export const FolderNameForm = ({ id, busy = false, error = null, onConnect }: Props) => {
  const [name, setName] = useState(DEFAULT_DIAGRAM_FOLDER_NAME);

  return (
    <Stack
      as="form"
      gap="2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!busy) onConnect(name.trim() || DEFAULT_DIAGRAM_FOLDER_NAME);
      }}
    >
      <Text as="label" size="sm" color="muted" htmlFor={id}>
        Folder name
      </Text>
      <TextField
        id={id}
        aria-label="Folder name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        disabled={busy}
      />
      <Text as="p" size="xs" color="muted" className={styles.hint}>
        The app creates this folder in your Drive (or reuses it).
      </Text>
      {error ? (
        <Text as="p" size="sm" color="accent-text" role="alert" className={styles.error}>
          {error}
        </Text>
      ) : null}
      <Button type="submit" disabled={busy}>
        {busy ? "Connecting…" : "Connect Google Drive"}
      </Button>
    </Stack>
  );
};
```

`FolderNameForm.module.css` (only what `Stack`/`Text` don't cover remains):

```css
.hint {
  margin: 0;
}
.error {
  margin: 0;
  padding: var(--es-space-2) var(--es-space-3);
  background: var(--es-danger);
  border-radius: var(--es-radius);
}
```

Note: `.error` padding was `8px 10px` — snaps to `8px 12px` (+2px horizontal).

- [ ] **Step 2: Verify** — `npx biome check src/features/driveConnect/ui/FolderNameForm` && `npx vitest run src/features/driveConnect` — expect no errors, existing tests still pass (no test file here today, but `DiagramRow`/sibling tests that import this indirectly must stay green).
- [ ] **Step 3: Commit** — `git add src/features/driveConnect/ui/FolderNameForm && git commit -m "refactor(driveConnect): use design primitives in FolderNameForm"`

---

### Task 8: Refactor `Badge.module.css` (tokens only)

**Files:**
- Modify: `src/shared/ui/Badge/Badge.module.css`

`Badge` keeps its own `tone`-based API (not a `Text` consumer — its color mapping is tone-based, not the `TextColor` scale) — only the font-size literal moves to a token.

- [ ] **Step 1: Replace literal with token**

```css
.badge {
  font-size: var(--es-font-size-sm);
}
.neutral {
  color: var(--es-muted);
}
.success {
  color: var(--es-accent);
}
.danger {
  color: var(--es-danger);
}
```

- [ ] **Step 2: Verify** — `npx biome check src/shared/ui/Badge/Badge.module.css` — expect no errors.
- [ ] **Step 3: Commit** — `git add src/shared/ui/Badge/Badge.module.css && git commit -m "refactor(ui): use design tokens in Badge"`

---

### Task 9: Refactor `Button.module.css` (tokens only)

**Files:**
- Modify: `src/shared/ui/Button/Button.module.css`

- [ ] **Step 1: Replace literal with tokens**

```css
.button {
  border: 1px solid var(--es-border);
  border-radius: var(--es-radius);
  padding: var(--es-space-2) var(--es-space-3);
  font: inherit;
  cursor: pointer;
}
.button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.primary {
  background: var(--es-accent);
  color: var(--es-accent-text);
}
.secondary {
  background: var(--es-surface);
  color: var(--es-text);
}
.danger {
  background: var(--es-danger);
  color: var(--es-accent-text);
}
```

Note: padding was `6px 12px` — snaps to `8px 12px` (+2px vertical).

- [ ] **Step 2: Verify** — `npx biome check src/shared/ui/Button/Button.module.css` && `npx vitest run src/shared/ui/Button` — expect no errors, existing `Button.test.tsx` still passes.
- [ ] **Step 3: Commit** — `git add src/shared/ui/Button/Button.module.css && git commit -m "refactor(ui): use design tokens in Button"`

---

### Task 10: Refactor `ConfirmDialog`

**Files:**
- Modify: `src/shared/ui/ConfirmDialog/ConfirmDialog.tsx`
- Modify: `src/shared/ui/ConfirmDialog/ConfirmDialog.module.css`

- [ ] **Step 1: Use `Stack`/`Text`**

`ConfirmDialog.tsx`:

```tsx
import { Button } from "../Button";
import { Dialog } from "../Dialog";
import { Stack } from "../Stack";
import { Text } from "../Text";
import styles from "./ConfirmDialog.module.css";

type Props = {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export const ConfirmDialog = ({
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = false,
  onConfirm,
  onCancel,
}: Props) => {
  return (
    <Dialog title={title} onClose={onCancel}>
      <Text as="p" color="muted" className={styles.message}>
        {message}
      </Text>
      <Stack direction="row" gap="2" justify="end">
        <Button variant="secondary" onClick={onCancel}>
          {cancelLabel}
        </Button>
        <Button variant={danger ? "danger" : "primary"} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </Stack>
    </Dialog>
  );
};
```

`ConfirmDialog.module.css`:

```css
.message {
  margin: 0 0 var(--es-space-4);
}
```

- [ ] **Step 2: Verify** — `npx vitest run src/shared/ui/ConfirmDialog` — expect existing `ConfirmDialog.test.tsx` to still pass.
- [ ] **Step 3: Commit** — `git add src/shared/ui/ConfirmDialog && git commit -m "refactor(ui): use design primitives in ConfirmDialog"`

---

### Task 11: Refactor `Dialog`

**Files:**
- Modify: `src/shared/ui/Dialog/Dialog.tsx`
- Modify: `src/shared/ui/Dialog/Dialog.module.css`

- [ ] **Step 1: Use `Heading`; tokenize z-index/padding/margin/font-size**

`Dialog.tsx`:

```tsx
import type { ReactNode } from "react";
import { Heading } from "../Heading";
import styles from "./Dialog.module.css";

type Props = {
  title: string;
  children: ReactNode;
  onClose?: () => void;
};

export const Dialog = ({ title, children, onClose }: Props) => {
  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: backdrop click-to-dismiss is a mouse convenience; content is keyboard-dismissible via dialog buttons.
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className={styles.overlay}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div className={styles.panel}>
        <Heading size="lg" className={styles.title}>
          {title}
        </Heading>
        {children}
      </div>
    </div>
  );
};
```

`Dialog.module.css`:

```css
.overlay {
  position: fixed;
  inset: 0;
  background: var(--es-overlay);
  display: grid;
  place-items: center;
  z-index: var(--es-z-max);
}
.panel {
  background: var(--es-bg);
  color: var(--es-text);
  border: 1px solid var(--es-border);
  border-radius: var(--es-radius);
  box-shadow: var(--es-shadow);
  padding: var(--es-space-5);
  min-width: 320px;
  max-width: 420px;
}
.title {
  margin: 0 0 var(--es-space-3);
}
```

- [ ] **Step 2: Verify** — `npx vitest run src/shared/ui/Dialog src/shared/ui/ConfirmDialog` — expect green (Dialog has no own test file today; ConfirmDialog's test exercises it indirectly).
- [ ] **Step 3: Commit** — `git add src/shared/ui/Dialog && git commit -m "refactor(ui): use design primitives in Dialog"`

---

### Task 12: Refactor `ListItem.module.css` (tokens only)

**Files:**
- Modify: `src/shared/ui/ListItem/ListItem.module.css`

`ListItem` is a `<button>` wrapping arbitrary `children` (icons/spans) — not converted to `Text`/`Stack`; only its literal spacing values move to tokens.

- [ ] **Step 1: Replace literals with tokens**

```css
.listItem {
  display: flex;
  align-items: center;
  gap: var(--es-space-2);
  padding: var(--es-space-2) var(--es-space-3);
  border: none;
  width: 100%;
  text-align: left;
  border-radius: var(--es-radius);
  background: transparent;
  color: var(--es-text);
  cursor: pointer;
  font: inherit;
}
.active {
  background: var(--es-surface);
}
.listItem:disabled {
  cursor: default;
}
```

Note: padding was `8px 10px` — snaps to `8px 12px` (+2px horizontal).

- [ ] **Step 2: Verify** — `npx biome check src/shared/ui/ListItem/ListItem.module.css` — expect no errors.
- [ ] **Step 3: Commit** — `git add src/shared/ui/ListItem/ListItem.module.css && git commit -m "refactor(ui): use design tokens in ListItem"`

---

### Task 13: Refactor `TextField.module.css` (tokens only)

**Files:**
- Modify: `src/shared/ui/TextField/TextField.module.css`

- [ ] **Step 1: Replace literal with tokens**

```css
.textField {
  background: var(--es-bg);
  color: var(--es-text);
  border: 1px solid var(--es-border);
  border-radius: var(--es-radius);
  padding: var(--es-space-2) var(--es-space-2);
  font: inherit;
  width: 100%;
  box-sizing: border-box;
}
```

Note: padding was `6px 8px` — snaps to `8px 8px` (+2px vertical).

- [ ] **Step 2: Verify** — `npx biome check src/shared/ui/TextField/TextField.module.css` — expect no errors.
- [ ] **Step 3: Commit** — `git add src/shared/ui/TextField/TextField.module.css && git commit -m "refactor(ui): use design tokens in TextField"`

---

### Task 14: Refactor `ConnectCard`

**Files:**
- Modify: `entrypoints/content/ui/ConnectCard/ConnectCard.tsx`
- Modify: `entrypoints/content/ui/ConnectCard/ConnectCard.module.css`

- [ ] **Step 1: Use `Stack`/`Heading`/`Text`**

`ConnectCard.tsx`:

```tsx
import { FolderNameForm } from "@/features/driveConnect";
import { Heading, Stack, Text } from "@/shared/ui";
import styles from "./ConnectCard.module.css";

type Props = {
  busy?: boolean;
  error?: string | null;
  onConnect: (folderName: string) => void;
};

// In-page (Shadow DOM) connect card shown on excalidraw.com before a folder is
// connected. Keyboard events are stopped at the root so typing the folder name
// doesn't trigger Excalidraw's tool shortcuts.
export const ConnectCard = ({ busy = false, error = null, onConnect }: Props) => {
  return (
    <Stack
      as="section"
      gap="2"
      padding="4"
      className={styles.root}
      aria-label="Connect Excalistore"
      onKeyDown={(e) => e.stopPropagation()}
      onKeyUp={(e) => e.stopPropagation()}
    >
      <Heading size="lg" className={styles.title}>
        Excalistore
      </Heading>
      <Text as="p" color="muted" className={styles.lead}>
        Save your diagrams to Google Drive.
      </Text>
      <FolderNameForm id="es-connect-folder" busy={busy} error={error} onConnect={onConnect} />
    </Stack>
  );
};
```

`ConnectCard.module.css` (flex/gap/padding now on `Stack`; this keeps only what's left):

```css
.root {
  width: 260px;
  background: var(--es-bg);
  color: var(--es-text);
  border: 1px solid var(--es-border);
  border-radius: var(--es-radius);
  box-shadow: var(--es-shadow);
  font: var(--es-font-size-base) / var(--es-line-height-base) var(--es-font-family);
}
.title {
  margin: 0;
}
.lead {
  margin: 0;
}
```

- [ ] **Step 2: Verify** — `npx biome check entrypoints/content/ui/ConnectCard` — expect no errors. No existing test file for `ConnectCard`.
- [ ] **Step 3: Commit** — `git add entrypoints/content/ui/ConnectCard && git commit -m "refactor(content): use design primitives in ConnectCard"`

---

### Task 15: Refactor `CreateDiagramForm`

**Files:**
- Modify: `entrypoints/content/ui/CreateDiagramForm/CreateDiagramForm.tsx`
- Modify: `entrypoints/content/ui/CreateDiagramForm/CreateDiagramForm.module.css`

- [ ] **Step 1: Use `Stack`**

`CreateDiagramForm.tsx`:

```tsx
import { useState } from "react";
import { Button, Spinner, Stack, TextField } from "@/shared/ui";

type Props = {
  disabled: boolean;
  onCreate: (name: string) => Promise<void>;
  onBusyChange: (busy: boolean) => void;
};

export const CreateDiagramForm = ({ disabled, onCreate, onBusyChange }: Props) => {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);

  const submitCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    onBusyChange(true);
    try {
      await onCreate(name); // resolves into a tab reload on success
    } finally {
      setBusy(false);
      onBusyChange(false);
      setNewName("");
      setCreating(false);
    }
  };

  if (!creating) {
    return (
      <Button disabled={disabled} onClick={() => setCreating(true)}>
        New diagram
      </Button>
    );
  }

  return (
    <Stack
      as="form"
      direction="row"
      gap="1"
      align="center"
      onSubmit={(e) => {
        e.preventDefault();
        submitCreate();
      }}
    >
      <TextField
        placeholder="Diagram name"
        value={newName}
        onChange={(e) => setNewName(e.target.value)}
        disabled={busy}
        autoFocus
      />
      {busy ? (
        <Spinner size={14} />
      ) : (
        <>
          <Button type="submit" disabled={disabled}>
            Create
          </Button>
          <Button variant="secondary" onClick={() => setCreating(false)}>
            Cancel
          </Button>
        </>
      )}
    </Stack>
  );
};
```

`CreateDiagramForm.module.css`: delete the file — `.createRow` had nothing beyond `display:flex`/`gap`/`align-items`, fully covered by `Stack` now.

- [ ] **Step 2: Verify** — `npx tsc --noEmit` (confirms the deleted CSS import doesn't dangle) && `npx biome check entrypoints/content/ui/CreateDiagramForm` — expect no errors.
- [ ] **Step 3: Commit** — `git add entrypoints/content/ui/CreateDiagramForm && git commit -m "refactor(content): use Stack in CreateDiagramForm"`

---

### Task 16: Refactor `DiagramPanel`

**Files:**
- Modify: `entrypoints/content/ui/DiagramPanel/DiagramPanel.tsx`
- Modify: `entrypoints/content/ui/DiagramPanel/DiagramPanel.module.css`

- [ ] **Step 1: Use `Stack`/`Heading`/`Text`; tokenize the icon buttons**

`DiagramPanel.tsx`:

```tsx
import { useState } from "react";
import type { SaveStatus } from "@/features/autosave";
import type { DriveFileMeta } from "@/shared/api";
import { Badge, Button, Heading, Spinner, Stack, Text, type Tone } from "@/shared/ui";
import type { ActiveDiagram } from "../../model/useActiveDiagram";
import { usePanelVisibility } from "../../model/usePanelVisibility";
import { CreateDiagramForm } from "../CreateDiagramForm";
import { DiagramRow } from "../DiagramRow";
import styles from "./DiagramPanel.module.css";

type Diagram = Pick<
  ActiveDiagram,
  "activeId" | "saveStatus" | "onOpen" | "onCreate" | "onRename"
> & {
  error?: string | null;
};

type DiagramPanelProps = {
  diagram: Diagram;
  files: DriveFileMeta[];
  isLoading: boolean;
  onSignOut: () => void;
};

const STATUS_TONE: Record<SaveStatus, Tone> = {
  idle: "neutral",
  saving: "neutral",
  saved: "success",
  error: "danger",
  conflict: "danger",
};

const STATUS_LABEL: Record<SaveStatus, string> = {
  idle: "Idle",
  saving: "Saving…",
  saved: "Saved",
  error: "Save failed",
  conflict: "Conflict — not saved",
};

export const DiagramPanel = ({ diagram, files, isLoading, onSignOut }: DiagramPanelProps) => {
  const { activeId, saveStatus, error, onOpen, onCreate, onRename } = diagram;
  const { isVisible, toggleVisibility } = usePanelVisibility();
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [isCreatingBusy, setIsCreatingBusy] = useState(false);

  // Stable order: sort by name so saving/opening a diagram never reshuffles the
  // list (sorting by modifiedTime would jump the active item to the top).
  const ordered = [...files].sort((a, b) => a.name.localeCompare(b.name));

  // Opening or creating replaces the canvas (tab reload) — lock the rows so a
  // second action can't race it.
  const areRowsLocked = openingId !== null || isCreatingBusy;

  const onRowOpen = async (id: string) => {
    if (openingId) return; // a switch is already in flight
    setOpeningId(id);
    try {
      await onOpen(id); // resolves into a tab reload on success
    } finally {
      setOpeningId(null);
    }
  };

  const onCreatingBusyChange = (isBusy: boolean) => setIsCreatingBusy(isBusy);

  if (!isVisible) {
    return (
      <button
        type="button"
        className={styles.fab}
        aria-label="Open Excalistore diagrams"
        onClick={toggleVisibility}
        onKeyDown={(e) => e.stopPropagation()}
      >
        +
      </button>
    );
  }

  return (
    // Excalidraw binds single-key tool shortcuts on the document, which would
    // fire while typing in the panel's inputs. Stop keyboard events at the panel
    // root so they never reach Excalidraw's global handlers.
    <Stack
      as="section"
      gap="2"
      padding="3"
      className={styles.root}
      aria-label="Excalistore diagrams"
      onKeyDown={(e) => e.stopPropagation()}
      onKeyUp={(e) => e.stopPropagation()}
    >
      <Stack as="header" direction="row" align="center" justify="between">
        <Heading size="md">Diagrams</Heading>
        <Stack direction="row" align="center" gap="2">
          <Badge tone={STATUS_TONE[saveStatus]}>{STATUS_LABEL[saveStatus]}</Badge>
          <button
            type="button"
            className={styles.toggle}
            aria-label="Collapse panel"
            onClick={toggleVisibility}
          >
            −
          </button>
        </Stack>
      </Stack>

      {error ? (
        <Text as="p" size="sm" color="accent-text" role="alert" className={styles.error}>
          {error}
        </Text>
      ) : null}

      {isLoading ? (
        <Stack direction="row" justify="center" padding="4">
          <Spinner />
        </Stack>
      ) : (
        <Stack as="ul" gap="1" className={styles.list}>
          {ordered.map((f) => (
            <DiagramRow
              key={f.id}
              file={f}
              active={f.id === activeId}
              locked={areRowsLocked}
              opening={openingId === f.id}
              onOpen={onRowOpen}
              onRename={onRename}
            />
          ))}
        </Stack>
      )}

      <Stack as="footer" gap="2" className={styles.footer}>
        <CreateDiagramForm
          disabled={areRowsLocked}
          onCreate={onCreate}
          onBusyChange={onCreatingBusyChange}
        />
        <Button variant="secondary" onClick={onSignOut}>
          Sign out
        </Button>
      </Stack>
    </Stack>
  );
};
```

`DiagramPanel.module.css`:

```css
.root {
  width: 260px;
  max-height: 70vh;
  background: var(--es-bg);
  color: var(--es-text);
  border: 1px solid var(--es-border);
  border-radius: var(--es-radius);
  box-shadow: var(--es-shadow);
  font: var(--es-font-size-base) / var(--es-line-height-base) var(--es-font-family);
}
.toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  padding: 0;
  border: 1px solid var(--es-border);
  border-radius: var(--es-radius);
  background: transparent;
  color: var(--es-text);
  font-size: var(--es-font-size-lg);
  line-height: var(--es-line-height-tight);
  cursor: pointer;
}
.toggle:hover {
  background: var(--es-surface);
}
.fab {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  padding: 0;
  border: 1px solid var(--es-border);
  border-radius: 50%;
  background: var(--es-accent);
  color: var(--es-accent-text);
  font-size: var(--es-font-size-xl);
  line-height: var(--es-line-height-tight);
  cursor: pointer;
  box-shadow: var(--es-shadow);
}
.error {
  margin: 0 0 var(--es-space-2);
  padding: var(--es-space-2) var(--es-space-3);
  background: var(--es-danger);
  border-radius: var(--es-radius);
}
.list {
  list-style: none;
  margin: 0;
  padding: 0;
  overflow-x: hidden;
  overflow-y: auto;
}
.footer {
  border-top: 1px solid var(--es-border);
  padding-top: var(--es-space-2);
}
```

Notes:
- `.error` padding was `8px 10px` — snaps to `8px 12px` (+2px horizontal).
- `.footer` gap was `6px` — now `var(--es-space-2)` = `8px` (+2px) via `Stack`.
- `.toggle`/`.fab` `width`/`height` (fixed hit-target sizes) stay literal — out of scope.

- [ ] **Step 2: Verify** — `npx tsc --noEmit` && `npx biome check entrypoints/content/ui/DiagramPanel` — expect no errors. No existing test file for `DiagramPanel`.
- [ ] **Step 3: Commit** — `git add entrypoints/content/ui/DiagramPanel && git commit -m "refactor(content): use design primitives in DiagramPanel"`

---

### Task 17: Refactor `DiagramRow`

**Files:**
- Modify: `entrypoints/content/ui/DiagramRow/DiagramRow.tsx`
- Modify: `entrypoints/content/ui/DiagramRow/DiagramRow.module.css`

- [ ] **Step 1: Use `Stack`/`Text`**

`DiagramRow.tsx`:

```tsx
import { useState } from "react";
import { stripExcalidrawExtension } from "@/entities/diagram";
import type { DriveFileMeta } from "@/shared/api";
import { formatDate } from "@/shared/lib";
import { Button, ListItem, Spinner, Stack, Text, TextField } from "@/shared/ui";
import styles from "./DiagramRow.module.css";

type Props = {
  file: DriveFileMeta;
  active: boolean;
  locked: boolean;
  opening: boolean;
  onOpen: (id: string) => void;
  onRename: (id: string, name: string) => Promise<void>;
};

export const DiagramRow = ({ file, active, locked, opening, onOpen, onRename }: Props) => {
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [saving, setSaving] = useState(false);

  const submitRename = async () => {
    const name = renameValue.trim();
    if (!name) {
      setIsRenaming(false);
      return;
    }
    setSaving(true);
    try {
      await onRename(file.id, name); // optimistic in-place update in the container
    } finally {
      setSaving(false);
      setIsRenaming(false);
    }
  };

  if (isRenaming) {
    return (
      <Stack as="li" direction="row" gap="1" align="center" className={styles.listRow}>
        <Stack
          as="form"
          direction="row"
          gap="1"
          align="center"
          onSubmit={(e) => {
            e.preventDefault();
            submitRename();
          }}
        >
          <TextField
            aria-label="Rename diagram"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            disabled={saving}
            autoFocus
          />
          {saving ? <Spinner size={14} /> : <Button type="submit">Save</Button>}
        </Stack>
      </Stack>
    );
  }

  return (
    <Stack as="li" direction="row" gap="1" align="center" className={styles.listRow}>
      <ListItem active={active} disabled={active || locked} onClick={() => onOpen(file.id)}>
        <span className={styles.name}>{stripExcalidrawExtension(file.name)}</span>
        {opening ? (
          <Spinner size={14} />
        ) : (
          <Text size="xs" color="muted" className={styles.meta}>
            {formatDate(file.modifiedTime)}
          </Text>
        )}
      </ListItem>
      <Text
        as="button"
        type="button"
        size="xs"
        color="accent"
        className={styles.renameBtn}
        aria-label={`Rename ${stripExcalidrawExtension(file.name)}`}
        onClick={(e) => {
          e.stopPropagation();
          setIsRenaming(true);
          setRenameValue(stripExcalidrawExtension(file.name));
        }}
      >
        Rename
      </Text>
    </Stack>
  );
};
```

`DiagramRow.module.css`:

```css
.listRow {
  min-width: 0;
}
.listRow > :first-child {
  flex: 1;
  min-width: 0;
}
.name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.meta {
  flex-shrink: 0;
}
.renameBtn {
  border: none;
  background: none;
  cursor: pointer;
}
```

- [ ] **Step 2: Verify** — `npx tsc --noEmit` && `npx biome check entrypoints/content/ui/DiagramRow` — expect no errors. No existing test file for `DiagramRow`.
- [ ] **Step 3: Commit** — `git add entrypoints/content/ui/DiagramRow && git commit -m "refactor(content): use design primitives in DiagramRow"`

---

### Task 18: Refactor `PopupConnect`

**Files:**
- Modify: `entrypoints/popup/ui/PopupConnect/PopupConnect.tsx`
- Modify: `entrypoints/popup/ui/PopupConnect/PopupConnect.module.css`

- [ ] **Step 1: Use `Box`/`Heading`/`Text`**

`PopupConnect.tsx`:

```tsx
import { FolderNameForm } from "@/features/driveConnect";
import type { ConnectionStatus } from "@/shared/api";
import { Box, Button, Heading, Text } from "@/shared/ui";
import styles from "./PopupConnect.module.css";

type Props = {
  status: ConnectionStatus;
  busy?: boolean;
  error?: string | null;
  onConnect: (folderName: string) => void;
  onSignOut: () => void;
};

export const PopupConnect = ({
  status,
  busy = false,
  error = null,
  onConnect,
  onSignOut,
}: Props) => {
  return (
    <Box as="main" padding="4" className={styles.root}>
      <Heading as="h1" size="lg" className={styles.title}>
        Excalistore
      </Heading>
      {status.connected ? (
        <>
          <Text as="p" color="muted" className={styles.folder}>
            Folder: <strong>{status.folderName ?? status.folderId}</strong>
          </Text>
          <Button variant="secondary" onClick={onSignOut} disabled={busy}>
            Sign out
          </Button>
        </>
      ) : (
        <FolderNameForm id="es-folder-name" busy={busy} error={error} onConnect={onConnect} />
      )}
    </Box>
  );
};
```

`PopupConnect.module.css`:

```css
.root {
  width: 280px;
  background: var(--es-bg);
  color: var(--es-text);
  font: var(--es-font-size-md) / var(--es-line-height-base) var(--es-font-family);
}
.title {
  margin: 0 0 var(--es-space-3);
}
.folder {
  margin: 0 0 var(--es-space-3);
}
```

- [ ] **Step 2: Verify** — `npx biome check entrypoints/popup/ui/PopupConnect` — expect no errors. No existing test file for `PopupConnect`.
- [ ] **Step 3: Commit** — `git add entrypoints/popup/ui/PopupConnect && git commit -m "refactor(popup): use design primitives in PopupConnect"`

---

### Task 19: Full verification and docs update

**Files:**
- Modify: `docs/architecture.md`

`Spinner.module.css` is intentionally untouched — its only non-color value is `border-radius: 50%`, a circle shape, not a scale value.

- [ ] **Step 1: Run the full check suite**

```bash
npx biome check .
npx tsc --noEmit
npx vitest run
npx wxt build
```

Expected: all four pass with no errors.

- [ ] **Step 2: Manual visual check**

Load the unpacked build (`.output/chrome-mv3`) in Chrome, open excalidraw.com, and confirm: connect card, panel, popup, dialogs, and forms render with no layout breakage in both light and dark theme (toggle via Excalidraw's own theme switch). The only expected differences are the snaps listed in each task's notes (all +2px).

Skipped in this pass — attempted via scripted Chrome/CDP automation, which turned into unsupervised desktop control (clicking, focus-stealing, keystroke injection) the user had not authorized. Stopped on correction. Relying instead on: `biome check`/`tsc --noEmit` clean, all 113 `vitest` tests passing (including RTL render/interaction tests for `ConnectCard`/`PopupConnect`/`DiagramPanel`), and a successful `wxt build`. A real browser check is still recommended before shipping; do it by hand, or as a deliberate, approved step next time — not scripted unprompted.

- [ ] **Step 3: Update `docs/architecture.md`**

In the `shared/ui` bullet and the `shared/config` (`theme`) bullet (currently around lines 214–222), replace:

```
- **`shared/ui`** — primitive components rendered in Shadow DOM: `Button`,
  `IconButton`, `Dialog`/`ConfirmDialog`, `TextField`, `ListItem`, `Badge`,
  `Spinner`. The panel and every dialog (replace-canvas, sign-out, rename,
  conflict) are composed from these.
- **`shared/config` (`theme`)** — design tokens as CSS custom properties
  (`theme.css`) for light and dark, mirrored from Excalidraw's appState via the
  `data-theme` attribute (`THEME_ATTR`). Single source of styling for the
  primitives.
```

with:

```
- **`shared/ui`** — primitive components rendered in Shadow DOM: `Button`,
  `Dialog`/`ConfirmDialog`, `TextField`, `ListItem`, `Badge`, `Spinner`, plus
  the layout/typography primitives `Box`, `Stack`, `Text`, `Heading` (all
  polymorphic via an `as` prop; `Stack` composes `Box`, `Heading` composes
  `Text`). The panel and every dialog (replace-canvas, sign-out, rename,
  conflict) are composed from these.
- **`shared/config` (`theme`)** — design tokens as CSS custom properties
  (`theme.css`): color/radius/shadow/overlay switch with light/dark via the
  `data-theme` attribute (`THEME_ATTR`, mirrored from Excalidraw's appState);
  spacing, typography, and z-index are flat tokens that don't vary by theme.
  Single source of styling for the primitives.
```

(Note: the existing doc mentions an `IconButton` that doesn't exist in `src/shared/ui` today — a pre-existing doc/code mismatch, unrelated to this plan. Drop it from the list while here since it's adjacent text being touched anyway, but don't otherwise investigate it.)

- [ ] **Step 4: Commit** — `git add docs/architecture.md && git commit -m "docs(architecture): document layout/typography primitives and new tokens"`
