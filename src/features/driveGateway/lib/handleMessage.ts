import type { ConnectionStatus, DiagramContent, Request, Response } from "@/shared/api";
import { DriveError, type DriveFile, ERROR_CODE, REQUEST_TYPE } from "@/shared/api";

// Dependencies injected so the router is pure and testable. background.ts
// supplies the real implementations.
export type GatewayDeps = {
  getToken: (interactive: boolean) => Promise<string>;
  signOut: (token: string) => Promise<void>;
  listFolder: (token: string, folderId: string) => Promise<DriveFile[]>;
  getFile: (token: string, id: string) => Promise<DiagramContent>;
  createFile: (
    token: string,
    name: string,
    folderId: string,
    content: string,
  ) => Promise<DriveFile>;
  updateFile: (
    token: string,
    id: string,
    content: string,
    prevRevision: string,
  ) => Promise<DriveFile>;
  renameFile: (token: string, id: string, name: string) => Promise<DriveFile>;
  trashFile: (token: string, id: string) => Promise<void>;
  getStore: () => Promise<ConnectionStatus>;
  setStore: (s: ConnectionStatus) => Promise<void>;
  findOrCreateFolder: (token: string, name: string) => Promise<{ id: string; name: string }>;
};

const err = (e: unknown): Extract<Response<never>, { ok: false }> => {
  const message = e instanceof Error ? e.message : String(e);
  const status = e instanceof DriveError ? e.status : undefined;
  let code: Extract<Response<never>, { ok: false }>["code"] = ERROR_CODE.UNKNOWN;
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

export const handleMessage = async (
  req: Request,
  deps: GatewayDeps,
): Promise<Response<unknown>> => {
  try {
    switch (req.type) {
      case REQUEST_TYPE.AUTH_STATUS:
        return { ok: true, data: await deps.getStore() };

      case REQUEST_TYPE.AUTH_SIGN_OUT: {
        const token = await deps.getToken(false).catch(() => "");
        if (token) await deps.signOut(token);
        const next: ConnectionStatus = { isConnected: false };
        await deps.setStore(next);
        return { ok: true, data: next };
      }

      case REQUEST_TYPE.DRIVE_LIST: {
        const store = await deps.getStore();
        if (!store.isConnected || !store.folderId) return err("not connected");
        const token = await deps.getToken(false);
        return { ok: true, data: await deps.listFolder(token, store.folderId) };
      }

      case REQUEST_TYPE.DRIVE_GET: {
        const store = await deps.getStore();
        if (!store.isConnected) return err("not connected");
        const token = await deps.getToken(false);
        return { ok: true, data: await deps.getFile(token, req.id) };
      }

      case REQUEST_TYPE.DRIVE_CREATE: {
        const store = await deps.getStore();
        if (!store.isConnected || !store.folderId) return err("not connected: no folder");
        const token = await deps.getToken(false);
        return {
          ok: true,
          data: await deps.createFile(token, req.name, store.folderId, req.content),
        };
      }

      case REQUEST_TYPE.DRIVE_UPDATE: {
        const store = await deps.getStore();
        if (!store.isConnected) return err("not connected");
        const token = await deps.getToken(false);
        return {
          ok: true,
          data: await deps.updateFile(token, req.id, req.content, req.prevRevision),
        };
      }

      case REQUEST_TYPE.DRIVE_RENAME: {
        const store = await deps.getStore();
        if (!store.isConnected) return err("not connected");
        const token = await deps.getToken(false);
        return { ok: true, data: await deps.renameFile(token, req.id, req.name) };
      }

      case REQUEST_TYPE.DRIVE_TRASH: {
        const store = await deps.getStore();
        if (!store.isConnected) return err("not connected");
        const token = await deps.getToken(false);
        await deps.trashFile(token, req.id);
        return { ok: true, data: null };
      }

      case REQUEST_TYPE.DRIVE_CONNECT: {
        // Interactive sign-in happens here (first user gesture from the popup).
        const token = await deps.getToken(true);
        const folder = await deps.findOrCreateFolder(token, req.folderName);
        const next: ConnectionStatus = {
          isConnected: true,
          folderId: folder.id,
          folderName: folder.name,
        };
        await deps.setStore(next);
        return { ok: true, data: next };
      }

      default:
        return err(`unhandled request: ${(req as { type: string }).type}`);
    }
  } catch (e) {
    return err(e);
  }
};
