import { useEffect } from "react";
import { useShallow } from "zustand/react/shallow";
import type { DriveFile } from "@/entities/google/drive";
import { useTextSearch } from "@/shared/lib";
import { useDiagramLibraryStore } from "./stores/diagramLibraryStore";
import { setDiagramSearchQuery } from "./stores/sessionStore";

export type DiagramData = {
  query: string;
  onQueryChange: (query: string) => void;
  results: DriveFile[];
  hasDiagrams: boolean;
};

// Sorts the diagram list and runs the search over it, persisting the
// debounced query. The caller must not mount this hook until the store's
// persisted query has resolved (see diagramLibraryStore's isQueryLoaded) —
// useTextSearch only reads its initialQuery on first render, so a
// later-arriving value here would never be adopted.
export const useDiagramData = (): DiagramData => {
  const { files, initialQuery } = useDiagramLibraryStore(
    useShallow((s) => ({ files: s.files, initialQuery: s.initialQuery })),
  );

  // Stable order: sort by name so saving/opening a diagram never reshuffles
  // the list (sorting by modifiedTime would jump the active item to the top).
  const ordered = [...files].sort((a, b) => a.name.localeCompare(b.name));

  const { query, debouncedQuery, onQueryChange, results } = useTextSearch(ordered, {
    getText: (f) => f.name,
    minChars: 3,
    initialQuery,
  });

  useEffect(() => {
    setDiagramSearchQuery(debouncedQuery);
  }, [debouncedQuery]);

  return { query, onQueryChange, results, hasDiagrams: files.length > 0 };
};
