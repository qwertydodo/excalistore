import { create } from "zustand";
import {
  type ActiveFile,
  buildExcalidrawFile,
  ensureExcalidrawExtension,
  parseExcalidrawFile,
} from "@/entities/diagram";
import type { DiagramContent, DriveFile } from "@/entities/google/drive";
import { REQUEST_TYPE } from "@/features/driveGateway";
import { sendDriveRequest } from "../../api";
import { SAVE_STATUS, type SaveStatus } from "../../lib/autosaveController";
import { bridge } from "../../lib/bridge";
import { clearScene, readScene, readTheme, writeScene } from "../../lib/sceneBridge";
import { useDiagramLibraryStore } from "./diagramLibraryStore";
import {
  clearActiveFile,
  getActiveFile,
  getCachedFiles,
  isFirstSessionLoad,
  markSessionLoaded,
  setActiveFile,
} from "./sessionStore";

export type ActiveDiagramStore = {
  activeId: string | null;
  revision: string | null;
  saveStatus: SaveStatus;
  actionError: string | null;
  isListReady: boolean;
  isReconciled: boolean;
  isLoadInFlight: boolean;
  onActivePointerChange: (activeId: string | null, revision: string | null) => void;
  onSaveStatusChange: (status: SaveStatus) => void;
  onActionErrorChange: (error: string | null) => void;
  saveActiveScene: (id: string) => Promise<void>;
  loadInitial: () => Promise<void>;
  onOpen: (id: string) => Promise<void>;
  onCreate: (name: string) => Promise<void>;
  onAutoCreate: (content: string, name: string) => Promise<void>;
  onRename: (id: string, name: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onRemoteDeleted: (deletedId: string) => Promise<void>;
};

// Owns the active-file pointer, its save revision, and the CRUD action
// handlers (open/create/rename/delete) that all read/write that pointer —
// read directly by whoever needs it (DiagramPanel, useSignOutFlow, the
// autosave effect in useAutosave, ...) instead of threading it all
// through App.tsx as props.
export const useActiveDiagramStore = create<ActiveDiagramStore>((set, get) => ({
  activeId: null,
  revision: null,
  saveStatus: SAVE_STATUS.IDLE,
  actionError: null,
  isListReady: false,
  isReconciled: false,
  isLoadInFlight: false,
  onActivePointerChange: (activeId, revision) => set({ activeId, revision }),
  onSaveStatusChange: (status) => set({ saveStatus: status }),
  onActionErrorChange: (error) => set({ actionError: error }),
  // The one implementation of "write what's on the canvas to Drive file `id`
  // with the stored revision as the conflict guard" — used by onOpen's
  // pre-switch flush, the autosave loop, and sign-out's best-effort flush.
  // Throws on failure so each caller keeps its own error policy.
  saveActiveScene: async (id) => {
    const scene = await readScene(bridge);
    const meta = await sendDriveRequest<DriveFile>({
      type: REQUEST_TYPE.DRIVE_UPDATE,
      id,
      content: JSON.stringify(scene),
      prevRevision: get().revision ?? "",
    });
    set({ revision: meta.headRevisionId });
    await setActiveFile({ id: meta.id, name: meta.name, loadedRevision: meta.headRevisionId });
  },
  // One-shot startup reconciliation, kicked off by useInitialDiagramLoad when
  // isConnected flips true (and again on a reconnect after an involuntary
  // logout — no reload happens there, so this is also what refreshes the
  // list). Fresh tab session: the cache may be stale, so wait for Drive and
  // flip both flags together. Navigation reload (open/create/delete-of-
  // active/sign-out reloads; rename does NOT reload): paint the cache and let
  // the panel mount immediately, then reconcile against Drive in the
  // background. A failed refresh keeps the painted state and the pointer —
  // a network error must never drop the active pointer as "stale".
  loadInitial: async () => {
    if (get().isLoadInFlight) return;
    // Reset readiness on re-entry (a reconnect after an involuntary logout):
    // the flags from the previous connected stretch must not mount the panel/
    // watchers against state the new load hasn't confirmed yet.
    set({ isLoadInFlight: true, isListReady: false, isReconciled: false });
    try {
      const adoptAgainst = (active: ActiveFile, list: DriveFile[]): boolean => {
        if (!list.some((f) => f.id === active.id)) return false;
        set({ activeId: active.id, revision: active.loadedRevision });
        return true;
      };
      const dropPointer = async (): Promise<void> => {
        await clearActiveFile();
        set({ activeId: null, revision: null });
      };
      const active = await getActiveFile();
      const { refresh, setFiles } = useDiagramLibraryStore.getState();
      if (isFirstSessionLoad()) {
        try {
          const list = await refresh();
          markSessionLoaded();
          if (active && !adoptAgainst(active, list)) await dropPointer();
          set({ isListReady: true, isReconciled: true });
        } catch {
          // Offline first load: mount an empty panel; the session stays
          // "first load" so the next reload tries Drive again. isReconciled
          // stays false — Drive was never observed, so the watchers must not
          // arm (auto-create could fork a duplicate of the diagram the
          // retained pointer refers to).
          set({ isListReady: true });
        }
      } else {
        const cached = await getCachedFiles();
        if (cached.length) setFiles(cached);
        if (active) adoptAgainst(active, cached);
        set({ isListReady: true });
        try {
          const list = await refresh();
          if (active && !adoptAgainst(active, list)) await dropPointer();
        } catch {
          // Silent background revalidation failed — keep cache + pointer.
        }
        set({ isReconciled: true });
      }
    } finally {
      set({ isLoadInFlight: false });
    }
  },
  onOpen: async (id) => {
    const { activeId } = get();
    if (id === activeId) return; // already open
    set({ actionError: null });
    try {
      // Opening reloads the tab, so save the current diagram first — otherwise
      // unsaved edits since the last autosave tick are lost. A failed save
      // (e.g. conflict) aborts the switch so nothing is dropped silently.
      if (activeId) await get().saveActiveScene(activeId);
      const { meta, content } = await sendDriveRequest<DiagramContent>({
        type: REQUEST_TYPE.DRIVE_GET,
        id,
      });
      const file = parseExcalidrawFile(content); // validates before write
      await setActiveFile({ id: meta.id, name: meta.name, loadedRevision: meta.headRevisionId });
      await writeScene(file, bridge); // reloads the tab
    } catch (e) {
      set({ actionError: e instanceof Error ? e.message : "Failed to open diagram" });
    }
  },
  onCreate: async (name) => {
    set({ actionError: null });
    try {
      const fileName = ensureExcalidrawExtension(name);
      const empty = buildExcalidrawFile([], { theme: readTheme(bridge) }, {});
      const meta = await sendDriveRequest<DriveFile>({
        type: REQUEST_TYPE.DRIVE_CREATE,
        name: fileName,
        content: JSON.stringify(empty),
      });
      await setActiveFile({ id: meta.id, name: meta.name, loadedRevision: meta.headRevisionId });
      await writeScene(empty, bridge); // reloads
    } catch (e) {
      set({ actionError: e instanceof Error ? e.message : "Failed to create diagram" });
    }
  },
  onAutoCreate: async (content, name) => {
    set({ actionError: null });
    try {
      const meta = await sendDriveRequest<DriveFile>({
        type: REQUEST_TYPE.DRIVE_CREATE,
        name: ensureExcalidrawExtension(name),
        content,
      });
      await setActiveFile({ id: meta.id, name: meta.name, loadedRevision: meta.headRevisionId });
      set({ activeId: meta.id, revision: meta.headRevisionId });
      const { files, setFiles } = useDiagramLibraryStore.getState();
      const next = [meta, ...files];
      setFiles(next);
    } catch (e) {
      set({ actionError: e instanceof Error ? e.message : "Failed to create diagram" });
      throw e;
    }
  },
  onRename: async (id, name) => {
    set({ actionError: null });
    try {
      const fileName = ensureExcalidrawExtension(name);
      const meta = await sendDriveRequest<DriveFile>({
        type: REQUEST_TYPE.DRIVE_RENAME,
        id,
        name: fileName,
      });
      // Patch the single row in place — no full re-fetch, so the list never
      // blanks out while the rename resolves.
      const { files, setFiles } = useDiagramLibraryStore.getState();
      const next = files.map((f) => (f.id === id ? meta : f));
      setFiles(next);
    } catch (e) {
      set({ actionError: e instanceof Error ? e.message : "Failed to rename diagram" });
    }
  },
  onDelete: async (id) => {
    set({ actionError: null });
    try {
      await sendDriveRequest<null>({ type: REQUEST_TYPE.DRIVE_TRASH, id });
      if (id === get().activeId) {
        await clearActiveFile();
        await clearScene(bridge); // wipes localStorage + IndexedDB, then reloads tab
      } else {
        const { files, setFiles } = useDiagramLibraryStore.getState();
        const next = files.filter((f) => f.id !== id);
        setFiles(next);
      }
    } catch (e) {
      set({ actionError: e instanceof Error ? e.message : "Failed to delete diagram" });
    }
  },
  // The active file was confirmed gone from Drive (autosave got a 404) — drop
  // the local pointer and the stale row so the panel stops highlighting/
  // re-attempting saves against a diagram that no longer exists.
  onRemoteDeleted: async (deletedId) => {
    // A late DELETED status (e.g. a slow cleanup flush from a previous
    // autosave instance) may land after another file became active — only
    // clear the pointer if it still refers to the deleted file.
    if (get().activeId === deletedId) {
      await clearActiveFile();
      set({ activeId: null, revision: null });
    }
    const { files, setFiles } = useDiagramLibraryStore.getState();
    setFiles(files.filter((f) => f.id !== deletedId));
  },
}));
