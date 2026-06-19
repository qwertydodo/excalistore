import { useCallback, useState } from "react";
import type { ConnectionStatus, DriveFileMeta } from "@/shared/api";
import { REQUEST_TYPE, sendToBackground } from "@/shared/api";

export type UseConnectFlowParams = {
  refresh: () => Promise<DriveFileMeta[]>;
  onStatusChange: (status: ConnectionStatus) => void;
};

export type ConnectFlow = {
  connecting: boolean;
  connectError: string | null;
  onConnect: (folderName: string) => Promise<void>;
};

// Owns the initial Drive-connect flow (interactive sign-in + folder find/create
// runs in the background gateway).
export const useConnectFlow = ({ refresh, onStatusChange }: UseConnectFlowParams): ConnectFlow => {
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);

  const onConnect = useCallback(
    async (folderName: string) => {
      if (connecting) return;
      setConnecting(true);
      setConnectError(null);
      try {
        // Interactive sign-in + folder find/create run in the background gateway.
        const next = await sendToBackground<ConnectionStatus>({
          type: REQUEST_TYPE.DRIVE_CONNECT,
          folderName,
        });
        onStatusChange(next);
        if (next.connected) await refresh();
      } catch (e) {
        setConnectError(e instanceof Error ? e.message : "Could not connect to Google Drive");
      } finally {
        setConnecting(false);
      }
    },
    [connecting, refresh, onStatusChange],
  );

  return { connecting, connectError, onConnect };
};
