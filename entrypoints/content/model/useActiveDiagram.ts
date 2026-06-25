import { type RefObject, useCallback, useEffect, useRef, useState } from "react";
import {
  buildExcalidrawFile,
  ensureExcalidrawExtension,
  parseExcalidrawFile,
} from "@/entities/diagram";
import { createAutosave, SAVE_STATUS, type SaveStatus } from "@/features/autosave";
import { currentSceneHash, readScene, readTheme, writeScene } from "@/features/sceneBridge";
import {
  clearActiveFile,
  getActiveFile,
  getCachedFiles,
  setActiveFile,
  setCachedFiles,
} from "@/features/session";
import type { ConnectionStatus, DiagramContent, DriveFileMeta } from "@/shared/api";
import { REQUEST_TYPE, sendToBackground } from "@/shared/api";
import { bridge } from "../lib/bridge";
import type { DiagramLibrary } from "./useDiagramLibrary";

export type UseActiveDiagramParams = Pick<
  DiagramLibrary,
  "onStatusChange" | "files" | "onFilesChange" | "refresh"
>;

export type ActiveDiagram = {
  activeId: string | null;
  onActiveIdChange: (id: string | null) => void;
  revisionRef: RefObject<string | null>;
  saveStatus: SaveStatus;
  actionError: string | null;
  onActionErrorChange: (error: string | null) => void;
  onOpen: (id: string) => Promise<void>;
  onCreate: (name: string) => Promise<void>;
  onRename: (id: string, name: string) => Promise<void>;
};

// Owns the active-file pointer, its autosave wiring, and the CRUD action
// handlers (open/create/rename) that all read/write that pointer.
export const useActiveDiagram = ({
  onStatusChange,
  files,
  onFilesChange,
  refresh,
}: UseActiveDiagramParams): ActiveDiagram => {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>(SAVE_STATUS.IDLE);
  const [actionError, setActionError] = useState<string | null>(null);
  const revisionRef = useRef<string | null>(null);

  // useCallback on all three below (not compiler-memoized — onOpen/onCreate/
  // onRename further down all contain a ternary inside a catch, which bails
  // the compiler for this whole hook; see "Known gap" in
  // docs/development.md). onSaveStatusChange specifically is read by the
  // autosave effect's deps just below, so it must stay stable; the other two
  // are passed down as props, where an unstable identity just churns child
  // re-renders.
  const onActiveIdChange = useCallback((id: string | null) => setActiveId(id), []);
  const onActionErrorChange = useCallback((error: string | null) => setActionError(error), []);
  const onSaveStatusChange = useCallback((status: SaveStatus) => setSaveStatus(status), []);

  // Initial load: connection status, file list, restore the active pointer.
  useEffect(() => {
    const loadInitial = async () => {
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
        setActiveId(active.id);
        revisionRef.current = active.loadedRevision;
      } else if (active) {
        // Stale pointer (different account/folder, or deleted) — drop it.
        await clearActiveFile();
      }
    };
    loadInitial();
  }, [refresh, onFilesChange, onStatusChange]);

  // Autosave: only meaningful once a file is active.
  useEffect(() => {
    if (!activeId) return;
    const autosave = createAutosave({
      getHash: () => currentSceneHash(bridge),
      save: async () => {
        const scene = await readScene(bridge);
        const meta = await sendToBackground<DriveFileMeta>({
          type: REQUEST_TYPE.DRIVE_UPDATE,
          id: activeId,
          content: JSON.stringify(scene),
          prevRevision: revisionRef.current ?? "",
        });
        revisionRef.current = meta.headRevisionId;
        await setActiveFile({ id: meta.id, name: meta.name, loadedRevision: meta.headRevisionId });
      },
      onStatus: onSaveStatusChange,
    });
    let stopped = false;
    // Establish the saved baseline before the first tick can fire.
    currentSceneHash(bridge).then((h) => {
      if (stopped) return;
      autosave.markSaved(h);
      autosave.start();
    });
    return () => {
      stopped = true;
      autosave.flush();
      autosave.stop();
    };
  }, [activeId, onSaveStatusChange]);

  const onOpen = useCallback(
    async (id: string) => {
      if (id === activeId) return; // already open
      setActionError(null);
      try {
        // Opening reloads the tab, so save the current diagram first — otherwise
        // unsaved edits since the last autosave tick are lost. A failed save
        // (e.g. conflict) aborts the switch so nothing is dropped silently.
        if (activeId) {
          const current = await readScene(bridge);
          const saved = await sendToBackground<DriveFileMeta>({
            type: REQUEST_TYPE.DRIVE_UPDATE,
            id: activeId,
            content: JSON.stringify(current),
            prevRevision: revisionRef.current ?? "",
          });
          revisionRef.current = saved.headRevisionId;
        }
        const { meta, content } = await sendToBackground<DiagramContent>({
          type: REQUEST_TYPE.DRIVE_GET,
          id,
        });
        const file = parseExcalidrawFile(content); // validates before write
        await setActiveFile({ id: meta.id, name: meta.name, loadedRevision: meta.headRevisionId });
        await writeScene(file, bridge); // reloads the tab
      } catch (e) {
        setActionError(e instanceof Error ? e.message : "Failed to open diagram");
      }
    },
    [activeId],
  );

  const onCreate = useCallback(async (name: string) => {
    setActionError(null);
    try {
      const fileName = ensureExcalidrawExtension(name);
      const empty = buildExcalidrawFile([], { theme: readTheme(bridge) }, {});
      const meta = await sendToBackground<DriveFileMeta>({
        type: REQUEST_TYPE.DRIVE_CREATE,
        name: fileName,
        content: JSON.stringify(empty),
      });
      await setActiveFile({ id: meta.id, name: meta.name, loadedRevision: meta.headRevisionId });
      await writeScene(empty, bridge); // reloads
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Failed to create diagram");
    }
  }, []);

  const onRename = useCallback(
    async (id: string, name: string) => {
      setActionError(null);
      try {
        const fileName = ensureExcalidrawExtension(name);
        const meta = await sendToBackground<DriveFileMeta>({
          type: REQUEST_TYPE.DRIVE_RENAME,
          id,
          name: fileName,
        });
        // Patch the single row in place — no full re-fetch, so the list doesn't
        // blank to the loading spinner.
        const next = files.map((f) => (f.id === id ? meta : f));
        onFilesChange(next);
        setCachedFiles(next);
      } catch (e) {
        setActionError(e instanceof Error ? e.message : "Failed to rename diagram");
      }
    },
    [files, onFilesChange],
  );

  return {
    activeId,
    onActiveIdChange,
    revisionRef,
    saveStatus,
    actionError,
    onActionErrorChange,
    onOpen,
    onCreate,
    onRename,
  };
};
