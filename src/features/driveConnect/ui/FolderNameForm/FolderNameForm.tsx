import { useState } from "react";
import { DEFAULT_DIAGRAM_FOLDER_NAME } from "@/shared/config/drive";
import { Button, TextField } from "@/shared/ui";
import styles from "./FolderNameForm.module.css";

type Props = {
  id: string;
  busy?: boolean;
  error?: string | null;
  onConnect: (folderName: string) => void;
};

// Shared folder-name entry form used by ConnectCard (in-page) and
// PopupConnect (extension popup) to start a Drive connection.
export const FolderNameForm = ({ id, busy = false, error = null, onConnect }: Props) => {
  const [name, setName] = useState(DEFAULT_DIAGRAM_FOLDER_NAME);

  return (
    <form
      className={styles.form}
      onSubmit={(e) => {
        e.preventDefault();
        if (!busy) onConnect(name.trim() || DEFAULT_DIAGRAM_FOLDER_NAME);
      }}
    >
      <label className={styles.label} htmlFor={id}>
        Folder name
      </label>
      <TextField
        id={id}
        aria-label="Folder name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        disabled={busy}
      />
      <p className={styles.hint}>The app creates this folder in your Drive (or reuses it).</p>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={busy}>
        {busy ? "Connecting…" : "Connect Google Drive"}
      </Button>
    </form>
  );
};
