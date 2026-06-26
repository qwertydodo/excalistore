import { type DriveFile, driveRepo } from "@/entities/google/drive";
import type { DiagramContent } from "@/shared/api";

export type DriveService = {
  list: (token: string, folderId: string) => Promise<DriveFile[]>;
  get: (token: string, id: string) => Promise<DiagramContent>;
  create: (token: string, name: string, folderId: string, content: string) => Promise<DriveFile>;
  update: (token: string, id: string, content: string, prevRevision: string) => Promise<DriveFile>;
  rename: (token: string, id: string, name: string) => Promise<DriveFile>;
  trash: (token: string, id: string) => Promise<void>;
};

export const createDriveService = (): DriveService => ({
  list: driveRepo.listFolder,

  get: async (token, id) => {
    const [meta, content] = await Promise.all([
      driveRepo.getMeta(token, id),
      driveRepo.getContent(token, id),
    ]);
    return { meta, content };
  },

  create: driveRepo.createFile,
  update: driveRepo.updateFile,
  rename: driveRepo.renameFile,
  trash: driveRepo.trashFile,
});
