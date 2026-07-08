// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { REQUEST_TYPE } from "@/features/driveGateway";
import { createFakeSceneBridgeDeps } from "../lib/testUtils";

const fakeDeps = createFakeSceneBridgeDeps();

vi.mock("@/features/driveGateway", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/driveGateway")>()),
  sendToBackground: vi.fn(),
}));
vi.mock("../lib/bridge", () => ({ bridge: fakeDeps }));

const { sendToBackground } = await import("@/features/driveGateway");
const { useActiveDiagramStore } = await import("./stores/activeDiagramStore");
const { useSignOutFlow } = await import("./useSignOutFlow");

const INITIAL_ACTIVE_STATE = useActiveDiagramStore.getState();

beforeEach(() => {
  useActiveDiagramStore.setState(INITIAL_ACTIVE_STATE, true);
  fakeDeps.storage.clear();
  vi.mocked(sendToBackground).mockReset();
  vi.mocked(fakeDeps.reload).mockClear();
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

  it("sets isSigningOut at the very start of doSignOut, before the auto-create watcher could see isConnected flip", async () => {
    vi.mocked(sendToBackground).mockResolvedValue(undefined);
    const { result } = renderHook(() => useSignOutFlow());

    await act(async () => {
      await result.current.doSignOut();
    });

    // Success path: clearScene reloads the tab (fake reload is a no-op here),
    // so a real reload would reset this naturally — no explicit reset is
    // expected on success.
    expect(useActiveDiagramStore.getState().isSigningOut).toBe(true);
    expect(fakeDeps.reload).toHaveBeenCalledOnce();
  });

  it("resets isSigningOut back to false when the sign-out sequence fails, so auto-create resumes", async () => {
    vi.mocked(sendToBackground).mockImplementation(async (request) => {
      if (request.type === REQUEST_TYPE.AUTH_SIGN_OUT) throw new Error("revoke failed");
      throw new Error(`unexpected request ${request.type}`);
    });
    const { result } = renderHook(() => useSignOutFlow());

    await act(async () => {
      await result.current.doSignOut();
    });

    expect(useActiveDiagramStore.getState().isSigningOut).toBe(false);
    expect(useActiveDiagramStore.getState().actionError).toBe("revoke failed");
  });
});
