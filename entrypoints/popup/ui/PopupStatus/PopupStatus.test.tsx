import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PopupStatus } from "./PopupStatus";

describe("PopupStatus", () => {
  it("shows the folder when connected", () => {
    render(
      <PopupStatus
        status={{ isConnected: true, folderId: "F", folderName: "Diagrams" }}
        onOpenExcalidraw={vi.fn()}
      />,
    );
    expect(screen.getByText("Diagrams")).toBeInTheDocument();
  });

  it("shows a not-connected hint when disconnected", () => {
    render(<PopupStatus status={{ isConnected: false }} onOpenExcalidraw={vi.fn()} />);
    expect(screen.getByText(/not connected/i)).toBeInTheDocument();
  });

  it("opens Excalidraw on click", async () => {
    const onOpenExcalidraw = vi.fn();
    render(<PopupStatus status={{ isConnected: false }} onOpenExcalidraw={onOpenExcalidraw} />);
    await userEvent.click(screen.getByRole("button", { name: /open excalidraw/i }));
    expect(onOpenExcalidraw).toHaveBeenCalledOnce();
  });
});
