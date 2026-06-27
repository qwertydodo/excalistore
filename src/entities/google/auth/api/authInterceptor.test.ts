import axios from "axios";
import MockAdapter from "axios-mock-adapter";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GOOGLE_API_ORIGIN, OAUTH_REVOKE } from "@/shared/config";
import { installAuthInterceptor } from "./authInterceptor";
import { authRepo } from "./authRepo";

const DRIVE_URL = `${GOOGLE_API_ORIGIN}/drive/v3/files`;

let client: ReturnType<typeof axios.create>;
let mock: MockAdapter;

beforeEach(() => {
  client = axios.create();
  mock = new MockAdapter(client);
  installAuthInterceptor(client);
  vi.spyOn(authRepo, "getToken").mockResolvedValue("FRESH");
  vi.spyOn(authRepo, "invalidateToken").mockResolvedValue(undefined);
});

describe("request interceptor", () => {
  it("injects a silent Bearer token on googleapis requests", async () => {
    let auth: unknown;
    mock.onGet(DRIVE_URL).reply((config) => {
      auth = config.headers?.Authorization;
      return [200, {}];
    });
    await client.get(DRIVE_URL);
    expect(authRepo.getToken).toHaveBeenCalledWith(false);
    expect(auth).toBe("Bearer FRESH");
  });

  it("does not attach a token to the revoke endpoint", async () => {
    let auth: unknown = "untouched";
    mock.onPost(new RegExp(OAUTH_REVOKE)).reply((config) => {
      auth = config.headers?.Authorization;
      return [200, {}];
    });
    await client.post(`${OAUTH_REVOKE}?token=x`);
    expect(authRepo.getToken).not.toHaveBeenCalled();
    expect(auth).toBeUndefined();
  });
});

describe("response interceptor (401)", () => {
  it("invalidates the stale token and retries once on 401", async () => {
    let calls = 0;
    mock.onGet(DRIVE_URL).reply(() => {
      calls += 1;
      return calls === 1 ? [401, {}] : [200, { ok: true }];
    });
    const res = await client.get(DRIVE_URL);
    expect(calls).toBe(2);
    expect(authRepo.invalidateToken).toHaveBeenCalledWith("FRESH");
    expect(res.data).toEqual({ ok: true });
  });

  it("gives up after one retry on a persistent 401", async () => {
    mock.onGet(DRIVE_URL).reply(401);
    await expect(client.get(DRIVE_URL)).rejects.toMatchObject({ response: { status: 401 } });
    expect(authRepo.invalidateToken).toHaveBeenCalledTimes(1);
  });
});
