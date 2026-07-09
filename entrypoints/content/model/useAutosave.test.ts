// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { stubSessionStorage } from "@/shared/lib/testUtils";
import { createFakeSceneBridgeDeps } from "../lib/testUtils";

// useAutosave drives the real currentSceneHash against the shared `bridge`
// singleton (real idb-keyval, which needs a real IndexedDB the jsdom test env
// doesn't provide — without this fake, the baseline-establishment promise
// rejects unhandled once activeId goes truthy).
const fakeDeps = createFakeSceneBridgeDeps();

vi.mock("@/features/driveGateway", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/driveGateway")>()),
  sendToBackground: vi.fn(),
}));
vi.mock("../lib/bridge", () => ({ bridge: fakeDeps }));
vi.mock("../lib/sceneBridge", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/sceneBridge")>()),
  currentSceneHash: vi.fn(async () => "h0"),
}));

const { sendToBackground } = await import("@/features/driveGateway");
const { useActiveDiagramStore } = await import("./stores/activeDiagramStore");
const { useAutosave } = await import("./useAutosave");
const { currentSceneHash } = await import("../lib/sceneBridge");

const INITIAL_ACTIVE_STATE = useActiveDiagramStore.getState();

beforeEach(() => {
  stubSessionStorage();
  useActiveDiagramStore.setState(INITIAL_ACTIVE_STATE, true);
  vi.mocked(sendToBackground).mockClear();
  fakeDeps.storage.clear();
});

describe("useAutosave", () => {
  it("saves via drive/update once a change has been stable past the debounce", async () => {
    vi.useFakeTimers();
    try {
      useActiveDiagramStore.setState({ activeId: "1", revision: "r1" });
      vi.mocked(sendToBackground).mockImplementation(async (request) => {
        if (request.type === "drive/update")
          return { id: "1", name: "a.excalidraw", modifiedTime: "t", headRevisionId: "r2" };
        throw new Error(`unexpected request ${request.type}`);
      });
      let hash = "h0";
      vi.mocked(currentSceneHash).mockImplementation(async () => hash);

      renderHook(() => useAutosave());
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0); // baseline established
      });

      hash = "h1"; // user edits
      await act(async () => {
        await vi.advanceTimersByTimeAsync(4000); // past the 2.5s debounce
      });

      expect(sendToBackground).toHaveBeenCalledWith(
        expect.objectContaining({ type: "drive/update", id: "1", prevRevision: "r1" }),
      );
      expect(useActiveDiagramStore.getState().revision).toBe("r2");
      expect(useActiveDiagramStore.getState().saveStatus).toBe("saved");
    } finally {
      vi.useRealTimers();
    }
  });

  it("flushes a pending dirty change on unmount", async () => {
    vi.useFakeTimers();
    try {
      useActiveDiagramStore.setState({ activeId: "1", revision: "r1" });
      vi.mocked(sendToBackground).mockImplementation(async (request) => {
        if (request.type === "drive/update")
          return { id: "1", name: "a.excalidraw", modifiedTime: "t", headRevisionId: "r2" };
        throw new Error(`unexpected request ${request.type}`);
      });
      let hash = "h0";
      vi.mocked(currentSceneHash).mockImplementation(async () => hash);

      const { unmount } = renderHook(() => useAutosave());
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0); // baseline established
      });

      hash = "h1"; // dirty, inside the debounce window
      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
      });

      unmount();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0); // let the flush settle
      });

      expect(sendToBackground).toHaveBeenCalledWith(
        expect.objectContaining({ type: "drive/update", id: "1" }),
      );
    } finally {
      vi.useRealTimers();
    }
  });
});
