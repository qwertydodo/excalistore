// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useActiveDiagramStore } from "./stores/activeDiagramStore";
import { useSignOutFlow } from "./useSignOutFlow";

const INITIAL_ACTIVE_STATE = useActiveDiagramStore.getState();

beforeEach(() => {
  useActiveDiagramStore.setState(INITIAL_ACTIVE_STATE, true);
});

describe("useSignOutFlow", () => {
  it("keeps doSignOut/openSignOut/cancelSignOut referentially stable across re-renders", () => {
    // Not consumed by any effect deps today, but they are passed down as
    // props — an unstable identity here churns child re-renders every render.
    const { result, rerender } = renderHook(() => useSignOutFlow());
    const first = result.current;
    rerender();
    const second = result.current;
    expect(second.doSignOut).toBe(first.doSignOut);
    expect(second.openSignOut).toBe(first.openSignOut);
    expect(second.cancelSignOut).toBe(first.cancelSignOut);
  });
});
