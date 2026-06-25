import type { Meta, StoryObj } from "@storybook/react";
import { Stack } from "./Stack";

const Tile = ({ label }: { label: string }) => (
  <div
    style={{
      padding: "8px 12px",
      background: "var(--es-surface)",
      border: "1px solid var(--es-border)",
      borderRadius: "var(--es-radius-sm)",
      fontSize: "var(--es-font-size-sm)",
      color: "var(--es-muted)",
    }}
  >
    {label}
  </div>
);

const meta: Meta<typeof Stack> = {
  title: "shared/ui/Stack",
  component: Stack,
  tags: ["autodocs"],
  argTypes: {
    direction: { control: "radio", options: ["column", "row"] },
    gap: { control: "select", options: ["1", "2", "3", "4", "5", "6"] },
    align: { control: "select", options: ["start", "center", "end", "stretch"] },
    justify: { control: "select", options: ["start", "center", "end", "between"] },
  },
  args: { gap: "2" },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Column: Story = {
  args: { direction: "column" },
  render: (args) => (
    <Stack {...args}>
      <Tile label="Item A" />
      <Tile label="Item B" />
      <Tile label="Item C" />
    </Stack>
  ),
};

export const Row: Story = {
  args: { direction: "row" },
  render: (args) => (
    <Stack {...args}>
      <Tile label="Item A" />
      <Tile label="Item B" />
      <Tile label="Item C" />
    </Stack>
  ),
};

export const SpaceBetween: Story = {
  args: { direction: "row", justify: "between", gap: "4" },
  render: (args) => (
    <div style={{ width: "320px" }}>
      <Stack {...args}>
        <Tile label="Left" />
        <Tile label="Right" />
      </Stack>
    </div>
  ),
};
