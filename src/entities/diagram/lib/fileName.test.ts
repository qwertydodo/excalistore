import { describe, expect, it } from "vitest";
import { nextUntitledName } from "./fileName";

describe("nextUntitledName", () => {
  it("returns 'Untitled' when no untitled diagram exists", () => {
    expect(nextUntitledName(["alpha.excalidraw", "beta.excalidraw"])).toBe("Untitled");
  });

  it("returns the next free number when 'Untitled' is taken", () => {
    expect(nextUntitledName(["Untitled.excalidraw"])).toBe("Untitled 2");
  });

  it("skips numbers already taken to find the next free one", () => {
    expect(nextUntitledName(["Untitled.excalidraw", "Untitled 2.excalidraw"])).toBe("Untitled 3");
  });

  it("matches case-insensitively", () => {
    expect(nextUntitledName(["untitled.excalidraw"])).toBe("Untitled 2");
  });

  it("returns 'Untitled' when the list is empty", () => {
    expect(nextUntitledName([])).toBe("Untitled");
  });
});
