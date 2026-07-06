import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stubChromeStorageLocal } from "@/shared/lib/testHelpers";
import { getDiagramSearchQuery, setDiagramSearchQuery } from "./searchState";

let local: ReturnType<typeof stubChromeStorageLocal>["local"];
beforeEach(() => {
  ({ local } = stubChromeStorageLocal());
});
afterEach(() => vi.restoreAllMocks());

describe("searchState", () => {
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
