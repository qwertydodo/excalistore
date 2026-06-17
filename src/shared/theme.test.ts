import { describe, expect, it } from "vitest";
import { type ThemeMode, themeVars } from "@/shared/theme";

describe("theme", () => {
  it("provides light and dark variable maps", () => {
    const light = themeVars("light");
    const dark = themeVars("dark");
    expect(light["--es-bg"]).toBeDefined();
    expect(dark["--es-bg"]).toBeDefined();
    expect(light["--es-bg"]).not.toBe(dark["--es-bg"]);
  });

  it("modes are typed", () => {
    const m: ThemeMode = "dark";
    expect(themeVars(m)["--es-text"]).toBeDefined();
  });
});
