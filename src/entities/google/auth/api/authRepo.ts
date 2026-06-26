import { googleClient } from "@/shared/api/google";
import { OAUTH_REVOKE } from "@/shared/config";

export const authRepo = {
  revokeToken: (token: string): Promise<void> =>
    googleClient.post(`${OAUTH_REVOKE}?token=${token}`).then(() => undefined),
};
