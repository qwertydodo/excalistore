import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getToken, signOut } from "./authClient";

const identity = {
  getAuthToken: vi.fn(),
  removeCachedAuthToken: vi.fn((_: unknown, cb: () => void) => cb()),
};

beforeEach(() => {
  (globalThis as unknown as { chrome: unknown }).chrome = { identity, runtime: {} };
  identity.getAuthToken.mockReset();
  identity.removeCachedAuthToken.mockClear();
});
afterEach(() => vi.restoreAllMocks());

describe("getToken", () => {
  it("resolves the token from chrome.identity", async () => {
    identity.getAuthToken.mockImplementation((_: unknown, cb: (r: { token?: string }) => void) =>
      cb({ token: "TOK" }),
    );
    await expect(getToken(true)).resolves.toBe("TOK");
    expect(identity.getAuthToken).toHaveBeenCalledWith({ interactive: true }, expect.any(Function));
  });

  it("resolves a bare string token (current Chrome runtime shape)", async () => {
    identity.getAuthToken.mockImplementation((_: unknown, cb: (r: unknown) => void) => cb("TOK"));
    await expect(getToken(true)).resolves.toBe("TOK");
  });

  it("rejects when no token returned", async () => {
    (
      globalThis as unknown as { chrome: { runtime: { lastError?: { message: string } } } }
    ).chrome.runtime.lastError = { message: "denied" };
    identity.getAuthToken.mockImplementation((_: unknown, cb: (r: { token?: string }) => void) =>
      cb({}),
    );
    await expect(getToken(true)).rejects.toThrow(/denied/);
  });

  it("dedupes concurrent non-interactive getToken calls", async () => {
    let calls = 0;
    identity.getAuthToken.mockImplementation((_: unknown, cb: (r: { token?: string }) => void) => {
      calls += 1;
      setTimeout(() => cb({ token: "TOK" }), 5);
    });
    const [a, b] = await Promise.all([getToken(false), getToken(false)]);
    expect(a).toBe("TOK");
    expect(b).toBe("TOK");
    expect(calls).toBe(1);
  });
});

describe("signOut", () => {
  it("removes the cached token and revokes it", async () => {
    const f = vi.fn(
      async (_url: RequestInfo | URL, _init?: RequestInit) => ({ ok: true }) as Response,
    );
    await signOut("TOK", f);
    expect(identity.removeCachedAuthToken).toHaveBeenCalledWith(
      { token: "TOK" },
      expect.any(Function),
    );
    expect(f.mock.calls[0]?.[0] as string).toContain("revoke?token=TOK");
  });
});
