import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stubChromeStorageLocal, stubSessionStorage } from "@/shared/lib/testUtils";
import {
  clearActiveFile,
  clearCachedFiles,
  clearFileListValidatedThisSession,
  getActiveFile,
  getCachedFiles,
  getDiagramSearchQuery,
  getPanelCollapsed,
  hasValidatedFileListThisSession,
  markFileListValidatedThisSession,
  setActiveFile,
  setCachedFiles,
  setDiagramSearchQuery,
  setPanelCollapsed,
} from "./sessionStore";

let store: ReturnType<typeof stubChromeStorageLocal>["store"];
let local: ReturnType<typeof stubChromeStorageLocal>["local"];
beforeEach(() => {
  ({ store, local } = stubChromeStorageLocal());
});
afterEach(() => vi.restoreAllMocks());

describe("activeFile", () => {
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

  it("tolerates storage.set/remove rejecting", async () => {
    local.set.mockImplementationOnce(async () => {
      throw new Error("context invalidated");
    });
    await expect(
      setActiveFile({ id: "1", name: "a", loadedRevision: "r" }),
    ).resolves.toBeUndefined();

    local.remove.mockImplementationOnce(async () => {
      throw new Error("context invalidated");
    });
    await expect(clearActiveFile()).resolves.toBeUndefined();
  });
});

describe("fileListCache", () => {
  const files = [{ id: "1", name: "a.excalidraw", modifiedTime: "t", headRevisionId: "r" }];

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

describe("panelCollapsed", () => {
  it("defaults to false when nothing is stored", async () => {
    await expect(getPanelCollapsed()).resolves.toBe(false);
  });

  it("round-trips the collapsed flag", async () => {
    await setPanelCollapsed(true);
    await expect(getPanelCollapsed()).resolves.toBe(true);
    await setPanelCollapsed(false);
    await expect(getPanelCollapsed()).resolves.toBe(false);
  });

  it("returns false when storage.get rejects", async () => {
    local.get.mockImplementationOnce(async () => {
      throw new Error("context invalidated");
    });
    await expect(getPanelCollapsed()).resolves.toBe(false);
  });
});

describe("fileListValidated", () => {
  beforeEach(() => {
    stubSessionStorage();
  });

  it("defaults to false when nothing is marked", () => {
    expect(hasValidatedFileListThisSession()).toBe(false);
  });

  it("returns true once marked", () => {
    markFileListValidatedThisSession();
    expect(hasValidatedFileListThisSession()).toBe(true);
  });

  it("resets to false after clearing (e.g. on sign-out)", () => {
    markFileListValidatedThisSession();
    clearFileListValidatedThisSession();
    expect(hasValidatedFileListThisSession()).toBe(false);
  });
});

describe("diagramSearchQuery", () => {
  it("defaults to an empty string when nothing is stored", async () => {
    await expect(getDiagramSearchQuery()).resolves.toBe("");
  });

  it("round-trips the query", async () => {
    await setDiagramSearchQuery("meeting");
    await expect(getDiagramSearchQuery()).resolves.toBe("meeting");
  });

  it("returns an empty string when storage.get rejects", async () => {
    local.get.mockImplementationOnce(async () => {
      throw new Error("context invalidated");
    });
    await expect(getDiagramSearchQuery()).resolves.toBe("");
  });
});
