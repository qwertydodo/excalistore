import { DIAGRAM_EXT } from "@/shared/config";

const EXTENSION_RE = new RegExp(`${DIAGRAM_EXT.replace(".", "\\.")}$`, "i");

// The .excalidraw extension is implied — hide it in the UI and re-add on save.
export const stripExcalidrawExtension = (name: string): string => {
  return name.replace(EXTENSION_RE, "");
};

export const ensureExcalidrawExtension = (name: string): string => {
  return name.endsWith(DIAGRAM_EXT) ? name : `${name}${DIAGRAM_EXT}`;
};
