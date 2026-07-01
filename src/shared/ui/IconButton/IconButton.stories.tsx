import type { Meta, StoryObj } from "@storybook/react";
import { fn } from "storybook/test";
import { IconButton } from "./IconButton";

const meta: Meta<typeof IconButton> = {
  title: "shared/ui/IconButton",
  component: IconButton,
  tags: ["autodocs"],
  argTypes: {
    icon: { control: "select", options: ["minus", "edit", "trash", "folderOpen", "cloud"] },
    variant: { control: "select", options: ["ghost", "primary"] },
    size: { control: "radio", options: ["sm", "md"] },
    shape: { control: "radio", options: ["square", "circle"] },
    disabled: { control: "boolean" },
  },
  args: {
    icon: "edit",
    onClick: fn(),
    "aria-label": "Edit",
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Ghost: Story = { args: { variant: "ghost" } };

export const Primary: Story = { args: { variant: "primary" } };

export const Circle: Story = { args: { shape: "circle" } };

export const Medium: Story = { args: { size: "md" } };

export const Disabled: Story = { args: { disabled: true } };

export const AllVariants: Story = {
  render: () => (
    <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
      <IconButton icon="edit" aria-label="Edit (ghost)" />
      <IconButton icon="edit" variant="primary" aria-label="Edit (primary)" />
      <IconButton icon="edit" shape="circle" aria-label="Edit (circle)" />
      <IconButton icon="edit" size="md" aria-label="Edit (md)" />
      <IconButton icon="minus" aria-label="Remove" />
      <IconButton icon="trash" aria-label="Delete" />
      <IconButton icon="folderOpen" aria-label="Open" />
    </div>
  ),
};
