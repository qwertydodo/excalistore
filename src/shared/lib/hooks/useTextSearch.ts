import { useState } from "react";
import { useDebounce } from "./useDebounce";

export type UseTextSearchOptions<T> = {
  getText: (item: T) => string;
  minChars?: number;
  debounceMs?: number;
  // Seeds `query` at construction only (standard useState initial-value
  // semantics) — later changes to this option are not adopted. A caller
  // that needs to seed from an async source (e.g. persisted storage) should
  // delay mounting this hook until that value is already known, rather than
  // relying on this hook to adopt a later-arriving value.
  initialQuery?: string;
};

export type UseTextSearchResult<T> = {
  query: string;
  debouncedQuery: string;
  onQueryChange: (value: string) => void;
  results: T[];
};

export const useTextSearch = <T>(
  data: T[],
  options: UseTextSearchOptions<T>,
): UseTextSearchResult<T> => {
  const { getText, minChars = 3, debounceMs = 300, initialQuery = "" } = options;
  const [query, setQuery] = useState(initialQuery);
  const debouncedQuery = useDebounce(query, debounceMs);

  const onQueryChange = (value: string) => setQuery(value);

  const results =
    debouncedQuery.length < minChars
      ? data
      : data.filter((item) => getText(item).toLowerCase().includes(debouncedQuery.toLowerCase()));

  return { query, debouncedQuery, onQueryChange, results };
};
