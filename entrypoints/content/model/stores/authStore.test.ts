import { beforeEach, describe, expect, it, vi } from "vitest";
import { REQUEST_TYPE, sendToBackground } from "@/features/driveGateway";

vi.mock("@/features/driveGateway", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/driveGateway")>()),
  sendToBackground: vi.fn(),
}));

const { useAuthStore } = await import("./authStore");

const INITIAL_AUTH_STATE = useAuthStore.getState();

beforeEach(() => {
  useAuthStore.setState(INITIAL_AUTH_STATE, true);
  vi.mocked(sendToBackground).mockReset();
});

describe("onStatusChange", () => {
  it("sets the store's status and flips isStatusLoaded", () => {
    useAuthStore.getState().onStatusChange({ isConnected: true });
    expect(useAuthStore.getState().status).toEqual({ isConnected: true });
    expect(useAuthStore.getState().isStatusLoaded).toBe(true);
  });
});

describe("loadStatus", () => {
  it("loads the connection status and flips isStatusLoaded", async () => {
    vi.mocked(sendToBackground).mockResolvedValue({ isConnected: true, folderName: "Diagrams" });
    await useAuthStore.getState().loadStatus();
    expect(useAuthStore.getState().status).toEqual({ isConnected: true, folderName: "Diagrams" });
    expect(useAuthStore.getState().isStatusLoaded).toBe(true);
  });

  it("falls back to disconnected (without leaving isStatusLoaded stuck false) on failure", async () => {
    vi.mocked(sendToBackground).mockRejectedValue(new Error("background unreachable"));
    await useAuthStore.getState().loadStatus();
    expect(useAuthStore.getState().status).toEqual({ isConnected: false });
    expect(useAuthStore.getState().isStatusLoaded).toBe(true);
  });
});

describe("connect", () => {
  it("connects and flips isStatusLoaded on success", async () => {
    vi.mocked(sendToBackground).mockResolvedValue({
      isConnected: true,
      folderId: "F",
      folderName: "Diagrams",
    });

    await useAuthStore.getState().connect("Diagrams");

    expect(useAuthStore.getState().status).toEqual({
      isConnected: true,
      folderId: "F",
      folderName: "Diagrams",
    });
    expect(useAuthStore.getState().isStatusLoaded).toBe(true);
    expect(useAuthStore.getState().isConnecting).toBe(false);
  });

  it("surfaces the error and resets isConnecting on failure", async () => {
    vi.mocked(sendToBackground).mockRejectedValue(new Error("Could not connect to Google Drive"));
    await useAuthStore.getState().connect("Diagrams");
    expect(useAuthStore.getState().connectError).toBe("Could not connect to Google Drive");
    expect(useAuthStore.getState().isConnecting).toBe(false);
    expect(useAuthStore.getState().status.isConnected).toBe(false);
  });

  it("ignores a second call while a connect is already in flight", async () => {
    let resolveConnect: (v: { isConnected: boolean }) => void = () => {};
    vi.mocked(sendToBackground).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveConnect = resolve;
        }),
    );
    const first = useAuthStore.getState().connect("Diagrams");
    await useAuthStore.getState().connect("Diagrams"); // no-op: already connecting
    expect(sendToBackground).toHaveBeenCalledTimes(1);
    resolveConnect({ isConnected: false });
    await first;
  });
});

describe("signOut", () => {
  it("calls AUTH_SIGN_OUT and resets status to disconnected", async () => {
    useAuthStore.setState({ status: { isConnected: true, folderName: "Diagrams" } });
    vi.mocked(sendToBackground).mockResolvedValue(undefined);

    await useAuthStore.getState().signOut();

    expect(sendToBackground).toHaveBeenCalledWith({ type: REQUEST_TYPE.AUTH_SIGN_OUT });
    expect(useAuthStore.getState().status).toEqual({ isConnected: false });
    expect(useAuthStore.getState().isStatusLoaded).toBe(true);
  });

  it("propagates a failure without changing status, so the caller can surface it", async () => {
    useAuthStore.setState({ status: { isConnected: true } });
    vi.mocked(sendToBackground).mockRejectedValue(new Error("network down"));

    await expect(useAuthStore.getState().signOut()).rejects.toThrow("network down");
    expect(useAuthStore.getState().status).toEqual({ isConnected: true });
  });
});
