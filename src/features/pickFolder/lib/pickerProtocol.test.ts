import { describe, expect, it } from "vitest";
import { isPickerMessage, PICKER_CHANNEL } from "./pickerProtocol";

describe("isPickerMessage", () => {
  it("accepts a well-formed message on our channel", () => {
    expect(isPickerMessage({ channel: PICKER_CHANNEL, type: "picker:ready", nonce: "n1" })).toBe(
      true,
    );
  });

  it("rejects foreign / malformed messages", () => {
    expect(isPickerMessage(null)).toBe(false);
    expect(isPickerMessage({ type: "picker:ready", nonce: "n1" })).toBe(false); // no channel
    expect(isPickerMessage({ channel: "other", type: "picker:ready", nonce: "n1" })).toBe(false);
    expect(isPickerMessage({ channel: PICKER_CHANNEL, type: "picker:ready" })).toBe(false); // no nonce
  });
});
