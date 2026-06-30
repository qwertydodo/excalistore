import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ConnectButton } from "./ConnectButton";

describe("ConnectButton", () => {
  it("opens the dialog and connects with the entered folder name", async () => {
    const onConnect = vi.fn();
    render(<ConnectButton onConnect={onConnect} />);
    await userEvent.click(screen.getByRole("button", { name: /connect google drive/i }));
    const input = screen.getByLabelText(/folder name/i);
    await userEvent.clear(input);
    await userEvent.type(input, "My Diagrams");
    const dialog = screen.getByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: /connect google drive/i }));
    expect(onConnect).toHaveBeenCalledWith("My Diagrams");
  });

  it("disables the submit and shows an error while busy/failed", async () => {
    render(<ConnectButton isBusy error="Sign-in was cancelled" onConnect={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: /connect google drive/i }));
    expect(screen.getByRole("button", { name: /connecting/i })).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent("Sign-in was cancelled");
  });

  it("closes the dialog on backdrop click", async () => {
    render(<ConnectButton onConnect={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: /connect google drive/i }));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(dialog);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("stops keyboard events from reaching the document (Excalidraw hotkeys)", async () => {
    const onDocKeyDown = vi.fn();
    document.addEventListener("keydown", onDocKeyDown);
    render(<ConnectButton onConnect={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: /connect google drive/i }));
    fireEvent.keyDown(screen.getByLabelText(/folder name/i), { key: "r" });
    document.removeEventListener("keydown", onDocKeyDown);
    expect(onDocKeyDown).not.toHaveBeenCalled();
  });
});
