import { type RefObject, useCallback, useState } from "react";
import { clearScene, readScene } from "@/features/sceneBridge";
import { clearActiveFile, clearCachedFiles } from "@/features/session";
import type { ConnectionStatus } from "@/shared/api";
import { REQUEST_TYPE, sendToBackground } from "@/shared/api";
import { bridge } from "../lib/bridge";

export type UseSignOutFlowParams = {
  activeId: string | null;
  revisionRef: RefObject<string | null>;
  onActiveIdChange: (id: string | null) => void;
  onStatusChange: (status: ConnectionStatus) => void;
  onActionErrorChange: (error: string | null) => void;
};

export type SignOutFlow = {
  signOutOpen: boolean;
  openSignOut: () => void;
  cancelSignOut: () => void;
  doSignOut: () => Promise<void>;
};

// Owns the sign-out confirmation dialog state and the safe sign-out sequence
// (flush the active diagram, clear local session state, clear the canvas).
export const useSignOutFlow = ({
  activeId,
  revisionRef,
  onActiveIdChange,
  onStatusChange,
  onActionErrorChange,
}: UseSignOutFlowParams): SignOutFlow => {
  const [signOutOpen, setSignOutOpen] = useState(false);

  const doSignOut = useCallback(async () => {
    setSignOutOpen(false);
    onActionErrorChange(null);
    // Flush the active file before clearing, per the safe sign-out contract.
    if (activeId) {
      try {
        const scene = await readScene(bridge);
        await sendToBackground({
          type: REQUEST_TYPE.DRIVE_UPDATE,
          id: activeId,
          content: JSON.stringify(scene),
          prevRevision: revisionRef.current ?? "",
        });
      } catch {
        // Best-effort flush; sign-out proceeds regardless.
      }
    }
    try {
      await sendToBackground({ type: REQUEST_TYPE.AUTH_SIGN_OUT });
      await clearActiveFile();
      await clearCachedFiles();
      onStatusChange({ connected: false });
      onActiveIdChange(null);
      await clearScene(bridge); // clears canvas + reloads
    } catch (e) {
      onActionErrorChange(e instanceof Error ? e.message : "Failed to sign out");
    }
  }, [activeId, revisionRef, onActiveIdChange, onStatusChange, onActionErrorChange]);

  const openSignOut = useCallback(() => setSignOutOpen(true), []);
  const cancelSignOut = useCallback(() => setSignOutOpen(false), []);

  return { signOutOpen, openSignOut, cancelSignOut, doSignOut };
};
