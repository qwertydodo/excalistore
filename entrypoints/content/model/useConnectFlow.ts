import { useState } from "react";
import type { ConnectionStatus } from "@/shared/api";
import { REQUEST_TYPE, sendToBackground } from "@/shared/api";
import type { DiagramLibrary } from "./useDiagramLibrary";

export type UseConnectFlowParams = Pick<DiagramLibrary, "refresh" | "onStatusChange">;

export type ConnectFlow = {
  isConnecting: boolean;
  connectError: string | null;
  onConnect: (folderName: string) => Promise<void>;
};

// Owns the initial Drive-connect flow (interactive sign-in + folder find/create
// runs in the background gateway).
export const useConnectFlow = ({ refresh, onStatusChange }: UseConnectFlowParams): ConnectFlow => {
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);

  const onConnect = async (folderName: string) => {
    if (isConnecting) return;
    setIsConnecting(true);
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
      setIsConnecting(false);
    }
  };

  return { isConnecting, connectError, onConnect };
};
