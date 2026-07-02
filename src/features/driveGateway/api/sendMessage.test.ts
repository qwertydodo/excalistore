import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RequestError, sendToBackground } from "./sendMessage";

const runtime = { sendMessage: vi.fn() };
beforeEach(() => {
  (globalThis as unknown as { chrome: unknown }).chrome = { runtime };
  runtime.sendMessage.mockReset();
});
afterEach(() => vi.restoreAllMocks());

describe("sendToBackground", () => {
  it("resolves data on ok response", async () => {
    runtime.sendMessage.mockResolvedValue({ ok: true, data: { isConnected: false } });
    await expect(sendToBackground({ type: "auth/status" })).resolves.toEqual({
      isConnected: false,
    });
  });

  it("throws RequestError carrying the code on error response", async () => {
    runtime.sendMessage.mockResolvedValue({ ok: false, error: "nope", code: "unauthorized" });
    await expect(sendToBackground({ type: "auth/status" })).rejects.toMatchObject({
      message: "nope",
      code: "unauthorized",
    });
    await expect(sendToBackground({ type: "auth/status" })).rejects.toBeInstanceOf(RequestError);
  });

  it("defaults the code to unknown when omitted", async () => {
    runtime.sendMessage.mockResolvedValue({ ok: false, error: "boom" });
    await expect(sendToBackground({ type: "auth/status" })).rejects.toMatchObject({
      code: "unknown",
    });
  });
});
