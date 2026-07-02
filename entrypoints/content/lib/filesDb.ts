import { clear, createStore, del, entries, keys, set } from "idb-keyval";
import type { BinaryFile } from "@/entities/diagram";
import type { SceneBridgeDeps } from "./sceneBridge";

// Excalidraw stores image binaries with idb-keyval under this exact db/store
// pair — we must match it to interoperate. This is the one fragile, version-
// sensitive integration point; verified manually (see docs/development.md).
const filesStore = createStore("files-db", "files-store");

const loadFiles = async (): Promise<Record<string, BinaryFile>> => {
  const out: Record<string, BinaryFile> = {};
  for (const [key, value] of await entries(filesStore)) {
    out[String(key)] = value as BinaryFile;
  }
  return out;
};

const saveFiles = async (files: Record<string, BinaryFile>): Promise<void> => {
  const nextIds = new Set(Object.keys(files));
  const existingIds = (await keys(filesStore)).map(String);
  // Delete blobs no longer referenced by the scene being written, so orphaned
  // images don't accumulate or bleed across opened diagrams.
  await Promise.all(existingIds.filter((id) => !nextIds.has(id)).map((id) => del(id, filesStore)));
  await Promise.all(Object.entries(files).map(([id, file]) => set(id, file, filesStore)));
};

const clearFiles = async (): Promise<void> => {
  await clear(filesStore);
};

// Real, browser-wired SceneBridgeDeps for the content script.
export const defaultSceneBridgeDeps = (): SceneBridgeDeps => {
  return {
    storage: window.localStorage,
    loadFiles,
    saveFiles,
    clearFiles,
    reload: () => window.location.reload(),
  };
};
