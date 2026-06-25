import { describe, expect, it } from "vitest";
import { type DriveFileMeta, isErrorResponse } from "@/shared/api";
import type { ConnectionStatus, DiagramContent } from "./messages";

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

  it("ConnectionStatus shape", () => {
    const s: ConnectionStatus = { isConnected: true, folderId: "F", folderName: "Diagrams" };
    expect(s.isConnected).toBe(true);
  });

  it("DiagramContent shape", () => {
    const d: DiagramContent = {
      meta: { id: "1", name: "a.excalidraw", modifiedTime: "t", headRevisionId: "r" },
      content: "{}",
    };
    expect(d.content).toBe("{}");
    expect(d.meta.headRevisionId).toBe("r");
  });
});
