import { useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { Button, Dialog } from "@/shared/ui";
import { useDiagramLibraryStore } from "../../model/stores/diagramLibraryStore";
import { FolderNameForm } from "../FolderNameForm";

// In-page (Shadow DOM) disconnected control on excalidraw.com: a labeled
// "Connect Google Drive" button that opens a dialog with the folder-name form.
// On success, App swaps to DiagramPanel and this unmounts — no manual close.
// (Keyboard events are scoped to the plugin at the shadow-root container in
// index.tsx, so the form needs no per-root keydown/keyup guards.)
export const ConnectButton = () => {
  const { isBusy, error, onConnect } = useDiagramLibraryStore(
    useShallow((s) => ({ isBusy: s.isConnecting, error: s.connectError, onConnect: s.connect })),
  );
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const openDialog = () => setIsDialogOpen(true);
  const closeDialog = () => setIsDialogOpen(false);

  return (
    <>
      <Button variant="primary" icon="cloud" onClick={openDialog}>
        Connect Google Drive
      </Button>
      {isDialogOpen && (
        <Dialog title="Connect Google Drive" onClose={closeDialog}>
          <FolderNameForm
            id="es-connect-folder"
            isBusy={isBusy}
            error={error}
            onConnect={onConnect}
          />
        </Dialog>
      )}
    </>
  );
};
