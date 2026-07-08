import { useEffect, useState } from "react";
import {
  buildExcalidrawFile,
  ensureExcalidrawExtension,
  nextUntitledName,
  sceneHash,
} from "@/entities/diagram";
import type { DriveFile } from "@/entities/google/drive";
import type { ConnectionStatus } from "@/features/driveGateway";
import { REQUEST_TYPE, sendToBackground } from "@/features/driveGateway";
import { createAutosave, SAVE_STATUS } from "../lib/autosaveController";
import { bridge } from "../lib/bridge";
import { currentSceneHash, readScene } from "../lib/sceneBridge";
import { useActiveDiagramStore } from "./stores/activeDiagramStore";
import { useDiagramLibraryStore } from "./stores/diagramLibraryStore";
import {
  clearActiveFile,
  getActiveFile,
  getCachedFiles,
  setActiveFile,
  setCachedFiles,
} from "./stores/sessionStore";

// Canonical hash of a blank scene (no elements, no app state, no files) —
// the baseline the auto-create watcher diffs against, so an untouched canvas
// never registers as dirty.
const EMPTY_SCENE_HASH = sceneHash(buildExcalidrawFile([], {}, {}));

// The active file was confirmed gone from Drive (autosave got a 404) — drop
// the local pointer and the stale row so the panel stops highlighting/
// re-attempting saves against a diagram that no longer exists. Reads/writes
// both stores directly via getState() (not hook-scoped) so it's callable
// from anywhere, including standalone in tests.
export const handleRemoteDeletion = async (deletedId: string): Promise<void> => {
  await clearActiveFile();
  useActiveDiagramStore.getState().onActiveIdChange(null);
  useActiveDiagramStore.getState().onRevisionChange(null);
  const { files, onFilesChange } = useDiagramLibraryStore.getState();
  const next = files.filter((f) => f.id !== deletedId);
  onFilesChange(next);
  setCachedFiles(next);
};

// Kicks off the initial load (connection status, file list, restore the
// active pointer) and wires the autosave loop to whichever file is active —
// called once from App. Everything it produces lives in activeDiagramStore,
// read directly by whoever needs it (DiagramPanel, useSignOutFlow, ...).
export const useActiveDiagram = (): void => {
  const activeId = useActiveDiagramStore((s) => s.activeId);
  const onActiveIdChange = useActiveDiagramStore((s) => s.onActiveIdChange);
  const onRevisionChange = useActiveDiagramStore((s) => s.onRevisionChange);
  const onSaveStatusChange = useActiveDiagramStore((s) => s.onSaveStatusChange);
  const isConnected = useDiagramLibraryStore((s) => s.status.isConnected);
  // Guards the auto-create watcher below from racing the stale-pointer
  // reconciliation in the effect right after this one: isConnected can flip
  // true well before that reconciliation (and the active-pointer adoption it
  // does) has actually finished.
  const [isInitialLoadComplete, setIsInitialLoadComplete] = useState(false);

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
      let cached: DriveFile[] = [];
      if (s.isConnected) {
        cached = await getCachedFiles();
        if (cached.length) onFilesChange(cached);
      }
      // Adopt the active pointer against the cached list right away too —
      // otherwise the row highlight lags behind the network refresh below,
      // even though the list itself already painted from cache.
      if (active && cached.some((f) => f.id === active.id)) {
        onActiveIdChange(active.id);
        onRevisionChange(active.loadedRevision);
      }
      const list = s.isConnected ? await refresh() : [];
      if (active && list.some((f) => f.id === active.id)) {
        onActiveIdChange(active.id);
        onRevisionChange(active.loadedRevision);
      } else if (active) {
        // Stale pointer (different account/folder, or deleted) — drop it.
        await clearActiveFile();
        onActiveIdChange(null);
        onRevisionChange(null);
      }
      setIsInitialLoadComplete(true);
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
      onStatus: (status) => {
        onSaveStatusChange(status);
        if (status === SAVE_STATUS.DELETED) handleRemoteDeletion(activeId);
      },
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

  // Auto-create: no active diagram yet, but the user started drawing anyway —
  // silently promote the current scene to a new Drive file once the change
  // has been stable for the same debounce window as regular autosave. Once
  // that succeeds, activeId flips non-null and the effect above takes over.
  useEffect(() => {
    if (activeId || !isConnected || !isInitialLoadComplete) return;
    const autosave = createAutosave({
      getHash: () => currentSceneHash(bridge),
      save: async () => {
        const scene = await readScene(bridge);
        const { files } = useDiagramLibraryStore.getState();
        const name = ensureExcalidrawExtension(nextUntitledName(files.map((f) => f.name)));
        await useActiveDiagramStore.getState().onAutoCreate(JSON.stringify(scene), name);
      },
      onStatus: onSaveStatusChange,
    });
    // Unlike the autosave effect above, there's no previously-saved baseline
    // to diff against here — nothing has been written to Drive for this
    // scene yet. Seed against the canonical empty-scene hash rather than
    // snapshotting whatever's already on the canvas as "saved": a blank
    // canvas hashes identically to EMPTY_SCENE_HASH and correctly stays
    // "not dirty" forever, while any real content — drawn before the watcher
    // could mount (e.g. while the initial load was still reconciling) or
    // after — hashes differently and gets picked up as dirty.
    autosave.markSaved(EMPTY_SCENE_HASH);
    autosave.start();
    return () => {
      autosave.flush();
      autosave.stop();
    };
  }, [activeId, isConnected, isInitialLoadComplete, onSaveStatusChange]);
};
