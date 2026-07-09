import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { stubChromeStorageLocal } from "@/shared/lib/testUtils";
import { useActiveDiagramStore } from "../../model/stores/activeDiagramStore";
import { useDiagramLibraryStore } from "../../model/stores/diagramLibraryStore";
import { usePanelVisibilityStore } from "../../model/stores/panelVisibilityStore";
import { DiagramPanel } from "./DiagramPanel";

const files = [
  { id: "1", name: "alpha.excalidraw", modifiedTime: "2026-06-18T10:00:00Z", headRevisionId: "r1" },
  { id: "2", name: "beta.excalidraw", modifiedTime: "2026-06-18T09:00:00Z", headRevisionId: "r2" },
];

const INITIAL_LIBRARY_STATE = useDiagramLibraryStore.getState();
const INITIAL_ACTIVE_STATE = useActiveDiagramStore.getState();
const INITIAL_PANEL_STATE = usePanelVisibilityStore.getState();

// panelVisibilityStore and diagramLibraryStore's isQueryLoaded are both
// loaded/gated once at the App level (useAppInit/App.tsx) before DiagramPanel
// ever mounts — these tests render DiagramPanel directly, so seed them
// pre-resolved instead of relying on those loaders. The diagram list and the
// active-diagram bits (activeId/saveStatus/error/onOpen/...) both read
// straight off their respective stores, so each test seeds those instead of
// passing props.
beforeEach(() => {
  stubChromeStorageLocal();
  useDiagramLibraryStore.setState(
    {
      ...INITIAL_LIBRARY_STATE,
      files,
      isFilesLoading: false,
      isQueryLoaded: true,
      initialQuery: "",
    },
    true,
  );
  useActiveDiagramStore.setState(
    { ...INITIAL_ACTIVE_STATE, activeId: "1", saveStatus: "saved" },
    true,
  );
  usePanelVisibilityStore.setState(
    { ...INITIAL_PANEL_STATE, isVisible: true, isInitialized: true },
    true,
  );
});

// The diagram list + search field mount only once the library store's
// isFilesLoading clears — wait for the search field (always rendered by
// DiagramList, regardless of file count) before asserting on content.
async function renderExpanded() {
  render(<DiagramPanel onSignOut={vi.fn()} />);
  await screen.findByLabelText("Excalistore diagrams");
  await screen.findByRole("textbox", { name: /search diagrams/i });
  return screen.getByLabelText("Excalistore diagrams");
}

describe("DiagramPanel", () => {
  it("lists files (without the .excalidraw extension) and marks the active one", async () => {
    await renderExpanded();
    expect(screen.getByText("alpha")).toBeInTheDocument();
    expect(screen.getByText("beta")).toBeInTheDocument();
    expect(screen.queryByText("alpha.excalidraw")).not.toBeInTheDocument();
  });

  it("opens a file on click", async () => {
    const onOpen = vi.fn();
    act(() => useActiveDiagramStore.setState({ onOpen }));
    await renderExpanded();
    await userEvent.click(screen.getByText("beta"));
    expect(onOpen).toHaveBeenCalledWith("2");
  });

  it("creates a new diagram with the entered name", async () => {
    const onCreate = vi.fn();
    act(() => useActiveDiagramStore.setState({ onCreate }));
    await renderExpanded();
    await userEvent.click(screen.getByRole("button", { name: /new/i }));
    await userEvent.type(screen.getByPlaceholderText(/name/i), "gamma");
    await userEvent.click(screen.getByRole("button", { name: /^create$/i }));
    expect(onCreate).toHaveBeenCalledWith("gamma");
  });

  it("shows a conflict badge", async () => {
    act(() => useActiveDiagramStore.setState({ saveStatus: "conflict" }));
    await renderExpanded();
    expect(screen.getByText(/conflict/i)).toBeInTheDocument();
  });

  it("signs out", async () => {
    const onSignOut = vi.fn();
    render(<DiagramPanel onSignOut={onSignOut} />);
    await screen.findByLabelText("Excalistore diagrams");
    await screen.findByRole("textbox", { name: /search diagrams/i });
    await userEvent.click(screen.getByRole("button", { name: /sign out/i }));
    expect(onSignOut).toHaveBeenCalledOnce();
  });

  it("renders an error banner when error is set", async () => {
    act(() => useActiveDiagramStore.setState({ actionError: "Could not open diagram" }));
    await renderExpanded();
    expect(screen.getByRole("alert")).toHaveTextContent("Could not open diagram");
  });

  it("collapses to a fab button and expands again when toggled", async () => {
    await renderExpanded();
    expect(screen.getByText("alpha")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /collapse panel/i }));
    expect(screen.queryByText("alpha")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /open excalistore diagrams/i }));
    expect(screen.getByText("alpha")).toBeInTheDocument();
  });

  it("shows 'No diagrams yet' when the file list is empty", async () => {
    act(() => useDiagramLibraryStore.setState({ files: [] }));
    await renderExpanded();
    expect(screen.getByText("No diagrams yet")).toBeInTheDocument();
  });

  it("shows a loading spinner while the library is loading, hides once ready", async () => {
    act(() => useDiagramLibraryStore.setState({ isFilesLoading: true }));
    render(<DiagramPanel onSignOut={vi.fn()} />);
    await screen.findByLabelText("Excalistore diagrams");
    expect(screen.getByRole("status", { name: /loading/i })).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: /search diagrams/i })).not.toBeInTheDocument();

    act(() => useDiagramLibraryStore.setState({ isFilesLoading: false }));
    await screen.findByRole("textbox", { name: /search diagrams/i });
    expect(screen.queryByRole("status", { name: /loading/i })).not.toBeInTheDocument();
    expect(screen.getByText("alpha")).toBeInTheDocument();
  });

  it("shows all diagrams while fewer than 3 characters are typed", async () => {
    await renderExpanded();
    await userEvent.type(screen.getByRole("textbox", { name: /search diagrams/i }), "al");
    expect(screen.getByText("alpha")).toBeInTheDocument();
    expect(screen.getByText("beta")).toBeInTheDocument();
  });

  it("filters the list once 3+ characters are typed", async () => {
    await renderExpanded();
    await userEvent.type(screen.getByRole("textbox", { name: /search diagrams/i }), "alp");
    await waitFor(() => expect(screen.queryByText("beta")).not.toBeInTheDocument());
    expect(screen.getByText("alpha")).toBeInTheDocument();
  });

  it("shows a no-match message when nothing matches", async () => {
    await renderExpanded();
    await userEvent.type(screen.getByRole("textbox", { name: /search diagrams/i }), "zzz");
    await screen.findByText('No diagrams match "zzz"');
  });

  it("clears the filter via the clear button", async () => {
    await renderExpanded();
    await userEvent.type(screen.getByRole("textbox", { name: /search diagrams/i }), "alp");
    await waitFor(() => expect(screen.queryByText("beta")).not.toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: /clear search/i }));
    await waitFor(() => expect(screen.getByText("beta")).toBeInTheDocument());
  });
});

// Keyboard scoping (stopping Excalidraw's document-level hotkeys) is no longer
// per-component — it lives at the shadow-root container; see scopeKeyboard.test.
