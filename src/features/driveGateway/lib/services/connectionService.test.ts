import { beforeEach, describe, expect, it, vi } from "vitest";
import { connectionService } from "./connectionService";

const storage: Record<string, unknown> = {};
const chromeMock = {
  storage: {
    local: {
      get: vi.fn(async (key: string) => ({ [key]: storage[key] })),
      set: vi.fn(async (obj: Record<string, unknown>) => {
        Object.assign(storage, obj);
      }),
    },
  },
};

beforeEach(() => {
  for (const k of Object.keys(storage)) {
    delete storage[k];
  }
  vi.clearAllMocks();
  (globalThis as unknown as { chrome: unknown }).chrome = chromeMock;
});

vi.mock("@/entities/google/auth", () => ({
  authRepo: {
    getToken: vi.fn().mockResolvedValue("TOK"),
    signOut: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("@/entities/google/drive", () => ({
  driveRepo: {
    findOrCreateFolder: vi.fn().mockResolvedValue({ id: "F1", name: "Diagrams" }),
  },
}));

describe("connectionService.getStatus", () => {
  it("returns disconnected when store is empty", async () => {
    expect(await connectionService.getStatus()).toEqual({ isConnected: false });
  });

  it("returns stored connection status", async () => {
    storage.connection = { isConnected: true, folderId: "F", folderName: "Diagrams" };

    expect(await connectionService.getStatus()).toEqual({
      isConnected: true,
      folderId: "F",
      folderName: "Diagrams",
    });
  });
});

describe("connectionService.signOut", () => {
  it("calls authRepo.signOut with current token, clears store, returns disconnected", async () => {
    const { authRepo } = await import("@/entities/google/auth");
    storage.connection = { isConnected: true, folderId: "F" };

    const result = await connectionService.signOut();
    expect(authRepo.signOut).toHaveBeenCalledWith("TOK");
    expect(result).toEqual({ isConnected: false });
    expect(storage.connection).toEqual({ isConnected: false });
  });

  it("still clears store even when getToken fails", async () => {
    const { authRepo } = await import("@/entities/google/auth");
    vi.mocked(authRepo.getToken).mockRejectedValueOnce(new Error("no token"));
    storage.connection = { isConnected: true };

    const result = await connectionService.signOut();
    expect(result).toEqual({ isConnected: false });
  });
});

describe("connectionService.connect", () => {
  it("prompts for consent, creates/finds folder, persists connection", async () => {
    const { authRepo } = await import("@/entities/google/auth");
    const { driveRepo } = await import("@/entities/google/drive");

    const result = await connectionService.connect("Diagrams");
    expect(authRepo.getToken).toHaveBeenCalledWith(true);
    expect(driveRepo.findOrCreateFolder).toHaveBeenCalledWith("Diagrams");
    expect(result).toEqual({ isConnected: true, folderId: "F1", folderName: "Diagrams" });
    expect(storage.connection).toEqual({
      isConnected: true,
      folderId: "F1",
      folderName: "Diagrams",
    });
  });
});
