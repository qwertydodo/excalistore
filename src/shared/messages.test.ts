import { describe, expect, it } from "vitest";
import { type DriveFileMeta, isErrorResponse } from "@/shared/messages";

describe("messages", () => {
  it("DriveFileMeta shape is usable", () => {
    const meta: DriveFileMeta = {
      id: "abc",
      name: "diagram.excalidraw",
      modifiedTime: "2026-06-17T00:00:00Z",
      headRevisionId: "r1",
    };
    expect(meta.name).toBe("diagram.excalidraw");
  });

  it("isErrorResponse narrows error responses", () => {
    expect(isErrorResponse({ ok: false, error: "nope" })).toBe(true);
    expect(isErrorResponse({ ok: true, data: 1 })).toBe(false);
  });
});
