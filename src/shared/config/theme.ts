// Theme is defined in theme.css via --es-* custom properties, switched by the
// data-theme attribute on the popup :root or the panel Shadow-DOM :host.
export const THEME_MODE = {
  LIGHT: "light",
  DARK: "dark",
} as const;

export type ThemeMode = (typeof THEME_MODE)[keyof typeof THEME_MODE];
export const THEME_ATTR = "data-theme";
