// Theme is defined in theme.css via --es-* custom properties, switched by the
// data-theme attribute on the popup :root or the panel Shadow-DOM :host.
export type ThemeMode = "light" | "dark";
export const THEME_ATTR = "data-theme";
