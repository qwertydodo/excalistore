import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PopupConnect } from "./PopupConnect";

describe("PopupConnect", () => {
  it("shows connect button when disconnected", () => {
    render(<PopupConnect status={{ connected: false }} onConnect={vi.fn()} onSignOut={vi.fn()} />);
    expect(screen.getByRole("button", { name: /connect/i })).toBeInTheDocument();
  });

  it("shows folder + sign out when connected", async () => {
    const onSignOut = vi.fn();
    render(
      <PopupConnect
        status={{ connected: true, folderId: "F", folderName: "Diagrams" }}
        onConnect={vi.fn()}
        onSignOut={onSignOut}
      />,
    );
    expect(screen.getByText("Diagrams")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /sign out/i }));
    expect(onSignOut).toHaveBeenCalledOnce();
  });
});
