import { useEffect } from "react";
import { useShallow } from "zustand/react/shallow";
import type { ConnectionStatus } from "@/features/driveGateway";
import { useActiveDiagramStore } from "./stores/activeDiagramStore";
import { useAuthStore } from "./stores/authStore";
import { useDiagramLibraryStore } from "./stores/diagramLibraryStore";
import { usePanelVisibilityStore } from "./stores/panelVisibilityStore";
import { useActiveDiagram } from "./useActiveDiagram";
import { type SignOutFlow, useSignOutFlow } from "./useSignOutFlow";

export type AppInit = {
  isStatusLoaded: boolean;
  isPanelReady: boolean;
  isQueryReady: boolean;
  isListReady: boolean;
  isReconciled: boolean;
  status: ConnectionStatus;
  signOut: SignOutFlow;
};

// The single hook App calls: kicks off every side-effecting load the app
// needs (connection status, panel visibility, search query, active pointer +
// autosave, sign-out flow wiring). Exposes isStatusLoaded, isPanelReady,
// isQueryReady, isListReady, and isReconciled separately rather than one
// merged "ready" flag — App gates on each in turn (status first, then panel
// visibility/query/list only once connected), since a disconnected user
// never needs to wait on any of them.
export const useAppInit = (): AppInit => {
  useActiveDiagram();
  const signOut = useSignOutFlow();

  const { status, isStatusLoaded, loadStatus } = useAuthStore(
    useShallow((s) => ({
      status: s.status,
      isStatusLoaded: s.isStatusLoaded,
      loadStatus: s.loadStatus,
    })),
  );
  const { isPanelReady, loadPanelVisibility } = usePanelVisibilityStore(
    useShallow((s) => ({
      isPanelReady: s.isPanelReady,
      loadPanelVisibility: s.loadPanelVisibility,
    })),
  );
  const { isQueryReady, loadInitialQuery } = useDiagramLibraryStore(
    useShallow((s) => ({ isQueryReady: s.isQueryReady, loadInitialQuery: s.loadInitialQuery })),
  );
  const { isListReady, isReconciled } = useActiveDiagramStore(
    useShallow((s) => ({ isListReady: s.isListReady, isReconciled: s.isReconciled })),
  );

  // The one-time connection-status check — useActiveDiagram used to trigger
  // this itself, but panel visibility/search query below both need to know
  // isConnected before they load, so it's hoisted here as the single owner.
  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  // Panel-collapsed state and the persisted search query are both irrelevant
  // on the disconnected (ConnectButton) screen, so defer loading either until
  // status.isConnected is confirmed true — sequenced behind connect instead
  // of fired at mount in parallel with it, which used to race useConnectDrive's
  // show() write against this same panel-visibility state.
  useEffect(() => {
    if (!status.isConnected) return;
    loadPanelVisibility();
    loadInitialQuery();
  }, [status.isConnected, loadPanelVisibility, loadInitialQuery]);

  return { isStatusLoaded, isPanelReady, isQueryReady, isListReady, isReconciled, status, signOut };
};
