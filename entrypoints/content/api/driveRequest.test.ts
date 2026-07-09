import { beforeEach, describe, expect, it, vi } from "vitest";
import { ERROR_CODE, RequestError, sendToBackground } from "@/features/driveGateway";

vi.mock("@/features/driveGateway", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/driveGateway")>()),
  sendToBackground: vi.fn(),
}));

const { sendDriveRequest } = await import("./driveRequest");
const { useAuthStore } = await import("../model/stores/authStore");

const INITIAL_AUTH_STATE = useAuthStore.getState();

beforeEach(() => {
  useAuthStore.setState(INITIAL_AUTH_STATE, true);
  vi.mocked(sendToBackground).mockReset();
});

describe("sendDriveRequest", () => {
  it("passes the request through and returns the response", async () => {
    vi.mocked(sendToBackground).mockResolvedValue([{ id: "1" }]);

    await expect(sendDriveRequest({ type: "drive/list" })).resolves.toEqual([{ id: "1" }]);
    expect(sendToBackground).toHaveBeenCalledWith({ type: "drive/list" });
  });

  it("marks the auth store disconnected on an unauthorized error, then rethrows", async () => {
    useAuthStore.setState({ status: { isConnected: true }, isStatusLoaded: true });
    vi.mocked(sendToBackground).mockRejectedValue(
      new RequestError("insufficient scopes", ERROR_CODE.UNAUTHORIZED),
    );

    await expect(sendDriveRequest({ type: "drive/list" })).rejects.toThrow("insufficient scopes");
    expect(useAuthStore.getState().status.isConnected).toBe(false);
  });

  it("leaves the auth store untouched on non-auth errors", async () => {
    useAuthStore.setState({ status: { isConnected: true }, isStatusLoaded: true });
    vi.mocked(sendToBackground).mockRejectedValue(new Error("network down"));

    await expect(sendDriveRequest({ type: "drive/list" })).rejects.toThrow("network down");
    expect(useAuthStore.getState().status.isConnected).toBe(true);
  });
});
