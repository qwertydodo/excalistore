import { describe, expect, it, vi } from "vitest";
import { buildExcalidrawFile } from "@/entities/diagram";
import type { SceneBridgeDeps } from "./sceneBridge";
import { clearScene, currentSceneHash, readScene, readTheme, writeScene } from "./sceneBridge";

// Map-backed fake of the Web Storage API (the subset the bridge uses).
function fakeStorage(seed: Record<string, string> = {}): Storage {
  const m = new Map<string, string>(Object.entries(seed));
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
    key: (i: number) => Array.from(m.keys())[i] ?? null,
    get length() {
      return m.size;
    },
  } as Storage;
}

function deps(over: Partial<SceneBridgeDeps> = {}): SceneBridgeDeps {
  return {
    storage: fakeStorage(),
    loadFiles: vi.fn(async () => ({})),
    saveFiles: vi.fn(async () => undefined),
    clearFiles: vi.fn(async () => undefined),
    reload: vi.fn(),
    ...over,
  };
}

describe("readScene", () => {
  it("builds a validated envelope from storage + files", async () => {
    const d = deps({
      storage: fakeStorage({
        excalidraw: JSON.stringify([{ id: "e1", version: 1 }]),
        "excalidraw-state": JSON.stringify({ theme: "dark", viewBackgroundColor: "#fff" }),
      }),
      loadFiles: vi.fn(async () => ({
        f1: { id: "f1", mimeType: "image/png", dataURL: "data:image/png;base64,AAAA" },
      })),
    });
    const scene = await readScene(d);
    expect(scene.type).toBe("excalidraw");
    expect(scene.elements).toEqual([{ id: "e1", version: 1 }]);
    expect(scene.appState).toMatchObject({ theme: "dark" });
    expect(scene.files.f1?.mimeType).toBe("image/png");
  });

  it("defaults to an empty scene when storage is blank", async () => {
    const scene = await readScene(deps());
    expect(scene.elements).toEqual([]);
    expect(scene.files).toEqual({});
  });
});

describe("writeScene", () => {
  it("validates, writes storage + files, then reloads", async () => {
    const d = deps();
    const file = buildExcalidrawFile(
      [{ id: "e1", version: 2 }],
      { theme: "light" },
      { f1: { id: "f1", mimeType: "image/png", dataURL: "data:image/png;base64,AAAA" } },
    );
    await writeScene(file, d);
    expect((d.storage as Storage).getItem("excalidraw")).toBe(JSON.stringify(file.elements));
    expect((d.storage as Storage).getItem("excalidraw-state")).toBe(JSON.stringify(file.appState));
    expect(d.saveFiles).toHaveBeenCalledWith(file.files);
    expect(d.reload).toHaveBeenCalledOnce();
  });

  it("rejects an invalid envelope before touching storage", async () => {
    const d = deps();
    await expect(writeScene({ type: "nope" } as never, d)).rejects.toThrow();
    expect(d.saveFiles).not.toHaveBeenCalled();
    expect(d.reload).not.toHaveBeenCalled();
  });
});

describe("clearScene", () => {
  it("removes storage keys, clears files, reloads", async () => {
    const d = deps({
      storage: fakeStorage({ excalidraw: "[]", "excalidraw-state": "{}" }),
    });
    await clearScene(d);
    expect((d.storage as Storage).getItem("excalidraw")).toBeNull();
    expect((d.storage as Storage).getItem("excalidraw-state")).toBeNull();
    expect(d.clearFiles).toHaveBeenCalledOnce();
    expect(d.reload).toHaveBeenCalledOnce();
  });
});

describe("readTheme", () => {
  it("reads the theme from appState, defaulting to light", () => {
    expect(
      readTheme(deps({ storage: fakeStorage({ "excalidraw-state": '{"theme":"dark"}' }) })),
    ).toBe("dark");
    expect(readTheme(deps())).toBe("light");
  });
});

describe("currentSceneHash", () => {
  it("is stable across reads and changes with elements", async () => {
    const base = deps({
      storage: fakeStorage({ excalidraw: JSON.stringify([{ id: "e1", version: 1 }]) }),
    });
    const h1 = await currentSceneHash(base);
    const h2 = await currentSceneHash(base);
    expect(h1).toBe(h2);
    const changed = deps({
      storage: fakeStorage({ excalidraw: JSON.stringify([{ id: "e1", version: 2 }]) }),
    });
    expect(await currentSceneHash(changed)).not.toBe(h1);
  });
});
