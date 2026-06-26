import { getToken as chromeGetToken, signOut as chromeSignOut } from "@/features/auth/api";
import type { ConnectionStatus } from "@/shared/api";
import { findOrCreateFolder } from "@/shared/api/google";

const STORE_KEY = "connection";

const getStore = async (): Promise<ConnectionStatus> =>
  ((await chrome.storage.local.get(STORE_KEY))[STORE_KEY] as ConnectionStatus) ?? {
    isConnected: false,
  };

const setStore = async (s: ConnectionStatus): Promise<void> => {
  await chrome.storage.local.set({ [STORE_KEY]: s });
};

export type AuthService = {
  getToken: (interactive: boolean) => Promise<string>;
  getStatus: () => Promise<ConnectionStatus>;
  signOut: () => Promise<ConnectionStatus>;
  connect: (token: string, folderName: string) => Promise<ConnectionStatus>;
};

export const createAuthService = (): AuthService => ({
  getToken: chromeGetToken,

  getStatus: getStore,

  signOut: async () => {
    const token = await chromeGetToken(false).catch(() => "");
    if (token) await chromeSignOut(token);
    const next: ConnectionStatus = { isConnected: false };
    await setStore(next);
    return next;
  },

  connect: async (token, folderName) => {
    const folder = await findOrCreateFolder(token, folderName);
    const next: ConnectionStatus = {
      isConnected: true,
      folderId: folder.id,
      folderName: folder.name,
    };
    await setStore(next);
    return next;
  },
});
