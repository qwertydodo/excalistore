import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { fn } from "storybook/test";
import { Button } from "../Button";
import { Text } from "../Text";
import { Dialog } from "./Dialog";

const meta: Meta<typeof Dialog> = {
  title: "shared/ui/Dialog",
  component: Dialog,
  tags: ["autodocs"],
  parameters: { layout: "fullscreen" },
  argTypes: {
    title: { control: "text" },
    onClose: { action: "closed" },
  },
  args: {
    title: "Dialog title",
    children: <Text color="muted">Dialog body content goes here.</Text>,
    onClose: fn(),
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithTrigger: Story = {
  render: () => {
    const [isOpen, setIsOpen] = useState(false);
    return (
      <div style={{ padding: "24px" }}>
        <Button onClick={() => setIsOpen(true)}>Open dialog</Button>
        {isOpen && (
          <Dialog title="Confirm action" onClose={() => setIsOpen(false)}>
            <Text color="muted">This action cannot be undone.</Text>
          </Dialog>
        )}
      </div>
    );
  },
  parameters: { layout: "fullscreen" },
};
