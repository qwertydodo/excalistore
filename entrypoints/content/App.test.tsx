// @vitest-environment jsdom
import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { stubChromeStorageLocal } from "@/shared/lib/testUtils";
import { App } from "./App";
import { useAuthStore } from "./model/stores/authStore";
import { useDiagramLibraryStore } from "./model/stores/diagramLibraryStore";
import { usePanelVisibilityStore } from "./model/stores/panelVisibilityStore";

// useActiveDiagram drives real Drive/bridge calls on mount (see its own
// test's fake-deps setup) — irrelevant to App's init-gating logic, which only
// cares about authStore/panelVisibilityStore/diagramLibraryStore. Stub it to
// a no-op so it doesn't interfere with the state these tests drive directly.
vi.mock("./model/useActiveDiagram", () => ({ useActiveDiagram: vi.fn() }));

// useAppInit's loadStatus() call (see useAppInit.ts) goes through this — leave
// it permanently pending so it never resolves on its own, letting these tests
// drive isStatusLoaded/status by calling onStatusChange directly instead.
vi.mock("@/features/driveGateway", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/driveGateway")>()),
  sendToBackground: vi.fn(() => new Promise(() => {})),
}));

const INITIAL_AUTH_STATE = useAuthStore.getState();
const INITIAL_PANEL_STATE = usePanelVisibilityStore.getState();
const INITIAL_LIBRARY_STATE = useDiagramLibraryStore.getState();

beforeEach(() => {
  stubChromeStorageLocal();
  useAuthStore.setState(INITIAL_AUTH_STATE, true);
  usePanelVisibilityStore.setState(INITIAL_PANEL_STATE, true);
  useDiagramLibraryStore.setState(INITIAL_LIBRARY_STATE, true);
});

describe("App", () => {
  it("renders nothing until the connection status resolves", async () => {
    const { container } = render(<App />);
    // Flush useAppInit's mount effects (loadStatus() included) so any state
    // update they cause lands inside act() instead of after the test returns.
    await act(async () => {});
    expect(container).toBeEmptyDOMElement();
  });

  it("shows ConnectButton once resolved as not connected", async () => {
    render(<App />);
    act(() => useAuthStore.getState().onStatusChange({ isConnected: false }));
    await screen.findByRole("button", { name: /connect google drive/i });
    expect(screen.queryByLabelText("Excalistore diagrams")).not.toBeInTheDocument();
  });

  it("renders nothing while connected but the panel-visibility store hasn't resolved yet", async () => {
    // useAppInit fires more than one chrome.storage.local.get() on mount
    // (panel-collapsed + search query) — queue every pending resolver rather
    // than assuming a single call, so this doesn't depend on hook-effect order.
    const pendingResolvers: Array<(v: Record<string, unknown>) => void> = [];
    vi.stubGlobal("chrome", {
      storage: {
        local: {
          get: vi.fn(
            () =>
              new Promise((resolve) => {
                pendingResolvers.push(resolve);
              }),
          ),
          set: vi.fn(async () => undefined),
          remove: vi.fn(async () => undefined),
        },
      },
    });

    const { container } = render(<App />);
    act(() => useAuthStore.getState().onStatusChange({ isConnected: true }));
    expect(container).toBeEmptyDOMElement();

    for (const resolve of pendingResolvers) resolve({});
    await screen.findByLabelText("Excalistore diagrams");
  });

  it("shows the diagram panel once connection status, panel visibility, and the search query all resolve", async () => {
    render(<App />);
    act(() => useAuthStore.getState().onStatusChange({ isConnected: true }));
    await waitFor(() => expect(usePanelVisibilityStore.getState().isInitialized).toBe(true));
    await waitFor(() => expect(useDiagramLibraryStore.getState().isQueryLoaded).toBe(true));
    await screen.findByLabelText("Excalistore diagrams");
  });
});
