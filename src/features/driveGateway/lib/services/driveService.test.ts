import { describe, expect, it, vi } from "vitest";
import { createDriveService } from "./driveService";

vi.mock("@/entities/google/drive", () => ({
  driveRepo: {
    listFolder: vi
      .fn()
      .mockResolvedValue([
        { id: "1", name: "a.excalidraw", modifiedTime: "t", headRevisionId: "r" },
      ]),
    getMeta: vi
      .fn()
      .mockResolvedValue({ id: "1", name: "a.excalidraw", modifiedTime: "t", headRevisionId: "r" }),
    getContent: vi.fn().mockResolvedValue('{"elements":[]}'),
    createFile: vi.fn().mockResolvedValue({
      id: "2",
      name: "new.excalidraw",
      modifiedTime: "t",
      headRevisionId: "r0",
    }),
    updateFile: vi.fn().mockResolvedValue({
      id: "1",
      name: "a.excalidraw",
      modifiedTime: "t2",
      headRevisionId: "r2",
    }),
    renameFile: vi.fn().mockResolvedValue({
      id: "1",
      name: "renamed.excalidraw",
      modifiedTime: "t",
      headRevisionId: "r",
    }),
    trashFile: vi.fn().mockResolvedValue(undefined),
  },
}));

describe("driveService.list", () => {
  it("delegates to listFolder", async () => {
    const { driveRepo } = await import("@/entities/google/drive");
    const svc = createDriveService();
    const files = await svc.list("TOK", "F");
    expect(driveRepo.listFolder).toHaveBeenCalledWith("TOK", "F");
    expect(files).toHaveLength(1);
    expect(files[0]?.id).toBe("1");
  });
});

describe("driveService.get", () => {
  it("fetches meta and content in parallel", async () => {
    const { driveRepo } = await import("@/entities/google/drive");
    const svc = createDriveService();
    const result = await svc.get("TOK", "1");
    expect(driveRepo.getMeta).toHaveBeenCalledWith("TOK", "1");
    expect(driveRepo.getContent).toHaveBeenCalledWith("TOK", "1");
    expect(result.meta.id).toBe("1");
    expect(result.content).toBe('{"elements":[]}');
  });
});

describe("driveService.create", () => {
  it("delegates to createFile", async () => {
    const { driveRepo } = await import("@/entities/google/drive");
    const svc = createDriveService();
    const file = await svc.create("TOK", "new.excalidraw", "F", "{}");
    expect(driveRepo.createFile).toHaveBeenCalledWith("TOK", "new.excalidraw", "F", "{}");
    expect(file.id).toBe("2");
  });
});

describe("driveService.update", () => {
  it("delegates to updateFile", async () => {
    const { driveRepo } = await import("@/entities/google/drive");
    const svc = createDriveService();
    const file = await svc.update("TOK", "1", "{}", "r");
    expect(driveRepo.updateFile).toHaveBeenCalledWith("TOK", "1", "{}", "r");
    expect(file.headRevisionId).toBe("r2");
  });
});

describe("driveService.rename", () => {
  it("delegates to renameFile", async () => {
    const { driveRepo } = await import("@/entities/google/drive");
    const svc = createDriveService();
    const file = await svc.rename("TOK", "1", "renamed.excalidraw");
    expect(driveRepo.renameFile).toHaveBeenCalledWith("TOK", "1", "renamed.excalidraw");
    expect(file.name).toBe("renamed.excalidraw");
  });
});

describe("driveService.trash", () => {
  it("delegates to trashFile", async () => {
    const { driveRepo } = await import("@/entities/google/drive");
    const svc = createDriveService();
    await svc.trash("TOK", "FILE1");
    expect(driveRepo.trashFile).toHaveBeenCalledWith("TOK", "FILE1");
  });
});
