import type { DriveFile } from "@/entities/driveFile";
import type { ConnectionStatus, Request, Response } from "@/shared/api";

// Dependencies injected so the router is pure and testable. background.ts
// supplies the real implementations.
export interface GatewayDeps {
  getToken: (interactive: boolean) => Promise<string>;
  signOut: (token: string) => Promise<void>;
  listFolder: (token: string, folderId: string) => Promise<DriveFile[]>;
  getStore: () => Promise<ConnectionStatus>;
  setStore: (s: ConnectionStatus) => Promise<void>;
}

function err(message: string): Extract<Response<never>, { ok: false }> {
  const code = /conflict/i.test(message)
    ? "conflict"
    : /unauthor|401/i.test(message)
      ? "unauthorized"
      : "unknown";
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

      default:
        return err(`unhandled request: ${(req as { type: string }).type}`);
    }
  } catch (e) {
    return err((e as Error).message);
  }
}
