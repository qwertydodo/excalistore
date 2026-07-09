import { useEffect } from "react";
import { useActiveDiagramStore } from "./stores/activeDiagramStore";
import { useAuthStore } from "./stores/authStore";

// Kicks off loadInitial whenever isConnected flips true: app start in a
// connected tab, and a reconnect after an involuntary logout (no reload
// happens there, so this re-fire is what refreshes the list). Runs from
// useAppInit — outside App's readiness gate, or the gate would deadlock.
// loadInitial's own isLoadInFlight guard collapses strict-mode double runs.
export const useInitialDiagramLoad = (): void => {
  const isConnected = useAuthStore((s) => s.status.isConnected);

  useEffect(() => {
    if (!isConnected) return;
    useActiveDiagramStore.getState().loadInitial();
  }, [isConnected]);
};
