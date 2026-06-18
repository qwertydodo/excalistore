import { clear, createStore, entries, set } from "idb-keyval";
import type { BinaryFile } from "@/entities/diagram";
import type { SceneBridgeDeps } from "./sceneBridge";

// Excalidraw stores image binaries with idb-keyval under this exact db/store
// pair — we must match it to interoperate. This is the one fragile, version-
// sensitive integration point; verified manually (see docs/development.md).
const filesStore = createStore("files-db", "files-store");

async function loadFiles(): Promise<Record<string, BinaryFile>> {
  const out: Record<string, BinaryFile> = {};
  for (const [key, value] of await entries(filesStore)) {
    out[String(key)] = value as BinaryFile;
  }
  return out;
}

async function saveFiles(files: Record<string, BinaryFile>): Promise<void> {
  await Promise.all(Object.entries(files).map(([id, file]) => set(id, file, filesStore)));
}

async function clearFiles(): Promise<void> {
  await clear(filesStore);
}

// Real, browser-wired SceneBridgeDeps for the content script.
export function defaultSceneBridgeDeps(): SceneBridgeDeps {
  return {
    storage: window.localStorage,
    loadFiles,
    saveFiles,
    clearFiles,
    reload: () => window.location.reload(),
  };
}
