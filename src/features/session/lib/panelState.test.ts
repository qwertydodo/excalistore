import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stubChromeStorageLocal } from "@/shared/lib/testHelpers";
import { getPanelCollapsed, setPanelCollapsed } from "./panelState";

let local: ReturnType<typeof stubChromeStorageLocal>["local"];
beforeEach(() => {
  ({ local } = stubChromeStorageLocal());
});
afterEach(() => vi.restoreAllMocks());

describe("panelState", () => {
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
