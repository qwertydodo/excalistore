import { type ActiveFile, isActiveFile } from "@/entities/diagram";

const KEY = "activeFile";

// The active-file pointer survives the writeScene→reload via chrome.storage.local.
export async function getActiveFile(): Promise<ActiveFile | null> {
  const value = (await chrome.storage.local.get(KEY))[KEY];
  return isActiveFile(value) ? value : null;
}

export async function setActiveFile(file: ActiveFile): Promise<void> {
  await chrome.storage.local.set({ [KEY]: file });
}

export async function clearActiveFile(): Promise<void> {
  await chrome.storage.local.remove(KEY);
}
