import { vi } from "vitest";
import type { SceneBridgeDeps } from "./sceneBridge";

// Map-backed fake of the Web Storage API, used below to build a fake
// SceneBridgeDeps for any test that drives code through the real `bridge`
// singleton: real `idb-keyval` needs a real IndexedDB, which the test env
// doesn't provide, so `loadFiles`/`saveFiles`/`clearFiles` are faked too.
const fakeStorage = (seed: Record<string, string> = {}): Storage => {
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
};

export const createFakeSceneBridgeDeps = (): SceneBridgeDeps => ({
  storage: fakeStorage(),
  loadFiles: vi.fn(async () => ({})),
  saveFiles: vi.fn(async () => undefined),
  clearFiles: vi.fn(async () => undefined),
  reload: vi.fn(),
});
