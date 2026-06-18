import { OAUTH_REVOKE } from "@/shared/config";

type Fetch = typeof fetch;

// Token never leaves the background worker. getAuthToken uses Chrome's signed-in
// account — no client secret. lastError is checked to surface user denial.
export function getToken(interactive: boolean): Promise<string> {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive }, (result) => {
      const err = chrome.runtime.lastError;
      // Chrome's runtime returns a bare string token in current builds, while
      // @types/chrome types it as { token }. Accept either shape.
      const raw = result as unknown as string | { token?: string } | undefined;
      const token = typeof raw === "string" ? raw : raw?.token;
      if (err || !token) {
        reject(new Error(err?.message ?? "no auth token"));
        return;
      }
      resolve(token);
    });
  });
}

export function signOut(token: string, f: Fetch = fetch): Promise<void> {
  return new Promise((resolve) => {
    chrome.identity.removeCachedAuthToken({ token }, () => {
      // Best-effort revoke; resolve regardless so sign-out always completes.
      void f(`${OAUTH_REVOKE}?token=${token}`, { method: "POST" })
        .catch(() => undefined)
        .finally(resolve);
    });
  });
}
