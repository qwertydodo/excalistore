import { create } from "zustand";
import type { DriveFile } from "@/entities/google/drive";
import { REQUEST_TYPE } from "@/features/driveGateway";
import { sendDriveRequest } from "../../api";
import {
  getDiagramSearchQuery,
  isFirstSessionLoad,
  markSessionLoaded,
  setCachedFiles,
} from "./sessionStore";

export type DiagramLibraryStore = {
  files: DriveFile[];
  initialQuery: string;
  isFilesLoading: boolean;
  isQueryLoaded: boolean;
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
  isFilesLoading: false,
  isQueryLoaded: false,
  // The one write path for the file list: state and the fast-paint cache
  // (chrome.storage.local) always move together, so no caller can update one
  // and forget the other.
  setFiles: (files) => {
    set({ files });
    setCachedFiles(files);
  },
  refresh: async () => {
    // Only skip the full-list loader once this tab session has already
    // validated a list against Drive at least once (e.g. right before an
    // open/switch/create reload) — that's a silent background revalidation,
    // don't yank the just-painted list out to show a spinner. A brand new
    // tab session shows the loader even if a cache is already painted: that
    // cache could be stale (files added/removed on Drive since last time),
    // and there's no in-flight reload to protect from flicker yet.
    if (isFirstSessionLoad()) set({ isFilesLoading: true });
    try {
      const list = await sendDriveRequest<DriveFile[]>({ type: REQUEST_TYPE.DRIVE_LIST });
      get().setFiles(list);
      markSessionLoaded();
      return list;
    } catch {
      return [];
    } finally {
      set({ isFilesLoading: false });
    }
  },
  loadInitialQuery: async () => {
    const initialQuery = await getDiagramSearchQuery();
    set({ initialQuery, isQueryLoaded: true });
  },
}));
