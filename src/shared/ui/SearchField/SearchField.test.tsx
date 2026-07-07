import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SearchField } from "./SearchField";

describe("SearchField", () => {
  it("calls onChange as the user types", async () => {
    const onChange = vi.fn();
    render(<SearchField name="search" value="" onChange={onChange} aria-label="Search diagrams" />);
    await userEvent.type(screen.getByRole("textbox", { name: "Search diagrams" }), "a");
    expect(onChange).toHaveBeenCalledWith("a");
  });

  it("shows no clear button when the value is empty", () => {
    render(<SearchField name="search" value="" onChange={vi.fn()} aria-label="Search diagrams" />);
    expect(screen.queryByRole("button", { name: "Clear search" })).not.toBeInTheDocument();
  });

  it("clears the value when the clear button is clicked", async () => {
    const onChange = vi.fn();
    render(
      <SearchField name="search" value="abc" onChange={onChange} aria-label="Search diagrams" />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(onChange).toHaveBeenCalledWith("");
  });

  it("forwards arbitrary input props, like disabled, to the underlying field", () => {
    render(
      <SearchField
        name="search"
        value=""
        onChange={vi.fn()}
        aria-label="Search diagrams"
        disabled
      />,
    );
    expect(screen.getByRole("textbox", { name: "Search diagrams" })).toBeDisabled();
  });
});
