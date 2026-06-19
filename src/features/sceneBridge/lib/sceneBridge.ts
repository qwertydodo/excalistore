import {
  type BinaryFile,
  buildExcalidrawFile,
  type ExcalidrawFile,
  sceneHash,
  validateExcalidrawFile,
} from "@/entities/diagram";
import type { ThemeMode } from "@/shared/config";

// Excalidraw's localStorage keys.
const ELEMENTS_KEY = "excalidraw";
const STATE_KEY = "excalidraw-state";

// All page-storage access is injected so the transform is unit-testable and the
// fragile IndexedDB binding lives in one adapter (filesDb.ts).
export interface SceneBridgeDeps {
  storage: Storage;
  loadFiles: () => Promise<Record<string, BinaryFile>>;
  saveFiles: (files: Record<string, BinaryFile>) => Promise<void>;
  clearFiles: () => Promise<void>;
  reload: () => void;
}

function readJson<T>(storage: Storage, key: string, fallback: T): T {
  const raw = storage.getItem(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    console.warn(`[excalistore] corrupt JSON in localStorage["${key}"]; using fallback`);
    return fallback;
  }
}

// Read the current canvas into a validated .excalidraw envelope.
export async function readScene(deps: SceneBridgeDeps): Promise<ExcalidrawFile> {
  const elements = readJson<Array<Record<string, unknown>>>(deps.storage, ELEMENTS_KEY, []);
  const appState = readJson<Record<string, unknown>>(deps.storage, STATE_KEY, {});
  const files = await deps.loadFiles();
  return buildExcalidrawFile(elements, appState, files);
}

// Replace the canvas: validate, write storage + binaries, then reload so
// Excalidraw restores from storage. Validation is the security boundary.
export async function writeScene(file: ExcalidrawFile, deps: SceneBridgeDeps): Promise<void> {
  validateExcalidrawFile(file);
  // Persist binaries first: if this throws (quota/IDB), localStorage is left
  // untouched so the next reload still reads a self-consistent old scene.
  await deps.saveFiles(file.files);
  deps.storage.setItem(ELEMENTS_KEY, JSON.stringify(file.elements));
  deps.storage.setItem(STATE_KEY, JSON.stringify(file.appState));
  deps.reload();
}

// Wipe the local scene (used by safe sign-out in Plan 4), then reload.
export async function clearScene(deps: SceneBridgeDeps): Promise<void> {
  deps.storage.removeItem(ELEMENTS_KEY);
  deps.storage.removeItem(STATE_KEY);
  await deps.clearFiles();
  deps.reload();
}

// Excalidraw's current theme, mirrored onto the panel host in Plan 4.
export function readTheme(deps: SceneBridgeDeps): ThemeMode {
  const appState = readJson<{ theme?: string }>(deps.storage, STATE_KEY, {});
  return appState.theme === "dark" ? "dark" : "light";
}

// Hash of the current scene for autosave change-detection (Plan 4).
export async function currentSceneHash(deps: SceneBridgeDeps): Promise<string> {
  return sceneHash(await readScene(deps));
}
