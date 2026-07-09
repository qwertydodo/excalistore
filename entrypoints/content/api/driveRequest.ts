import { ERROR_CODE, type Request, RequestError, sendToBackground } from "@/features/driveGateway";
import { useAuthStore } from "../model/stores/authStore";

// The content script's 401 middleware — the analog of a web app's auth
// interceptor. Every Drive call goes through here so "token no longer valid"
// flips the panel to disconnected in exactly one place, instead of each
// caller threading an onUnauthorized callback. Not a store, so importing
// authStore here doesn't breach the stores-never-import-authStore rule.
// authStore's own calls stay on raw sendToBackground (they ARE the auth flow).
export const sendDriveRequest = async <T>(request: Request): Promise<T> => {
  try {
    return await sendToBackground<T>(request);
  } catch (e) {
    if (e instanceof RequestError && e.code === ERROR_CODE.UNAUTHORIZED) {
      useAuthStore.getState().markDisconnected();
    }
    throw e;
  }
};
