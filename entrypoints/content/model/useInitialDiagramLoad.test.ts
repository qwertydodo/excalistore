// @vitest-environment jsdom
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { stubSessionStorage } from "@/shared/lib/testUtils";
import { createFakeSceneBridgeDeps } from "../lib/testUtils";

// useInitialDiagramLoad drives the real currentSceneHash/readScene against
// the shared `bridge` singleton (real idb-keyval, which needs a real
// IndexedDB the jsdom test env doesn't provide — without this fake, the
// store's loadInitial() can end up touching bridge-backed state).
const fakeDeps = createFakeSceneBridgeDeps();

vi.mock("@/features/driveGateway", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/driveGateway")>()),
  sendToBackground: vi.fn(),
}));
vi.mock("./stores/sessionStore", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./stores/sessionStore")>()),
  getActiveFile: vi.fn(async () => null),
  getCachedFiles: vi.fn(async () => []),
}));
vi.mock("../lib/bridge", () => ({ bridge: fakeDeps }));
vi.mock("../lib/sceneBridge", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/sceneBridge")>()),
  currentSceneHash: vi.fn(async () => "h0"),
  readScene: vi.fn(async () => ({
    type: "excalidraw",
    version: 2,
    source: "s",
    elements: [],
    appState: {},
    files: {},
  })),
}));

const { sendToBackground } = await import("@/features/driveGateway");
const { getActiveFile, getCachedFiles, markSessionLoaded } = await import("./stores/sessionStore");
const { useAuthStore } = await import("./stores/authStore");
const { useDiagramLibraryStore } = await import("./stores/diagramLibraryStore");
const { useActiveDiagramStore } = await import("./stores/activeDiagramStore");
const { useInitialDiagramLoad } = await import("./useInitialDiagramLoad");

const INITIAL_AUTH_STATE = useAuthStore.getState();
const INITIAL_LIBRARY_STATE = useDiagramLibraryStore.getState();
const INITIAL_ACTIVE_STATE = useActiveDiagramStore.getState();

// useAppInit owns the loadStatus() call in production (see useAppInit.ts) —
// useInitialDiagramLoad only reacts to isStatusLoaded/status.isConnected once
// they're already resolved. Since these tests render the hook in isolation
// (no useAppInit), seed that resolved state directly instead.
const connectAs = (isConnected: boolean) =>
  useAuthStore.setState({ status: { isConnected }, isStatusLoaded: true });

beforeEach(() => {
  stubSessionStorage(); // fresh (never-validated) session by default each test
  useAuthStore.setState(INITIAL_AUTH_STATE, true);
  useDiagramLibraryStore.setState(INITIAL_LIBRARY_STATE, true);
  useActiveDiagramStore.setState(INITIAL_ACTIVE_STATE, true);
  vi.mocked(sendToBackground).mockClear();
  vi.mocked(getActiveFile).mockClear();
  vi.mocked(getCachedFiles).mockClear();
  fakeDeps.storage.clear();
});

describe("useInitialDiagramLoad", () => {
  it("runs loadInitial only once across re-renders (regression: loadInitial must not re-run on every render)", async () => {
    connectAs(true);
    const { rerender } = renderHook(() => useInitialDiagramLoad());
    await waitFor(() => expect(getActiveFile).toHaveBeenCalledTimes(1));
    rerender();
    rerender();
    expect(getActiveFile).toHaveBeenCalledTimes(1);
  });

  it("adopts the active pointer from the cached list immediately, without waiting on the network refresh", async () => {
    markSessionLoaded(); // navigation-reload branch: paints the cache before the network resolves
    connectAs(true);
    const cachedFile = { id: "1", name: "a.excalidraw", modifiedTime: "t", headRevisionId: "r1" };
    vi.mocked(getActiveFile).mockResolvedValue({
      id: "1",
      name: "a.excalidraw",
      loadedRevision: "r1",
    });
    vi.mocked(getCachedFiles).mockResolvedValue([cachedFile]);
    let resolveList: (v: unknown) => void = () => {};
    vi.mocked(sendToBackground).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveList = resolve;
        }),
    );

    renderHook(() => useInitialDiagramLoad());

    await waitFor(() => expect(useActiveDiagramStore.getState().activeId).toBe("1"));
    resolveList([cachedFile]); // let the pending DRIVE_LIST settle so the effect can clean up
  });

  it("does nothing while disconnected", () => {
    connectAs(false);
    renderHook(() => useInitialDiagramLoad());
    expect(getActiveFile).not.toHaveBeenCalled();
  });
});
