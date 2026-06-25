import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { fn } from "storybook/test";
import { Button } from "../Button";
import { ConfirmDialog } from "./ConfirmDialog";

const meta: Meta<typeof ConfirmDialog> = {
  title: "shared/ui/ConfirmDialog",
  component: ConfirmDialog,
  tags: ["autodocs"],
  parameters: { layout: "fullscreen" },
  argTypes: {
    title: { control: "text" },
    message: { control: "text" },
    confirmLabel: { control: "text" },
    cancelLabel: { control: "text" },
    isDanger: { control: "boolean" },
  },
  args: {
    title: "Confirm action",
    message: "Are you sure you want to continue? This cannot be undone.",
    onConfirm: fn(),
    onCancel: fn(),
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Danger: Story = {
  args: {
    title: "Delete diagram",
    message: "This diagram will be permanently deleted from Google Drive.",
    confirmLabel: "Delete",
    isDanger: true,
  },
};

export const WithTrigger: Story = {
  render: () => {
    const [isOpen, setIsOpen] = useState(false);
    return (
      <div style={{ padding: "24px" }}>
        <Button variant="danger" onClick={() => setIsOpen(true)}>
          Delete diagram
        </Button>
        {isOpen && (
          <ConfirmDialog
            title="Delete diagram"
            message="This diagram will be permanently deleted from Google Drive."
            confirmLabel="Delete"
            isDanger
            onConfirm={() => setIsOpen(false)}
            onCancel={() => setIsOpen(false)}
          />
        )}
      </div>
    );
  },
  parameters: { layout: "fullscreen" },
};
