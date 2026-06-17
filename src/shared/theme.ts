// Design tokens mirrored loosely from Excalidraw's palette. Exposed as CSS
// custom properties applied to the Shadow DOM root, so all `ui` primitives
// style off `var(--es-*)` and theme-switch by swapping the variable map.
export type ThemeMode = "light" | "dark";

type Vars = Record<string, string>;

const light: Vars = {
  "--es-bg": "#ffffff",
  "--es-surface": "#f1f0ff",
  "--es-text": "#1b1b1f",
  "--es-muted": "#6a6a75",
  "--es-border": "#e0dfff",
  "--es-accent": "#6965db",
  "--es-accent-text": "#ffffff",
  "--es-danger": "#e03131",
  "--es-radius": "8px",
  "--es-shadow": "0 1px 4px rgba(0,0,0,0.1)",
};

const dark: Vars = {
  "--es-bg": "#232329",
  "--es-surface": "#2e2d39",
  "--es-text": "#e3e3e8",
  "--es-muted": "#9a99a5",
  "--es-border": "#3b3a47",
  "--es-accent": "#a8a5ff",
  "--es-accent-text": "#1b1b1f",
  "--es-danger": "#ff8787",
  "--es-radius": "8px",
  "--es-shadow": "0 1px 4px rgba(0,0,0,0.4)",
};

export function themeVars(mode: ThemeMode): Vars {
  return mode === "dark" ? dark : light;
}
