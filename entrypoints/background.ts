import { handleMessage, isAllowedSender } from "@/features/driveGateway";
import type { Request } from "@/shared/api";

export default defineBackground(() => {
  const popupUrl = chrome.runtime.getURL("popup.html");
  chrome.runtime.onMessage.addListener((req: Request, sender, sendResponse) => {
    if (!isAllowedSender(sender, { extensionId: chrome.runtime.id, popupUrl })) {
      sendResponse({ ok: false, error: "forbidden sender", code: "unknown" });
      return false;
    }
    handleMessage(req)
      .then(sendResponse)
      .catch((e: unknown) =>
        sendResponse({ ok: false, error: (e as Error).message, code: "unknown" }),
      );
    return true;
  });
});
