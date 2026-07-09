// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { REQUEST_TYPE, sendToBackground } from "@/features/driveGateway";
import { stubChromeStorageLocal, stubSessionStorage } from "@/shared/lib/testUtils";

vi.mock("@/features/driveGateway", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/driveGateway")>()),
  sendToBackground: vi.fn(),
}));

const { useAuthStore } = await import("./stores/authStore");
const { usePanelVisibilityStore } = await import("./stores/panelVisibilityStore");
const { useConnectDrive } = await import("./useConnectDrive");

const INITIAL_AUTH_STATE = useAuthStore.getState();
const INITIAL_PANEL_STATE = usePanelVisibilityStore.getState();

beforeEach(() => {
  stubChromeStorageLocal();
  stubSessionStorage();
  useAuthStore.setState(INITIAL_AUTH_STATE, true);
  usePanelVisibilityStore.setState(INITIAL_PANEL_STATE, true);
  vi.mocked(sendToBackground).mockReset();
});

describe("useConnectDrive", () => {
  it("opens the panel once authStore.connect succeeds", async () => {
    vi.mocked(sendToBackground).mockImplementation(async (request) => {
      if (request.type === REQUEST_TYPE.DRIVE_CONNECT) {
        return { isConnected: true, folderId: "F", folderName: "Diagrams" };
      }
      throw new Error(`unexpected request ${request.type}`);
    });

    const { result } = renderHook(() => useConnectDrive());
    await result.current.onConnect("Diagrams");

    expect(useAuthStore.getState().status).toEqual({
      isConnected: true,
      folderId: "F",
      folderName: "Diagrams",
    });
    expect(usePanelVisibilityStore.getState().isVisible).toBe(true);
  });

  it("leaves the panel untouched when connect fails", async () => {
    vi.mocked(sendToBackground).mockRejectedValue(new Error("Could not connect to Google Drive"));

    const { result } = renderHook(() => useConnectDrive());
    await result.current.onConnect("Diagrams");

    expect(useAuthStore.getState().status.isConnected).toBe(false);
    expect(usePanelVisibilityStore.getState().isVisible).toBe(false);
  });
});
