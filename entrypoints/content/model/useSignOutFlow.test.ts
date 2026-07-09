// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { stubChromeStorageLocal, stubSessionStorage } from "@/shared/lib/testUtils";
import { createFakeSceneBridgeDeps } from "../lib/testUtils";

// fakeDeps must be assigned before any (possibly transitive) import of
// "../lib/bridge" resolves — static imports of activeDiagramStore/authStore
// here would import bridge before this const runs (vi.mock factories are
// hoisted above imports, but this file's own top-level statements are not),
// so every store/hook below is loaded dynamically, after the mocks are set.
const fakeDeps = createFakeSceneBridgeDeps();

vi.mock("../lib/bridge", () => ({ bridge: fakeDeps }));
vi.mock("../lib/sceneBridge", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/sceneBridge")>()),
  clearScene: vi.fn(async () => undefined),
}));

const { useActiveDiagramStore } = await import("./stores/activeDiagramStore");
const { useAuthStore } = await import("./stores/authStore");
const { useSignOutFlow } = await import("./useSignOutFlow");
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
