import { FolderNameForm } from "@/features/driveConnect";
import type { ConnectionStatus } from "@/shared/api";
import { Button } from "@/shared/ui";
import styles from "./PopupConnect.module.css";

type Props = {
  status: ConnectionStatus;
  busy?: boolean;
  error?: string | null;
  onConnect: (folderName: string) => void;
  onSignOut: () => void;
};

export const PopupConnect = ({
  status,
  busy = false,
  error = null,
  onConnect,
  onSignOut,
}: Props) => {
  return (
    <main className={styles.root}>
      <h1 className={styles.title}>Excalistore</h1>
      {status.connected ? (
        <>
          <p className={styles.folder}>
            Folder: <strong>{status.folderName ?? status.folderId}</strong>
          </p>
          <Button variant="secondary" onClick={onSignOut} disabled={busy}>
            Sign out
          </Button>
        </>
      ) : (
        <FolderNameForm id="es-folder-name" busy={busy} error={error} onConnect={onConnect} />
      )}
    </main>
  );
};
