import { useShallow } from "zustand/react/shallow";
import { useAuthStore } from "./stores/authStore";
import { useDiagramLibraryStore } from "./stores/diagramLibraryStore";
import { usePanelVisibilityStore } from "./stores/panelVisibilityStore";

export type ConnectDrive = {
  onConnect: (folderName: string) => Promise<void>;
};

// Orchestrates the connect flow across three independent stores — authStore
// owns the API call itself, this hook is what wires "connect succeeded" to
// "open the panel and load the file list" instead of authStore reaching into
// the other two stores directly.
export const useConnectDrive = (): ConnectDrive => {
  const { connect, markDisconnected } = useAuthStore(
    useShallow((s) => ({ connect: s.connect, markDisconnected: s.markDisconnected })),
  );
  const show = usePanelVisibilityStore((s) => s.show);
  const refresh = useDiagramLibraryStore((s) => s.refresh);

  const onConnect = async (folderName: string) => {
    const status = await connect(folderName);
    if (status.isConnected) {
      await show();
      await refresh(markDisconnected);
    }
  };

  return { onConnect };
};
