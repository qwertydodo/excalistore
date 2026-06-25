import type { Meta, StoryObj } from "@storybook/react";
import { Spinner } from "./Spinner";

const meta: Meta<typeof Spinner> = {
  title: "shared/ui/Spinner",
  component: Spinner,
  tags: ["autodocs"],
  argTypes: {
    size: { control: { type: "range", min: 12, max: 48, step: 4 } },
  },
  args: { size: 16 },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Small: Story = { args: { size: 12 } };

export const Large: Story = { args: { size: 32 } };

export const AllSizes: Story = {
  render: () => (
    <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
      <Spinner size={12} />
      <Spinner size={16} />
      <Spinner size={24} />
      <Spinner size={32} />
    </div>
  ),
};
