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
  it("loads the file list and caches it", async () => {
    vi.mocked(sendToBackground).mockResolvedValue(files);
    const result = await useDiagramLibraryStore.getState().refresh();
    expect(result).toEqual(files);
    expect(useDiagramLibraryStore.getState().files).toEqual(files);
    await expect(getCachedFiles()).resolves.toEqual(files);
  });

  it("refresh throws on failure instead of swallowing to an empty list", async () => {
    const existingFile = {
      id: "9",
      name: "existing.excalidraw",
      modifiedTime: "t",
      headRevisionId: "r9",
    };
    useDiagramLibraryStore.setState({ files: [existingFile] });
    vi.mocked(sendToBackground).mockRejectedValue(new Error("network down"));

    await expect(useDiagramLibraryStore.getState().refresh()).rejects.toThrow("network down");
    expect(useDiagramLibraryStore.getState().files).toEqual([existingFile]); // untouched
  });
});

describe("loadInitialQuery", () => {
  it("resolves the persisted search query and flips isQueryReady", async () => {
    await setDiagramSearchQuery("meeting");
    await useDiagramLibraryStore.getState().loadInitialQuery();
    expect(useDiagramLibraryStore.getState().initialQuery).toBe("meeting");
    expect(useDiagramLibraryStore.getState().isQueryReady).toBe(true);
  });
});
