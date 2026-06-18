import { describe, expect, it, vi } from "vitest";
import type { GatewayDeps } from "./handleMessage";
import { handleMessage } from "./handleMessage";

function deps(over: Partial<GatewayDeps> = {}): GatewayDeps {
  return {
    getToken: vi.fn(async () => "TOK"),
    signOut: vi.fn(async () => undefined),
    listFolder: vi.fn(async () => [{ id: "1", name: "a", modifiedTime: "t", headRevisionId: "r" }]),
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
});
