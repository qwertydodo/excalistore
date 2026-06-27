import axios from "axios";
import type { DiagramContent } from "@/shared/api";
import { googleClient } from "@/shared/api/google";
import { DIAGRAM_MIME, DRIVE_API, DRIVE_UPLOAD, FOLDER_MIME } from "@/shared/config";
import { DriveError, type DriveFile } from "./driveFile";

const FIELDS = "id,name,modifiedTime,headRevisionId";

// Authorization is attached by the googleClient auth interceptor
// (installAuthInterceptor) — repo methods never handle the token themselves.

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

const toDriveError = (e: unknown): never => {
  if (axios.isAxiosError(e) && e.response) {
    throw new DriveError(e.response.status, `Drive request failed: ${e.response.status}`);
  }
  throw e;
};

export const driveRepo = {
  listFolder: async (folderId: string): Promise<DriveFile[]> => {
    const q = encodeURIComponent(
      `'${escapeQueryValue(folderId)}' in parents and trashed=false`,
    ).replace(/%20/g, "+");
    const out: DriveFile[] = [];
    let pageToken: string | undefined;
    do {
      const page = pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : "";
      const url = `${DRIVE_API}/files?q=${q}&fields=nextPageToken,files(${FIELDS})&orderBy=modifiedTime desc&pageSize=1000${page}`;
      const { data } = await googleClient
        .get<{ files?: DriveFile[]; nextPageToken?: string }>(url)
        .catch(toDriveError);
      out.push(...(data.files ?? []));
      pageToken = data.nextPageToken;
    } while (pageToken);
    return out;
  },

  getMeta: async (id: string): Promise<DriveFile> => {
    const { data } = await googleClient
      .get<DriveFile>(`${DRIVE_API}/files/${id}?fields=${FIELDS}`)
      .catch(toDriveError);
    return data;
  },

  getContent: async (id: string): Promise<string> => {
    const { data } = await googleClient
      .get<string>(`${DRIVE_API}/files/${id}?alt=media`, { responseType: "text" })
      .catch(toDriveError);
    return data;
  },

  // A diagram read needs both the metadata (for the conflict guard + name) and
  // the raw .excalidraw content, fetched in parallel.
  getDiagram: async (id: string): Promise<DiagramContent> => {
    const [meta, content] = await Promise.all([driveRepo.getMeta(id), driveRepo.getContent(id)]);
    return { meta, content };
  },

  createFile: async (name: string, folderId: string, content: string): Promise<DriveFile> => {
    const boundary = `es-${crypto.randomUUID()}`;
    const metadata = { name, parents: [folderId], mimeType: DIAGRAM_MIME };
    const body = buildMultipart(boundary, metadata, DIAGRAM_MIME, content);
    const { data } = await googleClient
      .post<DriveFile>(`${DRIVE_UPLOAD}/files?uploadType=multipart&fields=${FIELDS}`, body, {
        headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
      })
      .catch(toDriveError);
    return data;
  },

  updateFile: async (id: string, content: string, prevRevision: string): Promise<DriveFile> => {
    const current = await driveRepo.getMeta(id);
    if (current.headRevisionId !== prevRevision) {
      throw new Error("conflict: remote revision changed");
    }
    const { data } = await googleClient
      .patch<DriveFile>(`${DRIVE_UPLOAD}/files/${id}?uploadType=media&fields=${FIELDS}`, content, {
        headers: { "Content-Type": DIAGRAM_MIME },
      })
      .catch(toDriveError);
    return data;
  },

  renameFile: async (id: string, name: string): Promise<DriveFile> => {
    const { data } = await googleClient
      .patch<DriveFile>(`${DRIVE_API}/files/${id}?fields=${FIELDS}`, JSON.stringify({ name }), {
        headers: { "Content-Type": "application/json" },
      })
      .catch(toDriveError);
    return data;
  },

  trashFile: async (id: string): Promise<void> => {
    await googleClient
      .patch(`${DRIVE_API}/files/${id}`, JSON.stringify({ trashed: true }), {
        headers: { "Content-Type": "application/json" },
      })
      .catch(toDriveError);
  },

  findOrCreateFolder: async (name: string): Promise<{ id: string; name: string }> => {
    const safe = escapeQueryValue(name);
    const q = encodeURIComponent(
      `mimeType='${FOLDER_MIME}' and name='${safe}' and trashed=false`,
    ).replace(/%20/g, "+");
    const { data: listed } = await googleClient
      .get<{ files: Array<{ id: string; name: string }> }>(
        `${DRIVE_API}/files?q=${q}&fields=files(id,name)`,
      )
      .catch(toDriveError);
    const existing = listed.files?.[0];
    if (existing) return { id: existing.id, name: existing.name };

    const { data: created } = await googleClient
      .post<{ id: string; name: string }>(
        `${DRIVE_API}/files?fields=id,name`,
        JSON.stringify({ name, mimeType: FOLDER_MIME }),
        { headers: { "Content-Type": "application/json" } },
      )
      .catch(toDriveError);
    return { id: created.id, name: created.name };
  },
};

export type DriveRepo = typeof driveRepo;
