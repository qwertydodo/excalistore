import { useEffect, useState } from "react";
import type { DriveFile } from "@/entities/google/drive";
import { useDebounce, useTextSearch } from "@/shared/lib";
import { getDiagramSearchQuery, setDiagramSearchQuery } from "./searchState";

export const useDiagramSearch = (files: DriveFile[]) => {
  const [initialQuery, setInitialQuery] = useState<string | undefined>(undefined);

  useEffect(() => {
    getDiagramSearchQuery().then(setInitialQuery);
  }, []);

  const { query, onQueryChange, results } = useTextSearch(files, {
    getText: (f) => f.name,
    minChars: 3,
    ...(initialQuery !== undefined && { initialQuery }),
  });

  // Persistence is driven only by user-initiated changes (userQuery), never
  // by hydration adopting initialQuery into `query` — otherwise the
  // hydration jump would race useDebounce's restarted timer and briefly
  // write "" over the just-loaded value. userQuery starts undefined and
  // stays that way until the user actually types, so hydration alone can
  // never trigger a write.
  const [userQuery, setUserQuery] = useState<string | undefined>(undefined);
  const onSearchQueryChange = (value: string) => {
    onQueryChange(value);
    setUserQuery(value);
  };
  const debouncedUserQuery = useDebounce(userQuery, 300);
  useEffect(() => {
    if (debouncedUserQuery === undefined) return;
    setDiagramSearchQuery(debouncedUserQuery);
  }, [debouncedUserQuery]);

  return { query, onQueryChange: onSearchQueryChange, results };
};
