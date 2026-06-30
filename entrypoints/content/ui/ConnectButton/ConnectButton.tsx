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
// Keyboard events are stopped at the form root so typing the folder name
// doesn't trigger Excalidraw's tool shortcuts.
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
          {/* biome-ignore lint/a11y/noStaticElementInteractions: scopes Excalidraw hotkeys away from the form inputs. */}
          <div onKeyDown={(e) => e.stopPropagation()} onKeyUp={(e) => e.stopPropagation()}>
            <FolderNameForm
              id="es-connect-folder"
              isBusy={isBusy}
              error={error}
              onConnect={onConnect}
            />
          </div>
        </Dialog>
      )}
    </>
  );
};
