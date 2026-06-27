import { EXCALIDRAW_ORIGIN } from "@/shared/config";

// Trust boundary: the background worker only acts on messages from the
// extension's own popup page or a content script running on excalidraw.com.
// Trailing slash matters: without it, "https://excalidraw.com.evil.com/"
// would also pass startsWith.
const EXCALIDRAW_ORIGIN_PREFIX = `${EXCALIDRAW_ORIGIN}/`;

type SenderLike = {
  id?: string;
  url?: string;
};

type SenderOpts = {
  extensionId: string;
  popupUrl: string;
};

export const isAllowedSender = (sender: SenderLike, opts: SenderOpts): boolean => {
  if (sender.id !== opts.extensionId) return false;
  const url = sender.url ?? "";
  return url.startsWith(EXCALIDRAW_ORIGIN_PREFIX) || url.startsWith(opts.popupUrl);
};
