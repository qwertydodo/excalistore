import { useCallback, useState } from "react";
import { setCachedFiles } from "@/features/session";
import type { ConnectionStatus, DriveFileMeta } from "@/shared/api";
import { ERROR_CODE, REQUEST_TYPE, RequestError, sendToBackground } from "@/shared/api";

export type DiagramLibrary = {
  status: ConnectionStatus;
  onStatusChange: (status: ConnectionStatus) => void;
  files: DriveFileMeta[];
  onFilesChange: (files: DriveFileMeta[]) => void;
  isLoading: boolean;
  refresh: () => Promise<DriveFileMeta[]>;
};

// Owns connection status + the Drive file list, including the refresh that
// re-fetches the list and keeps the fast-paint cache in sync.
export const useDiagramLibrary = (): DiagramLibrary => {
  const [status, setStatus] = useState<ConnectionStatus>({ isConnected: false });
  const [files, setFiles] = useState<DriveFileMeta[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // useCallback on all three below (not compiler-memoized — react-compiler
  // 1.0.0 can't lower a try/finally yet, so it bails on this whole hook):
  // useActiveDiagram's loadInitial effect depends on these identities.
  // Unstable here re-fires that effect every render, looping refresh()
  // forever.
  const onStatusChange = useCallback((next: ConnectionStatus) => setStatus(next), []);
  const onFilesChange = useCallback((next: DriveFileMeta[]) => setFiles(next), []);

  const refresh = useCallback(async (): Promise<DriveFileMeta[]> => {
    setIsLoading(true);
    try {
      const list = await sendToBackground<DriveFileMeta[]>({ type: REQUEST_TYPE.DRIVE_LIST });
      setFiles(list);
      setCachedFiles(list); // keep the fast-paint cache fresh
      return list;
    } catch (e) {
      if (e instanceof RequestError && e.code === ERROR_CODE.UNAUTHORIZED) {
        setStatus({ isConnected: false });
      }
      return [];
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { status, onStatusChange, files, onFilesChange, isLoading, refresh };
};
