export const DRIVE_ID = /^[A-Za-z0-9_-]{10,200}$/;
export type DriveFolder = { id: string; resourceKey?: string };
export type ChoreoVideo = {
  id: string;
  name: string;
  folder: string;
  resourceKey?: string;
  duration?: string;
};

export function parseDriveFolder(value: string): DriveFolder {
  if (DRIVE_ID.test(value)) return { id: value };
  const url = new URL(value);
  const id = url.pathname.match(/\/folders\/([A-Za-z0-9_-]+)\/?$/)?.[1];
  const resourceKey = url.searchParams.get("resourcekey") ?? undefined;
  if (
    url.protocol !== "https:" ||
    url.hostname !== "drive.google.com" ||
    url.port ||
    url.username ||
    url.password ||
    !id ||
    !DRIVE_ID.test(id) ||
    (resourceKey && !/^[A-Za-z0-9_-]{1,200}$/.test(resourceKey))
  ) {
    throw new Error("Use a Google Drive folder link.");
  }
  return { id, resourceKey };
}
export function driveUrl(file: DriveFolder, folder = false, preview = false) {
  const url = new URL(
    folder
      ? `https://drive.google.com/drive/folders/${file.id}`
      : `https://drive.google.com/file/d/${file.id}/${preview ? "preview" : "view"}`,
  );
  if (file.resourceKey) url.searchParams.set("resourcekey", file.resourceKey);
  return url.href;
}

// Team folder explicitly provided by the owner; credentials and permissions stay server-side.
export const TEAM_CHOREO_FOLDER = "15bcUJZX8TSnMAd3xqt2I_4RhlAQwQstZ";
