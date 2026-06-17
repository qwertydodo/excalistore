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
