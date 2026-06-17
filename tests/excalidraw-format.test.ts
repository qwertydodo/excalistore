import { describe, expect, it } from "vitest";
import {
  type ExcalidrawFile,
  parseExcalidrawFile,
  validateExcalidrawFile,
} from "@/shared/excalidraw-format";

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
