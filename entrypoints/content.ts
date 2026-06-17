// Content script — injected into excalidraw.com.
// Scene bridge, panel UI, and autosave arrive in Plan 3.
export default defineContentScript({
  matches: ["https://excalidraw.com/*"],
  main() {
    console.debug("[excalistore] content script ready");
  },
});
