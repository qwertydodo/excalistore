import type { Request, Response } from "@/shared/api";
import { dispatch } from "./router";
import { createAuthService } from "./services/authService";
import { createDriveService } from "./services/driveService";

export const handleMessage = (req: Request): Promise<Response<unknown>> =>
  dispatch(req, { auth: createAuthService(), drive: createDriveService() });
