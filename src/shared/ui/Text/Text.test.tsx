import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Text } from "./Text";

describe("Text", () => {
  it("renders the given tag with size and color classes", () => {
    render(
      <Text as="label" size="sm" color="muted" htmlFor="x" data-testid="text">
        Folder name
      </Text>,
    );
    const el = screen.getByTestId("text");
    expect(el.tagName).toBe("LABEL");
    expect(el).toHaveAttribute("for", "x");
    expect(el.className).toContain("size-sm");
    expect(el.className).toContain("color-muted");
  });

  it("defaults to a span with no size/color class when omitted", () => {
    render(<Text data-testid="text">hi</Text>);
    const el = screen.getByTestId("text");
    expect(el.tagName).toBe("SPAN");
    expect(el.className).toBe("");
  });
});
