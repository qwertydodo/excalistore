import type { DiagramContent } from "@/shared/api";
import type { DriveFile } from "@/shared/api/google";
import {
  createFile,
  getContent,
  getMeta,
  listFolder,
  renameFile,
  trashFile,
  updateFile,
} from "@/shared/api/google";

export type DriveService = {
  list: (token: string, folderId: string) => Promise<DriveFile[]>;
  get: (token: string, id: string) => Promise<DiagramContent>;
  create: (token: string, name: string, folderId: string, content: string) => Promise<DriveFile>;
  update: (token: string, id: string, content: string, prevRevision: string) => Promise<DriveFile>;
  rename: (token: string, id: string, name: string) => Promise<DriveFile>;
  trash: (token: string, id: string) => Promise<void>;
};

export const createDriveService = (): DriveService => ({
  list: listFolder,

  get: async (token, id) => {
    const [meta, content] = await Promise.all([getMeta(token, id), getContent(token, id)]);
    return { meta, content };
  },

  create: createFile,
  update: updateFile,
  rename: renameFile,
  trash: trashFile,
});
