import { useCallback, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { REQUEST_TYPE } from "@/features/driveGateway";
import { sendDriveRequest } from "../api";
import { bridge } from "../lib/bridge";
import { clearScene, readScene } from "../lib/sceneBridge";
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
        const scene = await readScene(bridge);
        // getState() here, not a reactive `revision` selector — doSignOut's
        // deps deliberately exclude revision (it changes on every autosave
        // tick, and including it would churn this callback's identity, which
        // is passed down as a prop). Reading fresh via getState() gets the
        // latest value without adding that dep.
        await sendDriveRequest({
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
