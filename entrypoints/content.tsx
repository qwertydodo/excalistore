import { StrictMode, useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { buildExcalidrawFile, parseExcalidrawFile } from "@/entities/diagram";
import { createAutosave, type SaveStatus } from "@/features/autosave";
import {
  clearScene,
  currentSceneHash,
  defaultSceneBridgeDeps,
  readScene,
  readTheme,
  writeScene,
} from "@/features/sceneBridge";
import {
  clearActiveFile,
  clearCachedFiles,
  getActiveFile,
  getCachedFiles,
  setActiveFile,
  setCachedFiles,
} from "@/features/session";
import type { ConnectionStatus, DiagramContent, DriveFileMeta } from "@/shared/api";
import { RequestError, sendToBackground } from "@/shared/api";
import { THEME_ATTR } from "@/shared/config";
import { ConfirmDialog } from "@/shared/ui";
import { ConnectCard } from "@/widgets/connectCard";
import { DiagramPanel } from "@/widgets/diagramPanel";
// Import the panel + dialog styles so WXT injects them into the shadow root.
import "@/shared/config/theme.css";

const bridge = defaultSceneBridgeDeps();

function PanelApp({ host }: { host: HTMLElement }) {
  const [status, setStatus] = useState<ConnectionStatus>({ connected: false });
  const [files, setFiles] = useState<DriveFileMeta[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [loading, setLoading] = useState(false);
  const [signOutOpen, setSignOutOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const revisionRef = useRef<string | null>(null);

  // Mirror Excalidraw's theme onto the shadow host.
  useEffect(() => {
    const apply = () => host.setAttribute(THEME_ATTR, readTheme(bridge));
    apply();
    const id = setInterval(apply, 1000);
    return () => clearInterval(id);
  }, [host]);

  const refresh = useCallback(async (): Promise<DriveFileMeta[]> => {
    setLoading(true);
    try {
      const list = await sendToBackground<DriveFileMeta[]>({ type: "drive/list" });
      setFiles(list);
      void setCachedFiles(list); // keep the fast-paint cache fresh
      return list;
    } catch (e) {
      if (e instanceof RequestError && e.code === "unauthorized") {
        setStatus({ connected: false });
      }
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load: connection status, file list, restore the active pointer.
  useEffect(() => {
    void (async () => {
      const s = await sendToBackground<ConnectionStatus>({ type: "auth/status" }).catch(
        () => ({ connected: false }) as ConnectionStatus,
      );
      setStatus(s);
      const active = await getActiveFile();
      // Paint the cached list immediately (no flicker after the reload), then
      // revalidate against Drive in the background.
      if (s.connected) {
        const cached = await getCachedFiles();
        if (cached.length) setFiles(cached);
      }
      const list = s.connected ? await refresh() : [];
      if (active && list.some((f) => f.id === active.id)) {
        setActiveId(active.id);
        revisionRef.current = active.loadedRevision;
      } else if (active) {
        // Stale pointer (different account/folder, or deleted) — drop it.
        await clearActiveFile();
      }
    })();
  }, [refresh]);

  // Autosave: only meaningful once a file is active.
  useEffect(() => {
    if (!activeId) return;
    const autosave = createAutosave({
      getHash: () => currentSceneHash(bridge),
      save: async () => {
        const scene = await readScene(bridge);
        const meta = await sendToBackground<DriveFileMeta>({
          type: "drive/update",
          id: activeId,
          content: JSON.stringify(scene),
          prevRevision: revisionRef.current ?? "",
        });
        revisionRef.current = meta.headRevisionId;
        await setActiveFile({ id: meta.id, name: meta.name, loadedRevision: meta.headRevisionId });
      },
      onStatus: setSaveStatus,
    });
    let stopped = false;
    // Establish the saved baseline before the first tick can fire.
    void currentSceneHash(bridge).then((h) => {
      if (stopped) return;
      autosave.markSaved(h);
      autosave.start();
    });
    return () => {
      stopped = true;
      void autosave.flush();
      autosave.stop();
    };
  }, [activeId]);

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
            type: "drive/update",
            id: activeId,
            content: JSON.stringify(current),
            prevRevision: revisionRef.current ?? "",
          });
          revisionRef.current = saved.headRevisionId;
        }
        const { meta, content } = await sendToBackground<DiagramContent>({ type: "drive/get", id });
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
      const fileName = name.endsWith(".excalidraw") ? name : `${name}.excalidraw`;
      const empty = buildExcalidrawFile([], { theme: readTheme(bridge) }, {});
      const meta = await sendToBackground<DriveFileMeta>({
        type: "drive/create",
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
        const fileName = name.endsWith(".excalidraw") ? name : `${name}.excalidraw`;
        const meta = await sendToBackground<DriveFileMeta>({
          type: "drive/rename",
          id,
          name: fileName,
        });
        // Patch the single row in place — no full re-fetch, so the list doesn't
        // blank to the loading spinner.
        const next = files.map((f) => (f.id === id ? meta : f));
        setFiles(next);
        void setCachedFiles(next);
      } catch (e) {
        setActionError(e instanceof Error ? e.message : "Failed to rename diagram");
      }
    },
    [files],
  );

  const doSignOut = useCallback(async () => {
    setSignOutOpen(false);
    setActionError(null);
    // Flush the active file before clearing, per the safe sign-out contract.
    if (activeId) {
      try {
        const scene = await readScene(bridge);
        await sendToBackground({
          type: "drive/update",
          id: activeId,
          content: JSON.stringify(scene),
          prevRevision: revisionRef.current ?? "",
        });
      } catch {
        // Best-effort flush; sign-out proceeds regardless.
      }
    }
    try {
      await sendToBackground({ type: "auth/signOut" });
      await clearActiveFile();
      await clearCachedFiles();
      setStatus({ connected: false });
      setActiveId(null);
      await clearScene(bridge); // clears canvas + reloads
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Failed to sign out");
    }
  }, [activeId]);

  const onConnect = useCallback(
    async (folderName: string) => {
      if (connecting) return;
      setConnecting(true);
      setConnectError(null);
      try {
        // Interactive sign-in + folder find/create run in the background gateway.
        const next = await sendToBackground<ConnectionStatus>({
          type: "drive/connect",
          folderName,
        });
        setStatus(next);
        if (next.connected) await refresh();
      } catch (e) {
        setConnectError(e instanceof Error ? e.message : "Could not connect to Google Drive");
      } finally {
        setConnecting(false);
      }
    },
    [connecting, refresh],
  );

  if (!status.connected) {
    return <ConnectCard busy={connecting} error={connectError} onConnect={onConnect} />;
  }

  return (
    <>
      <DiagramPanel
        files={files}
        activeId={activeId}
        saveStatus={saveStatus}
        loading={loading}
        error={actionError}
        onOpen={onOpen}
        onCreate={onCreate}
        onRename={onRename}
        onSignOut={() => setSignOutOpen(true)}
      />
      {signOutOpen && (
        <ConfirmDialog
          title="Sign out of Excalistore?"
          message="This saves the current diagram to Drive and clears the canvas. Continue?"
          confirmLabel="Save & sign out"
          danger
          onConfirm={doSignOut}
          onCancel={() => setSignOutOpen(false)}
        />
      )}
    </>
  );
}

export default defineContentScript({
  matches: ["https://excalidraw.com/*"],
  cssInjectionMode: "ui",
  async main(ctx) {
    const ui = await createShadowRootUi(ctx, {
      name: "excalistore-panel",
      position: "inline",
      anchor: "body",
      onMount(uiContainer, _shadow, shadowHost) {
        // Position the shadow host fixed in a corner; it also carries the
        // theme attr so `:host([data-theme="dark"])` rules in theme.css apply.
        shadowHost.style.position = "fixed";
        shadowHost.style.top = "64px";
        shadowHost.style.right = "16px";
        shadowHost.style.zIndex = "1000";
        const root = createRoot(uiContainer);
        root.render(
          <StrictMode>
            <PanelApp host={shadowHost} />
          </StrictMode>,
        );
        return root;
      },
      onRemove(root) {
        root?.unmount();
      },
    });
    ui.mount();
  },
});
