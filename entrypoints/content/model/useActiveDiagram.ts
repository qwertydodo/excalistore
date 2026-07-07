import { useEffect } from "react";
import type { DriveFile } from "@/entities/google/drive";
import type { ConnectionStatus } from "@/features/driveGateway";
import { REQUEST_TYPE, sendToBackground } from "@/features/driveGateway";
import { createAutosave } from "../lib/autosaveController";
import { bridge } from "../lib/bridge";
import { currentSceneHash, readScene } from "../lib/sceneBridge";
import { useActiveDiagramStore } from "./stores/activeDiagramStore";
import { useDiagramLibraryStore } from "./stores/diagramLibraryStore";
import {
  clearActiveFile,
  getActiveFile,
  getCachedFiles,
  setActiveFile,
} from "./stores/sessionStore";

// Kicks off the initial load (connection status, file list, restore the
// active pointer) and wires the autosave loop to whichever file is active —
// called once from App. Everything it produces lives in activeDiagramStore,
// read directly by whoever needs it (DiagramPanel, useSignOutFlow, ...).
export const useActiveDiagram = (): void => {
  const activeId = useActiveDiagramStore((s) => s.activeId);
  const onActiveIdChange = useActiveDiagramStore((s) => s.onActiveIdChange);
  const onRevisionChange = useActiveDiagramStore((s) => s.onRevisionChange);
  const onSaveStatusChange = useActiveDiagramStore((s) => s.onSaveStatusChange);

  // Initial load: connection status, file list, restore the active pointer.
  useEffect(() => {
    const loadInitial = async () => {
      const { onStatusChange, onFilesChange, refresh } = useDiagramLibraryStore.getState();
      const s = await sendToBackground<ConnectionStatus>({ type: REQUEST_TYPE.AUTH_STATUS }).catch(
        () => ({ isConnected: false }) as ConnectionStatus,
      );
      onStatusChange(s);
      const active = await getActiveFile();
      // Paint the cached list immediately (no flicker after the reload), then
      // revalidate against Drive in the background.
      if (s.isConnected) {
        const cached = await getCachedFiles();
        if (cached.length) onFilesChange(cached);
      }
      const list = s.isConnected ? await refresh() : [];
      if (active && list.some((f) => f.id === active.id)) {
        onActiveIdChange(active.id);
        onRevisionChange(active.loadedRevision);
      } else if (active) {
        // Stale pointer (different account/folder, or deleted) — drop it.
        await clearActiveFile();
      }
    };
    loadInitial();
  }, [onActiveIdChange, onRevisionChange]);

  // Autosave: only meaningful once a file is active.
  useEffect(() => {
    if (!activeId) return;
    const autosave = createAutosave({
      getHash: () => currentSceneHash(bridge),
      save: async () => {
        const scene = await readScene(bridge);
        const meta = await sendToBackground<DriveFile>({
          type: REQUEST_TYPE.DRIVE_UPDATE,
          id: activeId,
          content: JSON.stringify(scene),
          prevRevision: useActiveDiagramStore.getState().revision ?? "",
        });
        onRevisionChange(meta.headRevisionId);
        await setActiveFile({ id: meta.id, name: meta.name, loadedRevision: meta.headRevisionId });
      },
      onStatus: onSaveStatusChange,
    });
    let isStopped = false;
    // Establish the saved baseline before the first tick can fire.
    currentSceneHash(bridge).then((h) => {
      if (isStopped) return;
      autosave.markSaved(h);
      autosave.start();
    });
    return () => {
      isStopped = true;
      autosave.flush();
      autosave.stop();
    };
  }, [activeId, onSaveStatusChange, onRevisionChange]);
};
