import { beforeEach, describe, expect, it, vi } from "vitest";
import { googleClient } from "@/shared/api/google";
import { GOOGLE_API_ORIGIN, OAUTH_REVOKE } from "@/shared/config";
import { stubFetch } from "@/shared/lib/testHelpers";
import { installAuthInterceptor } from "./authInterceptor";
import { authRepo } from "./authRepo";

const DRIVE_URL = `${GOOGLE_API_ORIGIN}/drive/v3/files`;

beforeEach(() => {
  installAuthInterceptor();
  vi.spyOn(authRepo, "getToken").mockResolvedValue("FRESH");
  vi.spyOn(authRepo, "invalidateToken").mockResolvedValue(undefined);
});

describe("request interceptor", () => {
  it("injects a silent Bearer token on googleapis requests", async () => {
    let auth: string | null = null;
    stubFetch((request) => {
      auth = request.headers.get("Authorization");
      return new Response("{}", { status: 200 });
    });
    await googleClient.get(DRIVE_URL);
    expect(authRepo.getToken).toHaveBeenCalledWith(false);
    expect(auth).toBe("Bearer FRESH");
  });

  it("does not attach a token to the revoke endpoint", async () => {
    let auth: string | null = null;
    stubFetch((request) => {
      auth = request.headers.get("Authorization");
      return new Response("{}", { status: 200 });
    });
    await googleClient.post(`${OAUTH_REVOKE}?token=x`);
    expect(authRepo.getToken).not.toHaveBeenCalled();
    expect(auth).toBeNull();
  });
});

describe("response interceptor (401)", () => {
  it("invalidates the stale token and retries once on 401", async () => {
    let calls = 0;
    stubFetch(() => {
      calls += 1;
      return calls === 1
        ? new Response("{}", { status: 401 })
        : new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    const res = await googleClient.get(DRIVE_URL).json<{ ok: boolean }>();
    expect(calls).toBe(2);
    expect(authRepo.invalidateToken).toHaveBeenCalledWith("FRESH");
    expect(res).toEqual({ ok: true });
  });

  it("gives up after one retry on a persistent 401", async () => {
    stubFetch(() => new Response("{}", { status: 401 }));
    await expect(googleClient.get(DRIVE_URL)).rejects.toMatchObject({ response: { status: 401 } });
    expect(authRepo.invalidateToken).toHaveBeenCalledTimes(1);
  });
});
