import { FolderNameForm } from "@/features/driveConnect";
import { Heading, Stack, Text } from "@/shared/ui";
import styles from "./ConnectCard.module.css";

type Props = {
  isBusy?: boolean;
  error?: string | null;
  onConnect: (folderName: string) => void;
};

// In-page (Shadow DOM) connect card shown on excalidraw.com before a folder is
// connected. Keyboard events are stopped at the root so typing the folder name
// doesn't trigger Excalidraw's tool shortcuts.
export const ConnectCard = ({ isBusy = false, error = null, onConnect }: Props) => {
  return (
    <Stack
      as="section"
      gap="2"
      padding="4"
      border="thin"
      radius="md"
      shadow="md"
      className={styles.root}
      aria-label="Connect Excalistore"
      onKeyDown={(e) => e.stopPropagation()}
      onKeyUp={(e) => e.stopPropagation()}
    >
      <Heading size="lg" className={styles.title}>
        Excalistore
      </Heading>
      <Text as="p" color="muted" className={styles.lead}>
        Save your diagrams to Google Drive.
      </Text>
      <FolderNameForm id="es-connect-folder" isBusy={isBusy} error={error} onConnect={onConnect} />
    </Stack>
  );
};
