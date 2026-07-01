import type { Meta, StoryObj } from "@storybook/react";
import { TextField } from "./TextField";

const meta: Meta<typeof TextField> = {
  title: "shared/ui/TextField",
  component: TextField,
  tags: ["autodocs"],
  argTypes: {
    placeholder: { control: "text" },
    disabled: { control: "boolean" },
    defaultValue: { control: "text" },
    size: { control: "radio", options: ["sm", "md"] },
  },
  args: {
    name: "field",
    placeholder: "Enter text…",
  },
  decorators: [
    (Story) => (
      <div style={{ width: "280px" }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithValue: Story = { args: { defaultValue: "excalistore" } };

export const Disabled: Story = { args: { disabled: true, defaultValue: "read-only value" } };

export const Small: Story = { args: { size: "sm" } };
