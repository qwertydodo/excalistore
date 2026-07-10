import { create } from "zustand";
import { getPanelCollapsed, setPanelCollapsed } from "./sessionStore";

export type PanelVisibilityStore = {
  isVisible: boolean;
  isPanelReady: boolean;
  toggleVisibility: () => Promise<void>;
  show: () => Promise<void>;
  loadPanelVisibility: () => Promise<void>;
};

// Owns the panel's visible/collapsed state — persisted across the
// writeScene→reload, independent of which diagram (if any) is active. A
// store (not a hook-local useState) so useAppInit can gate the whole App's
// initial render on isPanelReady without DiagramPanel threading isVisible
// back up as a prop.
export const usePanelVisibilityStore = create<PanelVisibilityStore>((set, get) => ({
  isVisible: false,
  isPanelReady: false,
  loadPanelVisibility: async () => {
    const isCollapsed = await getPanelCollapsed();
    set({ isVisible: !isCollapsed, isPanelReady: true });
  },
  toggleVisibility: async () => {
    const next = !get().isVisible;
    set({ isVisible: next });
    await setPanelCollapsed(!next);
  },
  // Idempotent open, unlike toggleVisibility — used by useConnectDrive to
  // auto-open the panel on a successful connect, regardless of current state.
  show: async () => {
    set({ isVisible: true });
    await setPanelCollapsed(false);
  },
}));
