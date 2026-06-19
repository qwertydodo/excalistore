import { describe, expect, it } from "vitest";
import { isAllowedSender } from "./isAllowedSender";

const opts = {
  extensionId: "abc123",
  popupUrl: "chrome-extension://abc123/popup.html",
};

describe("isAllowedSender", () => {
  it("accepts the extension's own popup page", () => {
    expect(
      isAllowedSender({ id: "abc123", url: "chrome-extension://abc123/popup.html" }, opts),
    ).toBe(true);
  });

  it("accepts the excalidraw.com content script", () => {
    expect(isAllowedSender({ id: "abc123", url: "https://excalidraw.com/" }, opts)).toBe(true);
  });

  it("rejects a different extension id", () => {
    expect(isAllowedSender({ id: "evil", url: "https://excalidraw.com/" }, opts)).toBe(false);
  });

  it("rejects an unknown origin", () => {
    expect(isAllowedSender({ id: "abc123", url: "https://evil.example/" }, opts)).toBe(false);
  });

  it("rejects a missing url", () => {
    expect(isAllowedSender({ id: "abc123" }, opts)).toBe(false);
  });
});
