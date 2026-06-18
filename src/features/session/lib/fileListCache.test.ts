import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearCachedFiles, getCachedFiles, setCachedFiles } from "./fileListCache";

const store: Record<string, unknown> = {};
const local = {
  get: vi.fn(async (key: string) => ({ [key]: store[key] })),
  set: vi.fn(async (obj: Record<string, unknown>) => {
    Object.assign(store, obj);
  }),
  remove: vi.fn(async (key: string) => {
    delete store[key];
  }),
};

const files = [{ id: "1", name: "a.excalidraw", modifiedTime: "t", headRevisionId: "r" }];

beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k];
  (globalThis as unknown as { chrome: unknown }).chrome = { storage: { local } };
  local.get.mockClear();
  local.set.mockClear();
  local.remove.mockClear();
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
