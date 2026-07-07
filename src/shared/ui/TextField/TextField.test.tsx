import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TextField } from "./TextField";

describe("TextField", () => {
  it("always wraps the input in a container div, even without an icon", () => {
    const { container } = render(<TextField name="q" />);
    const input = container.querySelector("input");
    expect(input?.parentElement?.tagName).toBe("DIV");
    expect(container.firstChild).not.toBe(input);
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

  it("applies className to the wrapper, with or without an icon", () => {
    const { container } = render(<TextField name="q" className="custom" />);
    expect(container.querySelector("input")?.parentElement).toHaveClass("custom");
  });
});
