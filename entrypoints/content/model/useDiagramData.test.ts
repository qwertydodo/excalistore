// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stubChromeStorageLocal } from "@/shared/lib/testUtils";
import { useDiagramLibraryStore } from "./stores/diagramLibraryStore";
import { getDiagramSearchQuery } from "./stores/sessionStore";
import { useDiagramData } from "./useDiagramData";

type Item = { id: string; name: string; modifiedTime: string; headRevisionId: string };
const files: Item[] = [
  { id: "1", name: "beta.excalidraw", modifiedTime: "", headRevisionId: "" },
  { id: "2", name: "alpha.excalidraw", modifiedTime: "", headRevisionId: "" },
];

const INITIAL_STORE_STATE = useDiagramLibraryStore.getState();

beforeEach(() => {
  stubChromeStorageLocal();
  vi.useFakeTimers();
  useDiagramLibraryStore.setState({ ...INITIAL_STORE_STATE, files }, true);
});
afterEach(() => {
  vi.useRealTimers();
});

describe("useDiagramData", () => {
  it("sorts files by name", () => {
    const { result } = renderHook(() => useDiagramData());
    expect(result.current.results.map((f) => f.name)).toEqual([
      "alpha.excalidraw",
      "beta.excalidraw",
    ]);
  });

  it("seeds the query from the store's initialQuery (e.g. rehydrated from storage)", () => {
    useDiagramLibraryStore.setState({ initialQuery: "beta" });
    const { result } = renderHook(() => useDiagramData());
    expect(result.current.query).toBe("beta");
  });

  it("filters after minChars is reached and the debounce window elapses", () => {
    const { result } = renderHook(() => useDiagramData());
    act(() => result.current.onQueryChange("alp"));
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(result.current.results.map((f) => f.name)).toEqual(["alpha.excalidraw"]);
  });

  it("persists the debounced query to storage", async () => {
    const { result } = renderHook(() => useDiagramData());
    act(() => result.current.onQueryChange("alp"));
    await act(async () => {
      vi.advanceTimersByTime(300);
      await Promise.resolve();
    });
    await expect(getDiagramSearchQuery()).resolves.toBe("alp");
  });

  it("reports whether the library has any files at all, independent of the search filter", () => {
    const { result } = renderHook(() => useDiagramData());
    expect(result.current.hasDiagrams).toBe(true);

    useDiagramLibraryStore.setState({ files: [] });
    const { result: empty } = renderHook(() => useDiagramData());
    expect(empty.current.hasDiagrams).toBe(false);
  });
});
