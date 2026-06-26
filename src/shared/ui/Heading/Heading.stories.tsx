import type { Meta, StoryObj } from "@storybook/react";
import { Heading } from "./Heading";

const meta: Meta<typeof Heading> = {
  title: "shared/ui/Heading",
  component: Heading,
  tags: ["autodocs"],
  argTypes: {
    as: { control: "radio", options: ["h1", "h2"] },
    children: { control: "text" },
  },
  args: { children: "Heading text" },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const H1: Story = { args: { as: "h1" } };

export const H2: Story = { args: { as: "h2" } };

export const AllLevels: Story = {
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      <Heading as="h1">h1 — large heading</Heading>
      <Heading as="h2">h2 — medium heading</Heading>
    </div>
  ),
};
