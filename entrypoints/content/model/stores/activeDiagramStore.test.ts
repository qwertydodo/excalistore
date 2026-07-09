import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildExcalidrawFile } from "@/entities/diagram";
import { REQUEST_TYPE, sendToBackground } from "@/features/driveGateway";
import { stubChromeStorageLocal } from "@/shared/lib/testUtils";
import { createFakeSceneBridgeDeps } from "../../lib/testUtils";
import { getActiveFile, setActiveFile } from "./sessionStore";

// activeDiagramStore drives the real readScene/writeScene/clearScene/
// readTheme against the shared `bridge` singleton, so it needs a fake
// SceneBridgeDeps rather than a plain jest.mock.
const fakeDeps = createFakeSceneBridgeDeps();

vi.mock("@/features/driveGateway", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/driveGateway")>()),
  sendToBackground: vi.fn(),
}));
vi.mock("../../lib/bridge", () => ({ bridge: fakeDeps }));

const { useActiveDiagramStore } = await import("./activeDiagramStore");
const { useDiagramLibraryStore } = await import("./diagramLibraryStore");

const INITIAL_ACTIVE_STATE = useActiveDiagramStore.getState();
const INITIAL_LIBRARY_STATE = useDiagramLibraryStore.getState();

const meta = { id: "1", name: "beta.excalidraw", modifiedTime: "t", headRevisionId: "r2" };
const emptyScene = buildExcalidrawFile([], {}, {});

beforeEach(() => {
  stubChromeStorageLocal();
  useActiveDiagramStore.setState(INITIAL_ACTIVE_STATE, true);
  useDiagramLibraryStore.setState(INITIAL_LIBRARY_STATE, true);
  fakeDeps.storage.clear();
  vi.mocked(sendToBackground).mockReset();
  vi.mocked(fakeDeps.reload).mockClear();
});

describe("onOpen", () => {
  it("opens the file, sets the active pointer, and writes the scene", async () => {
    vi.mocked(sendToBackground).mockImplementation(async (request) => {
      if (request.type === REQUEST_TYPE.DRIVE_GET)
        return { meta, content: JSON.stringify(emptyScene) };
      throw new Error(`unexpected request ${request.type}`);
    });

    await useActiveDiagramStore.getState().onOpen("1");

    await expect(getActiveFile()).resolves.toEqual({
      id: "1",
      name: "beta.excalidraw",
      loadedRevision: "r2",
    });
    expect(fakeDeps.reload).toHaveBeenCalledOnce();
    expect(useActiveDiagramStore.getState().actionError).toBeNull();
  });

  it("flushes the current diagram before switching, using the stored revision as the conflict guard", async () => {
    useActiveDiagramStore.setState({ activeId: "0", revision: "r0" });
    vi.mocked(sendToBackground).mockImplementation(async (request) => {
      if (request.type === REQUEST_TYPE.DRIVE_UPDATE) {
        expect(request.id).toBe("0");
        expect(request.prevRevision).toBe("r0");
        return { ...meta, id: "0", headRevisionId: "r0b" };
      }
      if (request.type === REQUEST_TYPE.DRIVE_GET)
        return { meta, content: JSON.stringify(emptyScene) };
      throw new Error(`unexpected request ${request.type}`);
    });

    await useActiveDiagramStore.getState().onOpen("1");

    // The flush's returned revision is recorded; the newly-opened file's own
    // revision is restored post-reload by useActiveDiagram's init effect
    // (from the ActiveFile pointer set below), not by onOpen itself.
    expect(useActiveDiagramStore.getState().revision).toBe("r0b");
    await expect(getActiveFile()).resolves.toEqual({
      id: "1",
      name: "beta.excalidraw",
      loadedRevision: "r2",
    });
  });

  it("is a no-op when the requested id is already active", async () => {
    useActiveDiagramStore.setState({ activeId: "1" });
    await useActiveDiagramStore.getState().onOpen("1");
    expect(sendToBackground).not.toHaveBeenCalled();
  });

  it("records an error and does not reload when the fetch fails", async () => {
    vi.mocked(sendToBackground).mockRejectedValue(new Error("network down"));
    await useActiveDiagramStore.getState().onOpen("1");
    expect(useActiveDiagramStore.getState().actionError).toBe("network down");
    expect(fakeDeps.reload).not.toHaveBeenCalled();
  });
});

describe("saveActiveScene", () => {
  it("saves the scene with the stored revision as conflict guard, then records the new revision and pointer", async () => {
    useActiveDiagramStore.setState({ activeId: "1", revision: "r1" });
    vi.mocked(sendToBackground).mockImplementation(async (request) => {
      if (request.type === REQUEST_TYPE.DRIVE_UPDATE) {
        expect(request.id).toBe("1");
        expect(request.prevRevision).toBe("r1");
        return { ...meta, id: "1", headRevisionId: "r2" };
      }
      throw new Error(`unexpected request ${request.type}`);
    });

    await useActiveDiagramStore.getState().saveActiveScene("1");

    expect(useActiveDiagramStore.getState().revision).toBe("r2");
    await expect(getActiveFile()).resolves.toEqual({
      id: "1",
      name: "beta.excalidraw",
      loadedRevision: "r2",
    });
  });

  it("propagates a failed save to the caller and leaves the revision untouched", async () => {
    useActiveDiagramStore.setState({ activeId: "1", revision: "r1" });
    vi.mocked(sendToBackground).mockRejectedValue(new Error("conflict"));

    await expect(useActiveDiagramStore.getState().saveActiveScene("1")).rejects.toThrow("conflict");
    expect(useActiveDiagramStore.getState().revision).toBe("r1");
  });
});

describe("onCreate", () => {
  it("creates a blank diagram, sets it active, and writes the scene", async () => {
    vi.mocked(sendToBackground).mockResolvedValue(meta);
    await useActiveDiagramStore.getState().onCreate("beta");
    await expect(getActiveFile()).resolves.toEqual({
      id: "1",
      name: "beta.excalidraw",
      loadedRevision: "r2",
    });
    expect(fakeDeps.reload).toHaveBeenCalledOnce();
  });

  it("records an error when creation fails", async () => {
    vi.mocked(sendToBackground).mockRejectedValue(new Error("quota exceeded"));
    await useActiveDiagramStore.getState().onCreate("beta");
    expect(useActiveDiagramStore.getState().actionError).toBe("quota exceeded");
    expect(fakeDeps.reload).not.toHaveBeenCalled();
  });
});

describe("onAutoCreate", () => {
  it("creates the file from the given content, sets the pointer directly (no reload), and prepends it to the library list", async () => {
    useDiagramLibraryStore.setState({
      files: [{ id: "9", name: "existing.excalidraw", modifiedTime: "t", headRevisionId: "r9" }],
    });
    vi.mocked(sendToBackground).mockResolvedValue(meta);

    await useActiveDiagramStore
      .getState()
      .onAutoCreate(JSON.stringify(emptyScene), "Untitled.excalidraw");

    expect(sendToBackground).toHaveBeenCalledWith({
      type: REQUEST_TYPE.DRIVE_CREATE,
      name: "Untitled.excalidraw",
      content: JSON.stringify(emptyScene),
    });
    await expect(getActiveFile()).resolves.toEqual({
      id: "1",
      name: "beta.excalidraw",
      loadedRevision: "r2",
    });
    expect(useActiveDiagramStore.getState().activeId).toBe("1");
    expect(useActiveDiagramStore.getState().revision).toBe("r2");
    expect(fakeDeps.reload).not.toHaveBeenCalled();
    expect(useDiagramLibraryStore.getState().files.map((f) => f.id)).toEqual(["1", "9"]);
  });

  it("records an error and rethrows when creation fails", async () => {
    vi.mocked(sendToBackground).mockRejectedValue(new Error("quota exceeded"));

    await expect(
      useActiveDiagramStore
        .getState()
        .onAutoCreate(JSON.stringify(emptyScene), "Untitled.excalidraw"),
    ).rejects.toThrow("quota exceeded");

    expect(useActiveDiagramStore.getState().actionError).toBe("quota exceeded");
    expect(useActiveDiagramStore.getState().activeId).toBeNull();
  });

  it("normalizes a bare name (no .excalidraw extension) before sending it", async () => {
    vi.mocked(sendToBackground).mockResolvedValue(meta);

    await useActiveDiagramStore.getState().onAutoCreate(JSON.stringify(emptyScene), "Untitled");

    expect(sendToBackground).toHaveBeenCalledWith({
      type: REQUEST_TYPE.DRIVE_CREATE,
      name: "Untitled.excalidraw",
      content: JSON.stringify(emptyScene),
    });
  });
});

describe("onRename", () => {
  it("patches the renamed file into the library's file list in place", async () => {
    useDiagramLibraryStore.setState({
      files: [{ id: "1", name: "old.excalidraw", modifiedTime: "t", headRevisionId: "r1" }],
    });
    const renamed = { ...meta, name: "renamed.excalidraw" };
    vi.mocked(sendToBackground).mockResolvedValue(renamed);

    await useActiveDiagramStore.getState().onRename("1", "renamed");

    expect(useDiagramLibraryStore.getState().files).toEqual([renamed]);
  });

  it("records an error when rename fails", async () => {
    vi.mocked(sendToBackground).mockRejectedValue(new Error("name already taken"));
    await useActiveDiagramStore.getState().onRename("1", "dup");
    expect(useActiveDiagramStore.getState().actionError).toBe("name already taken");
  });
});

describe("onDelete", () => {
  it("clears the canvas when deleting the active file", async () => {
    useActiveDiagramStore.setState({ activeId: "1" });
    await setActiveFile({ id: "1", name: "beta.excalidraw", loadedRevision: "r2" });
    vi.mocked(sendToBackground).mockResolvedValue(null);

    await useActiveDiagramStore.getState().onDelete("1");

    await expect(getActiveFile()).resolves.toBeNull();
    expect(fakeDeps.reload).toHaveBeenCalledOnce();
  });

  it("removes the file from the library list when deleting a non-active file", async () => {
    useActiveDiagramStore.setState({ activeId: null });
    useDiagramLibraryStore.setState({
      files: [
        { id: "1", name: "a.excalidraw", modifiedTime: "t", headRevisionId: "r1" },
        { id: "2", name: "b.excalidraw", modifiedTime: "t", headRevisionId: "r2" },
      ],
    });
    vi.mocked(sendToBackground).mockResolvedValue(null);

    await useActiveDiagramStore.getState().onDelete("1");

    expect(useDiagramLibraryStore.getState().files.map((f) => f.id)).toEqual(["2"]);
    expect(fakeDeps.reload).not.toHaveBeenCalled();
  });

  it("records an error when delete fails", async () => {
    vi.mocked(sendToBackground).mockRejectedValue(new Error("not found"));
    await useActiveDiagramStore.getState().onDelete("1");
    expect(useActiveDiagramStore.getState().actionError).toBe("not found");
  });
});

describe("onRemoteDeleted", () => {
  it("clears the active pointer and drops the deleted row from the library list", async () => {
    const survivor = { id: "2", name: "b.excalidraw", modifiedTime: "t", headRevisionId: "r2" };
    const deleted = { id: "1", name: "a.excalidraw", modifiedTime: "t", headRevisionId: "r1" };
    useDiagramLibraryStore.setState({ files: [deleted, survivor] });
    useActiveDiagramStore.setState({ activeId: "1", revision: "r1" });

    await useActiveDiagramStore.getState().onRemoteDeleted("1");

    expect(useActiveDiagramStore.getState().activeId).toBeNull();
    expect(useActiveDiagramStore.getState().revision).toBeNull();
    expect(useDiagramLibraryStore.getState().files).toEqual([survivor]);
  });
});
