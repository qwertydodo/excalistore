import { describe, expect, it } from "vitest";
import {
  type ExcalidrawFile,
  parseExcalidrawFile,
  validateExcalidrawFile,
} from "@/entities/diagram";

const valid: ExcalidrawFile = {
  type: "excalidraw",
  version: 2,
  source: "https://excalidraw.com",
  elements: [{ id: "e1", version: 3, type: "rectangle" }],
  appState: { viewBackgroundColor: "#ffffff" },
  files: {},
};

describe("validateExcalidrawFile", () => {
  it("accepts a well-formed file", () => {
    expect(() => validateExcalidrawFile(valid)).not.toThrow();
  });

  it("rejects wrong type", () => {
    expect(() => validateExcalidrawFile({ ...valid, type: "evil" })).toThrow();
  });

  it("rejects non-array elements", () => {
    expect(() => validateExcalidrawFile({ ...valid, elements: "x" })).toThrow();
  });

  it("parseExcalidrawFile parses a JSON string", () => {
    const parsed = parseExcalidrawFile(JSON.stringify(valid));
    expect(parsed.elements).toHaveLength(1);
  });

  it("parseExcalidrawFile throws on malformed JSON", () => {
    expect(() => parseExcalidrawFile("{not json")).toThrow();
  });
});

import { buildExcalidrawFile, sceneHash } from "@/entities/diagram";

describe("buildExcalidrawFile", () => {
  it("assembles a valid file from parts including images", () => {
    const file = buildExcalidrawFile(
      [{ id: "e1", version: 1, type: "image", fileId: "f1" }],
      { viewBackgroundColor: "#fff" },
      { f1: { id: "f1", mimeType: "image/png", dataURL: "data:image/png;base64,AAAA" } },
    );
    expect(file.type).toBe("excalidraw");
    expect(file.version).toBe(2);
    expect(file.files.f1?.dataURL).toContain("base64");
    expect(() => validateExcalidrawFile(file)).not.toThrow();
  });
});

describe("sceneHash", () => {
  it("is stable for the same scene", () => {
    const a = buildExcalidrawFile([{ id: "e1", version: 2 }], {}, {});
    const b = buildExcalidrawFile([{ id: "e1", version: 2 }], {}, {});
    expect(sceneHash(a)).toBe(sceneHash(b));
  });

  it("changes when an element version bumps", () => {
    const a = buildExcalidrawFile([{ id: "e1", version: 2 }], {}, {});
    const b = buildExcalidrawFile([{ id: "e1", version: 3 }], {}, {});
    expect(sceneHash(a)).not.toBe(sceneHash(b));
  });

  it("changes when image files change", () => {
    const a = buildExcalidrawFile([], {}, {});
    const b = buildExcalidrawFile(
      [],
      {},
      { f1: { id: "f1", mimeType: "image/png", dataURL: "data:image/png;base64,AAAA" } },
    );
    expect(sceneHash(a)).not.toBe(sceneHash(b));
  });
});
