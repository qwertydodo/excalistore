import type { Meta, StoryObj } from "@storybook/react";
import { Text } from "./Text";

const meta: Meta<typeof Text> = {
  title: "shared/ui/Text",
  component: Text,
  tags: ["autodocs"],
  argTypes: {
    size: {
      control: "select",
      options: ["xs", "sm", "base", "md", "lg", "xl"],
    },
    color: {
      control: "select",
      options: ["text", "muted", "danger", "accent", "accent-text"],
    },
    as: { control: "select", options: ["span", "p", "label", "div"] },
    children: { control: "text" },
  },
  args: { children: "The quick brown fox jumps over the lazy dog" },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Base: Story = { args: { size: "base" } };

export const Muted: Story = { args: { color: "muted" } };

export const Danger: Story = { args: { color: "danger", children: "Something went wrong" } };

export const Accent: Story = { args: { color: "accent" } };

export const AllSizes: Story = {
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      {(["xs", "sm", "base", "md", "lg", "xl"] as const).map((size) => (
        <Text key={size} size={size}>
          {size} — The quick brown fox
        </Text>
      ))}
    </div>
  ),
};

export const AllColors: Story = {
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      <Text color="text">text — default body copy</Text>
      <Text color="muted">muted — secondary label</Text>
      <Text color="danger">danger — error message</Text>
      <Text color="accent">accent — highlighted term</Text>
    </div>
  ),
};
