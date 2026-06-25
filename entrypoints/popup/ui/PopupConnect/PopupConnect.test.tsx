import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PopupConnect } from "./PopupConnect";

describe("PopupConnect", () => {
  it("connects with the entered folder name", async () => {
    const onConnect = vi.fn();
    render(
      <PopupConnect status={{ isConnected: false }} onConnect={onConnect} onSignOut={vi.fn()} />,
    );
    const input = screen.getByLabelText(/folder name/i);
    await userEvent.clear(input);
    await userEvent.type(input, "My Diagrams");
    await userEvent.click(screen.getByRole("button", { name: /connect/i }));
    expect(onConnect).toHaveBeenCalledWith("My Diagrams");
  });

  it("shows folder + sign out when connected", async () => {
    const onSignOut = vi.fn();
    render(
      <PopupConnect
        status={{ isConnected: true, folderId: "F", folderName: "Diagrams" }}
        onConnect={vi.fn()}
        onSignOut={onSignOut}
      />,
    );
    expect(screen.getByText("Diagrams")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /sign out/i }));
    expect(onSignOut).toHaveBeenCalledOnce();
  });

  it("disables the connect button and shows an error while busy/failed", () => {
    render(
      <PopupConnect
        status={{ isConnected: false }}
        isBusy
        error="Sign-in was cancelled"
        onConnect={vi.fn()}
        onSignOut={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: /connect/i })).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent("Sign-in was cancelled");
  });
});
