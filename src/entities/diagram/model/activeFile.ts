// Which Drive file the canvas currently represents. loadedRevision is the
// headRevisionId at load time and feeds the autosave conflict guard.
export interface ActiveFile {
  id: string;
  name: string;
  loadedRevision: string;
}

export function isActiveFile(value: unknown): value is ActiveFile {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" && typeof v.name === "string" && typeof v.loadedRevision === "string"
  );
}
