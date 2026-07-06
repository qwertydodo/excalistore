const KEY = "diagramSearchQuery";

// The panel's search query — persisted so it survives the writeScene→reload
// that opening a diagram triggers. Tolerates storage rejections (context
// invalidation), same as panelState.ts.
export const getDiagramSearchQuery = async (): Promise<string> => {
  try {
    return ((await chrome.storage.local.get(KEY))[KEY] as string | undefined) ?? "";
  } catch {
    return "";
  }
};

export const setDiagramSearchQuery = async (query: string): Promise<void> => {
  try {
    await chrome.storage.local.set({ [KEY]: query });
  } catch {
    // Best-effort; the panel just won't remember the query next reload.
  }
};
