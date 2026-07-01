import type { Meta, StoryObj } from "@storybook/react";
import { Icon } from "./Icon";

const meta: Meta<typeof Icon> = {
  title: "shared/ui/Icon",
  component: Icon,
  tags: ["autodocs"],
  argTypes: {
    name: { control: "select", options: ["minus", "edit", "trash", "folderOpen", "cloud"] },
    size: { control: "radio", options: ["sm", "md", "lg"] },
  },
  args: {
    name: "edit",
    size: "sm",
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Minus: Story = { args: { name: "minus" } };

export const Edit: Story = { args: { name: "edit" } };

export const Trash: Story = { args: { name: "trash" } };

export const FolderOpen: Story = { args: { name: "folderOpen" } };

export const Cloud: Story = { args: { name: "cloud" } };

export const AllIcons: Story = {
  render: () => (
    <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
      <Icon name="minus" />
      <Icon name="edit" />
      <Icon name="trash" />
      <Icon name="folderOpen" />
      <Icon name="cloud" />
    </div>
  ),
};

export const Sizes: Story = {
  render: () => (
    <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
      <Icon name="edit" size="sm" />
      <Icon name="edit" size="md" />
      <Icon name="edit" size="lg" />
    </div>
  ),
};
