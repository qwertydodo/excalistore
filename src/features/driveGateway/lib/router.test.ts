import { beforeEach, describe, expect, it, vi } from "vitest";
import { DriveError } from "@/entities/google/drive";
import { dispatch } from "./router";
import type { AuthService } from "./services/authService";
import type { DriveService } from "./services/driveService";

const authService: AuthService = {
  getToken: vi.fn().mockResolvedValue("TOK"),
  getStatus: vi
    .fn()
    .mockResolvedValue({ isConnected: true, folderId: "F", folderName: "Diagrams" }),
  signOut: vi.fn().mockResolvedValue({ isConnected: false }),
  connect: vi.fn().mockResolvedValue({ isConnected: true, folderId: "F", folderName: "Diagrams" }),
};

const driveService: DriveService = {
  list: vi.fn().mockResolvedValue([{ id: "1", name: "a", modifiedTime: "t", headRevisionId: "r" }]),
  get: vi.fn().mockResolvedValue({
    meta: { id: "1", name: "a.excalidraw", modifiedTime: "t", headRevisionId: "r" },
    content: '{"type":"excalidraw"}',
  }),
  create: vi.fn().mockResolvedValue({
    id: "2",
    name: "new.excalidraw",
    modifiedTime: "t",
    headRevisionId: "r0",
  }),
  update: vi
    .fn()
    .mockResolvedValue({ id: "1", name: "a.excalidraw", modifiedTime: "t2", headRevisionId: "r2" }),
  rename: vi.fn().mockResolvedValue({
    id: "1",
    name: "renamed.excalidraw",
    modifiedTime: "t",
    headRevisionId: "r",
  }),
  trash: vi.fn().mockResolvedValue(undefined),
};

const services = { auth: authService, drive: driveService };

beforeEach(() => {
  vi.mocked(authService.getToken).mockResolvedValue("TOK");
  vi.mocked(authService.getStatus).mockResolvedValue({
    isConnected: true,
    folderId: "F",
    folderName: "Diagrams",
  });
  vi.mocked(authService.signOut).mockResolvedValue({ isConnected: false });
  vi.mocked(authService.connect).mockResolvedValue({
    isConnected: true,
    folderId: "F",
    folderName: "Diagrams",
  });
});

describe("auth/status", () => {
  it("returns stored connection without token resolution", async () => {
    const res = await dispatch({ type: "auth/status" }, services);
    expect(authService.getToken).not.toHaveBeenCalled();
    expect(res).toEqual({
      ok: true,
      data: { isConnected: true, folderId: "F", folderName: "Diagrams" },
    });
  });
});

describe("auth/signOut", () => {
  it("calls authService.signOut without token middleware", async () => {
    const res = await dispatch({ type: "auth/signOut" }, services);
    expect(authService.signOut).toHaveBeenCalled();
    expect(authService.getToken).not.toHaveBeenCalled();
    expect(res).toEqual({ ok: true, data: { isConnected: false } });
  });
});

describe("drive/connect", () => {
  it("resolves token interactively then calls auth.connect", async () => {
    const res = await dispatch({ type: "drive/connect", folderName: "Diagrams" }, services);
    expect(authService.getToken).toHaveBeenCalledWith(true);
    expect(authService.connect).toHaveBeenCalledWith("TOK", "Diagrams");
    expect(res).toEqual({
      ok: true,
      data: { isConnected: true, folderId: "F", folderName: "Diagrams" },
    });
  });
});

describe("drive/list", () => {
  it("resolves token silently, checks connection, calls drive.list", async () => {
    const res = await dispatch({ type: "drive/list" }, services);
    expect(authService.getToken).toHaveBeenCalledWith(false);
    expect(driveService.list).toHaveBeenCalledWith("TOK", "F");
    expect(res).toEqual({
      ok: true,
      data: [{ id: "1", name: "a", modifiedTime: "t", headRevisionId: "r" }],
    });
  });

  it("returns error when not connected", async () => {
    vi.mocked(authService.getStatus).mockResolvedValueOnce({ isConnected: false });
    const res = await dispatch({ type: "drive/list" }, services);
    expect(res).toMatchObject({ ok: false, error: expect.stringMatching(/not connected/i) });
  });
});

describe("drive/get", () => {
  it("resolves token silently and calls drive.get", async () => {
    const res = await dispatch({ type: "drive/get", id: "1" }, services);
    expect(authService.getToken).toHaveBeenCalledWith(false);
    expect(driveService.get).toHaveBeenCalledWith("TOK", "1");
    expect(res).toMatchObject({ ok: true });
  });

  it("returns error when not connected", async () => {
    vi.mocked(authService.getStatus).mockResolvedValueOnce({ isConnected: false });
    const res = await dispatch({ type: "drive/get", id: "1" }, services);
    expect(res).toMatchObject({ ok: false, error: expect.stringMatching(/not connected/i) });
  });
});

describe("drive/create", () => {
  it("calls drive.create with token and stored folderId", async () => {
    const res = await dispatch(
      { type: "drive/create", name: "new.excalidraw", content: "{}" },
      services,
    );
    expect(driveService.create).toHaveBeenCalledWith("TOK", "new.excalidraw", "F", "{}");
    expect(res).toMatchObject({ ok: true, data: { id: "2" } });
  });

  it("returns error when folderId missing", async () => {
    vi.mocked(authService.getStatus).mockResolvedValueOnce({ isConnected: true });
    const res = await dispatch({ type: "drive/create", name: "n", content: "{}" }, services);
    expect(res).toMatchObject({ ok: false });
  });
});

describe("drive/update", () => {
  it("passes prevRevision to drive.update", async () => {
    const res = await dispatch(
      { type: "drive/update", id: "1", content: "{}", prevRevision: "r" },
      services,
    );
    expect(driveService.update).toHaveBeenCalledWith("TOK", "1", "{}", "r");
    expect(res).toMatchObject({ ok: true, data: { headRevisionId: "r2" } });
  });
});

describe("drive/rename", () => {
  it("calls drive.rename", async () => {
    const res = await dispatch(
      { type: "drive/rename", id: "1", name: "renamed.excalidraw" },
      services,
    );
    expect(driveService.rename).toHaveBeenCalledWith("TOK", "1", "renamed.excalidraw");
    expect(res).toMatchObject({ ok: true });
  });
});

describe("drive/trash", () => {
  it("calls drive.trash and returns null data", async () => {
    const res = await dispatch({ type: "drive/trash", id: "FILE1" }, services);
    expect(driveService.trash).toHaveBeenCalledWith("TOK", "FILE1");
    expect(res).toEqual({ ok: true, data: null });
  });
});

describe("error classification", () => {
  it("classifies Drive 403 as unauthorized", async () => {
    vi.mocked(driveService.list).mockRejectedValueOnce(
      new DriveError(403, "Drive request failed: 403"),
    );
    const res = await dispatch({ type: "drive/list" }, services);
    expect(res).toMatchObject({ ok: false, code: "unauthorized" });
  });

  it("classifies Drive 401 as unauthorized", async () => {
    vi.mocked(driveService.list).mockRejectedValueOnce(
      new DriveError(401, "Drive request failed: 401"),
    );
    const res = await dispatch({ type: "drive/list" }, services);
    expect(res).toMatchObject({ ok: false, code: "unauthorized" });
  });

  it("classifies token grant failure as unauthorized", async () => {
    vi.mocked(authService.getToken).mockRejectedValueOnce(
      new Error("OAuth2 not granted or revoked"),
    );
    const res = await dispatch({ type: "drive/list" }, services);
    expect(res).toMatchObject({ ok: false, code: "unauthorized" });
  });

  it("classifies conflict errors as conflict", async () => {
    vi.mocked(driveService.update).mockRejectedValueOnce(
      new Error("conflict: remote revision changed"),
    );
    const res = await dispatch(
      { type: "drive/update", id: "1", content: "{}", prevRevision: "r" },
      services,
    );
    expect(res).toEqual({
      ok: false,
      error: "conflict: remote revision changed",
      code: "conflict",
    });
  });

  it("classifies unknown errors as unknown", async () => {
    vi.mocked(driveService.list).mockRejectedValueOnce(new Error("network timeout"));
    const res = await dispatch({ type: "drive/list" }, services);
    expect(res).toMatchObject({ ok: false, code: "unknown" });
  });
});
