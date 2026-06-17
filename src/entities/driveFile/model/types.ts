// A Drive file as the app cares about it. headRevisionId drives the conflict
// guard; modifiedTime is shown in the panel.
export interface DriveFile {
  id: string;
  name: string;
  modifiedTime: string;
  headRevisionId: string;
}
