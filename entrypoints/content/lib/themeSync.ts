import { THEME_ATTR, THEME_MODE, type ThemeMode } from "@/shared/config";

// Excalidraw marks dark mode by appending this token to its root container's
// class list (confirmed via devtools on excalidraw.com); no other public signal
// exists for the app's current theme.
const EXCALIDRAW_DARK_CLASS = "theme--dark";
const EXCALIDRAW_CONTAINER_SELECTOR = ".excalidraw";

export const excalidrawThemeFromClassList = (classList: DOMTokenList): ThemeMode =>
  classList.contains(EXCALIDRAW_DARK_CLASS) ? THEME_MODE.DARK : THEME_MODE.LIGHT;

const applyTheme = (shadowHost: HTMLElement, container: Element) => {
  shadowHost.setAttribute(THEME_ATTR, excalidrawThemeFromClassList(container.classList));
};

// Mirrors excalidraw.com's own theme onto the panel's shadow host, so the
// existing --es-* CSS cascade (keyed off data-theme on :host) follows it with
// no component changes. Event-driven only — no polling.
export const syncPanelTheme = (shadowHost: HTMLElement): (() => void) => {
  let watchObserver: MutationObserver | undefined;

  const watch = (container: Element) => {
    applyTheme(shadowHost, container);
    watchObserver = new MutationObserver(() => applyTheme(shadowHost, container));
    watchObserver.observe(container, { attributes: true, attributeFilter: ["class"] });
  };

  const existing = document.querySelector(EXCALIDRAW_CONTAINER_SELECTOR);
  if (existing) {
    watch(existing);
    return () => watchObserver?.disconnect();
  }

  const findObserver = new MutationObserver(() => {
    const found = document.querySelector(EXCALIDRAW_CONTAINER_SELECTOR);
    if (!found) return;
    findObserver.disconnect();
    watch(found);
  });
  findObserver.observe(document.body, { childList: true, subtree: true });

  return () => {
    findObserver.disconnect();
    watchObserver?.disconnect();
  };
};
