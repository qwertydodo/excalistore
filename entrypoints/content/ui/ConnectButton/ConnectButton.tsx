import { useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { Button, Dialog } from "@/shared/ui";
import { useAuthStore } from "../../model/stores/authStore";
import { useConnectDrive } from "../../model/useConnectDrive";
import { FolderNameForm } from "../FolderNameForm";

// In-page (Shadow DOM) disconnected control on excalidraw.com: a labeled
// "Connect Google Drive" button that opens a dialog with the folder-name form.
// On success, App swaps to DiagramPanel and this unmounts — no manual close.
// (Keyboard events are scoped to the plugin at the shadow-root container in
// index.tsx, so the form needs no per-root keydown/keyup guards.)
export const ConnectButton = () => {
  const { isLoading, error } = useAuthStore(
    useShallow((s) => ({ isLoading: s.isConnecting, error: s.connectError })),
  );
  const { onConnect } = useConnectDrive();
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
            isLoading={isLoading}
            error={error}
            onConnect={onConnect}
          />
        </Dialog>
      )}
    </>
  );
};
