// @vitest-environment jsdom
// fake-indexeddb must install the indexedDB global before filesDb's module-
// scope createStore("files-db", "files-store") runs.
import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import type { BinaryFile } from "@/entities/diagram";
import { defaultSceneBridgeDeps } from "./filesDb";

const binaryFile = (id: string): BinaryFile => ({
  mimeType: "image/png",
  id,
  dataURL: `data:image/png;base64,${id}`,
});

// The db/store names filesDb binds to are Excalidraw's real ones — that
// interop can only be verified manually (see docs/development.md). What IS
// unit-testable is the adapter's own logic, orphan deletion above all.
const { loadFiles, saveFiles, clearFiles } = defaultSceneBridgeDeps();

beforeEach(async () => {
  await clearFiles();
});

describe("filesDb", () => {
  it("round-trips files through save and load", async () => {
    const files = { a: binaryFile("a"), b: binaryFile("b") };
    await saveFiles(files);
    await expect(loadFiles()).resolves.toEqual(files);
  });

  it("deletes blobs no longer referenced by the saved scene", async () => {
    await saveFiles({ a: binaryFile("a"), b: binaryFile("b") });
    const next = { b: binaryFile("b"), c: binaryFile("c") };
    await saveFiles(next);
    await expect(loadFiles()).resolves.toEqual(next); // "a" is gone
  });

  it("keeps existing blobs when the saved scene still references them", async () => {
    const kept = binaryFile("a");
    await saveFiles({ a: kept });
    await saveFiles({ a: kept, b: binaryFile("b") });
    const loaded = await loadFiles();
    expect(loaded.a).toEqual(kept);
    expect(Object.keys(loaded).sort()).toEqual(["a", "b"]);
  });

  it("clearFiles empties the store", async () => {
    await saveFiles({ a: binaryFile("a") });
    await clearFiles();
    await expect(loadFiles()).resolves.toEqual({});
  });
});
