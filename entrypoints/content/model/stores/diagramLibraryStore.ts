import { create } from "zustand";
import type { DriveFile } from "@/entities/google/drive";
import { REQUEST_TYPE } from "@/features/driveGateway";
import { sendDriveRequest } from "../../api";
import { getDiagramSearchQuery, setCachedFiles } from "./sessionStore";

export type DiagramLibraryStore = {
  files: DriveFile[];
  initialQuery: string;
  isQueryReady: boolean;
  setFiles: (files: DriveFile[]) => void;
  refresh: () => Promise<DriveFile[]>;
  loadInitialQuery: () => Promise<void>;
};

// Single source of truth for the connected Drive file list and the persisted
// search query's initial load — connection status lives in authStore, which
// this store never imports (see authStore's own comment): refresh() goes
// through sendDriveRequest instead, whose 401 middleware marks authStore
// disconnected on an unauthorized error. Read directly by whichever component
// needs it (DiagramPanel, useDiagramData, ...) instead of threading it all
// through App.tsx as props.
export const useDiagramLibraryStore = create<DiagramLibraryStore>((set, get) => ({
  files: [],
  initialQuery: "",
  isQueryReady: false,
  // The one write path for the file list: state and the fast-paint cache
  // (chrome.storage.local) always move together, so no caller can update one
  // and forget the other.
  setFiles: (files) => {
    set({ files });
    setCachedFiles(files);
  },
  // Dumb fetch: callers own spinners/failure policy. Throws on failure —
  // loadInitial catches (keeps cache + pointer), the auto-create watcher lets
  // the throw abort the tick so the controller retries.
  refresh: async () => {
    const list = await sendDriveRequest<DriveFile[]>({ type: REQUEST_TYPE.DRIVE_LIST });
    get().setFiles(list);
    return list;
  },
  loadInitialQuery: async () => {
    const initialQuery = await getDiagramSearchQuery();
    set({ initialQuery, isQueryReady: true });
  },
}));
