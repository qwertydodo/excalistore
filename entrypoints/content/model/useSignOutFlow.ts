import { useCallback, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { REQUEST_TYPE, sendToBackground } from "@/features/driveGateway";
import { bridge } from "../lib/bridge";
import { clearScene, readScene } from "../lib/sceneBridge";
import { useActiveDiagramStore } from "./stores/activeDiagramStore";
import { useDiagramLibraryStore } from "./stores/diagramLibraryStore";
import {
  clearActiveFile,
  clearCachedFiles,
  clearFileListValidatedThisSession,
} from "./stores/sessionStore";

export type SignOutFlow = {
  isSignOutOpen: boolean;
  openSignOut: () => void;
  cancelSignOut: () => void;
  doSignOut: () => Promise<void>;
};

// Owns the sign-out confirmation dialog state and the safe sign-out sequence
// (flush the active diagram, clear local session state, clear the canvas).
export const useSignOutFlow = (): SignOutFlow => {
  const { activeId, onActiveIdChange, onActionErrorChange } = useActiveDiagramStore(
    useShallow((s) => ({
      activeId: s.activeId,
      onActiveIdChange: s.onActiveIdChange,
      onActionErrorChange: s.onActionErrorChange,
    })),
  );
  const onStatusChange = useDiagramLibraryStore((s) => s.onStatusChange);
  const [isSignOutOpen, setIsSignOutOpen] = useState(false);

  // useCallback (not compiler-memoized — the ternary inside the outer catch
  // below bails the compiler, see "Known gap" in docs/development.md):
  // doSignOut is passed down as a prop, so an unstable identity churns child
  // re-renders every render of this hook.
  const doSignOut = useCallback(async () => {
    setIsSignOutOpen(false);
    onActionErrorChange(null);
    // Flush the active file before clearing, per the safe sign-out contract.
    if (activeId) {
      try {
        const scene = await readScene(bridge);
        await sendToBackground({
          type: REQUEST_TYPE.DRIVE_UPDATE,
          id: activeId,
          content: JSON.stringify(scene),
          prevRevision: useActiveDiagramStore.getState().revision ?? "",
        });
      } catch {
        // Best-effort flush; sign-out proceeds regardless.
      }
    }
    try {
      await sendToBackground({ type: REQUEST_TYPE.AUTH_SIGN_OUT });
      await clearActiveFile();
      await clearCachedFiles();
      clearFileListValidatedThisSession();
      onStatusChange({ isConnected: false });
      onActiveIdChange(null);
      await clearScene(bridge); // clears canvas + reloads
    } catch (e) {
      onActionErrorChange(e instanceof Error ? e.message : "Failed to sign out");
    }
  }, [activeId, onActiveIdChange, onStatusChange, onActionErrorChange]);

  const openSignOut = useCallback(() => setIsSignOutOpen(true), []);
  const cancelSignOut = useCallback(() => setIsSignOutOpen(false), []);

  return { isSignOutOpen, openSignOut, cancelSignOut, doSignOut };
};
