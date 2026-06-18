import { useEffect, useState } from "react";
import { getToken } from "@/features/auth";
import { pickFolder } from "@/features/pickFolder";
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

  async function onConnect() {
    // Sign in + pick folder happen in the popup (Picker needs the token here),
    // then persistence is delegated to the background gateway.
    const token = await getToken(true);
    const apiKey = import.meta.env.WXT_PICKER_API_KEY ?? "";
    const appId = (import.meta.env.WXT_OAUTH_CLIENT_ID ?? "").split("-")[0] ?? "";
    const folder = await pickFolder(token, apiKey, appId);
    if (!folder) return;
    const next: ConnectionStatus = {
      connected: true,
      folderId: folder.id,
      folderName: folder.name,
    };
    await sendToBackground({ type: "drive/setConnection", status: next });
    setStatus(next);
  }

  async function onSignOut() {
    const next = await sendToBackground<ConnectionStatus>({ type: "auth/signOut" });
    setStatus(next);
  }

  return <PopupConnect status={status} onConnect={onConnect} onSignOut={onSignOut} />;
}
