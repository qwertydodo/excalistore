const KEY = "panelCollapsed";

// Whether the in-page panel is collapsed — persisted so the choice survives the
// writeScene→reload. Tolerates storage rejections (context invalidation).
export const getPanelCollapsed = async (): Promise<boolean> => {
  try {
    return (await chrome.storage.local.get(KEY))[KEY] === true;
  } catch {
    return false;
  }
};

export const setPanelCollapsed = async (collapsed: boolean): Promise<void> => {
  try {
    await chrome.storage.local.set({ [KEY]: collapsed });
  } catch {
    // Best-effort; the panel just won't remember the state next reload.
  }
};
