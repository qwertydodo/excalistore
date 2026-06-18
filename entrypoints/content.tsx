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
  const revisionRef = useRef<string | null>(null);

  // Mirror Excalidraw's theme onto the shadow host.
  useEffect(() => {
    const apply = () => host.setAttribute(THEME_ATTR, readTheme(bridge));
    apply();
    const id = setInterval(apply, 1000);
    return () => clearInterval(id);
  }, [host]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const list = await sendToBackground<DriveFileMeta[]>({ type: "drive/list" });
      setFiles(list);
    } catch (e) {
      if (e instanceof RequestError && e.code === "unauthorized") {
        setStatus({ connected: false });
      }
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
      if (active) {
        setActiveId(active.id);
        revisionRef.current = active.loadedRevision;
      }
      if (s.connected) await refresh();
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
    void currentSceneHash(bridge).then((h) => autosave.markSaved(h));
    autosave.start();
    return () => autosave.stop();
  }, [activeId]);

  const onOpen = useCallback(async (id: string) => {
    const { meta, content } = await sendToBackground<DiagramContent>({ type: "drive/get", id });
    const file = parseExcalidrawFile(content); // validates before write
    await setActiveFile({ id: meta.id, name: meta.name, loadedRevision: meta.headRevisionId });
    await writeScene(file, bridge); // reloads the tab
  }, []);

  const onCreate = useCallback(async (name: string) => {
    const fileName = name.endsWith(".excalidraw") ? name : `${name}.excalidraw`;
    const empty = buildExcalidrawFile([], { theme: readTheme(bridge) }, {});
    const meta = await sendToBackground<DriveFileMeta>({
      type: "drive/create",
      name: fileName,
      content: JSON.stringify(empty),
    });
    await setActiveFile({ id: meta.id, name: meta.name, loadedRevision: meta.headRevisionId });
    await writeScene(empty, bridge); // reloads
  }, []);

  const onRename = useCallback(
    async (id: string, name: string) => {
      const fileName = name.endsWith(".excalidraw") ? name : `${name}.excalidraw`;
      await sendToBackground<DriveFileMeta>({ type: "drive/rename", id, name: fileName });
      await refresh();
    },
    [refresh],
  );

  const doSignOut = useCallback(async () => {
    setSignOutOpen(false);
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
    await sendToBackground({ type: "auth/signOut" });
    await clearActiveFile();
    setStatus({ connected: false });
    setActiveId(null);
    await clearScene(bridge); // clears canvas + reloads
  }, [activeId]);

  if (!status.connected) {
    return (
      // Dynamic-value exception (see CLAUDE.md): this disconnected state has no
      // colocated CSS Module in the entrypoints/ app layer, and the rule needed
      // here (panel-like padding + system font) isn't worth a one-off module.
      <p style={{ padding: 12, font: "13px system-ui" }}>
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
