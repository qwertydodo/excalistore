// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { stubChromeStorageLocal, stubSessionStorage } from "@/shared/lib/testUtils";
import { createFakeSceneBridgeDeps } from "../lib/testUtils";
import { useActiveDiagramStore } from "./stores/activeDiagramStore";
import { useAuthStore } from "./stores/authStore";
import { useSignOutFlow } from "./useSignOutFlow";

const fakeDeps = createFakeSceneBridgeDeps();

vi.mock("../lib/bridge", () => ({ bridge: fakeDeps }));
vi.mock("../lib/sceneBridge", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/sceneBridge")>()),
  clearScene: vi.fn(async () => undefined),
}));

const { clearScene } = await import("../lib/sceneBridge");

const INITIAL_ACTIVE_STATE = useActiveDiagramStore.getState();
const INITIAL_AUTH_STATE = useAuthStore.getState();

beforeEach(() => {
  useActiveDiagramStore.setState(INITIAL_ACTIVE_STATE, true);
  useAuthStore.setState(INITIAL_AUTH_STATE, true);
  stubChromeStorageLocal();
  stubSessionStorage();
  vi.mocked(clearScene).mockClear();
});

describe("useSignOutFlow", () => {
  it("keeps doSignOut/openSignOut/cancelSignOut referentially stable across re-renders", () => {
    // Not consumed by any effect deps today, but they are passed down as
    // props — an unstable identity here churns child re-renders every render.
    const { result, rerender } = renderHook(() => useSignOutFlow());
    const first = result.current;
    rerender();
    const second = result.current;
    expect(second.doSignOut).toBe(first.doSignOut);
    expect(second.openSignOut).toBe(first.openSignOut);
    expect(second.cancelSignOut).toBe(first.cancelSignOut);
  });

  it("signs out, disconnects authStore, and clears the canvas", async () => {
    const signOut = vi.fn(async () => undefined);
    useAuthStore.setState({ signOut });
    const { result } = renderHook(() => useSignOutFlow());

    await act(async () => {
      await result.current.doSignOut();
    });

    expect(signOut).toHaveBeenCalled();
    expect(clearScene).toHaveBeenCalledWith(fakeDeps);
    expect(useActiveDiagramStore.getState().actionError).toBeNull();
  });

  it("surfaces an error and skips clearing the canvas when signOut fails", async () => {
    const signOut = vi.fn(async () => {
      throw new Error("network down");
    });
    useAuthStore.setState({ signOut });
    const { result } = renderHook(() => useSignOutFlow());

    await act(async () => {
      await result.current.doSignOut();
    });

    expect(useActiveDiagramStore.getState().actionError).toBe("network down");
    expect(clearScene).not.toHaveBeenCalled();
  });
});
