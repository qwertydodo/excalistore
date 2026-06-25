import { FolderNameForm } from "@/features/driveConnect";
import type { ConnectionStatus } from "@/shared/api";
import { Box, Button, Heading, Text } from "@/shared/ui";
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
    <Box as="main" padding="4" className={styles.root}>
      <Heading as="h1" size="lg" className={styles.title}>
        Excalistore
      </Heading>
      {status.connected ? (
        <>
          <Text as="p" color="muted" className={styles.folder}>
            Folder: <strong>{status.folderName ?? status.folderId}</strong>
          </Text>
          <Button variant="secondary" onClick={onSignOut} disabled={busy}>
            Sign out
          </Button>
        </>
      ) : (
        <FolderNameForm id="es-folder-name" busy={busy} error={error} onConnect={onConnect} />
      )}
    </Box>
  );
};
