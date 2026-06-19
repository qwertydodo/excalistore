import { useEffect, useState } from "react";
import { getPanelCollapsed, setPanelCollapsed } from "@/features/session";

type PanelVisibility = {
  isVisible: boolean;
  toggleVisibility: () => void;
};

// Owns the panel's visible/collapsed state — persisted across the
// writeScene→reload, independent of which diagram (if any) is active.
export const usePanelVisibility = (): PanelVisibility => {
  const [isVisible, setIsVisible] = useState(true);

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
