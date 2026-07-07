import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { SearchField } from "./SearchField";

const meta: Meta<typeof SearchField> = {
  title: "shared/ui/SearchField",
  component: SearchField,
  tags: ["autodocs"],
  args: {
    name: "search",
    placeholder: "Type 3+ characters to search",
    "aria-label": "Search diagrams",
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

export const Empty: Story = {
  render: (args) => {
    const [value, setValue] = useState("");
    return <SearchField {...args} value={value} onChange={setValue} />;
  },
};

export const WithValue: Story = {
  render: (args) => {
    const [value, setValue] = useState("diagram");
    return <SearchField {...args} value={value} onChange={setValue} />;
  },
};
