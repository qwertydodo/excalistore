import { z } from "zod";

// The .excalidraw file envelope. Elements/appState are validated structurally
// (array / object) but not deeply — Excalidraw's element schema is large and
// versioned. Envelope validation is the security boundary before we write
// untrusted content into page storage.
const binaryFileSchema = z.object({
  mimeType: z.string(),
  id: z.string(),
  dataURL: z.string(),
  created: z.number().optional(),
  lastRetrieved: z.number().optional(),
});

const fileSchema = z.object({
  type: z.literal("excalidraw"),
  version: z.number(),
  source: z.string(),
  elements: z.array(z.record(z.unknown())),
  appState: z.record(z.unknown()),
  files: z.record(binaryFileSchema),
});

export type BinaryFile = z.infer<typeof binaryFileSchema>;
export type ExcalidrawFile = z.infer<typeof fileSchema>;

export function validateExcalidrawFile(value: unknown): asserts value is ExcalidrawFile {
  fileSchema.parse(value);
}

export function parseExcalidrawFile(json: string): ExcalidrawFile {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch (e) {
    throw new Error(`invalid JSON: ${(e as Error).message}`);
  }
  validateExcalidrawFile(raw);
  return raw;
}

export function buildExcalidrawFile(
  elements: Array<Record<string, unknown>>,
  appState: Record<string, unknown>,
  files: Record<string, BinaryFile>,
): ExcalidrawFile {
  const file: ExcalidrawFile = {
    type: "excalidraw",
    version: 2,
    source: "https://excalidraw.com",
    elements,
    appState,
    files,
  };
  validateExcalidrawFile(file);
  return file;
}

// djb2 string hash — small, dependency-free, sufficient for change detection.
function djb2(input: string): string {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 33) ^ input.charCodeAt(i);
  }
  return (hash >>> 0).toString(16);
}

// Hash only the fields that represent visible scene state: element id+version
// and the set of file ids + their dataURL lengths. Cheap and stable.
export function sceneHash(file: ExcalidrawFile): string {
  const elementSig = file.elements
    .map((e) => `${String(e.id)}:${String(e.version)}`)
    .sort()
    .join(",");
  const fileSig = Object.values(file.files)
    .map((f) => `${f.id}:${f.dataURL.length}`)
    .sort()
    .join(",");
  return djb2(`${elementSig}|${fileSig}`);
}
