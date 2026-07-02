export type DriveFile = {
  id: string;
  name: string;
  modifiedTime: string;
  headRevisionId: string;
};

// drive/get response: file metadata (for the conflict guard + name) plus the
// raw .excalidraw JSON content.
export type DiagramContent = {
  meta: DriveFile;
  content: string;
};

export class DriveError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "DriveError";
    this.status = status;
  }
}
