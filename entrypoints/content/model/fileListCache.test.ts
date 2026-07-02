import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stubChromeStorageLocal } from "@/shared/lib/testHelpers";
import { clearCachedFiles, getCachedFiles, setCachedFiles } from "./fileListCache";

const files = [{ id: "1", name: "a.excalidraw", modifiedTime: "t", headRevisionId: "r" }];

let store: ReturnType<typeof stubChromeStorageLocal>["store"];
let local: ReturnType<typeof stubChromeStorageLocal>["local"];
beforeEach(() => {
  ({ store, local } = stubChromeStorageLocal());
});
afterEach(() => vi.restoreAllMocks());

describe("fileListCache", () => {
  it("returns an empty array when nothing is cached", async () => {
    await expect(getCachedFiles()).resolves.toEqual([]);
  });

  it("round-trips the cached list", async () => {
    await setCachedFiles(files);
    await expect(getCachedFiles()).resolves.toEqual(files);
  });

  it("returns an empty array for a non-array stored value", async () => {
    store.fileListCache = { not: "an array" };
    await expect(getCachedFiles()).resolves.toEqual([]);
  });

  it("clears the cache", async () => {
    await setCachedFiles(files);
    await clearCachedFiles();
    await expect(getCachedFiles()).resolves.toEqual([]);
  });

  it("returns an empty array when storage.get rejects", async () => {
    local.get.mockImplementationOnce(async () => {
      throw new Error("context invalidated");
    });
    await expect(getCachedFiles()).resolves.toEqual([]);
  });
});
