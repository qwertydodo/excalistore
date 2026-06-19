import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearActiveFile, getActiveFile, setActiveFile } from "./activeFileStore";

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

beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k];
  (globalThis as unknown as { chrome: unknown }).chrome = { storage: { local } };
  local.get.mockClear();
  local.set.mockClear();
  local.remove.mockClear();
});
afterEach(() => vi.restoreAllMocks());

describe("activeFileStore", () => {
  it("returns null when nothing is stored", async () => {
    await expect(getActiveFile()).resolves.toBeNull();
  });

  it("round-trips a valid pointer", async () => {
    const af = { id: "1", name: "a.excalidraw", loadedRevision: "r" };
    await setActiveFile(af);
    await expect(getActiveFile()).resolves.toEqual(af);
  });

  it("returns null for a malformed stored value", async () => {
    store.activeFile = { id: "1" };
    await expect(getActiveFile()).resolves.toBeNull();
  });

  it("clears the pointer", async () => {
    await setActiveFile({ id: "1", name: "a", loadedRevision: "r" });
    await clearActiveFile();
    await expect(getActiveFile()).resolves.toBeNull();
  });

  it("returns null when storage.get rejects", async () => {
    local.get.mockImplementationOnce(async () => {
      throw new Error("context invalidated");
    });
    await expect(getActiveFile()).resolves.toBeNull();
  });
});
