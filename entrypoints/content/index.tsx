import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { EXCALIDRAW_ORIGIN } from "@/shared/config";
// Import the panel + dialog styles so WXT injects them into the shadow root.
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
      onMount(uiContainer, _shadow, shadowHost) {
        // Position the shadow host fixed in a corner; it also carries the
        // theme attr so `:host([data-theme="dark"])` rules in theme.css apply.
        shadowHost.style.position = "fixed";
        shadowHost.style.top = "64px";
        shadowHost.style.right = "16px";
        shadowHost.style.zIndex = "1000";
        const root = createRoot(uiContainer);
        root.render(
          <StrictMode>
            <App host={shadowHost} />
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
