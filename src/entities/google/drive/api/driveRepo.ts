import axios, { type AxiosResponse } from "axios";
import type { DiagramContent } from "@/shared/api";
import { googleClient } from "@/shared/api/google";
import { DIAGRAM_MIME, DRIVE_API, DRIVE_UPLOAD, FOLDER_MIME } from "@/shared/config";
import { DriveError, type DriveFile } from "./driveFile";

const FIELDS = "id,name,modifiedTime,headRevisionId";

// Authorization is attached by the googleClient auth interceptor
// (installAuthInterceptor) — repo methods never handle the token themselves.

// Single error boundary for the whole repo: unwrap the axios response and map
// any HTTP failure to a DriveError (with status) so the gateway can classify it.
const driveRequest = async <T>(call: Promise<AxiosResponse<T>>): Promise<T> => {
  try {
    return (await call).data;
  } catch (e) {
    if (axios.isAxiosError(e) && e.response) {
      throw new DriveError(e.response.status, `Drive request failed: ${e.response.status}`);
    }
    throw e;
  }
};

// Escape the Drive query *language* (not URL encoding — axios params handle
// that): a literal value sits inside single quotes in a `q` string, so `\` and
// `'` must be backslash-escaped or a crafted name could break out of the quotes.
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
        googleClient.get<{ files?: DriveFile[]; nextPageToken?: string }>(`${DRIVE_API}/files`, {
          params: {
            q: `'${escapeQueryValue(folderId)}' in parents and trashed=false`,
            fields: `nextPageToken,files(${FIELDS})`,
            orderBy: "modifiedTime desc",
            pageSize: 1000,
            pageToken,
          },
        }),
      );
      out.push(...(data.files ?? []));
      pageToken = data.nextPageToken;
    } while (pageToken);
    return out;
  },

  getMeta: (id: string): Promise<DriveFile> =>
    driveRequest(
      googleClient.get<DriveFile>(`${DRIVE_API}/files/${id}`, { params: { fields: FIELDS } }),
    ),

  getContent: (id: string): Promise<string> =>
    driveRequest(
      googleClient.get<string>(`${DRIVE_API}/files/${id}`, {
        params: { alt: "media" },
        responseType: "text",
      }),
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
      googleClient.post<DriveFile>(`${DRIVE_UPLOAD}/files`, body, {
        params: { uploadType: "multipart", fields: FIELDS },
        headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
      }),
    );
  },

  updateFile: async (id: string, content: string, prevRevision: string): Promise<DriveFile> => {
    const current = await driveRepo.getMeta(id);
    if (current.headRevisionId !== prevRevision) {
      throw new Error("conflict: remote revision changed");
    }
    return driveRequest(
      googleClient.patch<DriveFile>(`${DRIVE_UPLOAD}/files/${id}`, content, {
        params: { uploadType: "media", fields: FIELDS },
        headers: { "Content-Type": DIAGRAM_MIME },
      }),
    );
  },

  renameFile: (id: string, name: string): Promise<DriveFile> =>
    driveRequest(
      googleClient.patch<DriveFile>(`${DRIVE_API}/files/${id}`, JSON.stringify({ name }), {
        params: { fields: FIELDS },
        headers: { "Content-Type": "application/json" },
      }),
    ),

  trashFile: async (id: string): Promise<void> => {
    await driveRequest(
      googleClient.patch(`${DRIVE_API}/files/${id}`, JSON.stringify({ trashed: true }), {
        headers: { "Content-Type": "application/json" },
      }),
    );
  },

  findOrCreateFolder: async (name: string): Promise<{ id: string; name: string }> => {
    const listed = await driveRequest(
      googleClient.get<{ files: Array<{ id: string; name: string }> }>(`${DRIVE_API}/files`, {
        params: {
          q: `mimeType='${FOLDER_MIME}' and name='${escapeQueryValue(name)}' and trashed=false`,
          fields: "files(id,name)",
        },
      }),
    );
    const existing = listed.files?.[0];
    if (existing) return { id: existing.id, name: existing.name };

    const created = await driveRequest(
      googleClient.post<{ id: string; name: string }>(
        `${DRIVE_API}/files`,
        JSON.stringify({ name, mimeType: FOLDER_MIME }),
        { params: { fields: "id,name" }, headers: { "Content-Type": "application/json" } },
      ),
    );
    return { id: created.id, name: created.name };
  },
};

export type DriveRepo = typeof driveRepo;
