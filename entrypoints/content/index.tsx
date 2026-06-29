import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { EXCALIDRAW_ORIGIN } from "@/shared/config";
// Import reset + theme so WXT injects them into the shadow root.
import "@/shared/config/reset.css";
import "@/shared/config/theme.css";
import { App } from "./App";

export default defineContentScript({
  matches: [`${EXCALIDRAW_ORIGIN}/*`],
  cssInjectionMode: "ui",
  async main(ctx) {
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
        const root = createRoot(uiContainer);
        root.render(
          <StrictMode>
            <App />
          </StrictMode>,
        );
        return root;
      },
      onRemove(root) {
        root?.unmount();
      },
    });
    ui.mount();
  },
});
