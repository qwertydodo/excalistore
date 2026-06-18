import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendToBackground } from "./sendMessage";

const runtime = { sendMessage: vi.fn() };
beforeEach(() => {
  (globalThis as unknown as { chrome: unknown }).chrome = { runtime };
  runtime.sendMessage.mockReset();
});
afterEach(() => vi.restoreAllMocks());

describe("sendToBackground", () => {
  it("resolves data on ok response", async () => {
    runtime.sendMessage.mockResolvedValue({ ok: true, data: { connected: false } });
    await expect(sendToBackground({ type: "auth/status" })).resolves.toEqual({ connected: false });
  });

  it("throws on error response", async () => {
    runtime.sendMessage.mockResolvedValue({ ok: false, error: "nope" });
    await expect(sendToBackground({ type: "auth/status" })).rejects.toThrow("nope");
  });
});
