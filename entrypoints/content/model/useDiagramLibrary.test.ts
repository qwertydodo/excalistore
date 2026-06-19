// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useDiagramLibrary } from "./useDiagramLibrary";

describe("useDiagramLibrary", () => {
  it("keeps refresh/onStatusChange/onFilesChange referentially stable across re-renders", () => {
    // useActiveDiagram's loadInitial effect depends on these three — an
    // unstable identity here re-fires that effect every render, looping
    // refresh() forever (the infinite-reload/hang bug).
    const { result, rerender } = renderHook(() => useDiagramLibrary());
    const first = result.current;
    rerender();
    const second = result.current;
    expect(second.refresh).toBe(first.refresh);
    expect(second.onStatusChange).toBe(first.onStatusChange);
    expect(second.onFilesChange).toBe(first.onFilesChange);
  });
});
