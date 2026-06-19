import { useState } from "react";
import type { ConnectionStatus } from "@/shared/api";
import { DEFAULT_DIAGRAM_FOLDER_NAME } from "@/shared/config/drive";
import { Button, TextField } from "@/shared/ui";
import styles from "./PopupConnect.module.css";

interface Props {
  status: ConnectionStatus;
  busy?: boolean;
  error?: string | null;
  onConnect: (folderName: string) => void;
  onSignOut: () => void;
}

export function PopupConnect({ status, busy = false, error = null, onConnect, onSignOut }: Props) {
  const [name, setName] = useState(DEFAULT_DIAGRAM_FOLDER_NAME);

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
        <form
          className={styles.connectForm}
          onSubmit={(e) => {
            e.preventDefault();
            onConnect(name.trim() || DEFAULT_DIAGRAM_FOLDER_NAME);
          }}
        >
          <label className={styles.label} htmlFor="es-folder-name">
            Folder name
          </label>
          <TextField
            id="es-folder-name"
            aria-label="Folder name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <p className={styles.hint}>The app creates this folder in your Drive (or reuses it).</p>
          <Button type="submit" disabled={busy}>
            {busy ? "Connecting…" : "Connect Google Drive"}
          </Button>
        </form>
      )}
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </main>
  );
}
