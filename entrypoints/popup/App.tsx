import { useEffect, useState } from "react";
import type { ConnectionStatus } from "@/shared/api";
import { sendToBackground } from "@/shared/api";
import { PopupConnect } from "@/widgets/popupConnect";

export function App() {
  const [status, setStatus] = useState<ConnectionStatus>({ connected: false });

  useEffect(() => {
    sendToBackground<ConnectionStatus>({ type: "auth/status" })
      .then(setStatus)
      .catch(() => undefined);
  }, []);

  async function onConnect(folderName: string) {
    // Interactive sign-in + folder find/create happen in the background gateway.
    const next = await sendToBackground<ConnectionStatus>({ type: "drive/connect", folderName });
    setStatus(next);
  }

  async function onSignOut() {
    const next = await sendToBackground<ConnectionStatus>({ type: "auth/signOut" });
    setStatus(next);
  }

  return <PopupConnect status={status} onConnect={onConnect} onSignOut={onSignOut} />;
}
