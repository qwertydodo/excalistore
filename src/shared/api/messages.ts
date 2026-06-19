// Typed request/response contracts shared by content script and background.
// Background is the only side that performs Drive/auth work.

import type { ValueOf } from "@/shared/lib";

export type DriveFileMeta = {
  id: string;
  name: string;
  modifiedTime: string;
  headRevisionId: string;
};

// drive/get response: file metadata (for the conflict guard + name) plus the
// raw .excalidraw JSON content.
export type DiagramContent = {
  meta: DriveFileMeta;
  content: string;
};

export const REQUEST_TYPE = {
  AUTH_STATUS: "auth/status",
  AUTH_SIGN_OUT: "auth/signOut",
  DRIVE_CONNECT: "drive/connect",
  DRIVE_LIST: "drive/list",
  DRIVE_GET: "drive/get",
  DRIVE_CREATE: "drive/create",
  DRIVE_UPDATE: "drive/update",
  DRIVE_RENAME: "drive/rename",
} as const;

export type Request =
  | { type: typeof REQUEST_TYPE.AUTH_STATUS }
  | { type: typeof REQUEST_TYPE.AUTH_SIGN_OUT }
  | { type: typeof REQUEST_TYPE.DRIVE_CONNECT; folderName: string }
  | { type: typeof REQUEST_TYPE.DRIVE_LIST }
  | { type: typeof REQUEST_TYPE.DRIVE_GET; id: string }
  | { type: typeof REQUEST_TYPE.DRIVE_CREATE; name: string; content: string }
  | {
      type: typeof REQUEST_TYPE.DRIVE_UPDATE;
      id: string;
      content: string;
      prevRevision: string;
    }
  | { type: typeof REQUEST_TYPE.DRIVE_RENAME; id: string; name: string };

export type ConnectionStatus = {
  connected: boolean;
  folderId?: string;
  folderName?: string;
};

export const ERROR_CODE = {
  CONFLICT: "conflict",
  UNAUTHORIZED: "unauthorized",
  UNKNOWN: "unknown",
} as const;

export type ErrorCode = ValueOf<typeof ERROR_CODE>;

export type Ok<T> = { ok: true; data: T };
export type Err = { ok: false; error: string; code?: ErrorCode };
export type Response<T> = Ok<T> | Err;

export const isErrorResponse = (r: Response<unknown>): r is Err => {
  return r.ok === false;
};
