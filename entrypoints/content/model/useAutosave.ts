import { useEffect } from "react";
import { createAutosave, SAVE_STATUS } from "../lib/autosaveController";
import { bridge } from "../lib/bridge";
import { currentSceneHash } from "../lib/sceneBridge";
import { useActiveDiagramStore } from "./stores/activeDiagramStore";

// Wires the debounced autosave loop to whichever file is active; tears down
// (with a final flush) and rewires whenever the active file changes. No
// connection guard — DiagramWatchers' mount condition is the guard.
export const useAutosave = (): void => {
  const activeId = useActiveDiagramStore((s) => s.activeId);

  useEffect(() => {
    if (!activeId) return;
    const { saveActiveScene, onSaveStatusChange, onRemoteDeleted } =
      useActiveDiagramStore.getState();
    const autosave = createAutosave({
      getHash: () => currentSceneHash(bridge),
      save: () => saveActiveScene(activeId),
      onStatus: (status) => {
        onSaveStatusChange(status);
        if (status === SAVE_STATUS.DELETED) onRemoteDeleted(activeId);
      },
    });
    let isStopped = false;
    // Establish the saved baseline before the first tick can fire. A failed
    // hash read surfaces as an error badge instead of an unhandled rejection
    // (with autosave silently never starting).
    currentSceneHash(bridge)
      .then((h) => {
        if (isStopped) return;
        autosave.markSaved(h);
        autosave.start();
      })
      .catch(() => {
        if (!isStopped) onSaveStatusChange(SAVE_STATUS.ERROR);
      });
    return () => {
      isStopped = true;
      // flush() only rejects if the hash read fails (a failed save is already
      // classified to a status by the controller) — surface that too.
      autosave.flush().catch(() => onSaveStatusChange(SAVE_STATUS.ERROR));
      autosave.stop();
    };
  }, [activeId]);
};
