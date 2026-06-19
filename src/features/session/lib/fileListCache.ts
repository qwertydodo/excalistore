import type { DriveFileMeta } from "@/shared/api";

const KEY = "fileListCache";

// Cache the connected folder's file list so the panel can paint instantly after
// the writeScene→reload, then revalidate in the background. Tolerates storage
// rejections (extension-context invalidation) by treating them as an empty cache.
export async function getCachedFiles(): Promise<DriveFileMeta[]> {
  try {
    const value = (await chrome.storage.local.get(KEY))[KEY];
    return Array.isArray(value) ? (value as DriveFileMeta[]) : [];
  } catch {
    return [];
  }
}

export async function setCachedFiles(files: DriveFileMeta[]): Promise<void> {
  try {
    await chrome.storage.local.set({ [KEY]: files });
  } catch {
    // Best-effort cache; a failure just means no fast paint next reload.
  }
}

export async function clearCachedFiles(): Promise<void> {
  try {
    await chrome.storage.local.remove(KEY);
  } catch {
    // ignore
  }
}
