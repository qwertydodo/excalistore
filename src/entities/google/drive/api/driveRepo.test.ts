import MockAdapter from "axios-mock-adapter";
import { afterEach, describe, expect, it } from "vitest";
import { googleClient } from "@/shared/api/google";
import { DRIVE_API, DRIVE_UPLOAD } from "@/shared/config";
import { DriveError } from "./driveFile";
import { driveRepo } from "./driveRepo";

const mock = new MockAdapter(googleClient);
afterEach(() => mock.reset());

describe("googleClient config", () => {
  it("has a 15-second timeout", () => {
    expect(googleClient.defaults.timeout).toBe(15_000);
  });
});

describe("listFolder", () => {
  it("requests files and maps them", async () => {
    mock.onGet(new RegExp(`${DRIVE_API}/files`)).reply(200, {
      files: [{ id: "1", name: "a.excalidraw", modifiedTime: "t", headRevisionId: "r" }],
    });
    const files = await driveRepo.listFolder("FOLDER");
    expect(files).toEqual([
      { id: "1", name: "a.excalidraw", modifiedTime: "t", headRevisionId: "r" },
    ]);
  });

  it("includes folderId in the query param", async () => {
    let capturedQ = "";
    mock.onGet(new RegExp(`${DRIVE_API}/files`)).reply((config) => {
      capturedQ = (config.params as { q: string }).q;
      return [200, { files: [] }];
    });
    await driveRepo.listFolder("FOLDER");
    expect(capturedQ).toContain("'FOLDER' in parents");
  });

  it("throws DriveError with status on failure", async () => {
    mock.onGet(new RegExp(`${DRIVE_API}/files`)).reply(403);
    await expect(driveRepo.listFolder("F")).rejects.toThrow(DriveError);
    await expect(driveRepo.listFolder("F")).rejects.toMatchObject({ status: 403 });
  });

  it("follows nextPageToken across pages", async () => {
    mock.onGet(new RegExp(`${DRIVE_API}/files`)).reply((config) => {
      if ((config.params as { pageToken?: string }).pageToken === "PAGE2") {
        return [200, { files: [{ id: "2", name: "b", modifiedTime: "t", headRevisionId: "r" }] }];
      }
      return [
        200,
        {
          nextPageToken: "PAGE2",
          files: [{ id: "1", name: "a", modifiedTime: "t", headRevisionId: "r" }],
        },
      ];
    });
    const files = await driveRepo.listFolder("F");
    expect(files.map((x) => x.id)).toEqual(["1", "2"]);
  });
});

describe("getMeta", () => {
  it("fetches file metadata by id", async () => {
    const meta = { id: "9", name: "n.excalidraw", modifiedTime: "t", headRevisionId: "r" };
    mock.onGet(new RegExp(`${DRIVE_API}/files/9`)).reply(200, meta);
    expect(await driveRepo.getMeta("9")).toEqual(meta);
  });
});

describe("getContent", () => {
  it("returns file content as text", async () => {
    mock
      .onGet(new RegExp(`${DRIVE_API}/files/9`))
      .reply(200, '{"elements":[]}', { "Content-Type": "application/json" });
    const content = await driveRepo.getContent("9");
    expect(typeof content).toBe("string");
    expect(content).toContain("elements");
  });

  it("throws DriveError on failure", async () => {
    mock.onGet(new RegExp(`${DRIVE_API}/files/9`)).reply(404);
    await expect(driveRepo.getContent("9")).rejects.toThrow(DriveError);
  });
});

describe("getDiagram", () => {
  it("returns meta and content together", async () => {
    mock.onGet(new RegExp(`${DRIVE_API}/files/9`)).reply((config) => {
      if ((config.params as { alt?: string }).alt === "media") {
        return [200, '{"elements":[]}', { "Content-Type": "application/json" }];
      }
      return [200, { id: "9", name: "n.excalidraw", modifiedTime: "t", headRevisionId: "r" }];
    });
    const diagram = await driveRepo.getDiagram("9");
    expect(diagram.meta.id).toBe("9");
    expect(diagram.content).toContain("elements");
  });
});

describe("createFile", () => {
  it("multipart-uploads and returns metadata", async () => {
    const meta = { id: "9", name: "n.excalidraw", modifiedTime: "t", headRevisionId: "r" };
    mock.onPost(new RegExp(`${DRIVE_UPLOAD}/files`)).reply(200, meta);
    const result = await driveRepo.createFile("n.excalidraw", "FOLDER", '{"x":1}');
    expect(result).toEqual(meta);
  });

  it("sends multipart/related content-type with boundary", async () => {
    let capturedContentType = "";
    mock.onPost(new RegExp(`${DRIVE_UPLOAD}/files`)).reply((config) => {
      capturedContentType = (config.headers as Record<string, string>)["Content-Type"] ?? "";
      return [200, { id: "9", name: "n", modifiedTime: "t", headRevisionId: "r" }];
    });
    await driveRepo.createFile("n.excalidraw", "F", "{}");
    expect(capturedContentType).toMatch(/multipart\/related/);
    expect(capturedContentType).toMatch(/boundary=/);
  });

  it("uses a random boundary that does not collide with content", async () => {
    const content = '{"note":"--es-boundary--"}';
    let capturedBody = "";
    let capturedContentType = "";
    mock.onPost(new RegExp(`${DRIVE_UPLOAD}/files`)).reply((config) => {
      capturedBody = config.data as string;
      capturedContentType = (config.headers as Record<string, string>)["Content-Type"] ?? "";
      return [200, { id: "9", name: "n", modifiedTime: "t", headRevisionId: "r" }];
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
    mock
      .onGet(new RegExp(`${DRIVE_API}/files/9`))
      .reply(200, { id: "9", name: "n", modifiedTime: "t", headRevisionId: "rNEW" });
    await expect(driveRepo.updateFile("9", "{}", "rOLD")).rejects.toThrow(/conflict/i);
  });

  it("writes when revision matches", async () => {
    mock
      .onGet(new RegExp(`${DRIVE_API}/files/9`))
      .reply(200, { id: "9", name: "n", modifiedTime: "t", headRevisionId: "rSAME" });
    mock
      .onPatch(new RegExp(`${DRIVE_UPLOAD}/files/9`))
      .reply(200, { id: "9", name: "n", modifiedTime: "t2", headRevisionId: "rNEXT" });
    const meta = await driveRepo.updateFile("9", "{}", "rSAME");
    expect(meta.headRevisionId).toBe("rNEXT");
  });
});

describe("renameFile", () => {
  it("PATCHes the name as JSON", async () => {
    let capturedBody = "";
    mock.onPatch(new RegExp(`${DRIVE_API}/files/9`)).reply((config) => {
      capturedBody = config.data as string;
      return [200, { id: "9", name: "new.excalidraw", modifiedTime: "t", headRevisionId: "r" }];
    });
    const meta = await driveRepo.renameFile("9", "new.excalidraw");
    expect(meta.name).toBe("new.excalidraw");
    expect(JSON.parse(capturedBody)).toEqual({ name: "new.excalidraw" });
  });
});

describe("trashFile", () => {
  it("PATCHes with trashed:true", async () => {
    let capturedBody = "";
    mock.onPatch(new RegExp(`${DRIVE_API}/files/FILE1`)).reply((config) => {
      capturedBody = config.data as string;
      return [200, {}];
    });
    await driveRepo.trashFile("FILE1");
    expect(JSON.parse(capturedBody)).toEqual({ trashed: true });
  });

  it("throws DriveError on failure", async () => {
    mock.onPatch(new RegExp(`${DRIVE_API}/files/F`)).reply(403);
    await expect(driveRepo.trashFile("F")).rejects.toThrow(DriveError);
  });
});

describe("findOrCreateFolder", () => {
  it("returns existing folder without creating", async () => {
    mock.onGet(new RegExp(`${DRIVE_API}/files`)).reply(200, {
      files: [{ id: "F1", name: "Diagrams" }],
    });
    const folder = await driveRepo.findOrCreateFolder("Diagrams");
    expect(folder).toEqual({ id: "F1", name: "Diagrams" });
  });

  it("creates folder when none matches", async () => {
    mock.onGet(new RegExp(`${DRIVE_API}/files`)).reply(200, { files: [] });
    mock.onPost(new RegExp(`${DRIVE_API}/files`)).reply(200, { id: "F2", name: "New" });
    const folder = await driveRepo.findOrCreateFolder("New");
    expect(folder).toEqual({ id: "F2", name: "New" });
  });

  it("escapes single quotes in folder name query", async () => {
    let capturedQ = "";
    mock.onGet(new RegExp(`${DRIVE_API}/files`)).reply((config) => {
      capturedQ = (config.params as { q: string }).q;
      return [200, { files: [{ id: "X", name: "Bob's" }] }];
    });
    await driveRepo.findOrCreateFolder("Bob's");
    expect(capturedQ).toContain("Bob\\'s");
  });

  it("escapes backslashes in folder name query", async () => {
    let capturedQ = "";
    mock.onGet(new RegExp(`${DRIVE_API}/files`)).reply((config) => {
      capturedQ = (config.params as { q: string }).q;
      return [200, { files: [{ id: "X", name: "back\\slash" }] }];
    });
    await driveRepo.findOrCreateFolder("back\\slash");
    expect(capturedQ).toContain("back\\\\slash");
  });
});
