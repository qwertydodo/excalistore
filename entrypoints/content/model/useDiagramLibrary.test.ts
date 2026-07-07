// @vitest-environment jsdom
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { stubChromeStorageLocal } from "@/shared/lib/testUtils";
import { useDiagramLibraryStore } from "./stores/diagramLibraryStore";
import { setDiagramSearchQuery } from "./stores/sessionStore";
import { useDiagramLibrary } from "./useDiagramLibrary";

const INITIAL_STORE_STATE = useDiagramLibraryStore.getState();

beforeEach(() => {
  stubChromeStorageLocal();
  useDiagramLibraryStore.setState(INITIAL_STORE_STATE, true);
});

describe("useDiagramLibrary", () => {
  it("loads the persisted search query into the store on mount", async () => {
    await setDiagramSearchQuery("beta");
    renderHook(() => useDiagramLibrary());
    await waitFor(() => expect(useDiagramLibraryStore.getState().isQueryLoaded).toBe(true));
    expect(useDiagramLibraryStore.getState().initialQuery).toBe("beta");
  });

  it("reflects the store's connection status", () => {
    useDiagramLibraryStore.setState({ status: { isConnected: true, folderName: "Diagrams" } });
    const { result } = renderHook(() => useDiagramLibrary());
    expect(result.current.status).toEqual({ isConnected: true, folderName: "Diagrams" });
  });
});
