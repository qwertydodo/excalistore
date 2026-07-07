import { beforeEach, describe, expect, it, vi } from "vitest";
import { ERROR_CODE, REQUEST_TYPE, RequestError, sendToBackground } from "@/features/driveGateway";
import { stubChromeStorageLocal, stubSessionStorage } from "@/shared/lib/testUtils";
import { getCachedFiles, getPanelCollapsed, setDiagramSearchQuery } from "./sessionStore";

vi.mock("@/features/driveGateway", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/driveGateway")>()),
  sendToBackground: vi.fn(),
}));

const { useDiagramLibraryStore } = await import("./diagramLibraryStore");

const INITIAL_STATE = useDiagramLibraryStore.getState();
const files = [{ id: "1", name: "a.excalidraw", modifiedTime: "t", headRevisionId: "r" }];

beforeEach(() => {
  stubChromeStorageLocal();
  stubSessionStorage();
  useDiagramLibraryStore.setState(INITIAL_STATE, true);
  vi.mocked(sendToBackground).mockReset();
});

describe("onStatusChange / onFilesChange", () => {
  it("set the store's status and files", () => {
    useDiagramLibraryStore.getState().onStatusChange({ isConnected: true });
    expect(useDiagramLibraryStore.getState().status).toEqual({ isConnected: true });

    useDiagramLibraryStore.getState().onFilesChange(files);
    expect(useDiagramLibraryStore.getState().files).toEqual(files);
  });
});

describe("refresh", () => {
  it("loads the file list, caches it, and clears isFilesLoading", async () => {
    vi.mocked(sendToBackground).mockResolvedValue(files);
    const result = await useDiagramLibraryStore.getState().refresh();
    expect(result).toEqual(files);
    expect(useDiagramLibraryStore.getState().files).toEqual(files);
    expect(useDiagramLibraryStore.getState().isFilesLoading).toBe(false);
    await expect(getCachedFiles()).resolves.toEqual(files);
  });

  it("does not flip isFilesLoading on a same-session reload once the list was already validated (background revalidation)", async () => {
    // Simulate: this tab already validated the list once (e.g. right before
    // an open/switch reload), and the fast-paint cache repainted it on mount.
    vi.mocked(sendToBackground).mockResolvedValue(files);
    await useDiagramLibraryStore.getState().refresh(); // marks the session validated
    useDiagramLibraryStore.setState({ files });

    let resolveList: (v: typeof files) => void = () => {};
    vi.mocked(sendToBackground).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveList = resolve;
        }),
    );
    const pending = useDiagramLibraryStore.getState().refresh();
    expect(useDiagramLibraryStore.getState().isFilesLoading).toBe(false);
    resolveList(files);
    await pending;
  });

  it("shows the loader on a fresh tab session even if a stale cached list is already painted", async () => {
    // Cache from a previous session was painted, but this session has never
    // validated it against Drive yet — Drive may have changed meanwhile.
    useDiagramLibraryStore.setState({ files });
    let resolveList: (v: typeof files) => void = () => {};
    vi.mocked(sendToBackground).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveList = resolve;
        }),
    );
    const pending = useDiagramLibraryStore.getState().refresh();
    expect(useDiagramLibraryStore.getState().isFilesLoading).toBe(true);
    resolveList(files);
    await pending;
    expect(useDiagramLibraryStore.getState().isFilesLoading).toBe(false);
  });

  it("marks the store disconnected on an unauthorized error", async () => {
    vi.mocked(sendToBackground).mockRejectedValue(
      new RequestError("insufficient scopes", ERROR_CODE.UNAUTHORIZED),
    );
    const result = await useDiagramLibraryStore.getState().refresh();
    expect(result).toEqual([]);
    expect(useDiagramLibraryStore.getState().status).toEqual({ isConnected: false });
    expect(useDiagramLibraryStore.getState().isFilesLoading).toBe(false);
  });

  it("leaves status untouched on a non-auth error", async () => {
    useDiagramLibraryStore.setState({ status: { isConnected: true } });
    vi.mocked(sendToBackground).mockRejectedValue(new Error("network down"));
    const result = await useDiagramLibraryStore.getState().refresh();
    expect(result).toEqual([]);
    expect(useDiagramLibraryStore.getState().status).toEqual({ isConnected: true });
  });
});

describe("loadInitialQuery", () => {
  it("resolves the persisted search query and flips isQueryLoaded", async () => {
    await setDiagramSearchQuery("meeting");
    await useDiagramLibraryStore.getState().loadInitialQuery();
    expect(useDiagramLibraryStore.getState().initialQuery).toBe("meeting");
    expect(useDiagramLibraryStore.getState().isQueryLoaded).toBe(true);
  });
});

describe("connect", () => {
  it("connects, opens the panel, and refreshes the file list on success", async () => {
    vi.mocked(sendToBackground).mockImplementation(async (request) => {
      if (request.type === REQUEST_TYPE.DRIVE_CONNECT) {
        return { isConnected: true, folderId: "F", folderName: "Diagrams" };
      }
      if (request.type === REQUEST_TYPE.DRIVE_LIST) return files;
      throw new Error(`unexpected request ${request.type}`);
    });

    await useDiagramLibraryStore.getState().connect("Diagrams");

    expect(useDiagramLibraryStore.getState().status).toEqual({
      isConnected: true,
      folderId: "F",
      folderName: "Diagrams",
    });
    expect(useDiagramLibraryStore.getState().files).toEqual(files);
    expect(useDiagramLibraryStore.getState().isConnecting).toBe(false);
    await expect(getPanelCollapsed()).resolves.toBe(false);
  });

  it("surfaces the error and resets isConnecting on failure", async () => {
    vi.mocked(sendToBackground).mockRejectedValue(new Error("Could not connect to Google Drive"));
    await useDiagramLibraryStore.getState().connect("Diagrams");
    expect(useDiagramLibraryStore.getState().connectError).toBe(
      "Could not connect to Google Drive",
    );
    expect(useDiagramLibraryStore.getState().isConnecting).toBe(false);
    expect(useDiagramLibraryStore.getState().status.isConnected).toBe(false);
  });

  it("ignores a second call while a connect is already in flight", async () => {
    let resolveConnect: (v: { isConnected: boolean }) => void = () => {};
    vi.mocked(sendToBackground).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveConnect = resolve;
        }),
    );
    const first = useDiagramLibraryStore.getState().connect("Diagrams");
    await useDiagramLibraryStore.getState().connect("Diagrams"); // no-op: already connecting
    expect(sendToBackground).toHaveBeenCalledTimes(1);
    resolveConnect({ isConnected: false });
    await first;
  });
});
