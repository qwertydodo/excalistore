import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { stubChromeStorageLocal } from "@/shared/lib/testUtils";
import { useActiveDiagramStore } from "../../model/stores/activeDiagramStore";
import { useDiagramLibraryStore } from "../../model/stores/diagramLibraryStore";
import { DiagramList } from "./DiagramList";

const files = [
  { id: "1", name: "alpha.excalidraw", modifiedTime: "2026-06-18T10:00:00Z", headRevisionId: "r1" },
  { id: "2", name: "beta.excalidraw", modifiedTime: "2026-06-18T09:00:00Z", headRevisionId: "r2" },
];

const INITIAL_LIBRARY_STATE = useDiagramLibraryStore.getState();
const INITIAL_ACTIVE_STATE = useActiveDiagramStore.getState();

beforeEach(() => {
  stubChromeStorageLocal();
  useDiagramLibraryStore.setState(
    {
      ...INITIAL_LIBRARY_STATE,
      files,
      isQueryReady: true,
      initialQuery: "",
    },
    true,
  );
  useActiveDiagramStore.setState({ ...INITIAL_ACTIVE_STATE, activeId: "1" }, true);
});

function props(over = {}) {
  return {
    areRowsLocked: false,
    openingId: null,
    onRowOpen: vi.fn(),
    ...over,
  };
}

describe("DiagramList", () => {
  it("renders the search field and the sorted list", () => {
    render(<DiagramList {...props()} />);
    expect(screen.getByRole("textbox", { name: "Search diagrams" })).toBeInTheDocument();
    expect(screen.getByText("alpha")).toBeInTheDocument();
    expect(screen.getByText("beta")).toBeInTheDocument();
  });

  it("shows 'No diagrams yet' when the file list is empty", () => {
    useDiagramLibraryStore.setState({ files: [] });
    render(<DiagramList {...props()} />);
    expect(screen.getByText("No diagrams yet")).toBeInTheDocument();
  });

  it("starts already filtered when the store's initialQuery is non-empty", () => {
    useDiagramLibraryStore.setState({ initialQuery: "alp" });
    render(<DiagramList {...props()} />);
    expect(screen.getByText("alpha")).toBeInTheDocument();
    expect(screen.queryByText("beta")).not.toBeInTheDocument();
  });

  it("filters as the user types, once 3+ characters are entered", async () => {
    render(<DiagramList {...props()} />);
    await userEvent.type(screen.getByRole("textbox", { name: "Search diagrams" }), "alp");
    await waitFor(() => expect(screen.queryByText("beta")).not.toBeInTheDocument());
    expect(screen.getByText("alpha")).toBeInTheDocument();
  });

  it("shows a no-match message when nothing matches", async () => {
    render(<DiagramList {...props()} />);
    await userEvent.type(screen.getByRole("textbox", { name: "Search diagrams" }), "zzz");
    await screen.findByText('No diagrams match "zzz"');
  });
});
