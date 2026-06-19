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
import { clearActiveFile, getActiveFile, setActiveFile } from "@/features/session";
import type { ConnectionStatus, DiagramContent, DriveFileMeta } from "@/shared/api";
import { RequestError, sendToBackground } from "@/shared/api";
import { THEME_ATTR } from "@/shared/config";
import { ConfirmDialog } from "@/shared/ui";
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

  const onOpen = useCallback(async (id: string) => {
    setActionError(null);
    try {
      const { meta, content } = await sendToBackground<DiagramContent>({ type: "drive/get", id });
      const file = parseExcalidrawFile(content); // validates before write
      await setActiveFile({ id: meta.id, name: meta.name, loadedRevision: meta.headRevisionId });
      await writeScene(file, bridge); // reloads the tab
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Failed to open diagram");
    }
  }, []);

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
        await sendToBackground<DriveFileMeta>({ type: "drive/rename", id, name: fileName });
        await refresh();
      } catch (e) {
        setActionError(e instanceof Error ? e.message : "Failed to rename diagram");
      }
    },
    [refresh],
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
      setStatus({ connected: false });
      setActiveId(null);
      await clearScene(bridge); // clears canvas + reloads
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Failed to sign out");
    }
  }, [activeId]);

  if (!status.connected) {
    return (
      <p className="es-disconnected">
        Excalistore: open the extension popup to connect Google Drive.
      </p>
    );
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
