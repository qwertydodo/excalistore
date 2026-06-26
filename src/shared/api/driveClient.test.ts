import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createFile,
  findOrCreateFolder,
  listFolder,
  renameFile,
  trashFile,
  updateFile,
} from "./driveClient";

const TOKEN = "tok123";

function mockFetch(body: unknown, ok = true, status = 200) {
  return vi.fn(
    async (_url: RequestInfo | URL, _init?: RequestInit) =>
      ({ ok, status, json: async () => body, text: async () => JSON.stringify(body) }) as Response,
  );
}

afterEach(() => vi.restoreAllMocks());

describe("request timeout", () => {
  it("passes an abort signal to fetch", async () => {
    let sawSignal = false;
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      sawSignal = init?.signal instanceof AbortSignal;
      return { ok: true, status: 200, json: async () => ({ files: [] }) } as Response;
    });
    await listFolder(TOKEN, "F", fetchMock);
    expect(sawSignal).toBe(true);
  });
});

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

  it("follows nextPageToken across pages", async () => {
    const fetchMock = vi.fn(async (url: RequestInfo | URL) => {
      const u = String(url);
      if (u.includes("pageToken=PAGE2")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            files: [{ id: "2", name: "b", modifiedTime: "t", headRevisionId: "r" }],
          }),
        } as Response;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          nextPageToken: "PAGE2",
          files: [{ id: "1", name: "a", modifiedTime: "t", headRevisionId: "r" }],
        }),
      } as Response;
    });
    const files = await listFolder(TOKEN, "F", fetchMock);
    expect(files.map((x) => x.id)).toEqual(["1", "2"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
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

  it("uses a boundary that does not collide with the content body", async () => {
    // content deliberately contains the OLD fixed boundary token
    const content = '{"note":"--es-boundary--"}';
    let capturedBody = "";
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      capturedBody = init?.body as string;
      const ct = (init?.headers as Record<string, string>)["Content-Type"] ?? "";
      const boundary = ct.match(/boundary=(.+)$/)?.[1] ?? "";
      // the chosen boundary must not appear inside the user content
      expect(boundary).not.toBe("");
      expect(content.includes(boundary)).toBe(false);
      return {
        ok: true,
        status: 200,
        json: async () => ({ id: "9", name: "n", modifiedTime: "t", headRevisionId: "r" }),
      } as Response;
    });
    await createFile(TOKEN, "n.excalidraw", "F", content, fetchMock);
    expect(capturedBody).toContain(content);
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

describe("findOrCreateFolder", () => {
  it("returns an existing app folder by name without creating", async () => {
    const fetchMock = vi.fn(
      async (_url: RequestInfo | URL) =>
        ({
          ok: true,
          status: 200,
          json: async () => ({ files: [{ id: "F1", name: "Diagrams" }] }),
        }) as Response,
    );
    const folder = await findOrCreateFolder(TOKEN, "Diagrams", fetchMock);
    expect(folder).toEqual({ id: "F1", name: "Diagrams" });
    // only the list call happened (no create POST)
    expect(fetchMock).toHaveBeenCalledOnce();
    const url = String(fetchMock.mock.calls[0]?.[0]);
    expect(url).toContain("mimeType");
    expect(url).toContain("Diagrams");
  });

  it("creates the folder when none matches", async () => {
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") {
        return { ok: true, status: 200, json: async () => ({ id: "F2", name: "New" }) } as Response;
      }
      return { ok: true, status: 200, json: async () => ({ files: [] }) } as Response;
    });
    const folder = await findOrCreateFolder(TOKEN, "New", fetchMock);
    expect(folder).toEqual({ id: "F2", name: "New" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const createInit = fetchMock.mock.calls[1]?.[1] as RequestInit;
    expect(createInit.method).toBe("POST");
    expect(JSON.parse(createInit.body as string)).toMatchObject({
      name: "New",
      mimeType: "application/vnd.google-apps.folder",
    });
  });

  it("escapes single quotes in the folder name query", async () => {
    const fetchMock = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") {
        return {
          ok: true,
          status: 200,
          json: async () => ({ id: "X", name: "Bob's" }),
        } as Response;
      }
      const u = decodeURIComponent(String(url));
      expect(u).toContain("Bob\\'s");
      return { ok: true, status: 200, json: async () => ({ files: [] }) } as Response;
    });
    await findOrCreateFolder(TOKEN, "Bob's", fetchMock);
  });

  it("escapes backslashes before quotes in the folder name query", async () => {
    // Return a match so only the list call fires (no create POST to assert on).
    const fetchMock = vi.fn(async (url: RequestInfo | URL) => {
      const u = decodeURIComponent(String(url));
      // a trailing backslash must be doubled so it can't escape the closing quote
      expect(u).toContain("back\\\\slash");
      return {
        ok: true,
        status: 200,
        json: async () => ({ files: [{ id: "X", name: "back\\slash" }] }),
      } as Response;
    });
    await findOrCreateFolder(TOKEN, "back\\slash", fetchMock);
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});

describe("trashFile", () => {
  it("PATCHes files/{id} with trashed:true and auth header", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200 }) as Response);
    await trashFile(TOKEN, "FILE1", fetchMock);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = (fetchMock.mock.calls[0] as unknown as [string, RequestInit]) ?? ["", {}];
    expect(url).toContain("/files/FILE1");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body as string)).toEqual({ trashed: true });
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);
  });

  it("throws DriveError on non-ok response", async () => {
    await expect(
      trashFile(
        TOKEN,
        "F",
        vi.fn(async () => ({ ok: false, status: 403 }) as Response),
      ),
    ).rejects.toThrow(/403/);
  });
});
