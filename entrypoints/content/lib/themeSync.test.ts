// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { THEME_ATTR, THEME_MODE } from "@/shared/config";
import { excalidrawThemeFromClassList, syncPanelTheme } from "./themeSync";

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

describe("syncPanelTheme", () => {
  const makeShadowHost = () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    return host;
  };

  it("applies the initial theme immediately when the container already exists", () => {
    const container = document.createElement("div");
    container.className = "excalidraw excalidraw-container notranslate theme--dark";
    document.body.appendChild(container);
    const host = makeShadowHost();

    const detach = syncPanelTheme(host);
    expect(host.getAttribute(THEME_ATTR)).toBe(THEME_MODE.DARK);

    detach();
    document.body.removeChild(container);
    document.body.removeChild(host);
  });

  it("waits for the container to appear, then applies its initial theme", async () => {
    const host = makeShadowHost();
    const detach = syncPanelTheme(host);
    expect(host.hasAttribute(THEME_ATTR)).toBe(false);

    const container = document.createElement("div");
    container.className = "excalidraw excalidraw-container notranslate";
    document.body.appendChild(container);

    // jsdom's MutationObserver callback for the childList mutation above is
    // not guaranteed to have run by the next synchronous line — wait for it.
    await vi.waitFor(() => expect(host.getAttribute(THEME_ATTR)).toBe(THEME_MODE.LIGHT));

    detach();
    document.body.removeChild(container);
    document.body.removeChild(host);
  });

  it("mirrors later class toggles on the container", async () => {
    const container = document.createElement("div");
    container.className = "excalidraw excalidraw-container notranslate";
    document.body.appendChild(container);
    const host = makeShadowHost();

    const detach = syncPanelTheme(host);
    expect(host.getAttribute(THEME_ATTR)).toBe(THEME_MODE.LIGHT);

    container.className = "excalidraw excalidraw-container notranslate theme--dark";
    // jsdom's MutationObserver callback for the attribute mutation above is
    // not guaranteed to have run by the next synchronous line — wait for it.
    await vi.waitFor(() => expect(host.getAttribute(THEME_ATTR)).toBe(THEME_MODE.DARK));

    detach();
    document.body.removeChild(container);
    document.body.removeChild(host);
  });

  it("stops applying updates after detach", () => {
    const container = document.createElement("div");
    container.className = "excalidraw excalidraw-container notranslate";
    document.body.appendChild(container);
    const host = makeShadowHost();

    const detach = syncPanelTheme(host);
    detach();
    container.className = "excalidraw excalidraw-container notranslate theme--dark";
    expect(host.getAttribute(THEME_ATTR)).toBe(THEME_MODE.LIGHT);

    document.body.removeChild(container);
    document.body.removeChild(host);
  });
});
