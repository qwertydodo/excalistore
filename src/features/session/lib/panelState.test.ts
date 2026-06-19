import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getPanelCollapsed, setPanelCollapsed } from "./panelState";

const store: Record<string, unknown> = {};
const local = {
  get: vi.fn(async (key: string) => ({ [key]: store[key] })),
  set: vi.fn(async (obj: Record<string, unknown>) => {
    Object.assign(store, obj);
  }),
};

beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k];
  (globalThis as unknown as { chrome: unknown }).chrome = { storage: { local } };
  local.get.mockClear();
  local.set.mockClear();
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
