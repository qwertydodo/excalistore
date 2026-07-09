// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildExcalidrawFile, sceneHash } from "@/entities/diagram";
import { createFakeSceneBridgeDeps } from "../lib/testUtils";

// useAutoCreate drives the real currentSceneHash/readScene against the shared
// `bridge` singleton (real idb-keyval, which needs a real IndexedDB the
// jsdom test env doesn't provide — without this fake, the watcher's baseline
// seeding would touch bridge-backed state).
const fakeDeps = createFakeSceneBridgeDeps();

vi.mock("@/features/driveGateway", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/driveGateway")>()),
  sendToBackground: vi.fn(),
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
const { useDiagramLibraryStore } = await import("./stores/diagramLibraryStore");
const { useActiveDiagramStore } = await import("./stores/activeDiagramStore");
const { useAutoCreate } = await import("./useAutoCreate");
const { currentSceneHash, readScene } = await import("../lib/sceneBridge");

const INITIAL_LIBRARY_STATE = useDiagramLibraryStore.getState();
const INITIAL_ACTIVE_STATE = useActiveDiagramStore.getState();

beforeEach(() => {
  useDiagramLibraryStore.setState(INITIAL_LIBRARY_STATE, true);
  useActiveDiagramStore.setState(INITIAL_ACTIVE_STATE, true);
  vi.mocked(sendToBackground).mockClear();
  fakeDeps.storage.clear();
});

describe("useAutoCreate", () => {
  it("auto-creates a Drive file from the current scene once drawing is detected, without reloading", async () => {
    vi.useFakeTimers();
    try {
      vi.mocked(sendToBackground).mockImplementation(async (request) => {
        if (request.type === "drive/list") return [];
        if (request.type === "drive/create")
          return { id: "1", name: "Untitled.excalidraw", modifiedTime: "t", headRevisionId: "r1" };
        throw new Error(`unexpected request ${request.type}`);
      });
      let hash = "h0";
      vi.mocked(currentSceneHash).mockImplementation(async () => hash);

      renderHook(() => useAutoCreate());
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0); // let the baseline settle
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

  it("does not auto-create while a diagram is already active", async () => {
    vi.useFakeTimers();
    try {
      useActiveDiagramStore.setState({ activeId: "existing" });
      vi.mocked(sendToBackground).mockImplementation(async (request) => {
        if (request.type === "drive/list") return [];
        return undefined;
      });
      vi.mocked(currentSceneHash).mockImplementation(async () => "h1");

      renderHook(() => useAutoCreate());
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

  it("never auto-creates from a genuinely blank canvas, even well past the debounce window (regression coverage for the EMPTY_SCENE_HASH baseline, commit 150b16c)", async () => {
    vi.useFakeTimers();
    try {
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

      renderHook(() => useAutoCreate());
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0); // let the baseline settle
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

      renderHook(() => useAutoCreate());
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0); // let the baseline settle
      });
      const listCallsAfterMount = listCallCount;

      hash = "h1"; // user starts drawing
      await act(async () => {
        await vi.advanceTimersByTimeAsync(4000); // past the 2.5s debounce, first create fails
      });

      expect(createCallCount).toBe(1);
      // The failed attempt still refreshed the list before computing its name.
      expect(listCallCount).toBeGreaterThan(listCallsAfterMount);
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

      renderHook(() => useAutoCreate());
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0); // let the baseline settle
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
      vi.mocked(sendToBackground).mockImplementation(async (request) => {
        if (request.type === "drive/list") return [];
        if (request.type === "drive/create")
          return { id: "1", name: "Untitled.excalidraw", modifiedTime: "t", headRevisionId: "r1" };
        throw new Error(`unexpected request ${request.type}`);
      });
      let hash = "h0";
      vi.mocked(currentSceneHash).mockImplementation(async () => hash);

      const { unmount } = renderHook(() => useAutoCreate());
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0); // let the baseline settle
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
