import type { Meta, StoryObj } from "@storybook/react";
import { Box } from "./Box";

const content = (
  <span style={{ fontSize: "var(--es-font-size-sm)", color: "var(--es-muted)" }}>Box content</span>
);

const meta: Meta<typeof Box> = {
  title: "shared/ui/Box",
  component: Box,
  tags: ["autodocs"],
  argTypes: {
    padding: { control: "select", options: ["1", "2", "3", "4", "5", "6"] },
    border: { control: "radio", options: ["thin", "thick"] },
    radius: { control: "radio", options: ["sm", "md", "lg"] },
    shadow: { control: "radio", options: ["sm", "md", "lg"] },
  },
  args: { children: content, padding: "4" },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithBorder: Story = { args: { border: "thin", radius: "md" } };

export const WithShadow: Story = { args: { shadow: "md", radius: "md" } };

export const Card: Story = {
  args: { padding: "4", border: "thin", radius: "md", shadow: "sm" },
};
