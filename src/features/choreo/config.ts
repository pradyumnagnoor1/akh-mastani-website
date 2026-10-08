import "server-only";
import {
  parseDriveFolder,
  TEAM_CHOREO_FOLDER,
  type DriveFolder,
} from "./policy";
export type ChoreoConfig = {
  folder: DriveFolder;
  apiKey?: string;
  account?: { email: string; key: string };
  oauth?: { clientId: string; clientSecret: string; refreshToken: string };
};
export function choreoConfig(): ChoreoConfig | null {
  const folder =
    process.env.GOOGLE_DRIVE_CHOREO_FOLDER?.trim() ?? TEAM_CHOREO_FOLDER;
  if (!folder) return null;
  const source = parseDriveFolder(folder);
  const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID?.trim(),
    clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET?.trim(),
    refreshToken = process.env.GOOGLE_DRIVE_REFRESH_TOKEN?.trim();
  if (clientId || clientSecret || refreshToken) {
    if (!clientId || !clientSecret || !refreshToken)
      throw new Error("Choreo connection needs attention.");
    return { folder: source, oauth: { clientId, clientSecret, refreshToken } };
  }
  const credential = process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON?.trim();
  if (credential) {
    const account = JSON.parse(credential);
    if (
      typeof account.client_email !== "string" ||
      !/^[^\s@]+@[^\s@]+\.gserviceaccount\.com$/.test(account.client_email) ||
      typeof account.private_key !== "string" ||
      !account.private_key.includes("BEGIN PRIVATE KEY")
    )
      throw new Error("Choreo connection needs attention.");
    return {
      folder: source,
      account: { email: account.client_email, key: account.private_key },
    };
  }
  const apiKey = process.env.GOOGLE_DRIVE_API_KEY?.trim();
  return apiKey ? { folder: source, apiKey } : null;
}
