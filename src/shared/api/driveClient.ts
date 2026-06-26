import { DIAGRAM_MIME, DRIVE_API, DRIVE_UPLOAD, FOLDER_MIME } from "@/shared/config";
import type { DriveFile } from "./driveFile";

// fetch is injected so the client stays pure and unit-testable.
type Fetch = typeof fetch;

const FIELDS = "id,name,modifiedTime,headRevisionId";

const authHeaders = (token: string): Record<string, string> => {
  return { Authorization: `Bearer ${token}` };
};

// Drive query strings wrap values in single quotes; escape backslash first,
// then the quote, so a value can't break out of the quoted literal.
const escapeQueryValue = (value: string): string => {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
};

// Abort any Drive request that stalls past this, so the autosave/save pipeline
// can't wedge on a hung connection.
const REQUEST_TIMEOUT_MS = 15_000;

const timed = (init: RequestInit = {}): RequestInit => {
  return { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) };
};

// Carries the HTTP status so the gateway can classify auth failures (401/403)
// without string-matching the message.
export class DriveError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "DriveError";
    this.status = status;
  }
}

const asJson = async <T>(res: Response): Promise<T> => {
  if (!res.ok) throw new DriveError(res.status, `Drive request failed: ${res.status}`);
  return (await res.json()) as T;
};

export const listFolder = async (
  token: string,
  folderId: string,
  f: Fetch = fetch,
): Promise<DriveFile[]> => {
  const q = encodeURIComponent(
    `'${escapeQueryValue(folderId)}' in parents and trashed=false`,
  ).replace(/%20/g, "+");
  const out: DriveFile[] = [];
  let pageToken: string | undefined;
  do {
    const page = pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : "";
    const url = `${DRIVE_API}/files?q=${q}&fields=nextPageToken,files(${FIELDS})&orderBy=modifiedTime desc&pageSize=1000${page}`;
    const data = await asJson<{ files?: DriveFile[]; nextPageToken?: string }>(
      await f(url, timed({ headers: authHeaders(token) })),
    );
    out.push(...(data.files ?? []));
    pageToken = data.nextPageToken;
  } while (pageToken);
  return out;
};

export const getMeta = async (token: string, id: string, f: Fetch = fetch): Promise<DriveFile> => {
  const url = `${DRIVE_API}/files/${id}?fields=${FIELDS}`;
  return asJson<DriveFile>(await f(url, timed({ headers: authHeaders(token) })));
};

export const getContent = async (token: string, id: string, f: Fetch = fetch): Promise<string> => {
  const res = await f(`${DRIVE_API}/files/${id}?alt=media`, timed({ headers: authHeaders(token) }));
  if (!res.ok) throw new DriveError(res.status, `Drive content fetch failed: ${res.status}`);
  return res.text();
};

export const createFile = async (
  token: string,
  name: string,
  folderId: string,
  content: string,
  f: Fetch = fetch,
): Promise<DriveFile> => {
  const boundary = `es-${crypto.randomUUID()}`;
  const metadata = { name, parents: [folderId], mimeType: DIAGRAM_MIME };
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\nContent-Type: ${DIAGRAM_MIME}\r\n\r\n` +
    `${content}\r\n--${boundary}--`;
  const url = `${DRIVE_UPLOAD}/files?uploadType=multipart&fields=${FIELDS}`;
  const res = await f(
    url,
    timed({
      method: "POST",
      headers: {
        ...authHeaders(token),
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body,
    }),
  );
  return asJson<DriveFile>(res);
};

export const updateFile = async (
  token: string,
  id: string,
  content: string,
  prevRevision: string,
  f: Fetch = fetch,
): Promise<DriveFile> => {
  // Conflict guard: refuse to overwrite if remote moved since we loaded it.
  const current = await getMeta(token, id, f);
  if (current.headRevisionId !== prevRevision) {
    throw new Error("conflict: remote revision changed");
  }
  const url = `${DRIVE_UPLOAD}/files/${id}?uploadType=media&fields=${FIELDS}`;
  const res = await f(
    url,
    timed({
      method: "PATCH",
      headers: { ...authHeaders(token), "Content-Type": DIAGRAM_MIME },
      body: content,
    }),
  );
  return asJson<DriveFile>(res);
};

export const renameFile = async (
  token: string,
  id: string,
  name: string,
  f: Fetch = fetch,
): Promise<DriveFile> => {
  const url = `${DRIVE_API}/files/${id}?fields=${FIELDS}`;
  const res = await f(
    url,
    timed({
      method: "PATCH",
      headers: { ...authHeaders(token), "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    }),
  );
  return asJson<DriveFile>(res);
};

export const trashFile = async (token: string, id: string, f: Fetch = fetch): Promise<void> => {
  const url = `${DRIVE_API}/files/${id}`;
  const res = await f(
    url,
    timed({
      method: "PATCH",
      headers: { ...authHeaders(token), "Content-Type": "application/json" },
      body: JSON.stringify({ trashed: true }),
    }),
  );
  if (!res.ok) throw new DriveError(res.status, `Drive trash failed: ${res.status}`);
};

// Find an app-owned folder by exact name, or create it. Under drive.file the
// list only returns folders this app created, so this is idempotent per name.
export const findOrCreateFolder = async (
  token: string,
  name: string,
  f: Fetch = fetch,
): Promise<{ id: string; name: string }> => {
  const safe = escapeQueryValue(name);
  const q = encodeURIComponent(
    `mimeType='${FOLDER_MIME}' and name='${safe}' and trashed=false`,
  ).replace(/%20/g, "+");
  const listUrl = `${DRIVE_API}/files?q=${q}&fields=files(id,name)`;
  const listed = await asJson<{ files: Array<{ id: string; name: string }> }>(
    await f(listUrl, timed({ headers: authHeaders(token) })),
  );
  const existing = listed.files?.[0];
  if (existing) return { id: existing.id, name: existing.name };

  const created = await asJson<{ id: string; name: string }>(
    await f(
      `${DRIVE_API}/files?fields=id,name`,
      timed({
        method: "POST",
        headers: { ...authHeaders(token), "Content-Type": "application/json" },
        body: JSON.stringify({ name, mimeType: FOLDER_MIME }),
      }),
    ),
  );
  return { id: created.id, name: created.name };
};
