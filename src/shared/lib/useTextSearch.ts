import { useEffect, useState } from "react";
import { useDebounce } from "./useDebounce";

export type UseTextSearchOptions<T> = {
  getText: (item: T) => string;
  minChars?: number;
  debounceMs?: number;
  initialQuery?: string;
};

export type UseTextSearchResult<T> = {
  query: string;
  onQueryChange: (value: string) => void;
  results: T[];
};

export const useTextSearch = <T>(
  data: T[],
  options: UseTextSearchOptions<T>,
): UseTextSearchResult<T> => {
  const { getText, minChars = 3, debounceMs = 300, initialQuery } = options;
  const [query, setQuery] = useState(initialQuery ?? "");
  const debouncedQuery = useDebounce(query, debounceMs);

  // Hydrate from async-loaded storage: initialQuery starts undefined (not
  // loaded yet) and later flips to a defined string once the caller's
  // storage read resolves — adopt it when that happens.
  useEffect(() => {
    if (initialQuery !== undefined) setQuery(initialQuery);
  }, [initialQuery]);

  const onQueryChange = (value: string) => setQuery(value);

  const results =
    debouncedQuery.length < minChars
      ? data
      : data.filter((item) => getText(item).toLowerCase().includes(debouncedQuery.toLowerCase()));

  return { query, onQueryChange, results };
};
