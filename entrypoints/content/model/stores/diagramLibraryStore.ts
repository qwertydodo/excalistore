import { create } from "zustand";
import type { DriveFile } from "@/entities/google/drive";
import type { ConnectionStatus } from "@/features/driveGateway";
import { ERROR_CODE, REQUEST_TYPE, RequestError, sendToBackground } from "@/features/driveGateway";
import {
  getDiagramSearchQuery,
  hasValidatedFileListThisSession,
  markFileListValidatedThisSession,
  setCachedFiles,
  setPanelCollapsed,
} from "./sessionStore";

export type DiagramLibraryStore = {
  status: ConnectionStatus;
  files: DriveFile[];
  initialQuery: string;
  isFilesLoading: boolean;
  isQueryLoaded: boolean;
  isConnecting: boolean;
  connectError: string | null;
  onStatusChange: (status: ConnectionStatus) => void;
  onFilesChange: (files: DriveFile[]) => void;
  refresh: () => Promise<DriveFile[]>;
  loadInitialQuery: () => Promise<void>;
  connect: (folderName: string) => Promise<void>;
};

// Single source of truth for the connected Drive file list, connection
// status, and the persisted search query's initial load. Read directly by
// whichever component needs it (DiagramPanel, useDiagramLibrary, ...)
// instead of threading it all through App.tsx as props.
export const useDiagramLibraryStore = create<DiagramLibraryStore>((set, get) => ({
  status: { isConnected: false },
  files: [],
  initialQuery: "",
  isFilesLoading: false,
  isQueryLoaded: false,
  isConnecting: false,
  connectError: null,
  onStatusChange: (status) => set({ status }),
  onFilesChange: (files) => set({ files }),
  refresh: async () => {
    // Only skip the full-list loader once this tab session has already
    // validated a list against Drive at least once (e.g. right before an
    // open/switch/create reload) — that's a silent background revalidation,
    // don't yank the just-painted list out to show a spinner. A brand new
    // tab session shows the loader even if a cache is already painted: that
    // cache could be stale (files added/removed on Drive since last time),
    // and there's no in-flight reload to protect from flicker yet.
    if (!hasValidatedFileListThisSession()) set({ isFilesLoading: true });
    try {
      const list = await sendToBackground<DriveFile[]>({ type: REQUEST_TYPE.DRIVE_LIST });
      set({ files: list });
      setCachedFiles(list); // keep the fast-paint cache fresh
      markFileListValidatedThisSession();
      return list;
    } catch (e) {
      if (e instanceof RequestError && e.code === ERROR_CODE.UNAUTHORIZED) {
        set({ status: { isConnected: false } });
      }
      return [];
    } finally {
      set({ isFilesLoading: false });
    }
  },
  loadInitialQuery: async () => {
    const initialQuery = await getDiagramSearchQuery();
    set({ initialQuery, isQueryLoaded: true });
  },
  // Owns the initial Drive-connect flow (interactive sign-in + folder
  // find/create runs in the background gateway).
  connect: async (folderName) => {
    if (get().isConnecting) return;
    set({ isConnecting: true, connectError: null });
    try {
      const next = await sendToBackground<ConnectionStatus>({
        type: REQUEST_TYPE.DRIVE_CONNECT,
        folderName,
      });
      set({ status: next });
      if (next.isConnected) {
        // Auto-open the panel on connect: DiagramPanel's usePanelVisibility
        // reads this persisted value when it mounts.
        await setPanelCollapsed(false);
        await get().refresh();
      }
    } catch (e) {
      set({ connectError: e instanceof Error ? e.message : "Could not connect to Google Drive" });
    } finally {
      set({ isConnecting: false });
    }
  },
}));

// The panel waits on both the file list and the persisted search query
// before it can mount the search-consuming UI (see useDiagramData).
export const selectIsDiagramLibraryLoading = (s: DiagramLibraryStore): boolean =>
  s.isFilesLoading || !s.isQueryLoaded;
