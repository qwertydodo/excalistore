// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DiagramRow } from "./DiagramRow";

const file = {
  id: "1",
  name: "alpha.excalidraw",
  modifiedTime: "2026-06-18T10:00:00Z",
  headRevisionId: "r1",
};

function rowProps(over = {}) {
  return {
    file,
    isActive: false,
    isLocked: false,
    isOpening: false,
    onOpen: vi.fn(),
    onRename: vi.fn(async () => undefined),
    onDelete: vi.fn(async () => undefined),
    ...over,
  };
}

describe("DiagramRow", () => {
  it("renders edit and trash icon buttons", () => {
    render(<DiagramRow {...rowProps()} />);
    expect(screen.getByRole("button", { name: /rename alpha/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /delete alpha/i })).toBeInTheDocument();
  });

  it("clicking trash opens the confirm dialog", async () => {
    render(<DiagramRow {...rowProps()} />);
    await userEvent.click(screen.getByRole("button", { name: /delete alpha/i }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText(/drive trash/i)).toBeInTheDocument();
  });

  it("confirming delete calls onDelete with the file id", async () => {
    const onDelete = vi.fn(async () => undefined);
    render(<DiagramRow {...rowProps({ onDelete })} />);
    await userEvent.click(screen.getByRole("button", { name: /delete alpha/i }));
    await userEvent.click(screen.getByRole("button", { name: /move to trash/i }));
    expect(onDelete).toHaveBeenCalledWith("1");
  });

  it("canceling the dialog does not call onDelete", async () => {
    const onDelete = vi.fn(async () => undefined);
    render(<DiagramRow {...rowProps({ onDelete })} />);
    await userEvent.click(screen.getByRole("button", { name: /delete alpha/i }));
    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("trash button is disabled when isLocked", () => {
    render(<DiagramRow {...rowProps({ isLocked: true })} />);
    expect(screen.getByRole("button", { name: /delete alpha/i })).toBeDisabled();
  });

  it("confirm message mentions canvas clearing when row is active", async () => {
    render(<DiagramRow {...rowProps({ isActive: true })} />);
    await userEvent.click(screen.getByRole("button", { name: /delete alpha/i }));
    expect(screen.getByText(/canvas will be cleared/i)).toBeInTheDocument();
  });
});
