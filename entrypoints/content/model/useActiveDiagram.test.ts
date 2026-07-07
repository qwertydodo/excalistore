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
}));

const { sendToBackground } = await import("@/features/driveGateway");
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
});
