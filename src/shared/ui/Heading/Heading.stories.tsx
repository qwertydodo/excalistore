import type { Meta, StoryObj } from "@storybook/react";
import { Heading } from "./Heading";

const meta: Meta<typeof Heading> = {
  title: "shared/ui/Heading",
  component: Heading,
  tags: ["autodocs"],
  argTypes: {
    size: { control: "radio", options: ["md", "lg"] },
    as: { control: "radio", options: ["h1", "h2"] },
    children: { control: "text" },
  },
  args: { children: "Heading text" },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Md: Story = { args: { size: "md" } };

export const Lg: Story = { args: { size: "lg" } };

export const AllSizes: Story = {
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      <Heading size="lg">Large heading</Heading>
      <Heading size="md">Medium heading</Heading>
    </div>
  ),
};
