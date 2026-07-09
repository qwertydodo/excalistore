import { useCallback, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { bridge } from "../lib/bridge";
import { clearScene } from "../lib/sceneBridge";
import { useActiveDiagramStore } from "./stores/activeDiagramStore";
import { useAuthStore } from "./stores/authStore";
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
  const { activeId, onActivePointerChange, onActionErrorChange } = useActiveDiagramStore(
    useShallow((s) => ({
      activeId: s.activeId,
      onActivePointerChange: s.onActivePointerChange,
      onActionErrorChange: s.onActionErrorChange,
    })),
  );
  const signOut = useAuthStore((s) => s.signOut);
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
        await useActiveDiagramStore.getState().saveActiveScene(activeId);
      } catch {
        // Best-effort flush; sign-out proceeds regardless.
      }
    }
    try {
      await signOut();
      await clearActiveFile();
      await clearCachedFiles();
      clearFileListValidatedThisSession();
      onActivePointerChange(null, null);
      await clearScene(bridge); // clears canvas + reloads
    } catch (e) {
      onActionErrorChange(e instanceof Error ? e.message : "Failed to sign out");
    }
  }, [activeId, onActivePointerChange, signOut, onActionErrorChange]);

  const openSignOut = useCallback(() => setIsSignOutOpen(true), []);
  const cancelSignOut = useCallback(() => setIsSignOutOpen(false), []);

  return { isSignOutOpen, openSignOut, cancelSignOut, doSignOut };
};
