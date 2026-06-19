import { useState } from "react";
import { setCachedFiles } from "@/features/session";
import type { ConnectionStatus, DriveFileMeta } from "@/shared/api";
import { ERROR_CODE, REQUEST_TYPE, RequestError, sendToBackground } from "@/shared/api";

export type DiagramLibrary = {
  status: ConnectionStatus;
  onStatusChange: (status: ConnectionStatus) => void;
  files: DriveFileMeta[];
  onFilesChange: (files: DriveFileMeta[]) => void;
  loading: boolean;
  refresh: () => Promise<DriveFileMeta[]>;
};

// Owns connection status + the Drive file list, including the refresh that
// re-fetches the list and keeps the fast-paint cache in sync.
export const useDiagramLibrary = (): DiagramLibrary => {
  const [status, setStatus] = useState<ConnectionStatus>({ connected: false });
  const [files, setFiles] = useState<DriveFileMeta[]>([]);
  const [loading, setLoading] = useState(false);

  const onStatusChange = (next: ConnectionStatus) => setStatus(next);
  const onFilesChange = (next: DriveFileMeta[]) => setFiles(next);

  const refresh = async (): Promise<DriveFileMeta[]> => {
    setLoading(true);
    try {
      const list = await sendToBackground<DriveFileMeta[]>({ type: REQUEST_TYPE.DRIVE_LIST });
      setFiles(list);
      setCachedFiles(list); // keep the fast-paint cache fresh
      return list;
    } catch (e) {
      if (e instanceof RequestError && e.code === ERROR_CODE.UNAUTHORIZED) {
        setStatus({ connected: false });
      }
      return [];
    } finally {
      setLoading(false);
    }
  };

  return { status, onStatusChange, files, onFilesChange, loading, refresh };
};
