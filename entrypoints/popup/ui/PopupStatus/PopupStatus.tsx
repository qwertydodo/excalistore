import type { ConnectionStatus } from "@/shared/api";
import { Box, Button, Heading, Text } from "@/shared/ui";
import styles from "./PopupStatus.module.css";

type Props = {
  status: ConnectionStatus;
  onOpenExcalidraw: () => void;
};

// Thin popup: connection status + a shortcut to excalidraw.com. Connecting and
// signing out now live in-page (ConnectButton dialog / DiagramPanel).
export const PopupStatus = ({ status, onOpenExcalidraw }: Props) => {
  return (
    <Box as="main" padding="4" className={styles.root}>
      <Heading as="h1" className={styles.title}>
        Excalistore
      </Heading>
      {status.isConnected ? (
        <Text as="p" color="muted" className={styles.status}>
          Connected · <strong>{status.folderName ?? status.folderId}</strong>
        </Text>
      ) : (
        <Text as="p" color="muted" className={styles.status}>
          Not connected — open Excalidraw to connect.
        </Text>
      )}
      <Button variant="primary" icon="cloud" onClick={onOpenExcalidraw}>
        Open Excalidraw
      </Button>
    </Box>
  );
};
