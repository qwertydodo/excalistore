import { useCallback, useState } from "react";
import { clearScene, readScene } from "@/features/sceneBridge";
import { clearActiveFile, clearCachedFiles } from "@/features/session";
import { REQUEST_TYPE, sendToBackground } from "@/shared/api";
import { bridge } from "../lib/bridge";
import type { ActiveDiagram } from "./useActiveDiagram";
import type { DiagramLibrary } from "./useDiagramLibrary";

export type UseSignOutFlowParams = Pick<
  ActiveDiagram,
  "activeId" | "revisionRef" | "onActiveIdChange" | "onActionErrorChange"
> &
  Pick<DiagramLibrary, "onStatusChange">;

export type SignOutFlow = {
  isSignOutOpen: boolean;
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

  const openSignOut = useCallback(() => setIsSignOutOpen(true), []);
  const cancelSignOut = useCallback(() => setIsSignOutOpen(false), []);

  return { isSignOutOpen, openSignOut, cancelSignOut, doSignOut };
};
