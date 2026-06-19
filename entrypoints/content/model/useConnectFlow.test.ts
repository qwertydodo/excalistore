// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useConnectFlow } from "./useConnectFlow";

describe("useConnectFlow", () => {
  it("keeps onConnect referentially stable across re-renders", () => {
    // Not consumed by any effect deps today, but it is passed down as a
    // prop — an unstable identity here churns child re-renders every render.
    const refresh = vi.fn(async () => []);
    const onStatusChange = vi.fn();
    const { result, rerender } = renderHook(() => useConnectFlow({ refresh, onStatusChange }));
    const first = result.current;
    rerender();
    const second = result.current;
    expect(second.onConnect).toBe(first.onConnect);
  });
});
