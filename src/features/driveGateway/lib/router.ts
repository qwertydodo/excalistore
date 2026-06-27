import { DriveError, driveRepo } from "@/entities/google/drive";
import type { ConnectionStatus, ErrorCode, Request, Response } from "@/shared/api";
import { ERROR_CODE, REQUEST_TYPE } from "@/shared/api";
import type { ValueOf } from "@/shared/lib";
import { connectionService } from "./services/connectionService";

// The handler stays generic: look up a route, run it, classify errors. Each
// route owns its own preconditions (connection / folder) via the guards below,
// so domain rules live with the route, not baked into the dispatch loop.
type RouteHandler = (req: Request) => Promise<unknown>;

// Error messages the gateway throws and later classifies. Kept as consts so the
// thrower and the classifier agree (no drifting string literals).
const NOT_CONNECTED_MESSAGE = "not connected";
const NOT_CONNECTED_NO_FOLDER_MESSAGE = "not connected: no folder";

// Message patterns mapped to response codes. Drive HTTP status is preferred
// where available (see classifyError); these cover token-grant failures and
// scope errors that surface only as messages.
const UNAUTHORIZED_MESSAGE_PATTERN = /unauthor|insufficient|not granted|revoked|no auth token/i;
const CONFLICT_MESSAGE_PATTERN = /conflict/i;

// Guard: the request needs an active connection (used by file-id operations
// that don't touch the folder itself).
const requireConnection = async (): Promise<ConnectionStatus> => {
  const status = await connectionService.getStatus();
  if (!status.isConnected) throw new Error(NOT_CONNECTED_MESSAGE);
  return status;
};

// Guard: the request needs the connected folder id (list within it / create
// into it).
const requireFolderId = async (): Promise<string> => {
  const { folderId } = await requireConnection();
  if (!folderId) throw new Error(NOT_CONNECTED_NO_FOLDER_MESSAGE);
  return folderId;
};

const routes: Record<ValueOf<typeof REQUEST_TYPE>, RouteHandler> = {
  [REQUEST_TYPE.AUTH_STATUS]: () => connectionService.getStatus(),

  [REQUEST_TYPE.AUTH_SIGN_OUT]: () => connectionService.signOut(),

  [REQUEST_TYPE.DRIVE_CONNECT]: (req) => {
    const r = req as Extract<Request, { type: typeof REQUEST_TYPE.DRIVE_CONNECT }>;
    return connectionService.connect(r.folderName);
  },

  [REQUEST_TYPE.DRIVE_LIST]: async () => driveRepo.listFolder(await requireFolderId()),

  [REQUEST_TYPE.DRIVE_GET]: async (req) => {
    const r = req as Extract<Request, { type: typeof REQUEST_TYPE.DRIVE_GET }>;
    await requireConnection();
    return driveRepo.getDiagram(r.id);
  },

  [REQUEST_TYPE.DRIVE_CREATE]: async (req) => {
    const r = req as Extract<Request, { type: typeof REQUEST_TYPE.DRIVE_CREATE }>;
    return driveRepo.createFile(r.name, await requireFolderId(), r.content);
  },

  [REQUEST_TYPE.DRIVE_UPDATE]: async (req) => {
    const r = req as Extract<Request, { type: typeof REQUEST_TYPE.DRIVE_UPDATE }>;
    await requireConnection();
    return driveRepo.updateFile(r.id, r.content, r.prevRevision);
  },

  [REQUEST_TYPE.DRIVE_RENAME]: async (req) => {
    const r = req as Extract<Request, { type: typeof REQUEST_TYPE.DRIVE_RENAME }>;
    await requireConnection();
    return driveRepo.renameFile(r.id, r.name);
  },

  [REQUEST_TYPE.DRIVE_TRASH]: async (req) => {
    const r = req as Extract<Request, { type: typeof REQUEST_TYPE.DRIVE_TRASH }>;
    await requireConnection();
    await driveRepo.trashFile(r.id);
    return null;
  },
};

const classifyError = (e: unknown): Extract<Response<never>, { ok: false }> => {
  const message = e instanceof Error ? e.message : String(e);
  const status = e instanceof DriveError ? e.status : undefined;
  let code: ErrorCode = ERROR_CODE.UNKNOWN;
  if (CONFLICT_MESSAGE_PATTERN.test(message)) {
    code = ERROR_CODE.CONFLICT;
  } else if (status === 401 || status === 403 || UNAUTHORIZED_MESSAGE_PATTERN.test(message)) {
    code = ERROR_CODE.UNAUTHORIZED;
  }
  return { ok: false, error: message, code };
};

export const handleMessage = async (req: Request): Promise<Response<unknown>> => {
  try {
    const reqType = (req as { type: ValueOf<typeof REQUEST_TYPE> }).type;
    const route = routes[reqType];
    if (!route) throw new Error(`unhandled request: ${reqType}`);
    const data = await route(req);
    return { ok: true, data };
  } catch (e) {
    return classifyError(e);
  }
};
