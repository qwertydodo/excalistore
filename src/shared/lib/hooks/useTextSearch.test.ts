// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTextSearch } from "./useTextSearch";

type Item = { id: string; name: string };
const items: Item[] = [
  { id: "1", name: "beta" },
  { id: "2", name: "alpha" },
  { id: "3", name: "Alphabet" },
];

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("useTextSearch", () => {
  it("returns all data, in original order, below minChars", () => {
    const { result } = renderHook(() => useTextSearch(items, { getText: (i) => i.name }));
    expect(result.current.results).toEqual(items);
  });

  it("does not filter until the debounce window elapses", () => {
    const { result } = renderHook(() => useTextSearch(items, { getText: (i) => i.name }));
    act(() => result.current.onQueryChange("alp"));
    act(() => {
      vi.advanceTimersByTime(299);
    });
    expect(result.current.results).toEqual(items);
  });

  it("filters case-insensitively, preserving original order, once minChars is reached and the debounce elapses", () => {
    const { result } = renderHook(() => useTextSearch(items, { getText: (i) => i.name }));
    act(() => result.current.onQueryChange("ALP"));
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(result.current.results).toEqual([items[1], items[2]]);
  });

  it("seeds the query from initialQuery at construction", () => {
    const { result } = renderHook(() =>
      useTextSearch(items, { getText: (i) => i.name, initialQuery: "beta" }),
    );
    expect(result.current.query).toBe("beta");
  });

  it("does not adopt a later-changing initialQuery — it only seeds at construction", () => {
    const { result, rerender } = renderHook(
      ({ initialQuery }: { initialQuery: string }) =>
        useTextSearch(items, { getText: (i) => i.name, initialQuery }),
      { initialProps: { initialQuery: "alpha" } },
    );
    expect(result.current.query).toBe("alpha");
    rerender({ initialQuery: "beta" });
    expect(result.current.query).toBe("alpha");
  });
});
