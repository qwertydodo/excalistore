import type { ConnectionStatus, DiagramContent, Request, Response } from "@/shared/api";
import { DriveError, type DriveFile } from "@/shared/api";

// Dependencies injected so the router is pure and testable. background.ts
// supplies the real implementations.
export interface GatewayDeps {
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
  getStore: () => Promise<ConnectionStatus>;
  setStore: (s: ConnectionStatus) => Promise<void>;
  findOrCreateFolder: (token: string, name: string) => Promise<{ id: string; name: string }>;
}

function err(e: unknown): Extract<Response<never>, { ok: false }> {
  const message = e instanceof Error ? e.message : String(e);
  const status = e instanceof DriveError ? e.status : undefined;
  let code: Extract<Response<never>, { ok: false }>["code"] = "unknown";
  if (/conflict/i.test(message)) {
    code = "conflict";
  } else if (
    status === 401 ||
    status === 403 ||
    /unauthor|insufficient|not granted|revoked|no auth token/i.test(message)
  ) {
    code = "unauthorized";
  }
  return { ok: false, error: message, code };
}

export async function handleMessage(req: Request, deps: GatewayDeps): Promise<Response<unknown>> {
  try {
    switch (req.type) {
      case "auth/status":
        return { ok: true, data: await deps.getStore() };

      case "auth/signOut": {
        const token = await deps.getToken(false).catch(() => "");
        if (token) await deps.signOut(token);
        const next: ConnectionStatus = { connected: false };
        await deps.setStore(next);
        return { ok: true, data: next };
      }

      case "drive/list": {
        const store = await deps.getStore();
        if (!store.connected || !store.folderId) return err("not connected");
        const token = await deps.getToken(false);
        return { ok: true, data: await deps.listFolder(token, store.folderId) };
      }

      case "drive/get": {
        const store = await deps.getStore();
        if (!store.connected) return err("not connected");
        const token = await deps.getToken(false);
        return { ok: true, data: await deps.getFile(token, req.id) };
      }

      case "drive/create": {
        const store = await deps.getStore();
        if (!store.connected || !store.folderId) return err("not connected: no folder");
        const token = await deps.getToken(false);
        return {
          ok: true,
          data: await deps.createFile(token, req.name, store.folderId, req.content),
        };
      }

      case "drive/update": {
        const store = await deps.getStore();
        if (!store.connected) return err("not connected");
        const token = await deps.getToken(false);
        return {
          ok: true,
          data: await deps.updateFile(token, req.id, req.content, req.prevRevision),
        };
      }

      case "drive/rename": {
        const store = await deps.getStore();
        if (!store.connected) return err("not connected");
        const token = await deps.getToken(false);
        return { ok: true, data: await deps.renameFile(token, req.id, req.name) };
      }

      case "drive/connect": {
        // Interactive sign-in happens here (first user gesture from the popup).
        const token = await deps.getToken(true);
        const folder = await deps.findOrCreateFolder(token, req.folderName);
        const next: ConnectionStatus = {
          connected: true,
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
}
