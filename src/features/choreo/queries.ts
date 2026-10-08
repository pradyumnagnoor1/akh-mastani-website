import "server-only";
import { cache } from "react";
import { requireMember } from "@/features/identity/session";
import { parseDriveFolder, TEAM_CHOREO_FOLDER } from "./policy";
import { choreoConfig } from "./config";
import { fetchChoreo, ChoreoFailure } from "./google";

export const choreoData = cache(async () => {
  const { member } = await requireMember();
  let folder = parseDriveFolder(TEAM_CHOREO_FOLDER);
  try {
    folder = parseDriveFolder(
      process.env.GOOGLE_DRIVE_CHOREO_FOLDER?.trim() || TEAM_CHOREO_FOLDER,
    );
    const config = choreoConfig();
    if (!config) return { member, folder, status: "setup" as const };
    return {
      member,
      folder,
      status: "ready" as const,
      library: await fetchChoreo(config),
    };
  } catch (error) {
    return {
      member,
      folder,
      status: "error" as const,
      error:
        error instanceof ChoreoFailure
          ? error.message
          : "The video folder connection needs attention.",
    };
  }
});
