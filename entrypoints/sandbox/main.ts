import { isPickerMessage, PICKER_CHANNEL, type PickedFolder } from "@/features/pickFolder";

// Runs inside the MV3 sandboxed iframe. Loads the Picker (apis.google.com is
// permitted here only), then reports the chosen folder to the embedding popup.
// No chrome.* APIs are available in a sandbox — communication is postMessage.

function postToParent(message: Record<string, unknown>): void {
  window.parent.postMessage({ channel: PICKER_CHANNEL, ...message }, "*");
}

function loadPickerLib(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof gapi === "undefined") {
      reject(new Error("gapi failed to load"));
      return;
    }
    gapi.load("picker", { callback: () => resolve() });
  });
}

function openPicker(nonce: string, token: string, apiKey: string, appId: string): void {
  const view = new google.picker.DocsView(google.picker.ViewId.FOLDERS)
    .setSelectFolderEnabled(true)
    .setMimeTypes("application/vnd.google-apps.folder");

  const picker = new google.picker.PickerBuilder()
    .addView(view)
    .setOAuthToken(token)
    .setDeveloperKey(apiKey)
    .setAppId(appId)
    .setCallback((data: google.picker.ResponseObject) => {
      if (data.action === google.picker.Action.PICKED) {
        const doc = data.docs?.[0];
        const folder: PickedFolder | null = doc ? { id: doc.id, name: doc.name ?? "" } : null;
        if (folder) postToParent({ type: "picker:picked", nonce, folder });
        else postToParent({ type: "picker:cancel", nonce });
      } else if (data.action === google.picker.Action.CANCEL) {
        postToParent({ type: "picker:cancel", nonce });
      }
    })
    .build();
  picker.setVisible(true);
}

window.addEventListener("message", async (event: MessageEvent) => {
  const data = event.data;
  if (!isPickerMessage(data) || data.type !== "picker:open") return;
  const { nonce, token, apiKey, appId } = data;
  try {
    await loadPickerLib();
    openPicker(nonce, token, apiKey, appId);
  } catch (e) {
    postToParent({ type: "picker:error", nonce, message: (e as Error).message });
  }
});

// Tell the embedder we're listening so it sends the token + opens the picker.
// A fixed handshake nonce is fine here; the real per-pick nonce arrives in
// picker:open and is echoed on every reply.
postToParent({ type: "picker:ready", nonce: "ready" });
