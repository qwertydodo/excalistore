import { useAuthStore } from "./stores/authStore";
import { usePanelVisibilityStore } from "./stores/panelVisibilityStore";

export type ConnectDrive = {
  onConnect: (folderName: string) => Promise<void>;
};

// Orchestrates the connect flow across two independent stores — authStore
// owns the API call itself, this hook is what wires "connect succeeded" to
// "open the panel" instead of authStore reaching into panelVisibilityStore
// directly. The file list is no longer loaded here: activeDiagramStore's
// loadInitial() owns that, triggered by the isConnected flip (see
// useActiveDiagram).
export const useConnectDrive = (): ConnectDrive => {
  const connect = useAuthStore((s) => s.connect);
  const show = usePanelVisibilityStore((s) => s.show);

  const onConnect = async (folderName: string) => {
    const status = await connect(folderName);
    if (status.isConnected) await show();
  };

  return { onConnect };
};
