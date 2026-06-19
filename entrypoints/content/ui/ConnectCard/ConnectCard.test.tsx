import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ConnectCard } from "./ConnectCard";

describe("ConnectCard", () => {
  it("connects with the entered folder name", async () => {
    const onConnect = vi.fn();
    render(<ConnectCard onConnect={onConnect} />);
    const input = screen.getByLabelText(/folder name/i);
    await userEvent.clear(input);
    await userEvent.type(input, "My Diagrams");
    await userEvent.click(screen.getByRole("button", { name: /connect/i }));
    expect(onConnect).toHaveBeenCalledWith("My Diagrams");
  });

  it("disables the button and shows an error while busy/failed", () => {
    render(<ConnectCard busy error="Sign-in was cancelled" onConnect={vi.fn()} />);
    expect(screen.getByRole("button", { name: /connecting/i })).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent("Sign-in was cancelled");
  });

  it("stops keyboard events from reaching the document (Excalidraw hotkeys)", () => {
    const onDocKeyDown = vi.fn();
    document.addEventListener("keydown", onDocKeyDown);
    render(<ConnectCard onConnect={vi.fn()} />);
    fireEvent.keyDown(screen.getByLabelText("Connect Excalistore"), { key: "r" });
    document.removeEventListener("keydown", onDocKeyDown);
    expect(onDocKeyDown).not.toHaveBeenCalled();
  });
});
