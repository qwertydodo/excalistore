import { useEffect } from "react";
import { useShallow } from "zustand/react/shallow";
import type { ConnectionStatus } from "@/features/driveGateway";
import { useAuthStore } from "./stores/authStore";
import { useDiagramLibraryStore } from "./stores/diagramLibraryStore";
import { usePanelVisibilityStore } from "./stores/panelVisibilityStore";
import { useActiveDiagram } from "./useActiveDiagram";
import { type SignOutFlow, useSignOutFlow } from "./useSignOutFlow";

export type AppInit = {
  isStatusLoaded: boolean;
  isPanelInitialized: boolean;
  isQueryLoaded: boolean;
  status: ConnectionStatus;
  signOut: SignOutFlow;
};

// The single hook App calls: kicks off every side-effecting load the app
// needs (connection status, panel visibility, search query, active pointer +
// autosave, sign-out flow wiring). Exposes isStatusLoaded, isPanelInitialized,
// and isQueryLoaded separately rather than one merged "ready" flag — App
// gates on each in turn (status first, then panel visibility and query only
// once connected), since a disconnected user never needs to wait on either.
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
  const { isPanelInitialized, loadPanelVisibility } = usePanelVisibilityStore(
    useShallow((s) => ({
      isPanelInitialized: s.isInitialized,
      loadPanelVisibility: s.loadPanelVisibility,
    })),
  );
  const { isQueryLoaded, loadInitialQuery } = useDiagramLibraryStore(
    useShallow((s) => ({ isQueryLoaded: s.isQueryLoaded, loadInitialQuery: s.loadInitialQuery })),
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

  return { isStatusLoaded, isPanelInitialized, isQueryLoaded, status, signOut };
};
