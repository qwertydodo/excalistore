import { type Err, isErrorResponse, type Request, type Response } from "./messages";

type ErrCode = NonNullable<Err["code"]>;

// Carries the gateway's error code so callers can branch on conflict /
// unauthorized / unknown without string-matching the message.
export class RequestError extends Error {
  readonly code: ErrCode;
  constructor(message: string, code: ErrCode) {
    super(message);
    this.name = "RequestError";
    this.code = code;
  }
}

// Thin typed wrapper around chrome.runtime.sendMessage used by popup + content
// script. Throws RequestError on error responses so callers use try/catch.
export async function sendToBackground<T>(request: Request): Promise<T> {
  const res = (await chrome.runtime.sendMessage(request)) as Response<T>;
  if (isErrorResponse(res)) throw new RequestError(res.error, res.code ?? "unknown");
  return res.data;
}
