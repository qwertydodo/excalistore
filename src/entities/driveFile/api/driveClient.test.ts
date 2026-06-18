import { afterEach, describe, expect, it, vi } from "vitest";
import { createFile, listFolder, renameFile, updateFile } from "./driveClient";

const TOKEN = "tok123";

function mockFetch(body: unknown, ok = true, status = 200) {
  return vi.fn(
    async (_url: RequestInfo | URL, _init?: RequestInit) =>
      ({ ok, status, json: async () => body, text: async () => JSON.stringify(body) }) as Response,
  );
}

afterEach(() => vi.restoreAllMocks());

describe("listFolder", () => {
  it("requests the folder's files and maps them", async () => {
    const fetchMock = mockFetch({
      files: [{ id: "1", name: "a.excalidraw", modifiedTime: "t", headRevisionId: "r" }],
    });
    const files = await listFolder(TOKEN, "FOLDER", fetchMock);
    expect(files).toEqual([
      { id: "1", name: "a.excalidraw", modifiedTime: "t", headRevisionId: "r" },
    ]);
    const url = (fetchMock.mock.calls[0]?.[0] as string) ?? "";
    expect(url).toContain("'FOLDER'+in+parents");
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);
  });

  it("throws with status on failure", async () => {
    await expect(listFolder(TOKEN, "F", mockFetch({ error: "no" }, false, 403))).rejects.toThrow(
      /403/,
    );
  });
});

describe("createFile", () => {
  it("multipart-uploads name+parents+content and returns metadata", async () => {
    const fetchMock = mockFetch({
      id: "9",
      name: "n.excalidraw",
      modifiedTime: "t",
      headRevisionId: "r",
    });
    const meta = await createFile(TOKEN, "n.excalidraw", "FOLDER", '{"x":1}', fetchMock);
    expect(meta.id).toBe("9");
    const url = fetchMock.mock.calls[0]?.[0] as string;
    expect(url).toContain("/upload/drive/v3/files");
    expect(url).toContain("uploadType=multipart");
  });
});

describe("updateFile", () => {
  it("rejects on revision mismatch before writing", async () => {
    // getMeta returns a newer revision than the caller's prevRevision.
    const fetchMock = vi.fn(async (url: RequestInfo | URL) => {
      if (String(url).includes("fields=")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ id: "9", name: "n", modifiedTime: "t", headRevisionId: "rNEW" }),
        } as Response;
      }
      return { ok: true, status: 200, json: async () => ({}) } as Response;
    });
    await expect(updateFile(TOKEN, "9", "{}", "rOLD", fetchMock)).rejects.toThrow(/conflict/i);
  });

  it("writes when revision matches", async () => {
    // getMeta hits /drive/v3; the write hits /upload/drive/v3 — discriminate on that.
    const fetchMock = vi.fn(async (url: RequestInfo | URL) => {
      if (String(url).includes("/upload/")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ id: "9", name: "n", modifiedTime: "t2", headRevisionId: "rNEXT" }),
        } as Response;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ id: "9", name: "n", modifiedTime: "t", headRevisionId: "rSAME" }),
      } as Response;
    });
    const meta = await updateFile(TOKEN, "9", "{}", "rSAME", fetchMock);
    expect(meta.headRevisionId).toBe("rNEXT");
  });
});

describe("renameFile", () => {
  it("PATCHes the name as JSON", async () => {
    const fetchMock = mockFetch({
      id: "9",
      name: "new.excalidraw",
      modifiedTime: "t",
      headRevisionId: "r",
    });
    const meta = await renameFile(TOKEN, "9", "new.excalidraw", fetchMock);
    expect(meta.name).toBe("new.excalidraw");
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body as string)).toEqual({ name: "new.excalidraw" });
  });
});
