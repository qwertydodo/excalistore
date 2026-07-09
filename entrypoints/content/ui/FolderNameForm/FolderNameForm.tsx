import { useState } from "react";
import { DEFAULT_DIAGRAM_FOLDER_NAME } from "@/shared/config";
import { Button, Stack, Text, TextField } from "@/shared/ui";
import styles from "./FolderNameForm.module.css";

type FolderNameFormProps = {
  id: string;
  isLoading?: boolean;
  error?: string | null;
  onConnect: (folderName: string) => void;
};

// Folder-name entry form used by the in-page ConnectButton dialog to start a
// Drive connection.
export const FolderNameForm = ({
  id,
  isLoading = false,
  error = null,
  onConnect,
}: FolderNameFormProps) => {
  const [name, setName] = useState(DEFAULT_DIAGRAM_FOLDER_NAME);

  return (
    <Stack
      as="form"
      gap="3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!isLoading) onConnect(name.trim() || DEFAULT_DIAGRAM_FOLDER_NAME);
      }}
    >
      <Stack gap="1">
        <Text as="label" size="sm" color="muted" htmlFor={id}>
          Folder name
        </Text>
        <TextField
          id={id}
          name="folderName"
          aria-label="Folder name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={isLoading}
        />
        <Text as="p" size="xs" color="muted" className={styles.hint}>
          The app creates this folder in your Drive (or reuses it).
        </Text>
      </Stack>
      {error ? (
        <Text as="p" size="sm" color="accent-text" role="alert" className={styles.error}>
          {error}
        </Text>
      ) : null}
      <Button type="submit" disabled={isLoading}>
        {isLoading ? "Connecting…" : "Connect Google Drive"}
      </Button>
    </Stack>
  );
};
