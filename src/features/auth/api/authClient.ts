import { OAUTH_REVOKE } from "@/shared/config";

type Fetch = typeof fetch;

// Token never leaves the background worker. getAuthToken uses Chrome's signed-in
// account — no client secret. lastError is checked to surface user denial.
let inflightSilent: Promise<string> | null = null;

export function getToken(interactive: boolean): Promise<string> {
  // Dedupe concurrent silent refreshes — gateway messages each call getToken.
  if (!interactive && inflightSilent) return inflightSilent;
  const p = new Promise<string>((resolve, reject) => {
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
  if (!interactive) {
    inflightSilent = p;
    void p.finally(() => {
      inflightSilent = null;
    });
  }
  return p;
}

export function signOut(token: string, f: Fetch = fetch): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    // Fallback so a callback/network that never fires can't hang sign-out.
    const fallback = setTimeout(done, 3_000);
    chrome.identity.removeCachedAuthToken({ token }, () => {
      // Best-effort revoke; resolve regardless so sign-out always completes.
      void f(`${OAUTH_REVOKE}?token=${token}`, { method: "POST" })
        .catch(() => undefined)
        .finally(() => {
          clearTimeout(fallback);
          done();
        });
    });
  });
}
