import { authRepo } from "@/entities/google/auth";
import { driveRepo } from "@/entities/google/drive";
import type { ConnectionStatus } from "@/shared/api";

// The "connection" is the link between the extension and a Drive folder:
// whether the user has granted access and which folder diagrams live in. It is
// persisted in chrome.storage.local and is distinct from auth (tokens) — auth
// lives in entities/google/auth. This service orchestrates auth + drive +
// storage, which is why it sits in the feature layer (an entity may not import
// another entity).

const STORE_KEY = "connection";

const getStore = async (): Promise<ConnectionStatus> =>
  ((await chrome.storage.local.get(STORE_KEY))[STORE_KEY] as ConnectionStatus) ?? {
    isConnected: false,
  };

const setStore = async (s: ConnectionStatus): Promise<void> => {
  await chrome.storage.local.set({ [STORE_KEY]: s });
};

export const connectionService = {
  getStatus: getStore,

  signOut: async (): Promise<ConnectionStatus> => {
    const token = await authRepo.getToken(false).catch(() => "");
    if (token) await authRepo.signOut(token);
    const next: ConnectionStatus = { isConnected: false };
    await setStore(next);
    return next;
  },

  connect: async (folderName: string): Promise<ConnectionStatus> => {
    // Force the interactive consent prompt; the resulting token is cached by
    // Chrome, so the subsequent Drive call auths silently via the interceptor.
    await authRepo.getToken(true);
    const folder = await driveRepo.findOrCreateFolder(folderName);
    const next: ConnectionStatus = {
      isConnected: true,
      folderId: folder.id,
      folderName: folder.name,
    };
    await setStore(next);
    return next;
  },
};
