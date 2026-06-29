import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { IconButton } from "./IconButton";

describe("IconButton", () => {
  it("derives the title tooltip from aria-label by default", () => {
    render(<IconButton icon="trash" aria-label="Delete diagram" />);
    expect(screen.getByRole("button", { name: "Delete diagram" })).toHaveAttribute(
      "title",
      "Delete diagram",
    );
  });

  it("lets an explicit title override the aria-label", () => {
    render(<IconButton icon="edit" aria-label="Rename" title="Rename this diagram" />);
    expect(screen.getByRole("button", { name: "Rename" })).toHaveAttribute(
      "title",
      "Rename this diagram",
    );
  });
});
