import { create } from "zustand";
import type { ConnectionStatus } from "@/features/driveGateway";
import { REQUEST_TYPE, sendToBackground } from "@/features/driveGateway";

export type AuthStore = {
  status: ConnectionStatus;
  isStatusLoaded: boolean;
  isConnecting: boolean;
  connectError: string | null;
  onStatusChange: (status: ConnectionStatus) => void;
  markDisconnected: () => void;
  loadStatus: () => Promise<ConnectionStatus>;
  connect: (folderName: string) => Promise<ConnectionStatus>;
  signOut: () => Promise<void>;
};

// Single source of truth for whether the extension is connected to a Drive
// folder — distinct from diagramLibraryStore (file list, search query) so
// every consumer (ConnectButton, useAppInit, useActiveDiagram, ...) can read
// connection state straight off this store instead of it living inside a
// "library" store that also owns unrelated file-list concerns. A leaf store:
// it never reaches into other stores itself — anything that needs to react
// to a connect/sign-out (opening the panel, refreshing the file list) is
// orchestrated by the caller (see useConnectDrive, useSignOutFlow) instead of
// being baked in here, so this file has no cross-store import to keep in sync.
export const useAuthStore = create<AuthStore>((set, get) => ({
  status: { isConnected: false },
  isStatusLoaded: false,
  isConnecting: false,
  connectError: null,
  onStatusChange: (status) => set({ status, isStatusLoaded: true }),
  // Called by sendDriveRequest's 401 middleware (entrypoints/content/api) on
  // any mid-session unauthorized Drive response — one named action instead of
  // every call site re-wrapping onStatusChange({ isConnected: false }) itself.
  markDisconnected: () => set({ status: { isConnected: false }, isStatusLoaded: true }),
  // Kicks off the one-time connection-status check on app init. Returns the
  // resolved status so the caller doesn't need a follow-up getState() read.
  loadStatus: async () => {
    try {
      const status = await sendToBackground<ConnectionStatus>({ type: REQUEST_TYPE.AUTH_STATUS });
      set({ status, isStatusLoaded: true });
      return status;
    } catch (e) {
      // Background unreachable (e.g. extension context invalidated mid-load)
      // — fall back to "disconnected" rather than leaving isStatusLoaded
      // false forever, which would leave the app stuck on its init gate.
      console.warn("[excalistore] failed to load connection status; assuming disconnected", e);
      const status: ConnectionStatus = { isConnected: false };
      set({ status, isStatusLoaded: true });
      return status;
    }
  },
  // Owns the initial Drive-connect flow (interactive sign-in + folder
  // find/create runs in the background gateway). Returns the resolved status
  // so the caller doesn't need a follow-up getState() read.
  connect: async (folderName) => {
    if (get().isConnecting) return get().status;
    set({ isConnecting: true, connectError: null });
    try {
      const next = await sendToBackground<ConnectionStatus>({
        type: REQUEST_TYPE.DRIVE_CONNECT,
        folderName,
      });
      set({ status: next, isStatusLoaded: true });
      return next;
    } catch (e) {
      set({ connectError: e instanceof Error ? e.message : "Could not connect to Google Drive" });
      return get().status;
    } finally {
      set({ isConnecting: false });
    }
  },
  signOut: async () => {
    await sendToBackground({ type: REQUEST_TYPE.AUTH_SIGN_OUT });
    get().markDisconnected();
  },
}));
