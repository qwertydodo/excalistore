// Central Google API surface constants. The OAuth client id is injected via
// the manifest; these URLs/scopes are used by the client AND by wxt.config.ts
// (host_permissions/oauth2.scopes), so this file is the single source of truth
// for every googleapis.com URL in the project.
export const GOOGLE_API_ORIGIN = "https://www.googleapis.com";
export const DRIVE_API = `${GOOGLE_API_ORIGIN}/drive/v3`;
export const DRIVE_UPLOAD = `${GOOGLE_API_ORIGIN}/upload/drive/v3`;
export const DRIVE_FILE_SCOPE = `${GOOGLE_API_ORIGIN}/auth/drive.file`;
export const OAUTH_REVOKE = "https://oauth2.googleapis.com/revoke";
// Google Drive's folder MIME type.
export const FOLDER_MIME = "application/vnd.google-apps.folder";
