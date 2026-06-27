import type { AxiosInstance, InternalAxiosRequestConfig } from "axios";
import { googleClient } from "@/shared/api/google";
import { GOOGLE_API_ORIGIN } from "@/shared/config";
import { authRepo } from "./authRepo";

// Only Drive REST calls (www.googleapis.com) get the Bearer token. The OAuth
// revoke endpoint lives on a different host (oauth2.googleapis.com) and takes
// the token as a query param, so it must NOT receive an Authorization header.
const isGoogleApiUrl = (url: string | undefined): boolean =>
  url?.startsWith(GOOGLE_API_ORIGIN) ?? false;

// Marks a request already retried once after a 401, so a persistently
// unauthorized request can't loop forever.
type RetriableConfig = InternalAxiosRequestConfig & { isRetried?: boolean };

const bearerToken = (config: InternalAxiosRequestConfig): string | undefined => {
  const header = config.headers.get("Authorization");
  return typeof header === "string" ? header.replace(/^Bearer /, "") : undefined;
};

/**
 * Wire auth into the shared googleClient. Defined here (entities → shared is
 * legal) but invoked once from the background composition root — the single
 * place that performs this side effect. Keeps googleClient a dumb transport
 * singleton that knows nothing about auth.
 */
export const installAuthInterceptor = (client: AxiosInstance = googleClient): void => {
  client.interceptors.request.use(async (config) => {
    if (isGoogleApiUrl(config.url)) {
      const token = await authRepo.getToken(false);
      config.headers.set("Authorization", `Bearer ${token}`);
    }
    return config;
  });

  client.interceptors.response.use(undefined, async (error) => {
    const config = error.config as RetriableConfig | undefined;
    const status = error.response?.status;
    if (status === 401 && config && !config.isRetried && isGoogleApiUrl(config.url)) {
      config.isRetried = true;
      // The token Chrome handed us is stale/expired — drop it so the request
      // interceptor fetches a fresh one on retry.
      const stale = bearerToken(config);
      if (stale) await authRepo.invalidateToken(stale);
      return client.request(config);
    }
    return Promise.reject(error);
  });
};
