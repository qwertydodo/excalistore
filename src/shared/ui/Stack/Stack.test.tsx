import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Stack } from "./Stack";

describe("Stack", () => {
  it("renders row direction, gap, align, and justify classes", () => {
    render(
      <Stack
        as="ul"
        direction="row"
        gap="2"
        align="center"
        justify="between"
        data-testid="stack"
      />,
    );
    const el = screen.getByTestId("stack");
    expect(el.tagName).toBe("UL");
    expect(el.className).toContain("row");
    expect(el.className).toContain("gap-2");
    expect(el.className).toContain("align-center");
    expect(el.className).toContain("justify-between");
  });

  it("defaults to column direction with no gap/align/justify classes", () => {
    render(<Stack data-testid="stack" />);
    const el = screen.getByTestId("stack");
    expect(el.className).toContain("column");
    expect(el.className).not.toContain("gap-");
  });
});
