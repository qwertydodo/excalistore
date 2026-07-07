// @vitest-environment jsdom
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/driveGateway", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/driveGateway")>()),
  sendToBackground: vi.fn(async () => ({ isConnected: false })),
}));
vi.mock("./stores/sessionStore", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./stores/sessionStore")>()),
  getActiveFile: vi.fn(async () => null),
  getCachedFiles: vi.fn(async () => []),
}));

const { sendToBackground } = await import("@/features/driveGateway");
const { getActiveFile, getCachedFiles } = await import("./stores/sessionStore");
const { useDiagramLibraryStore } = await import("./stores/diagramLibraryStore");
const { useActiveDiagramStore } = await import("./stores/activeDiagramStore");
const { useActiveDiagram } = await import("./useActiveDiagram");

const INITIAL_LIBRARY_STATE = useDiagramLibraryStore.getState();
const INITIAL_ACTIVE_STATE = useActiveDiagramStore.getState();

beforeEach(() => {
  useDiagramLibraryStore.setState(INITIAL_LIBRARY_STATE, true);
  useActiveDiagramStore.setState(INITIAL_ACTIVE_STATE, true);
  vi.mocked(sendToBackground).mockClear();
});

describe("useActiveDiagram", () => {
  it("loads the connection status into the diagram library store on mount", async () => {
    renderHook(() => useActiveDiagram());
    await waitFor(() =>
      expect(useDiagramLibraryStore.getState().status).toEqual({ isConnected: false }),
    );
  });

  it("runs the initial load effect only once across re-renders (regression: onActiveIdChange/onRevisionChange are zustand actions, always stable, so this must never loop)", async () => {
    const { rerender } = renderHook(() => useActiveDiagram());
    await waitFor(() => expect(sendToBackground).toHaveBeenCalledTimes(1));
    rerender();
    rerender();
    expect(sendToBackground).toHaveBeenCalledTimes(1);
  });

  it("adopts the active pointer from the cached list immediately, without waiting on the network refresh", async () => {
    const cachedFile = { id: "1", name: "a.excalidraw", modifiedTime: "t", headRevisionId: "r1" };
    vi.mocked(getActiveFile).mockResolvedValue({
      id: "1",
      name: "a.excalidraw",
      loadedRevision: "r1",
    });
    vi.mocked(getCachedFiles).mockResolvedValue([cachedFile]);
    let resolveList: (v: unknown) => void = () => {};
    vi.mocked(sendToBackground).mockImplementation((request) => {
      if (request.type === "auth/status") return Promise.resolve({ isConnected: true });
      return new Promise((resolve) => {
        resolveList = resolve;
      });
    });

    renderHook(() => useActiveDiagram());

    await waitFor(() => expect(useActiveDiagramStore.getState().activeId).toBe("1"));
    resolveList([cachedFile]); // let the pending DRIVE_LIST settle so the effect can clean up
  });
});

describe("handleRemoteDeletion", () => {
  it("clears the active pointer and drops the deleted row from the library list", async () => {
    const survivor = { id: "2", name: "b.excalidraw", modifiedTime: "t", headRevisionId: "r2" };
    const deleted = { id: "1", name: "a.excalidraw", modifiedTime: "t", headRevisionId: "r1" };
    useDiagramLibraryStore.setState({ files: [deleted, survivor] });
    useActiveDiagramStore.setState({ activeId: "1", revision: "r1" });

    const { handleRemoteDeletion } = await import("./useActiveDiagram");
    await handleRemoteDeletion("1");

    expect(useActiveDiagramStore.getState().activeId).toBeNull();
    expect(useActiveDiagramStore.getState().revision).toBeNull();
    expect(useDiagramLibraryStore.getState().files).toEqual([survivor]);
  });
});
