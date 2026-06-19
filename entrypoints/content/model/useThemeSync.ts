import { useEffect } from "react";
import { readTheme } from "@/features/sceneBridge";
import { THEME_ATTR } from "@/shared/config";
import { bridge } from "../lib/bridge";

// Mirror Excalidraw's theme onto the shadow host.
export const useThemeSync = (host: HTMLElement): void => {
  useEffect(() => {
    const apply = () => host.setAttribute(THEME_ATTR, readTheme(bridge));
    apply();
    const id = setInterval(apply, 1000);
    return () => clearInterval(id);
  }, [host]);
};
