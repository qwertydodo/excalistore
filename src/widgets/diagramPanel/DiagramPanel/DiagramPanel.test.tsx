import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DiagramPanel } from "./DiagramPanel";

const files = [
  { id: "1", name: "alpha.excalidraw", modifiedTime: "2026-06-18T10:00:00Z", headRevisionId: "r1" },
  { id: "2", name: "beta.excalidraw", modifiedTime: "2026-06-18T09:00:00Z", headRevisionId: "r2" },
];

function props(over = {}) {
  return {
    files,
    activeId: "1",
    saveStatus: "saved" as const,
    loading: false,
    onOpen: vi.fn(),
    onCreate: vi.fn(),
    onRename: vi.fn(),
    onSignOut: vi.fn(),
    ...over,
  };
}

describe("DiagramPanel", () => {
  it("lists files (without the .excalidraw extension) and marks the active one", () => {
    render(<DiagramPanel {...props()} />);
    expect(screen.getByText("alpha")).toBeInTheDocument();
    expect(screen.getByText("beta")).toBeInTheDocument();
    expect(screen.queryByText("alpha.excalidraw")).not.toBeInTheDocument();
  });

  it("opens a file on click", async () => {
    const onOpen = vi.fn();
    render(<DiagramPanel {...props({ onOpen })} />);
    await userEvent.click(screen.getByText("beta"));
    expect(onOpen).toHaveBeenCalledWith("2");
  });

  it("creates a new diagram with the entered name", async () => {
    const onCreate = vi.fn();
    render(<DiagramPanel {...props({ onCreate })} />);
    await userEvent.click(screen.getByRole("button", { name: /new/i }));
    await userEvent.type(screen.getByPlaceholderText(/name/i), "gamma");
    await userEvent.click(screen.getByRole("button", { name: /^create$/i }));
    expect(onCreate).toHaveBeenCalledWith("gamma");
  });

  it("shows a conflict badge", () => {
    render(<DiagramPanel {...props({ saveStatus: "conflict" })} />);
    expect(screen.getByText(/conflict/i)).toBeInTheDocument();
  });

  it("signs out", async () => {
    const onSignOut = vi.fn();
    render(<DiagramPanel {...props({ onSignOut })} />);
    await userEvent.click(screen.getByRole("button", { name: /sign out/i }));
    expect(onSignOut).toHaveBeenCalledOnce();
  });

  it("renders an error banner when error is set", () => {
    render(<DiagramPanel {...props({ error: "Could not open diagram" })} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Could not open diagram");
  });

  it("stops keyboard events from reaching the document (Excalidraw hotkeys)", () => {
    const onDocKeyDown = vi.fn();
    document.addEventListener("keydown", onDocKeyDown);
    render(<DiagramPanel {...props()} />);
    fireEvent.keyDown(screen.getByLabelText("Excalistore diagrams"), { key: "r" });
    document.removeEventListener("keydown", onDocKeyDown);
    expect(onDocKeyDown).not.toHaveBeenCalled();
  });
});
