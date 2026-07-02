import { type ActiveFile, isActiveFile } from "@/entities/diagram";

const KEY = "activeFile";

// The active-file pointer survives the writeScene→reload via chrome.storage.local.
export const getActiveFile = async (): Promise<ActiveFile | null> => {
  try {
    const value = (await chrome.storage.local.get(KEY))[KEY];
    return isActiveFile(value) ? value : null;
  } catch {
    // Storage can reject on extension-context invalidation; treat as no pointer.
    return null;
  }
};

export const setActiveFile = async (file: ActiveFile): Promise<void> => {
  await chrome.storage.local.set({ [KEY]: file });
};

export const clearActiveFile = async (): Promise<void> => {
  await chrome.storage.local.remove(KEY);
};
