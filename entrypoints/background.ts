import {
  createFile,
  findOrCreateFolder,
  getContent,
  getMeta,
  listFolder,
  renameFile,
  updateFile,
} from "@/entities/driveFile";
import { getToken, signOut } from "@/features/auth";
import { type GatewayDeps, handleMessage } from "@/features/driveGateway";
import type { ConnectionStatus, Request } from "@/shared/api";

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
  findOrCreateFolder,
  getStore: async () =>
    ((await chrome.storage.local.get(STORE_KEY))[STORE_KEY] as ConnectionStatus) ?? {
      connected: false,
    },
  setStore: async (s) => chrome.storage.local.set({ [STORE_KEY]: s }),
};

export default defineBackground(() => {
  chrome.runtime.onMessage.addListener((req: Request, _sender, sendResponse) => {
    handleMessage(req, deps).then(sendResponse);
    return true; // async response
  });
});
