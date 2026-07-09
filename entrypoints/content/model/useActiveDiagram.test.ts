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
const { getActiveFile, getCachedFiles } = await import("./stores/sessionStore");
const { useAuthStore } = await import("./stores/authStore");
const { useDiagramLibraryStore } = await import("./stores/diagramLibraryStore");
const { useActiveDiagramStore } = await import("./stores/activeDiagramStore");
const { useActiveDiagram } = await import("./useActiveDiagram");
const { currentSceneHash, readScene } = await import("../lib/sceneBridge");

const INITIAL_AUTH_STATE = useAuthStore.getState();
const INITIAL_LIBRARY_STATE = useDiagramLibraryStore.getState();
const INITIAL_ACTIVE_STATE = useActiveDiagramStore.getState();

// useAppInit owns the loadStatus() call in production (see useAppInit.ts) —
// useActiveDiagram only reacts to isStatusLoaded/status.isConnected once
// they're already resolved. Since these tests render useActiveDiagram in
// isolation (no useAppInit), seed that resolved state directly instead.
const connectAs = (isConnected: boolean) =>
  useAuthStore.setState({ status: { isConnected }, isStatusLoaded: true });

beforeEach(() => {
  useAuthStore.setState(INITIAL_AUTH_STATE, true);
  useDiagramLibraryStore.setState(INITIAL_LIBRARY_STATE, true);
  useActiveDiagramStore.setState(INITIAL_ACTIVE_STATE, true);
  vi.mocked(sendToBackground).mockClear();
  vi.mocked(getActiveFile).mockClear();
  vi.mocked(getCachedFiles).mockClear();
  fakeDeps.storage.clear();
});

describe("useActiveDiagram", () => {
  it("runs the initial load effect only once across re-renders (regression: onActivePointerChange is a zustand action, always stable, so this must never loop)", async () => {
    connectAs(false);
    const { rerender } = renderHook(() => useActiveDiagram());
    await waitFor(() => expect(getActiveFile).toHaveBeenCalledTimes(1));
    rerender();
    rerender();
    expect(getActiveFile).toHaveBeenCalledTimes(1);
  });

  it("adopts the active pointer from the cached list immediately, without waiting on the network refresh", async () => {
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
      connectAs(true);
      vi.mocked(getActiveFile).mockResolvedValue(null);
      vi.mocked(getCachedFiles).mockResolvedValue([]);
      vi.mocked(sendToBackground).mockImplementation(async (request) => {
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
      connectAs(false);
      vi.mocked(getActiveFile).mockResolvedValue(null);
      vi.mocked(getCachedFiles).mockResolvedValue([]);
      vi.mocked(sendToBackground).mockImplementation(async (request) => {
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
      connectAs(true);
      useActiveDiagramStore.setState({ activeId: "existing" });
      vi.mocked(getActiveFile).mockResolvedValue(null);
      vi.mocked(getCachedFiles).mockResolvedValue([]);
      vi.mocked(sendToBackground).mockImplementation(async (request) => {
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
      connectAs(true);
      let resolveList: (v: unknown) => void = () => {};
      let isInitialListResolved = false;
      vi.mocked(getActiveFile).mockResolvedValue(null);
      vi.mocked(getCachedFiles).mockResolvedValue([]);
      vi.mocked(sendToBackground).mockImplementation(async (request) => {
        if (request.type === "drive/list") {
          // Only the initial load's list call stalls; the auto-create
          // watcher's own refresh()-before-retry call (Fix A) should resolve
          // normally once the initial load has gone through.
          if (isInitialListResolved) return [];
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

      isInitialListResolved = true;
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
      connectAs(true);
      vi.mocked(getActiveFile).mockResolvedValue(null);
      vi.mocked(getCachedFiles).mockResolvedValue([]);
      vi.mocked(sendToBackground).mockImplementation(async (request) => {
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

  it("refreshes the file list from Drive before retrying a failed create (dedupe against a lost-response partial success)", async () => {
    vi.useFakeTimers();
    try {
      connectAs(true);
      vi.mocked(getActiveFile).mockResolvedValue(null);
      vi.mocked(getCachedFiles).mockResolvedValue([]);
      let listCallCount = 0;
      let createCallCount = 0;
      vi.mocked(sendToBackground).mockImplementation(async (request) => {
        if (request.type === "drive/list") {
          listCallCount++;
          return [];
        }
        if (request.type === "drive/create") {
          createCallCount++;
          if (createCallCount === 1) throw new Error("network blip");
          return { id: "1", name: "Untitled.excalidraw", modifiedTime: "t", headRevisionId: "r1" };
        }
        throw new Error(`unexpected request ${request.type}`);
      });
      let hash = "h0";
      vi.mocked(currentSceneHash).mockImplementation(async () => hash);

      renderHook(() => useActiveDiagram());
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0); // let the initial load + baseline settle
      });
      const listCallsAfterInitialLoad = listCallCount;

      hash = "h1"; // user starts drawing
      await act(async () => {
        await vi.advanceTimersByTimeAsync(4000); // past the 2.5s debounce, first create fails
      });

      expect(createCallCount).toBe(1);
      // The failed attempt still refreshed the list before computing its name.
      expect(listCallCount).toBeGreaterThan(listCallsAfterInitialLoad);
      const listCallsAfterFirstAttempt = listCallCount;

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000); // next ~1s tick retries
      });

      // The retry refreshed the list again (rather than trusting the stale
      // local snapshot) before recomputing the name and retrying the create.
      expect(listCallCount).toBeGreaterThan(listCallsAfterFirstAttempt);
      expect(createCallCount).toBe(2);
      expect(useActiveDiagramStore.getState().activeId).toBe("1");
    } finally {
      vi.useRealTimers();
    }
  });

  it("picks a distinct name on retry when the failed attempt actually succeeded on Drive (lost-response partial success)", async () => {
    vi.useFakeTimers();
    try {
      connectAs(true);
      vi.mocked(getActiveFile).mockResolvedValue(null);
      vi.mocked(getCachedFiles).mockResolvedValue([]);
      // Simulates the scenario the refresh()-before-retry fix (9bd3f2f)
      // guards against: the first drive/create actually landed on Drive,
      // but the client never saw the response (so it retries) and the
      // retry's refreshed list now contains the file the first attempt
      // created under the name the retry would otherwise reuse.
      const collidingFile = {
        id: "1",
        name: "Untitled.excalidraw",
        modifiedTime: "t",
        headRevisionId: "r1",
      };
      let hasFirstCreateFailed = false;
      vi.mocked(sendToBackground).mockImplementation(async (request) => {
        if (request.type === "drive/list") return hasFirstCreateFailed ? [collidingFile] : [];
        if (request.type === "drive/create") {
          if (!hasFirstCreateFailed) {
            hasFirstCreateFailed = true;
            throw new Error("network blip");
          }
          return {
            id: "2",
            name: "Untitled 2.excalidraw",
            modifiedTime: "t",
            headRevisionId: "r2",
          };
        }
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
        await vi.advanceTimersByTimeAsync(4000); // past the 2.5s debounce, first create fails
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000); // next ~1s tick retries
      });

      const createCalls = vi
        .mocked(sendToBackground)
        .mock.calls.filter(([request]) => request.type === "drive/create");
      expect(createCalls).toHaveLength(2);
      const [firstCreateCall, secondCreateCall] = createCalls;
      expect(firstCreateCall?.[0]).toMatchObject({ name: "Untitled.excalidraw" });
      // The retry must not reuse "Untitled.excalidraw" — that name is now
      // taken on Drive's side, even though the client's own snapshot never
      // recorded it. Only refreshing before computing the name avoids this.
      expect(secondCreateCall?.[0]).toMatchObject({ name: "Untitled 2.excalidraw" });
      expect(useActiveDiagramStore.getState().activeId).toBe("2");
    } finally {
      vi.useRealTimers();
    }
  });

  it("never fires onAutoCreate on cleanup, since nothing has been saved yet to protect with a flush", async () => {
    vi.useFakeTimers();
    try {
      connectAs(true);
      vi.mocked(getActiveFile).mockResolvedValue(null);
      vi.mocked(getCachedFiles).mockResolvedValue([]);
      vi.mocked(sendToBackground).mockImplementation(async (request) => {
        if (request.type === "drive/list") return [];
        if (request.type === "drive/create")
          return { id: "1", name: "Untitled.excalidraw", modifiedTime: "t", headRevisionId: "r1" };
        throw new Error(`unexpected request ${request.type}`);
      });
      let hash = "h0";
      vi.mocked(currentSceneHash).mockImplementation(async () => hash);

      const { unmount } = renderHook(() => useActiveDiagram());
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0); // let the initial load + baseline settle
      });

      hash = "h1"; // user starts drawing, well under the debounce window
      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
      });

      unmount(); // cleanup runs: no flush() call exists here, and the timer is stopped

      await act(async () => {
        // Past the debounce window and several more ~1s ticks — if the timer
        // weren't also stopped on cleanup, a dangling tick would eventually
        // retrigger the save on its own even without an explicit flush.
        await vi.advanceTimersByTimeAsync(5000);
      });

      expect(sendToBackground).not.toHaveBeenCalledWith(
        expect.objectContaining({ type: "drive/create" }),
      );
    } finally {
      vi.useRealTimers();
    }
  });
});
