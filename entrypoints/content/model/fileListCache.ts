import type { DriveFile } from "@/entities/google/drive";

const KEY = "fileListCache";

// Cache the connected folder's file list so the panel can paint instantly after
// the writeScene→reload, then revalidate in the background. Tolerates storage
// rejections (extension-context invalidation) by treating them as an empty cache.
export const getCachedFiles = async (): Promise<DriveFile[]> => {
  try {
    const value = (await chrome.storage.local.get(KEY))[KEY];
    return Array.isArray(value) ? (value as DriveFile[]) : [];
  } catch {
    return [];
  }
};

export const setCachedFiles = async (files: DriveFile[]): Promise<void> => {
  try {
    await chrome.storage.local.set({ [KEY]: files });
  } catch {
    // Best-effort cache; a failure just means no fast paint next reload.
  }
};

export const clearCachedFiles = async (): Promise<void> => {
  try {
    await chrome.storage.local.remove(KEY);
  } catch {
    // ignore
  }
};
