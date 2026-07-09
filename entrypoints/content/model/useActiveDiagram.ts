import { useEffect } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  buildExcalidrawFile,
  ensureExcalidrawExtension,
  nextUntitledName,
  sceneHash,
} from "@/entities/diagram";
import { createAutosave, SAVE_STATUS } from "../lib/autosaveController";
import { bridge } from "../lib/bridge";
import { currentSceneHash, readScene } from "../lib/sceneBridge";
import { useActiveDiagramStore } from "./stores/activeDiagramStore";
import { useAuthStore } from "./stores/authStore";
import { useDiagramLibraryStore } from "./stores/diagramLibraryStore";

// Canonical hash of a blank scene (no elements, no app state, no files) —
// the baseline the auto-create watcher diffs against, so an untouched canvas
// never registers as dirty.
const EMPTY_SCENE_HASH = sceneHash(buildExcalidrawFile([], {}, {}));

// Wires activeDiagramStore's session-aware loadInitial() to the connection
// status, and the autosave/auto-create watchers to whichever file is active
// — called once from useAppInit. Everything it produces lives in
// activeDiagramStore, read directly by whoever needs it (DiagramPanel,
// useSignOutFlow, ...).
export const useActiveDiagram = (): void => {
  const { activeId, isReconciled, onSaveStatusChange, onAutoCreate } = useActiveDiagramStore(
    useShallow((s) => ({
      activeId: s.activeId,
      isReconciled: s.isReconciled,
      onSaveStatusChange: s.onSaveStatusChange,
      onAutoCreate: s.onAutoCreate,
    })),
  );
  const isConnected = useAuthStore((s) => s.status.isConnected);
  const refresh = useDiagramLibraryStore((s) => s.refresh);

  // Kicks off the store's session-aware initial load once the connection
  // status resolves true — also fires again on a reconnect after an
  // involuntary logout (no reload happens there, so this is also what
  // refreshes the list). See activeDiagramStore's loadInitial for the
  // fresh-session vs navigation-reload branching.
  useEffect(() => {
    if (!isConnected) return;
    useActiveDiagramStore.getState().loadInitial();
  }, [isConnected]);

  // Autosave: only meaningful once a file is active.
  useEffect(() => {
    if (!activeId) return;
    const autosave = createAutosave({
      getHash: () => currentSceneHash(bridge),
      save: () => useActiveDiagramStore.getState().saveActiveScene(activeId),
      onStatus: (status) => {
        onSaveStatusChange(status);
        if (status === SAVE_STATUS.DELETED)
          useActiveDiagramStore.getState().onRemoteDeleted(activeId);
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
  }, [activeId, onSaveStatusChange]);

  // Auto-create: no active diagram yet, but the user started drawing anyway —
  // silently promote the current scene to a new Drive file once the change
  // has been stable for the same debounce window as regular autosave. Once
  // that succeeds, activeId flips non-null and the effect above takes over.
  useEffect(() => {
    if (activeId || !isConnected || !isReconciled) return;
    const autosave = createAutosave({
      getHash: () => currentSceneHash(bridge),
      save: async () => {
        const scene = await readScene(bridge);
        // Unlike drive/update (idempotent, guarded by revision), a failed
        // onAutoCreate leaves dirty state untouched, so createAutosave retries
        // drive/create on the next ~1s tick. Refresh the file list from Drive
        // first — rather than trusting the possibly-stale local snapshot — so
        // a retry after a lost-response partial success (Drive created the
        // file, but the response never arrived) sees that file in the fresh
        // list and picks the next distinct name instead of colliding on an
        // identical one.
        const files = await refresh();
        const name = ensureExcalidrawExtension(nextUntitledName(files.map((f) => f.name)));
        await onAutoCreate(JSON.stringify(scene), name);
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
      // Unlike the autosave effect above, no flush() here: this watcher has
      // never successfully saved anything by the time cleanup runs, so
      // there's no already-saved state to protect. Every trigger for this
      // cleanup (disconnect, sign-out, or activeId just going non-null on
      // success) makes a create either doomed or redundant.
      autosave.stop();
    };
  }, [activeId, isConnected, isReconciled, onSaveStatusChange, refresh, onAutoCreate]);
};
