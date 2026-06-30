import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { EXCALIDRAW_ORIGIN } from "@/shared/config";
// Import reset + theme so WXT injects them into the shadow root.
import "@/shared/config/reset.css";
import "@/shared/config/theme.css";
import { App } from "./App";
import { scopeKeyboard } from "./lib/scopeKeyboard";

export default defineContentScript({
  matches: [`${EXCALIDRAW_ORIGIN}/*`],
  cssInjectionMode: "ui",
  async main(ctx) {
    let detachKeyboard: (() => void) | undefined;
    const ui = await createShadowRootUi(ctx, {
      name: "excalistore-panel",
      position: "inline",
      anchor: "body",
      // WXT 0.20+ injects `:host { all: initial !important }` into the shadow
      // root reset. That `all: initial !important` overrides the host's inline
      // positioning back to `static` — and in Chrome it wins even over an
      // inline `!important`, so it can't be beaten from the host's own styles.
      // Opt out of the reset; the panel's own styling comes from the theme
      // tokens + reset.css imported into the shadow root, not from this reset.
      inheritStyles: true,
      onMount(uiContainer, _shadow, shadowHost) {
        // Position the shadow host fixed in a corner.
        shadowHost.style.position = "fixed";
        shadowHost.style.top = "64px";
        shadowHost.style.right = "16px";
        shadowHost.style.zIndex = "1000";
        shadowHost.style.padding = "0";
        shadowHost.style.margin = "0";
        // Keep every key event inside the plugin so Excalidraw's document-level
        // tool shortcuts don't fire while typing in the panel. Detached in
        // onRemove alongside the React root.
        detachKeyboard = scopeKeyboard(uiContainer);
        const root = createRoot(uiContainer);
        root.render(
          <StrictMode>
            <App />
          </StrictMode>,
        );
        return root;
      },
      onRemove(root) {
        detachKeyboard?.();
        detachKeyboard = undefined;
        root?.unmount();
      },
    });
    ui.mount();
  },
});
