import { DriveError } from "@/entities/google/drive";
import type { ErrorCode, Request, Response } from "@/shared/api";
import { ERROR_CODE, REQUEST_TYPE } from "@/shared/api";
import type { ValueOf } from "@/shared/lib";
import type { AuthService } from "./services/authService";
import type { DriveService } from "./services/driveService";

type Services = { auth: AuthService; drive: DriveService };

type RouteContext = {
  token: string | undefined;
  folderId: string | undefined;
  isConnected: boolean;
};

type RouteEntry = {
  auth: "silent" | "interactive" | null;
  needsStore: boolean;
  run: (req: Request, ctx: RouteContext, services: Services) => Promise<unknown>;
};

const routes: Record<ValueOf<typeof REQUEST_TYPE>, RouteEntry> = {
  [REQUEST_TYPE.AUTH_STATUS]: {
    auth: null,
    needsStore: false,
    run: (_, __, { auth }) => auth.getStatus(),
  },
  [REQUEST_TYPE.AUTH_SIGN_OUT]: {
    auth: null,
    needsStore: false,
    run: (_, __, { auth }) => auth.signOut(),
  },
  [REQUEST_TYPE.DRIVE_CONNECT]: {
    auth: "interactive",
    needsStore: false,
    run: (req, { token }, { auth }) => {
      const r = req as Extract<Request, { type: typeof REQUEST_TYPE.DRIVE_CONNECT }>;
      return auth.connect(token as string, r.folderName);
    },
  },
  [REQUEST_TYPE.DRIVE_LIST]: {
    auth: "silent",
    needsStore: true,
    run: (_, { token, folderId }, { drive }) => drive.list(token as string, folderId as string),
  },
  [REQUEST_TYPE.DRIVE_GET]: {
    auth: "silent",
    needsStore: true,
    run: (req, { token }, { drive }) => {
      const r = req as Extract<Request, { type: typeof REQUEST_TYPE.DRIVE_GET }>;
      return drive.get(token as string, r.id);
    },
  },
  [REQUEST_TYPE.DRIVE_CREATE]: {
    auth: "silent",
    needsStore: true,
    run: (req, { token, folderId }, { drive }) => {
      const r = req as Extract<Request, { type: typeof REQUEST_TYPE.DRIVE_CREATE }>;
      return drive.create(token as string, r.name, folderId as string, r.content);
    },
  },
  [REQUEST_TYPE.DRIVE_UPDATE]: {
    auth: "silent",
    needsStore: true,
    run: (req, { token }, { drive }) => {
      const r = req as Extract<Request, { type: typeof REQUEST_TYPE.DRIVE_UPDATE }>;
      return drive.update(token as string, r.id, r.content, r.prevRevision);
    },
  },
  [REQUEST_TYPE.DRIVE_RENAME]: {
    auth: "silent",
    needsStore: true,
    run: (req, { token }, { drive }) => {
      const r = req as Extract<Request, { type: typeof REQUEST_TYPE.DRIVE_RENAME }>;
      return drive.rename(token as string, r.id, r.name);
    },
  },
  [REQUEST_TYPE.DRIVE_TRASH]: {
    auth: "silent",
    needsStore: true,
    run: async (req, { token }, { drive }) => {
      const r = req as Extract<Request, { type: typeof REQUEST_TYPE.DRIVE_TRASH }>;
      await drive.trash(token as string, r.id);
      return null;
    },
  },
};

const classifyError = (e: unknown): Extract<Response<never>, { ok: false }> => {
  const message = e instanceof Error ? e.message : String(e);
  const status = e instanceof DriveError ? e.status : undefined;
  let code: ErrorCode = ERROR_CODE.UNKNOWN;
  if (/conflict/i.test(message)) {
    code = ERROR_CODE.CONFLICT;
  } else if (
    status === 401 ||
    status === 403 ||
    /unauthor|insufficient|not granted|revoked|no auth token/i.test(message)
  ) {
    code = ERROR_CODE.UNAUTHORIZED;
  }
  return { ok: false, error: message, code };
};

export const dispatch = async (req: Request, services: Services): Promise<Response<unknown>> => {
  try {
    const reqType = (req as { type: ValueOf<typeof REQUEST_TYPE> }).type;
    const route = routes[reqType];
    if (!route) throw new Error(`unhandled request: ${reqType}`);

    const token =
      route.auth !== null ? await services.auth.getToken(route.auth === "interactive") : undefined;

    let isConnected = false;
    let folderId: string | undefined;

    if (route.needsStore) {
      const status = await services.auth.getStatus();
      isConnected = status.isConnected;
      folderId = status.folderId;
      if (!isConnected) throw new Error("not connected");
      if (
        (reqType === REQUEST_TYPE.DRIVE_LIST || reqType === REQUEST_TYPE.DRIVE_CREATE) &&
        !folderId
      ) {
        throw new Error("not connected: no folder");
      }
    }

    const data = await route.run(req, { token, isConnected, folderId }, services);
    return { ok: true, data };
  } catch (e) {
    return classifyError(e);
  }
};
