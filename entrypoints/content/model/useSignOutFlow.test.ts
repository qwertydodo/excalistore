// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useSignOutFlow } from "./useSignOutFlow";

describe("useSignOutFlow", () => {
  it("keeps doSignOut/openSignOut/cancelSignOut referentially stable across re-renders", () => {
    // Not consumed by any effect deps today, but they are passed down as
    // props — an unstable identity here churns child re-renders every render.
    const onActiveIdChange = vi.fn();
    const onStatusChange = vi.fn();
    const onActionErrorChange = vi.fn();
    const revisionRef = { current: null };
    const { result, rerender } = renderHook(() =>
      useSignOutFlow({
        activeId: null,
        revisionRef,
        onActiveIdChange,
        onStatusChange,
        onActionErrorChange,
      }),
    );
    const first = result.current;
    rerender();
    const second = result.current;
    expect(second.doSignOut).toBe(first.doSignOut);
    expect(second.openSignOut).toBe(first.openSignOut);
    expect(second.cancelSignOut).toBe(first.cancelSignOut);
  });
});
