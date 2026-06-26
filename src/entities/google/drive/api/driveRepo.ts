import axios from "axios";
import { googleClient } from "@/shared/api/google";
import { DIAGRAM_MIME, DRIVE_API, DRIVE_UPLOAD, FOLDER_MIME } from "@/shared/config";
import { DriveError, type DriveFile } from "./driveFile";

const FIELDS = "id,name,modifiedTime,headRevisionId";

const authHeader = (token: string): Record<string, string> => ({
  Authorization: `Bearer ${token}`,
});

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

const listFolderImpl = async (token: string, folderId: string): Promise<DriveFile[]> => {
  const q = encodeURIComponent(
    `'${escapeQueryValue(folderId)}' in parents and trashed=false`,
  ).replace(/%20/g, "+");
  const out: DriveFile[] = [];
  let pageToken: string | undefined;
  do {
    const page = pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : "";
    const url = `${DRIVE_API}/files?q=${q}&fields=nextPageToken,files(${FIELDS})&orderBy=modifiedTime desc&pageSize=1000${page}`;
    const { data } = await googleClient
      .get<{ files?: DriveFile[]; nextPageToken?: string }>(url, {
        headers: authHeader(token),
      })
      .catch(toDriveError);
    out.push(...(data.files ?? []));
    pageToken = data.nextPageToken;
  } while (pageToken);
  return out;
};

const getMetaImpl = async (token: string, id: string): Promise<DriveFile> => {
  const { data } = await googleClient
    .get<DriveFile>(`${DRIVE_API}/files/${id}?fields=${FIELDS}`, {
      headers: authHeader(token),
    })
    .catch(toDriveError);
  return data;
};

const getContentImpl = async (token: string, id: string): Promise<string> => {
  const { data } = await googleClient
    .get<string>(`${DRIVE_API}/files/${id}?alt=media`, {
      headers: authHeader(token),
      responseType: "text",
    })
    .catch(toDriveError);
  return data;
};

const createFileImpl = async (
  token: string,
  name: string,
  folderId: string,
  content: string,
): Promise<DriveFile> => {
  const boundary = `es-${crypto.randomUUID()}`;
  const metadata = { name, parents: [folderId], mimeType: DIAGRAM_MIME };
  const body = buildMultipart(boundary, metadata, DIAGRAM_MIME, content);
  const { data } = await googleClient
    .post<DriveFile>(`${DRIVE_UPLOAD}/files?uploadType=multipart&fields=${FIELDS}`, body, {
      headers: {
        ...authHeader(token),
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
    })
    .catch(toDriveError);
  return data;
};

const updateFileImpl = async (
  token: string,
  id: string,
  content: string,
  prevRevision: string,
): Promise<DriveFile> => {
  const current = await getMetaImpl(token, id);
  if (current.headRevisionId !== prevRevision) {
    throw new Error("conflict: remote revision changed");
  }
  const { data } = await googleClient
    .patch<DriveFile>(`${DRIVE_UPLOAD}/files/${id}?uploadType=media&fields=${FIELDS}`, content, {
      headers: { ...authHeader(token), "Content-Type": DIAGRAM_MIME },
    })
    .catch(toDriveError);
  return data;
};

const renameFileImpl = async (token: string, id: string, name: string): Promise<DriveFile> => {
  const { data } = await googleClient
    .patch<DriveFile>(`${DRIVE_API}/files/${id}?fields=${FIELDS}`, JSON.stringify({ name }), {
      headers: { ...authHeader(token), "Content-Type": "application/json" },
    })
    .catch(toDriveError);
  return data;
};

const trashFileImpl = async (token: string, id: string): Promise<void> => {
  await googleClient
    .patch(`${DRIVE_API}/files/${id}`, JSON.stringify({ trashed: true }), {
      headers: { ...authHeader(token), "Content-Type": "application/json" },
    })
    .catch(toDriveError);
};

const findOrCreateFolderImpl = async (
  token: string,
  name: string,
): Promise<{ id: string; name: string }> => {
  const safe = escapeQueryValue(name);
  const q = encodeURIComponent(
    `mimeType='${FOLDER_MIME}' and name='${safe}' and trashed=false`,
  ).replace(/%20/g, "+");
  const { data: listed } = await googleClient
    .get<{ files: Array<{ id: string; name: string }> }>(
      `${DRIVE_API}/files?q=${q}&fields=files(id,name)`,
      { headers: authHeader(token) },
    )
    .catch(toDriveError);
  const existing = listed.files?.[0];
  if (existing) return { id: existing.id, name: existing.name };

  const { data: created } = await googleClient
    .post<{ id: string; name: string }>(
      `${DRIVE_API}/files?fields=id,name`,
      JSON.stringify({ name, mimeType: FOLDER_MIME }),
      { headers: { ...authHeader(token), "Content-Type": "application/json" } },
    )
    .catch(toDriveError);
  return { id: created.id, name: created.name };
};

export const driveRepo = {
  listFolder: listFolderImpl,
  getMeta: getMetaImpl,
  getContent: getContentImpl,
  createFile: createFileImpl,
  updateFile: updateFileImpl,
  renameFile: renameFileImpl,
  trashFile: trashFileImpl,
  findOrCreateFolder: findOrCreateFolderImpl,
};
