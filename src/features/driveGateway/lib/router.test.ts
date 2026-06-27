import { beforeEach, describe, expect, it, vi } from "vitest";
import { DriveError, driveRepo } from "@/entities/google/drive";
import { handleMessage } from "./router";
import { connectionService } from "./services/connectionService";

vi.mock("@/entities/google/drive", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/entities/google/drive")>();
  return {
    ...actual,
    driveRepo: {
      listFolder: vi.fn(),
      getDiagram: vi.fn(),
      createFile: vi.fn(),
      updateFile: vi.fn(),
      renameFile: vi.fn(),
      trashFile: vi.fn(),
    },
  };
});

vi.mock("./services/connectionService", () => ({
  connectionService: {
    getStatus: vi.fn(),
    signOut: vi.fn(),
    connect: vi.fn(),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(connectionService.getStatus).mockResolvedValue({
    isConnected: true,
    folderId: "F",
    folderName: "Diagrams",
  });
  vi.mocked(connectionService.signOut).mockResolvedValue({ isConnected: false });
  vi.mocked(connectionService.connect).mockResolvedValue({
    isConnected: true,
    folderId: "F",
    folderName: "Diagrams",
  });
  vi.mocked(driveRepo.listFolder).mockResolvedValue([
    { id: "1", name: "a", modifiedTime: "t", headRevisionId: "r" },
  ]);
  vi.mocked(driveRepo.getDiagram).mockResolvedValue({
    meta: { id: "1", name: "a.excalidraw", modifiedTime: "t", headRevisionId: "r" },
    content: '{"type":"excalidraw"}',
  });
  vi.mocked(driveRepo.createFile).mockResolvedValue({
    id: "2",
    name: "new.excalidraw",
    modifiedTime: "t",
    headRevisionId: "r0",
  });
  vi.mocked(driveRepo.updateFile).mockResolvedValue({
    id: "1",
    name: "a.excalidraw",
    modifiedTime: "t2",
    headRevisionId: "r2",
  });
  vi.mocked(driveRepo.renameFile).mockResolvedValue({
    id: "1",
    name: "renamed.excalidraw",
    modifiedTime: "t",
    headRevisionId: "r",
  });
  vi.mocked(driveRepo.trashFile).mockResolvedValue(undefined);
});

describe("auth/status", () => {
  it("returns stored connection status", async () => {
    const res = await handleMessage({ type: "auth/status" });
    expect(connectionService.getStatus).toHaveBeenCalled();
    expect(res).toEqual({
      ok: true,
      data: { isConnected: true, folderId: "F", folderName: "Diagrams" },
    });
  });
});

describe("auth/signOut", () => {
  it("calls connectionService.signOut", async () => {
    const res = await handleMessage({ type: "auth/signOut" });
    expect(connectionService.signOut).toHaveBeenCalled();
    expect(res).toEqual({ ok: true, data: { isConnected: false } });
  });
});

describe("drive/connect", () => {
  it("calls connectionService.connect with the folder name", async () => {
    const res = await handleMessage({ type: "drive/connect", folderName: "Diagrams" });
    expect(connectionService.connect).toHaveBeenCalledWith("Diagrams");
    expect(res).toEqual({
      ok: true,
      data: { isConnected: true, folderId: "F", folderName: "Diagrams" },
    });
  });
});

describe("drive/list", () => {
  it("checks connection then calls driveRepo.listFolder with stored folderId", async () => {
    const res = await handleMessage({ type: "drive/list" });
    expect(connectionService.getStatus).toHaveBeenCalled();
    expect(driveRepo.listFolder).toHaveBeenCalledWith("F");
    expect(res).toEqual({
      ok: true,
      data: [{ id: "1", name: "a", modifiedTime: "t", headRevisionId: "r" }],
    });
  });

  it("returns error when not connected", async () => {
    vi.mocked(connectionService.getStatus).mockResolvedValueOnce({ isConnected: false });
    const res = await handleMessage({ type: "drive/list" });
    expect(res).toMatchObject({ ok: false, error: expect.stringMatching(/not connected/i) });
  });
});

describe("drive/get", () => {
  it("calls driveRepo.getDiagram", async () => {
    const res = await handleMessage({ type: "drive/get", id: "1" });
    expect(driveRepo.getDiagram).toHaveBeenCalledWith("1");
    expect(res).toMatchObject({ ok: true });
  });

  it("returns error when not connected", async () => {
    vi.mocked(connectionService.getStatus).mockResolvedValueOnce({ isConnected: false });
    const res = await handleMessage({ type: "drive/get", id: "1" });
    expect(res).toMatchObject({ ok: false, error: expect.stringMatching(/not connected/i) });
  });
});

describe("drive/create", () => {
  it("calls driveRepo.createFile with stored folderId", async () => {
    const res = await handleMessage({
      type: "drive/create",
      name: "new.excalidraw",
      content: "{}",
    });
    expect(driveRepo.createFile).toHaveBeenCalledWith("new.excalidraw", "F", "{}");
    expect(res).toMatchObject({ ok: true, data: { id: "2" } });
  });

  it("returns error when folderId missing", async () => {
    vi.mocked(connectionService.getStatus).mockResolvedValueOnce({ isConnected: true });
    const res = await handleMessage({ type: "drive/create", name: "n", content: "{}" });
    expect(res).toMatchObject({ ok: false });
  });
});

describe("drive/update", () => {
  it("passes prevRevision to driveRepo.updateFile", async () => {
    const res = await handleMessage({
      type: "drive/update",
      id: "1",
      content: "{}",
      prevRevision: "r",
    });
    expect(driveRepo.updateFile).toHaveBeenCalledWith("1", "{}", "r");
    expect(res).toMatchObject({ ok: true, data: { headRevisionId: "r2" } });
  });
});

describe("drive/rename", () => {
  it("calls driveRepo.renameFile", async () => {
    const res = await handleMessage({ type: "drive/rename", id: "1", name: "renamed.excalidraw" });
    expect(driveRepo.renameFile).toHaveBeenCalledWith("1", "renamed.excalidraw");
    expect(res).toMatchObject({ ok: true });
  });
});

describe("drive/trash", () => {
  it("calls driveRepo.trashFile and returns null data", async () => {
    const res = await handleMessage({ type: "drive/trash", id: "FILE1" });
    expect(driveRepo.trashFile).toHaveBeenCalledWith("FILE1");
    expect(res).toEqual({ ok: true, data: null });
  });
});

describe("error classification", () => {
  it("classifies Drive 403 as unauthorized", async () => {
    vi.mocked(driveRepo.listFolder).mockRejectedValueOnce(
      new DriveError(403, "Drive request failed: 403"),
    );
    const res = await handleMessage({ type: "drive/list" });
    expect(res).toMatchObject({ ok: false, code: "unauthorized" });
  });

  it("classifies Drive 401 as unauthorized", async () => {
    vi.mocked(driveRepo.listFolder).mockRejectedValueOnce(
      new DriveError(401, "Drive request failed: 401"),
    );
    const res = await handleMessage({ type: "drive/list" });
    expect(res).toMatchObject({ ok: false, code: "unauthorized" });
  });

  it("classifies token grant failure as unauthorized", async () => {
    vi.mocked(driveRepo.listFolder).mockRejectedValueOnce(
      new Error("OAuth2 not granted or revoked"),
    );
    const res = await handleMessage({ type: "drive/list" });
    expect(res).toMatchObject({ ok: false, code: "unauthorized" });
  });

  it("classifies conflict errors as conflict", async () => {
    vi.mocked(driveRepo.updateFile).mockRejectedValueOnce(
      new Error("conflict: remote revision changed"),
    );
    const res = await handleMessage({
      type: "drive/update",
      id: "1",
      content: "{}",
      prevRevision: "r",
    });
    expect(res).toEqual({
      ok: false,
      error: "conflict: remote revision changed",
      code: "conflict",
    });
  });

  it("classifies unknown errors as unknown", async () => {
    vi.mocked(driveRepo.listFolder).mockRejectedValueOnce(new Error("network timeout"));
    const res = await handleMessage({ type: "drive/list" });
    expect(res).toMatchObject({ ok: false, code: "unknown" });
  });
});
