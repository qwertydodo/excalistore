import type { Meta, StoryObj } from "@storybook/react";
import { fn } from "storybook/test";
import { ListItem } from "./ListItem";

const meta: Meta<typeof ListItem> = {
  title: "shared/ui/ListItem",
  component: ListItem,
  tags: ["autodocs"],
  argTypes: {
    isActive: { control: "boolean" },
    disabled: { control: "boolean" },
    children: { control: "text" },
  },
  args: {
    children: "diagram-name.excalidraw",
    onClick: fn(),
  },
  decorators: [
    (Story) => (
      <div style={{ width: "240px" }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Active: Story = { args: { isActive: true } };

export const Disabled: Story = { args: { disabled: true } };

export const List: Story = {
  render: () => (
    <div style={{ width: "240px", display: "flex", flexDirection: "column", gap: "2px" }}>
      <ListItem isActive>active-diagram.excalidraw</ListItem>
      <ListItem>another-diagram.excalidraw</ListItem>
      <ListItem disabled>archived.excalidraw</ListItem>
    </div>
  ),
};
