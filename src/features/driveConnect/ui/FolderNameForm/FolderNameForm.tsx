import { useState } from "react";
import { DEFAULT_DIAGRAM_FOLDER_NAME } from "@/shared/config/drive";
import { Button, Stack, Text, TextField } from "@/shared/ui";
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
    <Stack
      as="form"
      gap="2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!busy) onConnect(name.trim() || DEFAULT_DIAGRAM_FOLDER_NAME);
      }}
    >
      <Text as="label" size="sm" color="muted" htmlFor={id}>
        Folder name
      </Text>
      <TextField
        id={id}
        aria-label="Folder name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        disabled={busy}
      />
      <Text as="p" size="xs" color="muted" className={styles.hint}>
        The app creates this folder in your Drive (or reuses it).
      </Text>
      {error ? (
        <Text as="p" size="sm" color="accent-text" role="alert" className={styles.error}>
          {error}
        </Text>
      ) : null}
      <Button type="submit" disabled={busy}>
        {busy ? "Connecting…" : "Connect Google Drive"}
      </Button>
    </Stack>
  );
};
