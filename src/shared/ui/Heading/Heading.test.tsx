import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Heading } from "./Heading";

describe("Heading", () => {
  it("renders h1 when requested", () => {
    render(<Heading as="h1">Excalistore</Heading>);
    expect(screen.getByRole("heading", { level: 1, name: "Excalistore" })).toBeInTheDocument();
  });

  it("defaults to h2", () => {
    render(<Heading>Diagrams</Heading>);
    expect(screen.getByRole("heading", { level: 2, name: "Diagrams" })).toBeInTheDocument();
  });
});
