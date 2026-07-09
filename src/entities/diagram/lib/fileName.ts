import { DIAGRAM_EXT } from "@/shared/config";

const EXTENSION_RE = new RegExp(`${DIAGRAM_EXT.replace(".", "\\.")}$`, "i");

// The .excalidraw extension is implied — hide it in the UI and re-add on save.
export const stripExcalidrawExtension = (name: string): string => {
  return name.replace(EXTENSION_RE, "");
};

export const ensureExcalidrawExtension = (name: string): string => {
  return name.endsWith(DIAGRAM_EXT) ? name : `${name}${DIAGRAM_EXT}`;
};

// Picks the next free "Untitled"/"Untitled N" name for a silently
// auto-created diagram (see useAutoCreate's auto-create watcher).
// Case-insensitive so "untitled.excalidraw" still counts as taken.
export const nextUntitledName = (existingNames: string[]): string => {
  const stripped = new Set(existingNames.map((n) => stripExcalidrawExtension(n).toLowerCase()));
  if (!stripped.has("untitled")) return "Untitled";
  let n = 2;
  while (stripped.has(`untitled ${n}`)) n++;
  return `Untitled ${n}`;
};
