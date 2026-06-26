import type { Meta, StoryObj } from "@storybook/react";
import { fn } from "storybook/test";
import { IconButton } from "./IconButton";

const meta: Meta<typeof IconButton> = {
  title: "shared/ui/IconButton",
  component: IconButton,
  tags: ["autodocs"],
  argTypes: {
    icon: { control: "select", options: ["plus", "minus", "cross", "edit"] },
    variant: { control: "select", options: ["ghost", "primary"] },
    size: { control: "radio", options: ["sm", "md"] },
    shape: { control: "radio", options: ["square", "circle"] },
    disabled: { control: "boolean" },
  },
  args: {
    icon: "plus",
    onClick: fn(),
    "aria-label": "Add",
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
      <IconButton icon="plus" aria-label="Add (ghost)" />
      <IconButton icon="plus" variant="primary" aria-label="Add (primary)" />
      <IconButton icon="plus" shape="circle" aria-label="Add (circle)" />
      <IconButton icon="plus" size="md" aria-label="Add (md)" />
      <IconButton icon="minus" aria-label="Remove" />
      <IconButton icon="cross" aria-label="Close" />
      <IconButton icon="edit" aria-label="Edit" />
    </div>
  ),
};
