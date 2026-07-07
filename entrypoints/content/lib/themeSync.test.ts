// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { THEME_MODE } from "@/shared/config";
import { excalidrawThemeFromClassList } from "./themeSync";

describe("excalidrawThemeFromClassList", () => {
  it("returns dark when the theme--dark token is present", () => {
    const el = document.createElement("div");
    el.className = "excalidraw excalidraw-container notranslate theme--dark";
    expect(excalidrawThemeFromClassList(el.classList)).toBe(THEME_MODE.DARK);
  });

  it("returns light when the theme--dark token is absent", () => {
    const el = document.createElement("div");
    el.className = "excalidraw excalidraw-container notranslate";
    expect(excalidrawThemeFromClassList(el.classList)).toBe(THEME_MODE.LIGHT);
  });
});
