import { useEffect, useState } from "react";
import type { ConnectionStatus } from "@/shared/api";
import { sendToBackground } from "@/shared/api";
import { PopupConnect } from "@/widgets/popupConnect";

export function App() {
  const [status, setStatus] = useState<ConnectionStatus>({ connected: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    sendToBackground<ConnectionStatus>({ type: "auth/status" })
      .then(setStatus)
      .catch(() => undefined);
  }, []);

  async function onConnect(folderName: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      // Interactive sign-in + folder find/create happen in the background gateway.
      const next = await sendToBackground<ConnectionStatus>({ type: "drive/connect", folderName });
      setStatus(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not connect to Google Drive");
    } finally {
      setBusy(false);
    }
  }

  async function onSignOut() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const next = await sendToBackground<ConnectionStatus>({ type: "auth/signOut" });
      setStatus(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not sign out");
    } finally {
      setBusy(false);
    }
  }

  return (
    <PopupConnect
      status={status}
      busy={busy}
      error={error}
      onConnect={onConnect}
      onSignOut={onSignOut}
    />
  );
}
