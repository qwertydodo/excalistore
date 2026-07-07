import { THEME_MODE, type ThemeMode } from "@/shared/config";

// Excalidraw marks dark mode by appending this token to its root container's
// class list (confirmed via devtools on excalidraw.com); no other public signal
// exists for the app's current theme.
const EXCALIDRAW_DARK_CLASS = "theme--dark";

export const excalidrawThemeFromClassList = (classList: DOMTokenList): ThemeMode =>
  classList.contains(EXCALIDRAW_DARK_CLASS) ? THEME_MODE.DARK : THEME_MODE.LIGHT;
