import { useEffect } from "react";
import {
  buildExcalidrawFile,
  ensureExcalidrawExtension,
  nextUntitledName,
  sceneHash,
} from "@/entities/diagram";
import { createAutosave } from "../lib/autosaveController";
import { bridge } from "../lib/bridge";
import { currentSceneHash, readScene } from "../lib/sceneBridge";
import { useActiveDiagramStore } from "./stores/activeDiagramStore";
import { useDiagramLibraryStore } from "./stores/diagramLibraryStore";

// Canonical hash of a blank scene (no elements, no app state, no files) —
// the baseline the auto-create watcher diffs against, so an untouched canvas
// never registers as dirty.
const EMPTY_SCENE_HASH = sceneHash(buildExcalidrawFile([], {}, {}));

// Auto-create: no active diagram, but the user started drawing anyway —
// silently promote the scene to a new Drive file once the change has been
// stable for the same debounce window as regular autosave. Once that
// succeeds, activeId flips non-null, this effect stops, and useAutosave takes
// over. No connection/reconcile guards — DiagramWatchers only mounts once
// App's gates say connected + reconciled.
export const useAutoCreate = (): void => {
  const activeId = useActiveDiagramStore((s) => s.activeId);

  useEffect(() => {
    if (activeId) return;
    const { onAutoCreate, onSaveStatusChange } = useActiveDiagramStore.getState();
    const autosave = createAutosave({
      getHash: () => currentSceneHash(bridge),
      save: async () => {
        const scene = await readScene(bridge);
        // Refresh the file list from Drive first — rather than trusting the
        // possibly-stale local snapshot — so a retry after a lost-response
        // partial success sees that file in the fresh list and picks the next
        // distinct name instead of colliding on an identical one. A throw
        // here (network, 401) aborts the tick and the controller retries.
        const files = await useDiagramLibraryStore.getState().refresh();
        const name = ensureExcalidrawExtension(nextUntitledName(files.map((f) => f.name)));
        await onAutoCreate(JSON.stringify(scene), name);
      },
      onStatus: onSaveStatusChange,
    });
    // No previously-saved baseline to diff against — seed with the canonical
    // empty-scene hash so a blank canvas stays "not dirty" forever, while any
    // real content hashes differently and gets picked up as dirty.
    autosave.markSaved(EMPTY_SCENE_HASH);
    autosave.start();
    return () => {
      // No flush() here: this watcher has never successfully saved anything
      // by the time cleanup runs, so there's no already-saved state to
      // protect.
      autosave.stop();
    };
  }, [activeId]);
};
