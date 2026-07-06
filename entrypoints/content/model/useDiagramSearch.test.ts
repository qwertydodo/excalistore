// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stubChromeStorageLocal } from "@/shared/lib/testHelpers";
import { getDiagramSearchQuery, setDiagramSearchQuery } from "./searchState";
import { useDiagramSearch } from "./useDiagramSearch";

type Item = { id: string; name: string; modifiedTime: string; headRevisionId: string };
const files: Item[] = [
  { id: "1", name: "beta.excalidraw", modifiedTime: "", headRevisionId: "" },
  { id: "2", name: "alpha.excalidraw", modifiedTime: "", headRevisionId: "" },
];

const flush = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};

beforeEach(() => {
  stubChromeStorageLocal();
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("useDiagramSearch", () => {
  it("starts with an empty query and the full, unfiltered list", async () => {
    const { result } = renderHook(() => useDiagramSearch(files));
    await flush();
    expect(result.current.query).toBe("");
    expect(result.current.results).toEqual(files);
  });

  it("filters after minChars is reached and the debounce window elapses", async () => {
    const { result } = renderHook(() => useDiagramSearch(files));
    await flush();
    act(() => result.current.onQueryChange("alp"));
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(result.current.results).toEqual([files[1]]);
  });

  it("persists the debounced query to storage", async () => {
    const { result } = renderHook(() => useDiagramSearch(files));
    await flush();
    act(() => result.current.onQueryChange("alp"));
    act(() => {
      vi.advanceTimersByTime(300);
    });
    await flush();
    await expect(getDiagramSearchQuery()).resolves.toBe("alp");
  });

  it("rehydrates a persisted query on mount", async () => {
    await setDiagramSearchQuery("beta");
    const { result } = renderHook(() => useDiagramSearch(files));
    await flush();
    expect(result.current.query).toBe("beta");
  });

  it("never writes to storage from hydration alone, even after the debounce window elapses", async () => {
    await setDiagramSearchQuery("beta");
    renderHook(() => useDiagramSearch(files));
    await flush(); // initialQuery resolves, query adopts "beta" — no onQueryChange call made
    // A naive implementation (debouncing `query` itself) writes "" here,
    // synchronously within this same hydration flush — catch it before its
    // own restarted debounce timer self-corrects within the 300ms window.
    await expect(getDiagramSearchQuery()).resolves.toBe("beta");
    act(() => {
      vi.advanceTimersByTime(300);
    });
    await flush();
    await expect(getDiagramSearchQuery()).resolves.toBe("beta");
  });
});
