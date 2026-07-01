import type { Meta, StoryObj } from "@storybook/react";
import { fn } from "storybook/test";
import { Button } from "./Button";

const meta: Meta<typeof Button> = {
  title: "shared/ui/Button",
  component: Button,
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: "select",
      options: ["primary", "secondary", "danger"],
    },
    width: {
      control: "select",
      options: ["content", "full"],
    },
    size: {
      control: "radio",
      options: ["sm", "md"],
    },
    disabled: { control: "boolean" },
    children: { control: "text" },
  },
  args: {
    children: "Button",
    onClick: fn(),
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = { args: { variant: "primary" } };

export const Secondary: Story = { args: { variant: "secondary" } };

export const Danger: Story = { args: { variant: "danger", children: "Delete" } };

export const Disabled: Story = { args: { disabled: true } };

export const Loading: Story = { args: { isLoading: true } };

export const Small: Story = { args: { size: "sm" } };

export const FullWidth: Story = {
  args: { width: "full" },
  decorators: [
    (Story) => (
      <div style={{ width: "240px" }}>
        <Story />
      </div>
    ),
  ],
};

export const AllVariants: Story = {
  render: () => (
    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
      <Button variant="primary">Primary</Button>
      <Button variant="secondary">Secondary</Button>
      <Button variant="danger">Danger</Button>
    </div>
  ),
};
