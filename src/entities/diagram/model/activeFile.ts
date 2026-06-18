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
  // loadedRevision may legitimately be empty before the first save; id/name
  // must be non-empty so a corrupt pointer can't drive an empty-id drive/get.
  return (
    typeof v.id === "string" &&
    v.id.length > 0 &&
    typeof v.name === "string" &&
    v.name.length > 0 &&
    typeof v.loadedRevision === "string"
  );
}
