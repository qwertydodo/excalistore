// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/shared/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/shared/api")>()),
  sendToBackground: vi.fn(async () => ({ isConnected: false })),
}));
vi.mock("@/features/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/session")>()),
  getActiveFile: vi.fn(async () => null),
}));

const { useActiveDiagram } = await import("./useActiveDiagram");

describe("useActiveDiagram", () => {
  it("keeps onActiveIdChange/onActionErrorChange/onOpen/onCreate/onRename/onDelete referentially stable across re-renders", async () => {
    // onOpen/onCreate/onRename/onDelete are passed down as props; onActiveIdChange and
    // onActionErrorChange also feed useSignOutFlow's deps. An unstable
    // identity here churns child re-renders (or, for onSaveStatusChange,
    // would re-fire the autosave effect — covered separately since it's
    // already required to stay stable for that reason).
    const onStatusChange = vi.fn();
    const onFilesChange = vi.fn();
    const refresh = vi.fn(async () => []);
    const files: never[] = [];
    const { result, rerender } = renderHook(() =>
      useActiveDiagram({ onStatusChange, files, onFilesChange, refresh }),
    );
    const first = result.current;
    rerender();
    const second = result.current;
    expect(second.onActiveIdChange).toBe(first.onActiveIdChange);
    expect(second.onActionErrorChange).toBe(first.onActionErrorChange);
    expect(second.onOpen).toBe(first.onOpen);
    expect(second.onCreate).toBe(first.onCreate);
    expect(second.onRename).toBe(first.onRename);
    expect(second.onDelete).toBe(first.onDelete);
  });
});
