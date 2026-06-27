import { DriveError, driveRepo } from "@/entities/google/drive";
import type { ErrorCode, Request, Response } from "@/shared/api";
import { ERROR_CODE, REQUEST_TYPE } from "@/shared/api";
import type { ValueOf } from "@/shared/lib";
import { connectionService } from "./services/connectionService";

// No dependency injection: FSD already lets this feature import the entities
// (driveRepo) and its own connection service directly, so the routes call them
// straight. connectionService stays a service because it orchestrates auth +
// drive + the connection store (which an entity may not do).

// Resolved before a route runs, when the route requires an established
// connection (see RouteEntry.isConnectionRequired).
type RouteContext = {
  folderId: string | undefined;
};

type RouteEntry = {
  // Whether the route operates on the connected Drive folder. When true,
  // handleMessage loads the connection status first, fails fast if
  // disconnected, and passes folderId through RouteContext. Auth tokens are NOT
  // handled here — the googleClient interceptor attaches them per request, and
  // drive/connect triggers the interactive consent prompt itself inside
  // connectionService.
  isConnectionRequired: boolean;
  run: (req: Request, ctx: RouteContext) => Promise<unknown>;
};

// Error messages the gateway throws and later classifies. Kept as consts so the
// thrower and the classifier agree (no drifting string literals).
const NOT_CONNECTED_MESSAGE = "not connected";
const NOT_CONNECTED_NO_FOLDER_MESSAGE = "not connected: no folder";

// Message patterns mapped to response codes. Drive HTTP status is preferred
// where available (see classifyError); these cover token-grant failures and
// scope errors that surface only as messages.
const UNAUTHORIZED_MESSAGE_PATTERN = /unauthor|insufficient|not granted|revoked|no auth token/i;
const CONFLICT_MESSAGE_PATTERN = /conflict/i;

const routes: Record<ValueOf<typeof REQUEST_TYPE>, RouteEntry> = {
  [REQUEST_TYPE.AUTH_STATUS]: {
    isConnectionRequired: false,
    run: () => connectionService.getStatus(),
  },
  [REQUEST_TYPE.AUTH_SIGN_OUT]: {
    isConnectionRequired: false,
    run: () => connectionService.signOut(),
  },
  [REQUEST_TYPE.DRIVE_CONNECT]: {
    isConnectionRequired: false,
    run: (req) => {
      const r = req as Extract<Request, { type: typeof REQUEST_TYPE.DRIVE_CONNECT }>;
      return connectionService.connect(r.folderName);
    },
  },
  [REQUEST_TYPE.DRIVE_LIST]: {
    isConnectionRequired: true,
    run: (_, { folderId }) => driveRepo.listFolder(folderId as string),
  },
  [REQUEST_TYPE.DRIVE_GET]: {
    isConnectionRequired: true,
    run: (req) => {
      const r = req as Extract<Request, { type: typeof REQUEST_TYPE.DRIVE_GET }>;
      return driveRepo.getDiagram(r.id);
    },
  },
  [REQUEST_TYPE.DRIVE_CREATE]: {
    isConnectionRequired: true,
    run: (req, { folderId }) => {
      const r = req as Extract<Request, { type: typeof REQUEST_TYPE.DRIVE_CREATE }>;
      return driveRepo.createFile(r.name, folderId as string, r.content);
    },
  },
  [REQUEST_TYPE.DRIVE_UPDATE]: {
    isConnectionRequired: true,
    run: (req) => {
      const r = req as Extract<Request, { type: typeof REQUEST_TYPE.DRIVE_UPDATE }>;
      return driveRepo.updateFile(r.id, r.content, r.prevRevision);
    },
  },
  [REQUEST_TYPE.DRIVE_RENAME]: {
    isConnectionRequired: true,
    run: (req) => {
      const r = req as Extract<Request, { type: typeof REQUEST_TYPE.DRIVE_RENAME }>;
      return driveRepo.renameFile(r.id, r.name);
    },
  },
  [REQUEST_TYPE.DRIVE_TRASH]: {
    isConnectionRequired: true,
    run: async (req) => {
      const r = req as Extract<Request, { type: typeof REQUEST_TYPE.DRIVE_TRASH }>;
      await driveRepo.trashFile(r.id);
      return null;
    },
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

    let folderId: string | undefined;

    if (route.isConnectionRequired) {
      const status = await connectionService.getStatus();
      if (!status.isConnected) throw new Error(NOT_CONNECTED_MESSAGE);
      folderId = status.folderId;
      if (
        (reqType === REQUEST_TYPE.DRIVE_LIST || reqType === REQUEST_TYPE.DRIVE_CREATE) &&
        !folderId
      ) {
        throw new Error(NOT_CONNECTED_NO_FOLDER_MESSAGE);
      }
    }

    const data = await route.run(req, { folderId });
    return { ok: true, data };
  } catch (e) {
    return classifyError(e);
  }
};
