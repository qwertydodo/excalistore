// Trust boundary: the background worker only acts on messages from the
// extension's own popup page or a content script running on excalidraw.com.
const EXCALIDRAW_ORIGIN = "https://excalidraw.com/";

interface SenderLike {
  id?: string;
  url?: string;
}

interface SenderOpts {
  extensionId: string;
  popupUrl: string;
}

export function isAllowedSender(sender: SenderLike, opts: SenderOpts): boolean {
  if (sender.id !== opts.extensionId) return false;
  const url = sender.url ?? "";
  return url.startsWith(EXCALIDRAW_ORIGIN) || url.startsWith(opts.popupUrl);
}
