---
name: design-system-skills
description: Token generators, component patterns, accessibility guidance, and framework integrations for design systems. Use when planning token architecture, generating color/spacing/type/shadow/radius/motion/breakpoint/z-index scales, building dark mode or layout-primitive patterns, fixing accessibility (contrast/focus/ARIA), writing component or token docs, or wiring tokens into React/Vue/Svelte/Angular/Figma/Storybook/Framer/style-dictionary.
---

# Design System Skills

Bundle of 28 focused reference guides, grouped by category below. Each is a
plain markdown file (some with a companion `algorithm.ts`) — open the one
that matches the task with Read, there is no separate Skill-tool entry per
file.

Source: https://github.com/dylantarre/design-system-skills

## Tokens (10)

| Guide | Purpose |
|-------|---------|
| `tokens/design-tokens-structure/SKILL.md` | Token architecture (primitive → semantic → component) |
| `tokens/color-scale/SKILL.md` (+ `algorithm.ts`) | OKLCH color palettes from brand colors |
| `tokens/spacing-scale/SKILL.md` (+ `algorithm.ts`) | Margin/padding/gap token scales |
| `tokens/type-scale/SKILL.md` (+ `algorithm.ts`) | Typography with modular ratios |
| `tokens/shadow-scale/SKILL.md` | Elevation and depth tokens |
| `tokens/radius-scale/SKILL.md` | Border radius tokens |
| `tokens/breakpoints/SKILL.md` | Responsive breakpoint tokens |
| `tokens/motion-scale/SKILL.md` | Animation duration and easing |
| `tokens/z-index-scale/SKILL.md` | Layering/stacking tokens |
| `tokens/responsive-typography/SKILL.md` | Fluid type with `clamp()` |

## Patterns (5)

| Guide | Purpose |
|-------|---------|
| `patterns/dark-mode/SKILL.md` | Theme switching with semantic tokens |
| `patterns/compound-components/SKILL.md` | Radix/Headless UI patterns |
| `patterns/icon-system/SKILL.md` | SVG sprites and icon components |
| `patterns/layout-primitives/SKILL.md` | Stack, Cluster, Grid, Sidebar |
| `patterns/animation-principles/SKILL.md` | Disney's 12 principles for UI |

## Frameworks (4)

| Guide | Purpose |
|-------|---------|
| `frameworks/react/SKILL.md` | React + TypeScript components |
| `frameworks/vue/SKILL.md` | Vue 3 + Composition API |
| `frameworks/svelte/SKILL.md` | Svelte 5 + runes |
| `frameworks/angular/SKILL.md` | Angular + signals |

## Tools (4)

| Guide | Purpose |
|-------|---------|
| `tools/figma/SKILL.md` | Figma Variables and Tokens Studio |
| `tools/storybook/SKILL.md` | Component documentation |
| `tools/framer/SKILL.md` | Framer token integration |
| `tools/style-dictionary/SKILL.md` | Multi-platform token transformation |

## Accessibility (3)

| Guide | Purpose |
|-------|---------|
| `accessibility/color-contrast/SKILL.md` | WCAG contrast validation |
| `accessibility/focus-states/SKILL.md` | Keyboard focus indicators |
| `accessibility/aria-patterns/SKILL.md` | ARIA for interactive components |

## Documentation (2)

| Guide | Purpose |
|-------|---------|
| `documentation/token-docs/SKILL.md` | Design token documentation |
| `documentation/component-docs/SKILL.md` | Component API documentation |

## Recommended paths

**New design system**: `tokens/design-tokens-structure` → `tokens/color-scale`
→ `tokens/spacing-scale` → `tokens/type-scale` → `tokens/shadow-scale` →
`patterns/dark-mode` → `frameworks/react` → `tools/storybook`

**Add tokens to existing project**: `tokens/design-tokens-structure` →
`tokens/color-scale` → `tokens/spacing-scale` → `tools/style-dictionary`

**Improve accessibility**: `accessibility/color-contrast` →
`accessibility/focus-states` → `accessibility/aria-patterns`

**Cross-platform**: `tokens/design-tokens-structure` →
`tools/style-dictionary` → `tools/figma`

This project (excalistore) styles via CSS Modules + `var(--es-*)` tokens in
`src/shared/config/theme.css` — no Tailwind, Vue, Svelte, or Angular in use,
so `frameworks/vue`, `frameworks/svelte`, `frameworks/angular` and Tailwind
output sections are reference-only here.
