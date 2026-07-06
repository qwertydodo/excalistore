import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TextField } from "./TextField";

describe("TextField", () => {
  it("renders without a wrapper element when no icon is given", () => {
    const { container } = render(<TextField name="q" />);
    expect(container.firstChild).toBe(container.querySelector("input"));
  });

  it("renders a decorative start icon, hidden from the accessibility tree", () => {
    render(<TextField name="q" icon={{ start: "search" }} />);
    expect(document.querySelector("svg")).toHaveAttribute("aria-hidden");
  });

  it("renders a clickable end icon that fires its callback and exposes its aria-label", async () => {
    const onClick = vi.fn();
    render(<TextField name="q" icon={{ end: { name: "x", onClick, "aria-label": "Clear" } }} />);
    await userEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(onClick).toHaveBeenCalledOnce();
  });
});
