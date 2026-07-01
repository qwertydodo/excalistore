import type { AfterResponseHook, BeforeRequestHook } from "ky";
import { googleClient, setAuthHooks } from "@/shared/api/google";
import { GOOGLE_API_ORIGIN } from "@/shared/config";
import { authRepo } from "./authRepo";

// Only Drive REST calls (www.googleapis.com) get the Bearer token. The OAuth
// revoke endpoint lives on a different host (oauth2.googleapis.com) and takes
// the token as a query param, so it must NOT receive an Authorization header.
const isGoogleApiUrl = (url: string): boolean => url.startsWith(GOOGLE_API_ORIGIN);

const bearerToken = (request: Request): string | undefined => {
  const header = request.headers.get("Authorization");
  return header?.replace(/^Bearer /, "");
};

const beforeRequest: BeforeRequestHook = async ({ request }) => {
  if (isGoogleApiUrl(request.url)) {
    const token = await authRepo.getToken(false);
    request.headers.set("Authorization", `Bearer ${token}`);
  }
};

// Retries a request exactly once after a 401 — `retryCount === 0` is the same
// one-shot guard the old `isRetried` flag gave us. `beforeRequest` hooks don't
// re-run on ky retries, so the fresh token is attached here before retrying.
const afterResponse: AfterResponseHook = async ({ request, response, retryCount }) => {
  if (retryCount > 0 || response.status !== 401 || !isGoogleApiUrl(request.url)) return;
  const stale = bearerToken(request);
  if (stale) await authRepo.invalidateToken(stale);
  const fresh = await authRepo.getToken(false);
  const headers = new Headers(request.headers);
  headers.set("Authorization", `Bearer ${fresh}`);
  return googleClient.retry({ request: new Request(request, { headers }) });
};

/**
 * Wire auth into the shared googleClient. Defined here (entities → shared is
 * legal) but invoked once from the background composition root — the single
 * place that performs this side effect. Keeps googleClient a dumb transport
 * singleton that knows nothing about auth.
 */
export const installAuthInterceptor = (): void => {
  setAuthHooks({ beforeRequest, afterResponse });
};
