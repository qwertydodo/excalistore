import { create } from "zustand";
import type { DriveFile } from "@/entities/google/drive";
import { ERROR_CODE, REQUEST_TYPE, RequestError, sendToBackground } from "@/features/driveGateway";
import {
  getDiagramSearchQuery,
  hasValidatedFileListThisSession,
  markFileListValidatedThisSession,
  setCachedFiles,
} from "./sessionStore";

export type DiagramLibraryStore = {
  files: DriveFile[];
  initialQuery: string;
  isFilesLoading: boolean;
  isQueryLoaded: boolean;
  onFilesChange: (files: DriveFile[]) => void;
  refresh: (onUnauthorized?: () => void) => Promise<DriveFile[]>;
  loadInitialQuery: () => Promise<void>;
};

// Single source of truth for the connected Drive file list and the persisted
// search query's initial load — connection status lives in authStore, which
// this store never imports (see authStore's own comment): refresh() takes an
// optional onUnauthorized callback instead, so a caller that cares about a
// 401 mid-refresh (useActiveDiagram, ...) wires it to authStore itself. Read
// directly by whichever component needs it (DiagramPanel, useDiagramData,
// ...) instead of threading it all through App.tsx as props.
export const useDiagramLibraryStore = create<DiagramLibraryStore>((set) => ({
  files: [],
  initialQuery: "",
  isFilesLoading: false,
  isQueryLoaded: false,
  onFilesChange: (files) => set({ files }),
  refresh: async (onUnauthorized) => {
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
        onUnauthorized?.();
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
}));
