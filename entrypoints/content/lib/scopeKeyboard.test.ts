// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { scopeKeyboard } from "./scopeKeyboard";

describe("scopeKeyboard", () => {
  it("stops keydown/keyup from bubbling past the element, and cleanup restores it", () => {
    const onDoc = vi.fn();
    document.addEventListener("keydown", onDoc);
    document.addEventListener("keyup", onDoc);
    const el = document.createElement("div");
    document.body.appendChild(el);

    const cleanup = scopeKeyboard(el);
    el.dispatchEvent(new KeyboardEvent("keydown", { key: "r", bubbles: true }));
    el.dispatchEvent(new KeyboardEvent("keyup", { key: "r", bubbles: true }));
    expect(onDoc).not.toHaveBeenCalled();

    cleanup();
    el.dispatchEvent(new KeyboardEvent("keydown", { key: "r", bubbles: true }));
    expect(onDoc).toHaveBeenCalledTimes(1);

    document.removeEventListener("keydown", onDoc);
    document.removeEventListener("keyup", onDoc);
    document.body.removeChild(el);
  });
});
