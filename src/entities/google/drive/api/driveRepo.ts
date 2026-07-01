import { HTTPError } from "ky";
import { type DiagramContent, googleClient } from "@/shared/api";
import { DIAGRAM_MIME, DRIVE_API, DRIVE_UPLOAD, FOLDER_MIME } from "@/shared/config";
import { DriveError, type DriveFile } from "./driveFile";

const FIELDS = "id,name,modifiedTime,headRevisionId";

// Authorization is attached by the googleClient auth interceptor
// (installAuthInterceptor) — repo methods never handle the token themselves.

// Single error boundary for the whole repo: map any HTTP failure to a
// DriveError (with status) so the gateway can classify it.
const driveRequest = async <T>(promise: Promise<T>): Promise<T> => {
  try {
    return await promise;
  } catch (e) {
    if (e instanceof HTTPError) {
      throw new DriveError(e.response.status, `Drive request failed: ${e.response.status}`);
    }
    throw e;
  }
};

// Escape the Drive query *language* (not URL encoding — ky's searchParams
// handle that): a literal value sits inside single quotes in a `q` string, so
// `\` and `'` must be backslash-escaped or a crafted name could break out of
// the quotes.
const escapeQueryValue = (value: string): string =>
  value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

const buildMultipart = (
  boundary: string,
  metadata: object,
  mimeType: string,
  content: string,
): string =>
  `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
  `${JSON.stringify(metadata)}\r\n` +
  `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n` +
  `${content}\r\n--${boundary}--`;

export const driveRepo = {
  listFolder: async (folderId: string): Promise<DriveFile[]> => {
    const out: DriveFile[] = [];
    let pageToken: string | undefined;
    do {
      const data = await driveRequest(
        googleClient
          .get(`${DRIVE_API}/files`, {
            searchParams: {
              q: `'${escapeQueryValue(folderId)}' in parents and trashed=false`,
              fields: `nextPageToken,files(${FIELDS})`,
              orderBy: "modifiedTime desc",
              pageSize: 1000,
              pageToken,
            },
          })
          .json<{ files?: DriveFile[]; nextPageToken?: string }>(),
      );
      out.push(...(data.files ?? []));
      pageToken = data.nextPageToken;
    } while (pageToken);
    return out;
  },

  getMeta: (id: string): Promise<DriveFile> =>
    driveRequest(
      googleClient
        .get(`${DRIVE_API}/files/${id}`, { searchParams: { fields: FIELDS } })
        .json<DriveFile>(),
    ),

  getContent: (id: string): Promise<string> =>
    driveRequest(
      googleClient.get(`${DRIVE_API}/files/${id}`, { searchParams: { alt: "media" } }).text(),
    ),

  // A diagram read needs both the metadata (for the conflict guard + name) and
  // the raw .excalidraw content, fetched in parallel.
  getDiagram: async (id: string): Promise<DiagramContent> => {
    const [meta, content] = await Promise.all([driveRepo.getMeta(id), driveRepo.getContent(id)]);
    return { meta, content };
  },

  createFile: (name: string, folderId: string, content: string): Promise<DriveFile> => {
    const boundary = `es-${crypto.randomUUID()}`;
    const metadata = { name, parents: [folderId], mimeType: DIAGRAM_MIME };
    const body = buildMultipart(boundary, metadata, DIAGRAM_MIME, content);
    return driveRequest(
      googleClient
        .post(`${DRIVE_UPLOAD}/files`, {
          searchParams: { uploadType: "multipart", fields: FIELDS },
          headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
          body,
        })
        .json<DriveFile>(),
    );
  },

  updateFile: async (id: string, content: string, prevRevision: string): Promise<DriveFile> => {
    const current = await driveRepo.getMeta(id);
    if (current.headRevisionId !== prevRevision) {
      throw new Error("conflict: remote revision changed");
    }
    return driveRequest(
      googleClient
        .patch(`${DRIVE_UPLOAD}/files/${id}`, {
          searchParams: { uploadType: "media", fields: FIELDS },
          headers: { "Content-Type": DIAGRAM_MIME },
          body: content,
        })
        .json<DriveFile>(),
    );
  },

  renameFile: (id: string, name: string): Promise<DriveFile> =>
    driveRequest(
      googleClient
        .patch(`${DRIVE_API}/files/${id}`, {
          searchParams: { fields: FIELDS },
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        })
        .json<DriveFile>(),
    ),

  trashFile: async (id: string): Promise<void> => {
    await driveRequest(
      googleClient.patch(`${DRIVE_API}/files/${id}`, {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trashed: true }),
      }),
    );
  },

  findOrCreateFolder: async (name: string): Promise<{ id: string; name: string }> => {
    const listed = await driveRequest(
      googleClient
        .get(`${DRIVE_API}/files`, {
          searchParams: {
            q: `mimeType='${FOLDER_MIME}' and name='${escapeQueryValue(name)}' and trashed=false`,
            fields: "files(id,name)",
          },
        })
        .json<{ files: Array<{ id: string; name: string }> }>(),
    );
    const existing = listed.files?.[0];
    if (existing) return { id: existing.id, name: existing.name };

    const created = await driveRequest(
      googleClient
        .post(`${DRIVE_API}/files`, {
          searchParams: { fields: "id,name" },
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, mimeType: FOLDER_MIME }),
        })
        .json<{ id: string; name: string }>(),
    );
    return { id: created.id, name: created.name };
  },
};

export type DriveRepo = typeof driveRepo;
