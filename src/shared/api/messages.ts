// Typed request/response contracts shared by content script and background.
// Background is the only side that performs Drive/auth work.

export interface DriveFileMeta {
  id: string;
  name: string;
  modifiedTime: string;
  headRevisionId: string;
}

export type Request =
  | { type: "auth/status" }
  | { type: "auth/signIn" }
  | { type: "auth/signOut" }
  | { type: "drive/pickFolder" }
  | { type: "drive/list" }
  | { type: "drive/get"; id: string }
  | { type: "drive/create"; name: string; content: string }
  | { type: "drive/update"; id: string; content: string; prevRevision: string }
  | { type: "drive/rename"; id: string; name: string };

export interface ConnectionStatus {
  connected: boolean;
  folderId?: string;
  folderName?: string;
}

export type Ok<T> = { ok: true; data: T };
export type Err = { ok: false; error: string; code?: "conflict" | "unauthorized" | "unknown" };
export type Response<T> = Ok<T> | Err;

export function isErrorResponse(r: Response<unknown>): r is Err {
  return r.ok === false;
}
