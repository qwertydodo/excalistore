import type { ConnectionStatus } from "@/shared/api";
import { Button } from "@/shared/ui";
import styles from "./PopupConnect.module.css";

interface Props {
  status: ConnectionStatus;
  onConnect: () => void;
  onSignOut: () => void;
}

export function PopupConnect({ status, onConnect, onSignOut }: Props) {
  return (
    <main className={styles.root}>
      <h1 className={styles.title}>Excalistore</h1>
      {status.connected ? (
        <>
          <p className={styles.folder}>
            Folder: <strong>{status.folderName ?? status.folderId}</strong>
          </p>
          <Button variant="secondary" onClick={onSignOut}>
            Sign out
          </Button>
        </>
      ) : (
        <Button onClick={onConnect}>Connect Google Drive</Button>
      )}
    </main>
  );
}
