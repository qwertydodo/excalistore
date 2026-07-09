import { beforeEach, describe, expect, it, vi } from "vitest";
import { sendToBackground } from "@/features/driveGateway";
import { stubChromeStorageLocal, stubSessionStorage } from "@/shared/lib/testUtils";
import { getCachedFiles, setDiagramSearchQuery } from "./sessionStore";

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

describe("setFiles", () => {
  it("sets the in-memory list and writes the fast-paint cache in one action", async () => {
    const files = [{ id: "1", name: "a.excalidraw", modifiedTime: "t", headRevisionId: "r1" }];

    useDiagramLibraryStore.getState().setFiles(files);

    expect(useDiagramLibraryStore.getState().files).toEqual(files);
    await expect(getCachedFiles()).resolves.toEqual(files);
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

  it("swallows an error and returns an empty list, clearing isFilesLoading (401 handling now lives in sendDriveRequest, see driveRequest.test.ts)", async () => {
    vi.mocked(sendToBackground).mockRejectedValue(new Error("network down"));
    const result = await useDiagramLibraryStore.getState().refresh();
    expect(result).toEqual([]);
    expect(useDiagramLibraryStore.getState().isFilesLoading).toBe(false);
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
