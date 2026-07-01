import { TimeoutError } from "ky";
import { describe, expect, it, vi } from "vitest";
import { jsonResponse, stubFetch } from "@/shared/lib/testHelpers";
import { DriveError } from "./driveFile";
import { driveRepo } from "./driveRepo";

describe("googleClient timeout", () => {
  it("aborts a request that never responds after 15 seconds", async () => {
    vi.useFakeTimers();
    stubFetch(() => new Promise<Response>(() => {}));
    const result = expect(driveRepo.getMeta("9")).rejects.toBeInstanceOf(TimeoutError);
    await vi.advanceTimersByTimeAsync(15_000);
    await result;
    vi.useRealTimers();
  });
});

describe("listFolder", () => {
  it("requests files and maps them", async () => {
    stubFetch(() =>
      jsonResponse({
        files: [{ id: "1", name: "a.excalidraw", modifiedTime: "t", headRevisionId: "r" }],
      }),
    );
    const files = await driveRepo.listFolder("FOLDER");
    expect(files).toEqual([
      { id: "1", name: "a.excalidraw", modifiedTime: "t", headRevisionId: "r" },
    ]);
  });

  it("includes folderId in the query param", async () => {
    let capturedQ = "";
    stubFetch((request) => {
      capturedQ = new URL(request.url).searchParams.get("q") ?? "";
      return jsonResponse({ files: [] });
    });
    await driveRepo.listFolder("FOLDER");
    expect(capturedQ).toContain("'FOLDER' in parents");
  });

  it("throws DriveError with status on failure", async () => {
    stubFetch(() => new Response("", { status: 403 }));
    await expect(driveRepo.listFolder("F")).rejects.toThrow(DriveError);
    await expect(driveRepo.listFolder("F")).rejects.toMatchObject({ status: 403 });
  });

  it("follows nextPageToken across pages", async () => {
    stubFetch((request) => {
      const pageToken = new URL(request.url).searchParams.get("pageToken");
      if (pageToken === "PAGE2") {
        return jsonResponse({
          files: [{ id: "2", name: "b", modifiedTime: "t", headRevisionId: "r" }],
        });
      }
      return jsonResponse({
        nextPageToken: "PAGE2",
        files: [{ id: "1", name: "a", modifiedTime: "t", headRevisionId: "r" }],
      });
    });
    const files = await driveRepo.listFolder("F");
    expect(files.map((x) => x.id)).toEqual(["1", "2"]);
  });
});

describe("getMeta", () => {
  it("fetches file metadata by id", async () => {
    const meta = { id: "9", name: "n.excalidraw", modifiedTime: "t", headRevisionId: "r" };
    stubFetch(() => jsonResponse(meta));
    expect(await driveRepo.getMeta("9")).toEqual(meta);
  });
});

describe("getContent", () => {
  it("returns file content as text", async () => {
    stubFetch(
      () =>
        new Response('{"elements":[]}', {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );
    const content = await driveRepo.getContent("9");
    expect(typeof content).toBe("string");
    expect(content).toContain("elements");
  });

  it("throws DriveError on failure", async () => {
    stubFetch(() => new Response("", { status: 404 }));
    await expect(driveRepo.getContent("9")).rejects.toThrow(DriveError);
  });
});

describe("getDiagram", () => {
  it("returns meta and content together", async () => {
    stubFetch((request) => {
      const alt = new URL(request.url).searchParams.get("alt");
      if (alt === "media") {
        return new Response('{"elements":[]}', {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return jsonResponse({
        id: "9",
        name: "n.excalidraw",
        modifiedTime: "t",
        headRevisionId: "r",
      });
    });
    const diagram = await driveRepo.getDiagram("9");
    expect(diagram.meta.id).toBe("9");
    expect(diagram.content).toContain("elements");
  });
});

describe("createFile", () => {
  it("multipart-uploads and returns metadata", async () => {
    const meta = { id: "9", name: "n.excalidraw", modifiedTime: "t", headRevisionId: "r" };
    stubFetch(() => jsonResponse(meta));
    const result = await driveRepo.createFile("n.excalidraw", "FOLDER", '{"x":1}');
    expect(result).toEqual(meta);
  });

  it("sends multipart/related content-type with boundary", async () => {
    let capturedContentType = "";
    stubFetch((request) => {
      capturedContentType = request.headers.get("Content-Type") ?? "";
      return jsonResponse({ id: "9", name: "n", modifiedTime: "t", headRevisionId: "r" });
    });
    await driveRepo.createFile("n.excalidraw", "F", "{}");
    expect(capturedContentType).toMatch(/multipart\/related/);
    expect(capturedContentType).toMatch(/boundary=/);
  });

  it("uses a random boundary that does not collide with content", async () => {
    const content = '{"note":"--es-boundary--"}';
    let capturedBody = "";
    let capturedContentType = "";
    stubFetch(async (request) => {
      capturedBody = await request.text();
      capturedContentType = request.headers.get("Content-Type") ?? "";
      return jsonResponse({ id: "9", name: "n", modifiedTime: "t", headRevisionId: "r" });
    });
    await driveRepo.createFile("n.excalidraw", "F", content);
    const boundary = capturedContentType.match(/boundary=(.+)$/)?.[1] ?? "";
    expect(boundary).not.toBe("");
    expect(content.includes(boundary)).toBe(false);
    expect(capturedBody).toContain(content);
  });
});

describe("updateFile", () => {
  it("rejects on revision mismatch before writing", async () => {
    stubFetch(() =>
      jsonResponse({ id: "9", name: "n", modifiedTime: "t", headRevisionId: "rNEW" }),
    );
    await expect(driveRepo.updateFile("9", "{}", "rOLD")).rejects.toThrow(/conflict/i);
  });

  it("writes when revision matches", async () => {
    stubFetch((request) => {
      if (request.method === "GET") {
        return jsonResponse({ id: "9", name: "n", modifiedTime: "t", headRevisionId: "rSAME" });
      }
      return jsonResponse({ id: "9", name: "n", modifiedTime: "t2", headRevisionId: "rNEXT" });
    });
    const meta = await driveRepo.updateFile("9", "{}", "rSAME");
    expect(meta.headRevisionId).toBe("rNEXT");
  });
});

describe("renameFile", () => {
  it("PATCHes the name as JSON", async () => {
    let capturedBody = "";
    stubFetch(async (request) => {
      capturedBody = await request.text();
      return jsonResponse({
        id: "9",
        name: "new.excalidraw",
        modifiedTime: "t",
        headRevisionId: "r",
      });
    });
    const meta = await driveRepo.renameFile("9", "new.excalidraw");
    expect(meta.name).toBe("new.excalidraw");
    expect(JSON.parse(capturedBody)).toEqual({ name: "new.excalidraw" });
  });
});

describe("trashFile", () => {
  it("PATCHes with trashed:true", async () => {
    let capturedBody = "";
    stubFetch(async (request) => {
      capturedBody = await request.text();
      return jsonResponse({});
    });
    await driveRepo.trashFile("FILE1");
    expect(JSON.parse(capturedBody)).toEqual({ trashed: true });
  });

  it("throws DriveError on failure", async () => {
    stubFetch(() => new Response("", { status: 403 }));
    await expect(driveRepo.trashFile("F")).rejects.toThrow(DriveError);
  });
});

describe("findOrCreateFolder", () => {
  it("returns existing folder without creating", async () => {
    stubFetch(() => jsonResponse({ files: [{ id: "F1", name: "Diagrams" }] }));
    const folder = await driveRepo.findOrCreateFolder("Diagrams");
    expect(folder).toEqual({ id: "F1", name: "Diagrams" });
  });

  it("creates folder when none matches", async () => {
    stubFetch((request) => {
      if (request.method === "GET") return jsonResponse({ files: [] });
      return jsonResponse({ id: "F2", name: "New" });
    });
    const folder = await driveRepo.findOrCreateFolder("New");
    expect(folder).toEqual({ id: "F2", name: "New" });
  });

  it("escapes single quotes in folder name query", async () => {
    let capturedQ = "";
    stubFetch((request) => {
      capturedQ = new URL(request.url).searchParams.get("q") ?? "";
      return jsonResponse({ files: [{ id: "X", name: "Bob's" }] });
    });
    await driveRepo.findOrCreateFolder("Bob's");
    expect(capturedQ).toContain("Bob\\'s");
  });

  it("escapes backslashes in folder name query", async () => {
    let capturedQ = "";
    stubFetch((request) => {
      capturedQ = new URL(request.url).searchParams.get("q") ?? "";
      return jsonResponse({ files: [{ id: "X", name: "back\\slash" }] });
    });
    await driveRepo.findOrCreateFolder("back\\slash");
    expect(capturedQ).toContain("back\\\\slash");
  });
});
