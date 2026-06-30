import { useState } from "react";
import { FolderNameForm } from "@/features/driveConnect";
import { Button, Dialog } from "@/shared/ui";

type Props = {
  isBusy?: boolean;
  error?: string | null;
  onConnect: (folderName: string) => void;
};

// In-page (Shadow DOM) disconnected control on excalidraw.com: a labeled
// "Connect Google Drive" button that opens a dialog with the folder-name form.
// On success, App swaps to DiagramPanel and this unmounts — no manual close.
// (Keyboard events are scoped to the plugin at the shadow-root container in
// index.tsx, so the form needs no per-root keydown/keyup guards.)
export const ConnectButton = ({ isBusy = false, error = null, onConnect }: Props) => {
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
