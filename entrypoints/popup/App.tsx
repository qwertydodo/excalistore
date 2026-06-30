import { useEffect, useState } from "react";
import type { ConnectionStatus } from "@/shared/api";
import { REQUEST_TYPE, sendToBackground } from "@/shared/api";
import { EXCALIDRAW_ORIGIN } from "@/shared/config/excalidraw";
import { PopupStatus } from "./ui/PopupStatus";

export const App = () => {
  const [status, setStatus] = useState<ConnectionStatus>({ isConnected: false });

  useEffect(() => {
    sendToBackground<ConnectionStatus>({ type: REQUEST_TYPE.AUTH_STATUS })
      .then((next) => setStatus(next))
      .catch(() => undefined);
  }, []);

  // Focus an existing excalidraw.com tab if one is open, else open a new one.
  // Covered by the existing host_permissions; not a Drive/auth call, so it may
  // run in the popup.
  const onOpenExcalidraw = async () => {
    try {
      const [tab] = await chrome.tabs.query({ url: `${EXCALIDRAW_ORIGIN}/*` });
      if (tab?.id != null) {
        await chrome.tabs.update(tab.id, { active: true });
        if (tab.windowId != null) await chrome.windows.update(tab.windowId, { focused: true });
        return;
      }
    } catch {
      // fall through to opening a fresh tab
    }
    await chrome.tabs.create({ url: `${EXCALIDRAW_ORIGIN}/` });
  };

  return <PopupStatus status={status} onOpenExcalidraw={onOpenExcalidraw} />;
};
