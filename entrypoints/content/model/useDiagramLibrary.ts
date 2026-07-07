import { useEffect } from "react";
import { useShallow } from "zustand/react/shallow";
import type { ConnectionStatus } from "@/features/driveGateway";
import { useDiagramLibraryStore } from "./stores/diagramLibraryStore";

export type DiagramLibrary = {
  status: ConnectionStatus;
};

// Kicks off the one-time load of the persisted search query into the
// diagram library store — the store's other fields/actions (files, connect,
// refresh, ...) are read directly by whoever needs them (useActiveDiagram,
// App, DiagramList, ...), no props drilling needed.
export const useDiagramLibrary = (): DiagramLibrary => {
  const { status, loadInitialQuery } = useDiagramLibraryStore(
    useShallow((s) => ({ status: s.status, loadInitialQuery: s.loadInitialQuery })),
  );

  useEffect(() => {
    loadInitialQuery();
  }, [loadInitialQuery]);

  return { status };
};
