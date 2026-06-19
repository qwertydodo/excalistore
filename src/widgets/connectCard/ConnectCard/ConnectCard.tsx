import { FolderNameForm } from "@/features/driveConnect";
import styles from "./ConnectCard.module.css";

type Props = {
  busy?: boolean;
  error?: string | null;
  onConnect: (folderName: string) => void;
};

// In-page (Shadow DOM) connect card shown on excalidraw.com before a folder is
// connected. Keyboard events are stopped at the root so typing the folder name
// doesn't trigger Excalidraw's tool shortcuts.
export const ConnectCard = ({ busy = false, error = null, onConnect }: Props) => {
  return (
    <section
      className={styles.root}
      aria-label="Connect Excalistore"
      onKeyDown={(e) => e.stopPropagation()}
      onKeyUp={(e) => e.stopPropagation()}
    >
      <h2 className={styles.title}>Excalistore</h2>
      <p className={styles.lead}>Save your diagrams to Google Drive.</p>
      <FolderNameForm id="es-connect-folder" busy={busy} error={error} onConnect={onConnect} />
    </section>
  );
};
