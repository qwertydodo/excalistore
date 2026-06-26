import type { Meta, StoryObj } from "@storybook/react";
import { Icon } from "./Icon";

const meta: Meta<typeof Icon> = {
  title: "shared/ui/Icon",
  component: Icon,
  tags: ["autodocs"],
  argTypes: {
    name: { control: "select", options: ["plus", "minus", "cross", "edit"] },
    size: { control: "radio", options: ["sm", "md", "lg"] },
  },
  args: {
    name: "plus",
    size: "sm",
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Plus: Story = { args: { name: "plus" } };

export const Minus: Story = { args: { name: "minus" } };

export const Cross: Story = { args: { name: "cross" } };

export const Edit: Story = { args: { name: "edit" } };

export const AllIcons: Story = {
  render: () => (
    <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
      <Icon name="plus" />
      <Icon name="minus" />
      <Icon name="cross" />
      <Icon name="edit" />
    </div>
  ),
};

export const Sizes: Story = {
  render: () => (
    <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
      <Icon name="plus" size="sm" />
      <Icon name="plus" size="md" />
      <Icon name="plus" size="lg" />
    </div>
  ),
};
