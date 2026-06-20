import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Box } from "./Box";

describe("Box", () => {
  it("renders the given tag with a padding class", () => {
    render(<Box as="section" padding="4" data-testid="box" />);
    const el = screen.getByTestId("box");
    expect(el.tagName).toBe("SECTION");
    expect(el.className).toContain("p-4");
  });

  it("defaults to a div with no padding class when omitted", () => {
    render(<Box data-testid="box" />);
    const el = screen.getByTestId("box");
    expect(el.tagName).toBe("DIV");
    expect(el.className).toBe("");
  });
});
