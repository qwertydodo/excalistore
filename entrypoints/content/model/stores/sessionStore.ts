import { type ActiveFile, isActiveFile } from "@/entities/diagram";
import type { DriveFile } from "@/entities/google/drive";

// Plain chrome.storage.local wrappers for everything the panel needs to
// survive a writeScene-triggered tab reload — grouped in one file since each
// is just a get/set/(clear) pair around a single key, not real app state.

const ACTIVE_FILE_KEY = "activeFile";

// The active-file pointer survives the writeScene→reload via chrome.storage.local.
export const getActiveFile = async (): Promise<ActiveFile | null> => {
  try {
    const value = (await chrome.storage.local.get(ACTIVE_FILE_KEY))[ACTIVE_FILE_KEY];
    return isActiveFile(value) ? value : null;
  } catch {
    // Storage can reject on extension-context invalidation; treat as no pointer.
    return null;
  }
};

export const setActiveFile = async (file: ActiveFile): Promise<void> => {
  try {
    await chrome.storage.local.set({ [ACTIVE_FILE_KEY]: file });
  } catch {
    // Best-effort; the pointer just won't survive the next reload.
  }
};

export const clearActiveFile = async (): Promise<void> => {
  try {
    await chrome.storage.local.remove(ACTIVE_FILE_KEY);
  } catch {
    // ignore
  }
};

const FILE_LIST_CACHE_KEY = "fileListCache";

// Cache the connected folder's file list so the panel can paint instantly after
// the writeScene→reload, then revalidate in the background. Tolerates storage
// rejections (extension-context invalidation) by treating them as an empty cache.
export const getCachedFiles = async (): Promise<DriveFile[]> => {
  try {
    const value = (await chrome.storage.local.get(FILE_LIST_CACHE_KEY))[FILE_LIST_CACHE_KEY];
    return Array.isArray(value) ? (value as DriveFile[]) : [];
  } catch {
    return [];
  }
};

export const setCachedFiles = async (files: DriveFile[]): Promise<void> => {
  try {
    await chrome.storage.local.set({ [FILE_LIST_CACHE_KEY]: files });
  } catch {
    // Best-effort cache; a failure just means no fast paint next reload.
  }
};

export const clearCachedFiles = async (): Promise<void> => {
  try {
    await chrome.storage.local.remove(FILE_LIST_CACHE_KEY);
  } catch {
    // ignore
  }
};

const PANEL_COLLAPSED_KEY = "panelCollapsed";

// Whether the in-page panel is collapsed — persisted so the choice survives the
// writeScene→reload. Tolerates storage rejections (context invalidation).
export const getPanelCollapsed = async (): Promise<boolean> => {
  try {
    return (await chrome.storage.local.get(PANEL_COLLAPSED_KEY))[PANEL_COLLAPSED_KEY] === true;
  } catch {
    return false;
  }
};

export const setPanelCollapsed = async (isCollapsed: boolean): Promise<void> => {
  try {
    await chrome.storage.local.set({ [PANEL_COLLAPSED_KEY]: isCollapsed });
  } catch {
    // Best-effort; the panel just won't remember the state next reload.
  }
};

const SEARCH_QUERY_KEY = "diagramSearchQuery";

// The panel's search query — persisted so it survives the writeScene→reload
// that opening a diagram triggers. Tolerates storage rejections (context
// invalidation), same as the rest of this file.
export const getDiagramSearchQuery = async (): Promise<string> => {
  try {
    return (
      ((await chrome.storage.local.get(SEARCH_QUERY_KEY))[SEARCH_QUERY_KEY] as
        | string
        | undefined) ?? ""
    );
  } catch {
    return "";
  }
};

export const setDiagramSearchQuery = async (query: string): Promise<void> => {
  try {
    await chrome.storage.local.set({ [SEARCH_QUERY_KEY]: query });
  } catch {
    // Best-effort; the panel just won't remember the query next reload.
  }
};
