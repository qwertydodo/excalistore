import { describe, expect, it, vi } from "vitest";
import type { GatewayDeps } from "./handleMessage";
import { handleMessage } from "./handleMessage";

function deps(over: Partial<GatewayDeps> = {}): GatewayDeps {
  return {
    getToken: vi.fn(async () => "TOK"),
    signOut: vi.fn(async () => undefined),
    listFolder: vi.fn(async () => [{ id: "1", name: "a", modifiedTime: "t", headRevisionId: "r" }]),
    getFile: vi.fn(async () => ({
      meta: { id: "1", name: "a.excalidraw", modifiedTime: "t", headRevisionId: "r" },
      content: '{"type":"excalidraw"}',
    })),
    createFile: vi.fn(async () => ({
      id: "2",
      name: "new.excalidraw",
      modifiedTime: "t",
      headRevisionId: "r0",
    })),
    updateFile: vi.fn(async () => ({
      id: "1",
      name: "a.excalidraw",
      modifiedTime: "t2",
      headRevisionId: "r2",
    })),
    renameFile: vi.fn(async () => ({
      id: "1",
      name: "renamed.excalidraw",
      modifiedTime: "t2",
      headRevisionId: "r",
    })),
    getStore: vi.fn(async () => ({ connected: true, folderId: "F", folderName: "Diagrams" })),
    setStore: vi.fn(async () => undefined),
    ...over,
  };
}

describe("handleMessage", () => {
  it("auth/status returns stored connection", async () => {
    const res = await handleMessage({ type: "auth/status" }, deps());
    expect(res).toEqual({
      ok: true,
      data: { connected: true, folderId: "F", folderName: "Diagrams" },
    });
  });

  it("drive/list uses token + stored folder", async () => {
    const d = deps();
    const res = await handleMessage({ type: "drive/list" }, d);
    expect(d.getToken).toHaveBeenCalled();
    expect(d.listFolder).toHaveBeenCalledWith("TOK", "F");
    expect(res).toEqual({
      ok: true,
      data: [{ id: "1", name: "a", modifiedTime: "t", headRevisionId: "r" }],
    });
  });

  it("drive/list errors when not connected", async () => {
    const d = deps({ getStore: vi.fn(async () => ({ connected: false })) });
    const res = await handleMessage({ type: "drive/list" }, d);
    expect(res).toEqual({
      ok: false,
      error: expect.stringMatching(/not connected/i),
      code: "unknown",
    });
  });

  it("auth/signOut clears the store", async () => {
    const d = deps();
    const res = await handleMessage({ type: "auth/signOut" }, d);
    expect(d.signOut).toHaveBeenCalled();
    expect(d.setStore).toHaveBeenCalledWith({ connected: false });
    expect(res).toEqual({ ok: true, data: { connected: false } });
  });

  it("drive/setConnection stores and echoes the status", async () => {
    const d = deps();
    const status = { connected: true, folderId: "G", folderName: "Other" };
    const res = await handleMessage({ type: "drive/setConnection", status }, d);
    expect(d.setStore).toHaveBeenCalledWith(status);
    expect(res).toEqual({ ok: true, data: status });
  });

  it("maps conflict errors to code conflict", async () => {
    const d = deps({
      listFolder: vi.fn(async () => {
        throw new Error("conflict: x");
      }),
    });
    const res = await handleMessage({ type: "drive/list" }, d);
    expect(res).toEqual({ ok: false, error: "conflict: x", code: "conflict" });
  });

  it("drive/get fetches content + meta with token", async () => {
    const d = deps();
    const res = await handleMessage({ type: "drive/get", id: "1" }, d);
    expect(d.getToken).toHaveBeenCalled();
    expect(d.getFile).toHaveBeenCalledWith("TOK", "1");
    expect(res).toEqual({
      ok: true,
      data: {
        meta: { id: "1", name: "a.excalidraw", modifiedTime: "t", headRevisionId: "r" },
        content: '{"type":"excalidraw"}',
      },
    });
  });

  it("drive/get errors when not connected", async () => {
    const d = deps({ getStore: vi.fn(async () => ({ connected: false })) });
    const res = await handleMessage({ type: "drive/get", id: "1" }, d);
    expect(res).toEqual({
      ok: false,
      error: expect.stringMatching(/not connected/i),
      code: "unknown",
    });
  });

  it("drive/create uses token + stored folder", async () => {
    const d = deps();
    const res = await handleMessage(
      { type: "drive/create", name: "new.excalidraw", content: "{}" },
      d,
    );
    expect(d.createFile).toHaveBeenCalledWith("TOK", "new.excalidraw", "F", "{}");
    expect(res).toEqual({
      ok: true,
      data: { id: "2", name: "new.excalidraw", modifiedTime: "t", headRevisionId: "r0" },
    });
  });

  it("drive/create errors without a folder", async () => {
    const d = deps({ getStore: vi.fn(async () => ({ connected: true })) });
    const res = await handleMessage({ type: "drive/create", name: "n", content: "{}" }, d);
    expect(res).toEqual({
      ok: false,
      error: expect.stringMatching(/no folder|not connected/i),
      code: "unknown",
    });
  });

  it("drive/update passes the prev revision for the conflict guard", async () => {
    const d = deps();
    const res = await handleMessage(
      { type: "drive/update", id: "1", content: "{}", prevRevision: "r" },
      d,
    );
    expect(d.updateFile).toHaveBeenCalledWith("TOK", "1", "{}", "r");
    expect(res).toEqual({
      ok: true,
      data: { id: "1", name: "a.excalidraw", modifiedTime: "t2", headRevisionId: "r2" },
    });
  });

  it("drive/update surfaces conflict with code conflict", async () => {
    const d = deps({
      updateFile: vi.fn(async () => {
        throw new Error("conflict: remote revision changed");
      }),
    });
    const res = await handleMessage(
      { type: "drive/update", id: "1", content: "{}", prevRevision: "rOLD" },
      d,
    );
    expect(res).toEqual({
      ok: false,
      error: "conflict: remote revision changed",
      code: "conflict",
    });
  });

  it("drive/rename renames with token", async () => {
    const d = deps();
    const res = await handleMessage(
      { type: "drive/rename", id: "1", name: "renamed.excalidraw" },
      d,
    );
    expect(d.renameFile).toHaveBeenCalledWith("TOK", "1", "renamed.excalidraw");
    expect(res).toEqual({
      ok: true,
      data: { id: "1", name: "renamed.excalidraw", modifiedTime: "t2", headRevisionId: "r" },
    });
  });
});
