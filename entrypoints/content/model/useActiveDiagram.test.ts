// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildExcalidrawFile, sceneHash } from "@/entities/diagram";
import { createFakeSceneBridgeDeps } from "../lib/testUtils";

// useActiveDiagram drives the real currentSceneHash/readScene against the
// shared `bridge` singleton (real idb-keyval, which needs a real IndexedDB
// the jsdom test env doesn't provide — without this fake, the autosave
// effect's baseline-establishment promise rejects unhandled once activeId
// goes truthy).
const fakeDeps = createFakeSceneBridgeDeps();

vi.mock("@/features/driveGateway", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/driveGateway")>()),
  sendToBackground: vi.fn(async () => ({ isConnected: false })),
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
const { getActiveFile, getCachedFiles } = await import("./stores/sessionStore");
const { useDiagramLibraryStore } = await import("./stores/diagramLibraryStore");
const { useActiveDiagramStore } = await import("./stores/activeDiagramStore");
const { useActiveDiagram } = await import("./useActiveDiagram");
const { currentSceneHash, readScene } = await import("../lib/sceneBridge");

const INITIAL_LIBRARY_STATE = useDiagramLibraryStore.getState();
const INITIAL_ACTIVE_STATE = useActiveDiagramStore.getState();

beforeEach(() => {
  useDiagramLibraryStore.setState(INITIAL_LIBRARY_STATE, true);
  useActiveDiagramStore.setState(INITIAL_ACTIVE_STATE, true);
  vi.mocked(sendToBackground).mockClear();
  fakeDeps.storage.clear();
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

describe("auto-create watcher", () => {
  it("auto-creates a Drive file from the current scene once drawing is detected, without reloading", async () => {
    vi.useFakeTimers();
    try {
      vi.mocked(getActiveFile).mockResolvedValue(null);
      vi.mocked(getCachedFiles).mockResolvedValue([]);
      vi.mocked(sendToBackground).mockImplementation(async (request) => {
        if (request.type === "auth/status") return { isConnected: true };
        if (request.type === "drive/list") return [];
        if (request.type === "drive/create")
          return { id: "1", name: "Untitled.excalidraw", modifiedTime: "t", headRevisionId: "r1" };
        throw new Error(`unexpected request ${request.type}`);
      });
      let hash = "h0";
      vi.mocked(currentSceneHash).mockImplementation(async () => hash);

      renderHook(() => useActiveDiagram());
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0); // let the initial load + baseline settle
      });

      hash = "h1"; // user starts drawing
      await act(async () => {
        await vi.advanceTimersByTimeAsync(4000); // past the 2.5s debounce
      });

      expect(sendToBackground).toHaveBeenCalledWith({
        type: "drive/create",
        name: "Untitled.excalidraw",
        content: expect.any(String),
      });
      expect(useActiveDiagramStore.getState().activeId).toBe("1");
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not auto-create while disconnected", async () => {
    vi.useFakeTimers();
    try {
      vi.mocked(getActiveFile).mockResolvedValue(null);
      vi.mocked(getCachedFiles).mockResolvedValue([]);
      vi.mocked(sendToBackground).mockImplementation(async (request) => {
        if (request.type === "auth/status") return { isConnected: false };
        throw new Error(`unexpected request ${request.type}`);
      });
      vi.mocked(currentSceneHash).mockImplementation(async () => "h1");

      renderHook(() => useActiveDiagram());
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });

      expect(sendToBackground).not.toHaveBeenCalledWith(
        expect.objectContaining({ type: "drive/create" }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not auto-create while a diagram is already active", async () => {
    vi.useFakeTimers();
    try {
      useActiveDiagramStore.setState({ activeId: "existing" });
      vi.mocked(getActiveFile).mockResolvedValue(null);
      vi.mocked(getCachedFiles).mockResolvedValue([]);
      vi.mocked(sendToBackground).mockImplementation(async (request) => {
        if (request.type === "auth/status") return { isConnected: true };
        if (request.type === "drive/list") return [];
        return undefined;
      });
      vi.mocked(currentSceneHash).mockImplementation(async () => "h1");

      renderHook(() => useActiveDiagram());
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });

      expect(sendToBackground).not.toHaveBeenCalledWith(
        expect.objectContaining({ type: "drive/create" }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not auto-create before the initial load/reconciliation finishes", async () => {
    vi.useFakeTimers();
    try {
      let resolveList: (v: unknown) => void = () => {};
      vi.mocked(getActiveFile).mockResolvedValue(null);
      vi.mocked(getCachedFiles).mockResolvedValue([]);
      vi.mocked(sendToBackground).mockImplementation(async (request) => {
        if (request.type === "auth/status") return { isConnected: true };
        if (request.type === "drive/list") {
          return new Promise((resolve) => {
            resolveList = resolve;
          });
        }
        if (request.type === "drive/create")
          return { id: "1", name: "Untitled.excalidraw", modifiedTime: "t", headRevisionId: "r1" };
        throw new Error(`unexpected request ${request.type}`);
      });
      vi.mocked(currentSceneHash).mockImplementation(async () => "h1");

      renderHook(() => useActiveDiagram());
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000); // isConnected is true, but the list call is stuck pending
      });
      expect(sendToBackground).not.toHaveBeenCalledWith(
        expect.objectContaining({ type: "drive/create" }),
      );

      resolveList([]); // initial load finally completes
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0); // let the mount settle
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });
      expect(sendToBackground).toHaveBeenCalledWith(
        expect.objectContaining({ type: "drive/create" }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("never auto-creates from a genuinely blank canvas, even well past the debounce window (regression coverage for the EMPTY_SCENE_HASH baseline, commit 150b16c)", async () => {
    vi.useFakeTimers();
    try {
      vi.mocked(getActiveFile).mockResolvedValue(null);
      vi.mocked(getCachedFiles).mockResolvedValue([]);
      vi.mocked(sendToBackground).mockImplementation(async (request) => {
        if (request.type === "auth/status") return { isConnected: true };
        if (request.type === "drive/list") return [];
        throw new Error(`unexpected request ${request.type}`);
      });
      // Exercise the real hashing path instead of the literal-string mock the
      // other scenarios above use: readScene returns an actually-blank
      // envelope, and currentSceneHash delegates to the real sceneHash over
      // it, so this reproduces the exact EMPTY_SCENE_HASH the source module
      // seeds the watcher's baseline with.
      vi.mocked(readScene).mockResolvedValue(buildExcalidrawFile([], {}, {}));
      vi.mocked(currentSceneHash).mockImplementation(async (deps) =>
        sceneHash(await readScene(deps)),
      );

      renderHook(() => useActiveDiagram());
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0); // let the initial load + baseline settle
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000); // well past the 2.5s debounce
      });

      expect(sendToBackground).not.toHaveBeenCalledWith(
        expect.objectContaining({ type: "drive/create" }),
      );
    } finally {
      vi.useRealTimers();
    }
  });
});
