import { describe, expect, it } from "vitest";
import { isActiveFile } from "./activeFile";

describe("isActiveFile", () => {
  it("accepts a well-formed pointer", () => {
    expect(isActiveFile({ id: "1", name: "a.excalidraw", loadedRevision: "r" })).toBe(true);
  });

  it("rejects null and partial shapes", () => {
    expect(isActiveFile(null)).toBe(false);
    expect(isActiveFile({ id: "1", name: "a" })).toBe(false);
    expect(isActiveFile({ id: 1, name: "a", loadedRevision: "r" })).toBe(false);
  });

  it("rejects an object with empty id/name", () => {
    expect(isActiveFile({ id: "", name: "", loadedRevision: "" })).toBe(false);
  });
});
