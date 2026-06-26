import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAuthService } from "./authService";

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
  identity: {
    getAuthToken: vi.fn(),
    removeCachedAuthToken: vi.fn((_: unknown, cb: () => void) => cb()),
  },
  runtime: {},
};

beforeEach(() => {
  for (const k of Object.keys(storage)) {
    delete storage[k];
  }
  vi.clearAllMocks();
  (globalThis as unknown as { chrome: unknown }).chrome = chromeMock;
});

vi.mock("@/entities/google/auth", () => ({
  getToken: vi.fn().mockResolvedValue("TOK"),
  signOut: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/entities/google/drive", () => ({
  driveRepo: {
    findOrCreateFolder: vi.fn().mockResolvedValue({ id: "F1", name: "Diagrams" }),
  },
}));

describe("authService.getStatus", () => {
  it("returns disconnected when store is empty", async () => {
    const svc = createAuthService();
    expect(await svc.getStatus()).toEqual({ isConnected: false });
  });

  it("returns stored connection status", async () => {
    storage.connection = { isConnected: true, folderId: "F", folderName: "Diagrams" };
    const svc = createAuthService();
    expect(await svc.getStatus()).toEqual({
      isConnected: true,
      folderId: "F",
      folderName: "Diagrams",
    });
  });
});

describe("authService.getToken", () => {
  it("delegates to chromeGetToken", async () => {
    const { getToken } = await import("@/entities/google/auth");
    const svc = createAuthService();
    const token = await svc.getToken(false);
    expect(token).toBe("TOK");
    expect(getToken).toHaveBeenCalledWith(false);
  });
});

describe("authService.signOut", () => {
  it("calls signOut with current token, clears store, returns disconnected", async () => {
    const { signOut } = await import("@/entities/google/auth");
    storage.connection = { isConnected: true, folderId: "F" };
    const svc = createAuthService();
    const result = await svc.signOut();
    expect(signOut).toHaveBeenCalledWith("TOK");
    expect(result).toEqual({ isConnected: false });
    expect(storage.connection).toEqual({ isConnected: false });
  });

  it("still clears store even when getToken fails", async () => {
    const { getToken } = await import("@/entities/google/auth");
    vi.mocked(getToken).mockRejectedValueOnce(new Error("no token"));
    storage.connection = { isConnected: true };
    const svc = createAuthService();
    const result = await svc.signOut();
    expect(result).toEqual({ isConnected: false });
  });
});

describe("authService.connect", () => {
  it("creates/finds folder and persists connection", async () => {
    const { driveRepo } = await import("@/entities/google/drive");
    const svc = createAuthService();
    const result = await svc.connect("TOK", "Diagrams");
    expect(driveRepo.findOrCreateFolder).toHaveBeenCalledWith("TOK", "Diagrams");
    expect(result).toEqual({ isConnected: true, folderId: "F1", folderName: "Diagrams" });
    expect(storage.connection).toEqual({
      isConnected: true,
      folderId: "F1",
      folderName: "Diagrams",
    });
  });
});
