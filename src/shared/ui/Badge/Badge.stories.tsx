import type { Meta, StoryObj } from "@storybook/react";
import { Badge } from "./Badge";

const meta: Meta<typeof Badge> = {
  title: "shared/ui/Badge",
  component: Badge,
  tags: ["autodocs"],
  argTypes: {
    tone: { control: "select", options: ["neutral", "success", "danger"] },
    children: { control: "text" },
  },
  args: { children: "Badge" },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Neutral: Story = { args: { tone: "neutral" } };

export const Success: Story = { args: { tone: "success", children: "Saved" } };

export const Danger: Story = { args: { tone: "danger", children: "Error" } };

export const AllTones: Story = {
  render: () => (
    <div style={{ display: "flex", gap: "8px" }}>
      <Badge tone="neutral">Idle</Badge>
      <Badge tone="success">Saved</Badge>
      <Badge tone="danger">Error</Badge>
    </div>
  ),
};
