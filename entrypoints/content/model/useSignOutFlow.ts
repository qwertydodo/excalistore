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
    // Signal the auto-create watcher (useActiveDiagram) to skip its flush
    // once isConnected flips false below — set before anything else so it's
    // in place for the entire sequence, including the flush right after.
    useActiveDiagramStore.getState().onSigningOutChange(true);
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
      // isConnected flipping false below unmounts the auto-create watcher's
      // effect in useActiveDiagram; its cleanup checks the isSigningOut flag
      // set above and skips flush() explicitly, rather than relying on the
      // token revoke below happening first to make a stray create fail
      // harmlessly. clearScene reloads the tab on success (see below), which
      // resets isSigningOut naturally with the rest of in-memory state — the
      // catch block below resets it explicitly for the abort path instead.
      await sendToBackground({ type: REQUEST_TYPE.AUTH_SIGN_OUT });
      await clearActiveFile();
      await clearCachedFiles();
      clearFileListValidatedThisSession();
      onStatusChange({ isConnected: false });
      onActiveIdChange(null);
      await clearScene(bridge); // clears canvas + reloads
    } catch (e) {
      onActionErrorChange(e instanceof Error ? e.message : "Failed to sign out");
      // Sign-out aborted — resume normal auto-create behavior instead of
      // leaving the watcher permanently skipping its flush.
      useActiveDiagramStore.getState().onSigningOutChange(false);
    }
  }, [activeId, onActiveIdChange, onStatusChange, onActionErrorChange]);

  const openSignOut = useCallback(() => setIsSignOutOpen(true), []);
  const cancelSignOut = useCallback(() => setIsSignOutOpen(false), []);

  return { isSignOutOpen, openSignOut, cancelSignOut, doSignOut };
};
