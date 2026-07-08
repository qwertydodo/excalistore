import { googleClient } from "@/shared/api";
import { OAUTH_REVOKE } from "@/shared/config";

// Auth lives entirely in this slice. The OAuth token never leaves the
// background worker. getToken uses Chrome's signed-in account (no client
// secret); revoke/removeCachedAuthToken are the disconnect path.

// Thrown when chrome.identity returns no token (and lastError carries no
// message). The router classifies this message as an UNAUTHORIZED response.
export const NO_AUTH_TOKEN_MESSAGE = "no auth token";

// Chrome's own denial message when the user cancels the OAuth consent
// screen is literally "The user did not approve access." — technically
// accurate but reads like a bug report rather than an expected choice.
export const ACCESS_NOT_APPROVED_MESSAGE =
  "Approve access to Google Drive to use Excalistore's features.";

// Rewrites known chrome.identity raw messages into user-facing copy; unknown
// messages pass through unchanged. Add a case here for each new raw message
// worth rewriting rather than inlining another regex check at the call site.
const toFriendlyAuthMessage = (rawMessage: string): string => {
  if (/did not approve access/i.test(rawMessage)) {
    return ACCESS_NOT_APPROVED_MESSAGE;
  }
  return rawMessage;
};

// Best-effort revoke timeout: a callback/network that never fires must not
// hang sign-out, so we resolve after this regardless.
const SIGN_OUT_FALLBACK_MS = 3_000;

let inflightSilent: Promise<string> | null = null;

const requestToken = (isInteractive: boolean): Promise<string> =>
  new Promise<string>((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive: isInteractive }, (result) => {
      const err = chrome.runtime.lastError;
      // Chrome's runtime returns a bare string token in current builds, while
      // @types/chrome types it as { token }. Accept either shape.
      const raw = result as unknown as string | { token?: string } | undefined;
      const token = typeof raw === "string" ? raw : raw?.token;
      if (err || !token) {
        reject(new Error(toFriendlyAuthMessage(err?.message ?? NO_AUTH_TOKEN_MESSAGE)));
        return;
      }
      resolve(token);
    });
  });

const revokeToken = (token: string): Promise<void> =>
  googleClient.post(`${OAUTH_REVOKE}?token=${token}`).then(() => undefined);

export const authRepo = {
  // No in-memory token cache on purpose: the MV3 worker is ephemeral (killed
  // when idle), so any cache would die anyway, and Chrome already caches +
  // refreshes the token. We only dedupe concurrent *silent* refreshes, since
  // the gateway interceptor calls getToken on every Drive request.
  getToken: (isInteractive: boolean): Promise<string> => {
    if (!isInteractive && inflightSilent) return inflightSilent;
    const p = requestToken(isInteractive);
    if (!isInteractive) {
      inflightSilent = p;
      p.finally(() => {
        inflightSilent = null;
      });
    }
    return p;
  },

  // Drop Chrome's cached copy so the next getToken fetches a fresh token.
  // Used by the 401 response interceptor and by signOut.
  invalidateToken: (token: string): Promise<void> =>
    new Promise((resolve) => {
      chrome.identity.removeCachedAuthToken({ token }, () => resolve());
    }),

  revokeToken,

  signOut: (token: string): Promise<void> =>
    new Promise((resolve) => {
      let isSettled = false;
      const done = () => {
        if (isSettled) return;
        isSettled = true;
        resolve();
      };
      const fallback = setTimeout(done, SIGN_OUT_FALLBACK_MS);
      chrome.identity.removeCachedAuthToken({ token }, () => {
        // Best-effort revoke; resolve regardless so sign-out always completes.
        authRepo
          .revokeToken(token)
          .catch(() => undefined)
          .finally(() => {
            clearTimeout(fallback);
            done();
          });
      });
    }),
};
