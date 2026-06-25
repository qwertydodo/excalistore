import { useEffect, useState } from "react";
import type { ConnectionStatus } from "@/shared/api";
import { REQUEST_TYPE, sendToBackground } from "@/shared/api";
import { PopupConnect } from "./ui/PopupConnect";

export const App = () => {
  const [status, setStatus] = useState<ConnectionStatus>({ isConnected: false });
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    sendToBackground<ConnectionStatus>({ type: REQUEST_TYPE.AUTH_STATUS })
      .then((next) => setStatus(next))
      .catch(() => undefined);
  }, []);

  const onConnect = async (folderName: string) => {
    if (isBusy) return;
    setIsBusy(true);
    setError(null);
    try {
      // Interactive sign-in + folder find/create happen in the background gateway.
      const next = await sendToBackground<ConnectionStatus>({
        type: REQUEST_TYPE.DRIVE_CONNECT,
        folderName,
      });
      setStatus(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not connect to Google Drive");
    } finally {
      setIsBusy(false);
    }
  };

  const onSignOut = async () => {
    if (isBusy) return;
    setIsBusy(true);
    setError(null);
    try {
      const next = await sendToBackground<ConnectionStatus>({ type: REQUEST_TYPE.AUTH_SIGN_OUT });
      setStatus(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not sign out");
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <PopupConnect
      status={status}
      isBusy={isBusy}
      error={error}
      onConnect={onConnect}
      onSignOut={onSignOut}
    />
  );
};
