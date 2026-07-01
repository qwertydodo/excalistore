import { vi } from "vitest";

export const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const stubFetch = (handler: (request: Request) => Response | Promise<Response>): void => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (request: Request) => handler(request)),
  );
};

export const stubChromeStorageLocal = (): {
  store: Record<string, unknown>;
  local: {
    get: ReturnType<typeof vi.fn>;
    set: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
  };
} => {
  const store: Record<string, unknown> = {};
  const local = {
    get: vi.fn(async (key: string) => ({ [key]: store[key] })),
    set: vi.fn(async (obj: Record<string, unknown>) => {
      Object.assign(store, obj);
    }),
    remove: vi.fn(async (key: string) => {
      delete store[key];
    }),
  };
  (globalThis as unknown as { chrome: unknown }).chrome = { storage: { local } };
  return { store, local };
};
