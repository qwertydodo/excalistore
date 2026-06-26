import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DiagramPanel } from "./DiagramPanel";

const files = [
  { id: "1", name: "alpha.excalidraw", modifiedTime: "2026-06-18T10:00:00Z", headRevisionId: "r1" },
  { id: "2", name: "beta.excalidraw", modifiedTime: "2026-06-18T09:00:00Z", headRevisionId: "r2" },
];

// usePanelVisibility (called internally by DiagramPanel) persists through
// chrome.storage.local — stub it so the panel starts expanded deterministically.
const local = {
  get: vi.fn(async () => ({})),
  set: vi.fn(async () => {}),
};
beforeEach(() => {
  (globalThis as unknown as { chrome: unknown }).chrome = { storage: { local } };
  local.get.mockClear();
  local.set.mockClear();
});

function diagramProps(over = {}) {
  return {
    activeId: "1",
    saveStatus: "saved" as const,
    onOpen: vi.fn(),
    onCreate: vi.fn(),
    onRename: vi.fn(),
    onDelete: vi.fn(),
    ...over,
  };
}

function panelProps(over = {}) {
  return {
    files,
    isLoading: false,
    onSignOut: vi.fn(),
    ...over,
  };
}

describe("DiagramPanel", () => {
  it("lists files (without the .excalidraw extension) and marks the active one", () => {
    render(<DiagramPanel diagram={diagramProps()} {...panelProps()} />);
    expect(screen.getByText("alpha")).toBeInTheDocument();
    expect(screen.getByText("beta")).toBeInTheDocument();
    expect(screen.queryByText("alpha.excalidraw")).not.toBeInTheDocument();
  });

  it("opens a file on click", async () => {
    const onOpen = vi.fn();
    render(<DiagramPanel diagram={diagramProps({ onOpen })} {...panelProps()} />);
    await userEvent.click(screen.getByText("beta"));
    expect(onOpen).toHaveBeenCalledWith("2");
  });

  it("creates a new diagram with the entered name", async () => {
    const onCreate = vi.fn();
    render(<DiagramPanel diagram={diagramProps({ onCreate })} {...panelProps()} />);
    await userEvent.click(screen.getByRole("button", { name: /new/i }));
    await userEvent.type(screen.getByPlaceholderText(/name/i), "gamma");
    await userEvent.click(screen.getByRole("button", { name: /^create$/i }));
    expect(onCreate).toHaveBeenCalledWith("gamma");
  });

  it("shows a conflict badge", () => {
    render(<DiagramPanel diagram={diagramProps({ saveStatus: "conflict" })} {...panelProps()} />);
    expect(screen.getByText(/conflict/i)).toBeInTheDocument();
  });

  it("signs out", async () => {
    const onSignOut = vi.fn();
    render(<DiagramPanel diagram={diagramProps()} {...panelProps({ onSignOut })} />);
    await userEvent.click(screen.getByRole("button", { name: /sign out/i }));
    expect(onSignOut).toHaveBeenCalledOnce();
  });

  it("renders an error banner when error is set", () => {
    render(
      <DiagramPanel
        diagram={diagramProps({ error: "Could not open diagram" })}
        {...panelProps()}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Could not open diagram");
  });

  it("collapses to a fab button and expands again when toggled", async () => {
    render(<DiagramPanel diagram={diagramProps()} {...panelProps()} />);
    expect(screen.getByText("alpha")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /collapse panel/i }));
    expect(screen.queryByText("alpha")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /open excalistore diagrams/i }));
    expect(screen.getByText("alpha")).toBeInTheDocument();
  });

  it("shows 'No diagrams yet' when the file list is empty", () => {
    render(<DiagramPanel diagram={diagramProps()} {...panelProps({ files: [] })} />);
    expect(screen.getByText("No diagrams yet")).toBeInTheDocument();
  });

  it("stops keyboard events from reaching the document (Excalidraw hotkeys)", () => {
    const onDocKeyDown = vi.fn();
    document.addEventListener("keydown", onDocKeyDown);
    render(<DiagramPanel diagram={diagramProps()} {...panelProps()} />);
    fireEvent.keyDown(screen.getByLabelText("Excalistore diagrams"), { key: "r" });
    document.removeEventListener("keydown", onDocKeyDown);
    expect(onDocKeyDown).not.toHaveBeenCalled();
  });
});
