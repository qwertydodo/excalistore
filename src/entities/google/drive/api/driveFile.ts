export type DriveFile = {
  id: string;
  name: string;
  modifiedTime: string;
  headRevisionId: string;
};

export class DriveError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "DriveError";
    this.status = status;
  }
}
