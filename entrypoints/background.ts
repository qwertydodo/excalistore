import { getToken, signOut } from "@/features/auth";
import { type GatewayDeps, handleMessage, isAllowedSender } from "@/features/driveGateway";
import type { ConnectionStatus, Request } from "@/shared/api";
import {
  createFile,
  findOrCreateFolder,
  getContent,
  getMeta,
  listFolder,
  renameFile,
  trashFile,
  updateFile,
} from "@/shared/api";

// Background service worker — trusted core. Holds the only access to the
// OAuth token and Drive APIs; routes typed messages through the gateway.
const STORE_KEY = "connection";

const deps: GatewayDeps = {
  getToken,
  signOut,
  listFolder,
  getFile: async (token, id) => {
    const [meta, content] = await Promise.all([getMeta(token, id), getContent(token, id)]);
    return { meta, content };
  },
  createFile,
  updateFile,
  renameFile,
  trashFile,
  findOrCreateFolder,
  getStore: async () =>
    ((await chrome.storage.local.get(STORE_KEY))[STORE_KEY] as ConnectionStatus) ?? {
      isConnected: false,
    },
  setStore: async (s) => chrome.storage.local.set({ [STORE_KEY]: s }),
};

export default defineBackground(() => {
  const popupUrl = chrome.runtime.getURL("popup.html");
  chrome.runtime.onMessage.addListener((req: Request, sender, sendResponse) => {
    if (!isAllowedSender(sender, { extensionId: chrome.runtime.id, popupUrl })) {
      sendResponse({ ok: false, error: "forbidden sender", code: "unknown" });
      return false;
    }
    handleMessage(req, deps)
      .then(sendResponse)
      .catch((e: unknown) =>
        sendResponse({ ok: false, error: (e as Error).message, code: "unknown" }),
      );
    return true; // async response
  });
});
