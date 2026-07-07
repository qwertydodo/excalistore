import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useDiagramLibraryStore } from "../../model/stores/diagramLibraryStore";
import { ConnectButton } from "./ConnectButton";

const INITIAL_STORE_STATE = useDiagramLibraryStore.getState();

beforeEach(() => {
  useDiagramLibraryStore.setState(INITIAL_STORE_STATE, true);
});

describe("ConnectButton", () => {
  it("opens the dialog and connects with the entered folder name", async () => {
    const connect = vi.fn();
    useDiagramLibraryStore.setState({ connect });
    render(<ConnectButton />);
    await userEvent.click(screen.getByRole("button", { name: /connect google drive/i }));
    const input = screen.getByLabelText(/folder name/i);
    await userEvent.clear(input);
    await userEvent.type(input, "My Diagrams");
    const dialog = screen.getByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: /connect google drive/i }));
    expect(connect).toHaveBeenCalledWith("My Diagrams");
  });

  it("disables the submit and shows an error while busy/failed", async () => {
    useDiagramLibraryStore.setState({ isConnecting: true, connectError: "Sign-in was cancelled" });
    render(<ConnectButton />);
    await userEvent.click(screen.getByRole("button", { name: /connect google drive/i }));
    expect(screen.getByRole("button", { name: /connecting/i })).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent("Sign-in was cancelled");
  });

  it("closes the dialog on backdrop click", async () => {
    render(<ConnectButton />);
    await userEvent.click(screen.getByRole("button", { name: /connect google drive/i }));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(dialog);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

// Keyboard scoping (stopping Excalidraw's document-level hotkeys) is no longer
// per-component — it lives at the shadow-root container; see scopeKeyboard.test.
