import type { Meta, StoryObj } from "@storybook/react";
import { fn } from "storybook/test";
import { IconButton } from "./IconButton";

const PlusIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const meta: Meta<typeof IconButton> = {
  title: "shared/ui/IconButton",
  component: IconButton,
  tags: ["autodocs"],
  argTypes: {
    variant: { control: "select", options: ["ghost", "primary"] },
    size: { control: "radio", options: ["sm", "md"] },
    shape: { control: "radio", options: ["square", "circle"] },
    disabled: { control: "boolean" },
  },
  args: {
    children: <PlusIcon />,
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
      <IconButton aria-label="Add (ghost)">
        <PlusIcon />
      </IconButton>
      <IconButton variant="primary" aria-label="Add (primary)">
        <PlusIcon />
      </IconButton>
      <IconButton shape="circle" aria-label="Add (circle)">
        <PlusIcon />
      </IconButton>
      <IconButton size="md" aria-label="Add (md)">
        <PlusIcon />
      </IconButton>
    </div>
  ),
};
