import { useCallback, useState } from "react";
import { setPanelCollapsed } from "@/features/session";
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

  // useCallback (not compiler-memoized — try/finally below, see "Known gap"
  // in docs/development.md): onConnect is passed down as a prop, so an
  // unstable identity churns child re-renders every render of this hook.
  const onConnect = useCallback(
    async (folderName: string) => {
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
        if (next.isConnected) {
          // Auto-open the panel on connect: DiagramPanel's usePanelVisibility
          // reads this persisted value when it mounts.
          await setPanelCollapsed(false);
          await refresh();
        }
      } catch (e) {
        setConnectError(e instanceof Error ? e.message : "Could not connect to Google Drive");
      } finally {
        setIsConnecting(false);
      }
    },
    [isConnecting, refresh, onStatusChange],
  );

  return { isConnecting, connectError, onConnect };
};
