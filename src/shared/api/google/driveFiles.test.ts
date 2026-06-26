import MockAdapter from "axios-mock-adapter";
import { afterEach, describe, expect, it } from "vitest";
import { DRIVE_API, DRIVE_UPLOAD } from "@/shared/config";
import { DriveError } from "./driveFile";
import {
  createFile,
  findOrCreateFolder,
  getContent,
  getMeta,
  listFolder,
  renameFile,
  trashFile,
  updateFile,
} from "./driveFiles";
import { googleClient } from "./googleClient";

const TOKEN = "tok123";
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
    const files = await listFolder(TOKEN, "FOLDER");
    expect(files).toEqual([
      { id: "1", name: "a.excalidraw", modifiedTime: "t", headRevisionId: "r" },
    ]);
  });

  it("passes auth header", async () => {
    let capturedHeaders: Record<string, string> = {};
    mock.onGet(new RegExp(`${DRIVE_API}/files`)).reply((config) => {
      capturedHeaders = config.headers as Record<string, string>;
      return [200, { files: [] }];
    });
    await listFolder(TOKEN, "F");
    expect(capturedHeaders["Authorization"]).toBe(`Bearer ${TOKEN}`);
  });

  it("includes folderId in query", async () => {
    let capturedUrl = "";
    mock.onGet(new RegExp(`${DRIVE_API}/files`)).reply((config) => {
      capturedUrl = config.url ?? "";
      return [200, { files: [] }];
    });
    await listFolder(TOKEN, "FOLDER");
    expect(decodeURIComponent(capturedUrl)).toContain("'FOLDER'+in+parents");
  });

  it("throws DriveError with status on failure", async () => {
    mock.onGet(new RegExp(`${DRIVE_API}/files`)).reply(403);
    await expect(listFolder(TOKEN, "F")).rejects.toThrow(DriveError);
    await expect(listFolder(TOKEN, "F")).rejects.toMatchObject({ status: 403 });
  });

  it("follows nextPageToken across pages", async () => {
    mock.onGet(/pageToken=PAGE2/).reply(200, {
      files: [{ id: "2", name: "b", modifiedTime: "t", headRevisionId: "r" }],
    });
    mock.onGet(new RegExp(`${DRIVE_API}/files`)).reply(200, {
      nextPageToken: "PAGE2",
      files: [{ id: "1", name: "a", modifiedTime: "t", headRevisionId: "r" }],
    });
    const files = await listFolder(TOKEN, "F");
    expect(files.map((x) => x.id)).toEqual(["1", "2"]);
  });
});

describe("getMeta", () => {
  it("fetches file metadata by id", async () => {
    const meta = { id: "9", name: "n.excalidraw", modifiedTime: "t", headRevisionId: "r" };
    mock.onGet(new RegExp(`${DRIVE_API}/files/9`)).reply(200, meta);
    expect(await getMeta(TOKEN, "9")).toEqual(meta);
  });
});

describe("getContent", () => {
  it("returns file content as text", async () => {
    mock
      .onGet(new RegExp(`${DRIVE_API}/files/9`))
      .reply(200, '{"elements":[]}', { "Content-Type": "application/json" });
    const content = await getContent(TOKEN, "9");
    expect(typeof content).toBe("string");
    expect(content).toContain("elements");
  });

  it("throws DriveError on failure", async () => {
    mock.onGet(new RegExp(`${DRIVE_API}/files/9`)).reply(404);
    await expect(getContent(TOKEN, "9")).rejects.toThrow(DriveError);
  });
});

describe("createFile", () => {
  it("multipart-uploads and returns metadata", async () => {
    const meta = { id: "9", name: "n.excalidraw", modifiedTime: "t", headRevisionId: "r" };
    mock.onPost(new RegExp(`${DRIVE_UPLOAD}/files`)).reply(200, meta);
    const result = await createFile(TOKEN, "n.excalidraw", "FOLDER", '{"x":1}');
    expect(result).toEqual(meta);
  });

  it("sends multipart/related content-type with boundary", async () => {
    let capturedContentType = "";
    mock.onPost(new RegExp(`${DRIVE_UPLOAD}/files`)).reply((config) => {
      capturedContentType = (config.headers as Record<string, string>)["Content-Type"] ?? "";
      return [200, { id: "9", name: "n", modifiedTime: "t", headRevisionId: "r" }];
    });
    await createFile(TOKEN, "n.excalidraw", "F", "{}");
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
    await createFile(TOKEN, "n.excalidraw", "F", content);
    const boundary = capturedContentType.match(/boundary=(.+)$/)?.[1] ?? "";
    expect(boundary).not.toBe("");
    expect(content.includes(boundary)).toBe(false);
    expect(capturedBody).toContain(content);
  });
});

describe("updateFile", () => {
  it("rejects on revision mismatch before writing", async () => {
    mock
      .onGet(new RegExp(`${DRIVE_API}/files/9\\?fields`))
      .reply(200, { id: "9", name: "n", modifiedTime: "t", headRevisionId: "rNEW" });
    await expect(updateFile(TOKEN, "9", "{}", "rOLD")).rejects.toThrow(/conflict/i);
  });

  it("writes when revision matches", async () => {
    mock
      .onGet(new RegExp(`${DRIVE_API}/files/9\\?fields`))
      .reply(200, { id: "9", name: "n", modifiedTime: "t", headRevisionId: "rSAME" });
    mock
      .onPatch(new RegExp(`${DRIVE_UPLOAD}/files/9`))
      .reply(200, { id: "9", name: "n", modifiedTime: "t2", headRevisionId: "rNEXT" });
    const meta = await updateFile(TOKEN, "9", "{}", "rSAME");
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
    const meta = await renameFile(TOKEN, "9", "new.excalidraw");
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
    await trashFile(TOKEN, "FILE1");
    expect(JSON.parse(capturedBody)).toEqual({ trashed: true });
  });

  it("throws DriveError on failure", async () => {
    mock.onPatch(new RegExp(`${DRIVE_API}/files/F`)).reply(403);
    await expect(trashFile(TOKEN, "F")).rejects.toThrow(DriveError);
  });
});

describe("findOrCreateFolder", () => {
  it("returns existing folder without creating", async () => {
    mock.onGet(new RegExp(`${DRIVE_API}/files\\?q`)).reply(200, {
      files: [{ id: "F1", name: "Diagrams" }],
    });
    const folder = await findOrCreateFolder(TOKEN, "Diagrams");
    expect(folder).toEqual({ id: "F1", name: "Diagrams" });
  });

  it("creates folder when none matches", async () => {
    mock.onGet(new RegExp(`${DRIVE_API}/files\\?q`)).reply(200, { files: [] });
    mock.onPost(new RegExp(`${DRIVE_API}/files`)).reply(200, { id: "F2", name: "New" });
    const folder = await findOrCreateFolder(TOKEN, "New");
    expect(folder).toEqual({ id: "F2", name: "New" });
  });

  it("escapes single quotes in folder name query", async () => {
    let capturedUrl = "";
    mock.onGet(new RegExp(`${DRIVE_API}/files\\?q`)).reply((config) => {
      capturedUrl = config.url ?? "";
      return [200, { files: [{ id: "X", name: "Bob's" }] }];
    });
    await findOrCreateFolder(TOKEN, "Bob's");
    expect(decodeURIComponent(capturedUrl)).toContain("Bob\\'s");
  });

  it("escapes backslashes in folder name query", async () => {
    let capturedUrl = "";
    mock.onGet(new RegExp(`${DRIVE_API}/files\\?q`)).reply((config) => {
      capturedUrl = config.url ?? "";
      return [200, { files: [{ id: "X", name: "back\\slash" }] }];
    });
    await findOrCreateFolder(TOKEN, "back\\slash");
    expect(decodeURIComponent(capturedUrl)).toContain("back\\\\slash");
  });
});
