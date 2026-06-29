import { useEffect, useState } from "react";
import { getPanelCollapsed, setPanelCollapsed } from "@/features/session";

type PanelVisibility = {
  isVisible: boolean;
  toggleVisibility: () => void;
};

// Owns the panel's visible/collapsed state — persisted across the
// writeScene→reload, independent of which diagram (if any) is active.
export const usePanelVisibility = (): PanelVisibility => {
  // Start collapsed: the persisted state loads async, so assuming "expanded"
  // would flash the full panel on every init (layout shift) before settling.
  // Collapsed-first means init only ever grows to the fab, never shrinks from
  // the full panel.
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    getPanelCollapsed().then((isCollapsed) => setIsVisible(!isCollapsed));
  }, []);

  const toggleVisibility = () => {
    setIsVisible((prev) => {
      const next = !prev;
      setPanelCollapsed(!next);
      return next;
    });
  };

  return { isVisible, toggleVisibility };
};
