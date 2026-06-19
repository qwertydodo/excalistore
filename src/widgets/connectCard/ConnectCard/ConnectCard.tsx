import { useState } from "react";
import { Button, TextField } from "@/shared/ui";
import styles from "./ConnectCard.module.css";

interface Props {
  busy?: boolean;
  error?: string | null;
  onConnect: (folderName: string) => void;
}

const DEFAULT_FOLDER = "Excalidraw Diagrams";

// In-page (Shadow DOM) connect card shown on excalidraw.com before a folder is
// connected. Keyboard events are stopped at the root so typing the folder name
// doesn't trigger Excalidraw's tool shortcuts.
export function ConnectCard({ busy = false, error = null, onConnect }: Props) {
  const [name, setName] = useState(DEFAULT_FOLDER);

  return (
    <section
      className={styles.root}
      aria-label="Connect Excalistore"
      onKeyDown={(e) => e.stopPropagation()}
      onKeyUp={(e) => e.stopPropagation()}
    >
      <h2 className={styles.title}>Excalistore</h2>
      <p className={styles.lead}>Save your diagrams to Google Drive.</p>
      <form
        className={styles.form}
        onSubmit={(e) => {
          e.preventDefault();
          if (!busy) onConnect(name.trim() || DEFAULT_FOLDER);
        }}
      >
        <label className={styles.label} htmlFor="es-connect-folder">
          Folder name
        </label>
        <TextField
          id="es-connect-folder"
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
    </section>
  );
}
