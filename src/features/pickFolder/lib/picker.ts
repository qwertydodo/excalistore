// Thin Google Picker wrapper. Loads gapi (first-party, CSP-allowed), shows a
// folder-only picker, resolves the chosen folder. Runs in the popup, where it
// is handed the OAuth token for the picker session only.
interface PickedFolder {
  id: string;
  name: string;
}

const GAPI_SRC = "https://apis.google.com/js/api.js";

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const el = document.createElement("script");
    el.src = src;
    el.onload = () => resolve();
    el.onerror = () => reject(new Error(`failed to load ${src}`));
    document.head.appendChild(el);
  });
}

export async function pickFolder(
  token: string,
  apiKey: string,
  appId: string,
): Promise<PickedFolder | null> {
  await loadScript(GAPI_SRC);
  await new Promise<void>((resolve) =>
    google.picker ? resolve() : gapi.load("picker", { callback: () => resolve() }),
  );

  return new Promise<PickedFolder | null>((resolve) => {
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
          resolve(doc ? { id: doc.id, name: doc.name ?? "" } : null);
        } else if (data.action === google.picker.Action.CANCEL) {
          resolve(null);
        }
      })
      .build();
    picker.setVisible(true);
  });
}
