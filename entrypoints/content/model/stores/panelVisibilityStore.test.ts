import { act } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { stubChromeStorageLocal } from "@/shared/lib/testUtils";
import { usePanelVisibilityStore } from "./panelVisibilityStore";
import { getPanelCollapsed, setPanelCollapsed } from "./sessionStore";

const INITIAL_STATE = usePanelVisibilityStore.getState();

beforeEach(() => {
  stubChromeStorageLocal();
  usePanelVisibilityStore.setState(INITIAL_STATE, true);
});

describe("panelVisibilityStore", () => {
  it("starts uninitialized, then resolves isVisible once the persisted state loads", async () => {
    expect(usePanelVisibilityStore.getState().isInitialized).toBe(false);
    await act(() => usePanelVisibilityStore.getState().loadPanelVisibility());
    expect(usePanelVisibilityStore.getState().isInitialized).toBe(true);
    expect(usePanelVisibilityStore.getState().isVisible).toBe(true);
  });

  it("stays collapsed when the persisted state is collapsed", async () => {
    await setPanelCollapsed(true);
    await act(() => usePanelVisibilityStore.getState().loadPanelVisibility());
    expect(usePanelVisibilityStore.getState().isVisible).toBe(false);
  });

  it("toggles visibility and persists the new collapsed state", async () => {
    await act(() => usePanelVisibilityStore.getState().loadPanelVisibility());
    expect(usePanelVisibilityStore.getState().isVisible).toBe(true);

    await act(() => usePanelVisibilityStore.getState().toggleVisibility());
    expect(usePanelVisibilityStore.getState().isVisible).toBe(false);
    expect(await getPanelCollapsed()).toBe(true);

    await act(() => usePanelVisibilityStore.getState().toggleVisibility());
    expect(usePanelVisibilityStore.getState().isVisible).toBe(true);
    expect(await getPanelCollapsed()).toBe(false);
  });

  it("show() opens the panel and persists not-collapsed, regardless of current state", async () => {
    usePanelVisibilityStore.setState({ isVisible: false });
    await act(() => usePanelVisibilityStore.getState().show());
    expect(usePanelVisibilityStore.getState().isVisible).toBe(true);
    expect(await getPanelCollapsed()).toBe(false);
  });
});
