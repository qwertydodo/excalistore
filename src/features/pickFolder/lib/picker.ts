import { isPickerMessage, PICKER_CHANNEL, type PickedFolder } from "./pickerProtocol";

export type { PickedFolder } from "./pickerProtocol";

// Folder selection under MV3: the Picker can only load apis.google.com from a
// sandboxed page, so we embed sandbox.html as a full-popup iframe, hand it the
// OAuth token over postMessage, and resolve with the chosen folder. The token
// lives only in the popup + this child iframe for the pick's duration.
export function pickFolder(
  token: string,
  apiKey: string,
  appId: string,
): Promise<PickedFolder | null> {
  return new Promise((resolve) => {
    const nonce =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : String(Date.now() + Math.random());

    const iframe = document.createElement("iframe");
    iframe.src = chrome.runtime.getURL("sandbox.html");
    iframe.title = "Choose a Google Drive folder";
    iframe.style.cssText =
      "position:fixed;top:0;left:0;width:100%;height:100%;border:0;z-index:2147483647;background:#fff;";

    // The popup window only sizes up to its content, so widen the body while the
    // picker is open (Chrome popups expand up to ~800x600).
    const prevWidth = document.body.style.minWidth;
    const prevHeight = document.body.style.minHeight;
    document.body.style.minWidth = "640px";
    document.body.style.minHeight = "520px";

    function cleanup(): void {
      window.removeEventListener("message", onMessage);
      iframe.remove();
      document.body.style.minWidth = prevWidth;
      document.body.style.minHeight = prevHeight;
    }

    function post(message: Record<string, unknown>): void {
      iframe.contentWindow?.postMessage({ channel: PICKER_CHANNEL, ...message }, "*");
    }

    function onMessage(event: MessageEvent): void {
      if (event.source !== iframe.contentWindow) return;
      const data = event.data;
      if (!isPickerMessage(data)) return;
      // The ready handshake uses a fixed nonce ("ready") since it precedes the
      // pick's real nonce being known to the sandbox. Handle it before the
      // nonce-match check below, which guards every other message type.
      if (data.type === "picker:ready") {
        post({ type: "picker:open", nonce, token, apiKey, appId });
        return;
      }
      if (data.nonce !== nonce) return;
      switch (data.type) {
        case "picker:picked":
          cleanup();
          resolve(data.folder);
          break;
        case "picker:cancel":
        case "picker:error":
          cleanup();
          resolve(null);
          break;
      }
    }

    window.addEventListener("message", onMessage);
    document.body.appendChild(iframe);
  });
}
