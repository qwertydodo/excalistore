import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stubChromeStorageLocal } from "@/shared/lib/testHelpers";
import { clearActiveFile, getActiveFile, setActiveFile } from "./activeFileStore";

let store: ReturnType<typeof stubChromeStorageLocal>["store"];
let local: ReturnType<typeof stubChromeStorageLocal>["local"];
beforeEach(() => {
  ({ store, local } = stubChromeStorageLocal());
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
