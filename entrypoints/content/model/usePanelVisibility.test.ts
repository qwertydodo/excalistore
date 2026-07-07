// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { stubChromeStorageLocal } from "@/shared/lib/testUtils";
import { getPanelCollapsed, setPanelCollapsed } from "./stores/sessionStore";
import { usePanelVisibility } from "./usePanelVisibility";

beforeEach(() => {
  stubChromeStorageLocal();
});

describe("usePanelVisibility", () => {
  it("starts collapsed, then expands once the persisted state resolves to not-collapsed", async () => {
    const { result } = renderHook(() => usePanelVisibility());
    expect(result.current.isVisible).toBe(false);
    await waitFor(() => expect(result.current.isVisible).toBe(true));
  });

  it("stays collapsed when the persisted state is collapsed", async () => {
    await setPanelCollapsed(true);
    const { result } = renderHook(() => usePanelVisibility());
    await waitFor(async () => expect(await getPanelCollapsed()).toBe(true));
    expect(result.current.isVisible).toBe(false);
  });

  it("toggles visibility and persists the new collapsed state", async () => {
    const { result } = renderHook(() => usePanelVisibility());
    await waitFor(() => expect(result.current.isVisible).toBe(true));

    act(() => result.current.toggleVisibility());
    expect(result.current.isVisible).toBe(false);
    await waitFor(async () => expect(await getPanelCollapsed()).toBe(true));

    act(() => result.current.toggleVisibility());
    expect(result.current.isVisible).toBe(true);
    await waitFor(async () => expect(await getPanelCollapsed()).toBe(false));
  });
});
