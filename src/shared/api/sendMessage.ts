import { isErrorResponse, type Request, type Response } from "./messages";

// Thin typed wrapper around chrome.runtime.sendMessage used by popup + content
// script. Throws on error responses so callers use try/catch.
export async function sendToBackground<T>(request: Request): Promise<T> {
  const res = (await chrome.runtime.sendMessage(request)) as Response<T>;
  if (isErrorResponse(res)) throw new Error(res.error);
  return res.data;
}
