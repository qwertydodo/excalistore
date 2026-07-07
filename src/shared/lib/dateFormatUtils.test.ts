import { describe, expect, it } from "vitest";
import { formatDate } from "./dateFormatUtils";

describe("formatDate", () => {
  it("formats a valid ISO date using the locale date format", () => {
    const iso = "2026-01-15T00:00:00Z";
    expect(formatDate(iso)).toBe(new Date(iso).toLocaleDateString());
  });

  it("returns the input unchanged when it isn't a valid date", () => {
    expect(formatDate("not-a-date")).toBe("not-a-date");
  });

  it("returns the input unchanged for an empty string", () => {
    expect(formatDate("")).toBe("");
  });
});
