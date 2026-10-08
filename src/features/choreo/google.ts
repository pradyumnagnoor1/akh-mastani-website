import "server-only";
import { sign } from "node:crypto";
import { DRIVE_ID, type DriveFolder, type ChoreoVideo } from "./policy";
import type { ChoreoConfig } from "./config";

export class ChoreoFailure extends Error {
  constructor(
    public readonly code:
      | "authorization"
      | "capacity"
      | "upstream"
      | "invalid_response"
      | "timeout",
  ) {
    super(
      code === "authorization"
        ? "The video folder connection needs attention."
        : code === "capacity"
          ? "The video folder is too large to load. Open it in Drive."
          : "Videos are temporarily unavailable. Try again.",
    );
  }
}
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const encode = (value: unknown) =>
  Buffer.from(JSON.stringify(value)).toString("base64url");

/** Traverse only real folders below the configured root; no arbitrary client-supplied file IDs. */
export async function fetchChoreo(
  config: ChoreoConfig,
  transport: typeof fetch = fetch,
) {
  const deadline = AbortSignal.timeout(20000);
  async function request(
    url: string | URL,
    init?: RequestInit,
  ): Promise<Record<string, unknown>> {
    try {
      const response = await transport(url, {
        ...init,
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.any([deadline, AbortSignal.timeout(5000)]),
      });
      if ([401, 403, 404].includes(response.status))
        throw new ChoreoFailure("authorization");
      if (!response.ok) throw new ChoreoFailure("upstream");
      const body: unknown = await response.json();
      if (!object(body)) throw new ChoreoFailure("invalid_response");
      return body;
    } catch (error) {
      if (error instanceof ChoreoFailure) throw error;
      throw new ChoreoFailure(
        error instanceof Error && /Timeout|Abort/.test(error.name)
          ? "timeout"
          : "invalid_response",
      );
    }
  }
  let token: string | undefined;
  if (config.oauth) {
    const result = await request("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: config.oauth.clientId,
        client_secret: config.oauth.clientSecret,
        refresh_token: config.oauth.refreshToken,
        grant_type: "refresh_token",
      }),
    });
    if (typeof result.access_token !== "string" || !result.access_token)
      throw new ChoreoFailure("invalid_response");
    token = result.access_token;
  } else if (config.account) {
    const now = Math.floor(Date.now() / 1000);
    const assertion = `${encode({ alg: "RS256", typ: "JWT" })}.${encode({ iss: config.account.email, scope: "https://www.googleapis.com/auth/drive.metadata.readonly", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 })}`;
    const signature = sign(
      "RSA-SHA256",
      Buffer.from(assertion),
      config.account.key,
    ).toString("base64url");
    const result = await request("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: `${assertion}.${signature}`,
      }),
    });
    if (typeof result.access_token !== "string" || !result.access_token)
      throw new ChoreoFailure("invalid_response");
    token = result.access_token;
  }
  async function drive(
    path: string,
    parameters: Record<string, string>,
    folder: DriveFolder,
  ) {
    const url = new URL(`https://www.googleapis.com/drive/v3/${path}`);
    Object.entries(parameters).forEach(([key, value]) =>
      url.searchParams.set(key, value),
    );
    if (config.apiKey) url.searchParams.set("key", config.apiKey);
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    if (folder.resourceKey)
      headers["X-Goog-Drive-Resource-Keys"] =
        `${folder.id}/${folder.resourceKey}`;
    return request(url, { headers });
  }
  const root = await drive(
    `files/${config.folder.id}`,
    { fields: "id,name,mimeType,trashed", supportsAllDrives: "true" },
    config.folder,
  );
  if (
    root.id !== config.folder.id ||
    root.mimeType !== "application/vnd.google-apps.folder" ||
    root.trashed ||
    typeof root.name !== "string"
  )
    throw new ChoreoFailure("authorization");
  const queue = [{ ...config.folder, name: "" }];
  const visited = new Set([config.folder.id]);
  const videos: ChoreoVideo[] = [];
  const seenVideos = new Set<string>();
  let pages = 0;
  for (let offset = 0; offset < queue.length; offset++) {
    const folder = queue[offset];
    let pageToken = "";
    const tokens = new Set<string>();
    do {
      if (++pages > 30) throw new ChoreoFailure("capacity");
      const result = await drive(
        "files",
        {
          q: `'${folder.id}' in parents and trashed = false and (mimeType contains 'video/' or mimeType = 'application/vnd.google-apps.folder')`,
          fields:
            "nextPageToken,incompleteSearch,files(id,name,mimeType,trashed,resourceKey,videoMediaMetadata(durationMillis))",
          pageSize: "100",
          orderBy: "name_natural",
          spaces: "drive",
          supportsAllDrives: "true",
          includeItemsFromAllDrives: "true",
          ...(pageToken ? { pageToken } : {}),
        },
        folder,
      );
      if (!Array.isArray(result.files) || result.incompleteSearch === true)
        throw new ChoreoFailure("invalid_response");
      if (result.files.length > 100) throw new ChoreoFailure("capacity");
      for (const item of result.files) {
        if (
          !object(item) ||
          typeof item.id !== "string" ||
          !DRIVE_ID.test(item.id) ||
          typeof item.name !== "string" ||
          typeof item.mimeType !== "string" ||
          (item.resourceKey !== undefined &&
            (typeof item.resourceKey !== "string" ||
              !/^[A-Za-z0-9_-]{1,200}$/.test(item.resourceKey)))
        )
          throw new ChoreoFailure("invalid_response");
        if (item.trashed) continue;
        const name = item.name.slice(0, 200);
        const key =
          typeof item.resourceKey === "string" ? item.resourceKey : undefined;
        if (
          item.mimeType === "application/vnd.google-apps.folder" &&
          !visited.has(item.id)
        ) {
          if (queue.length >= 20) throw new ChoreoFailure("capacity");
          visited.add(item.id);
          queue.push({
            id: item.id,
            resourceKey: key,
            name: [folder.name, name].filter(Boolean).join(" / "),
          });
        } else if (
          item.mimeType.startsWith("video/") &&
          !seenVideos.has(item.id)
        ) {
          if (videos.length >= 1000) throw new ChoreoFailure("capacity");
          seenVideos.add(item.id);
          const milliseconds = object(item.videoMediaMetadata)
            ? Number(item.videoMediaMetadata.durationMillis)
            : NaN;
          const seconds = Math.floor(milliseconds / 1000);
          videos.push({
            id: item.id,
            name,
            folder: folder.name,
            resourceKey: key,
            ...(Number.isFinite(seconds) && seconds >= 0
              ? {
                  duration: `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`,
                }
              : {}),
          });
        }
      }
      if (
        result.nextPageToken !== undefined &&
        (typeof result.nextPageToken !== "string" ||
          result.nextPageToken.length > 4096)
      )
        throw new ChoreoFailure("invalid_response");
      pageToken =
        typeof result.nextPageToken === "string" ? result.nextPageToken : "";
      if (pageToken && tokens.has(pageToken))
        throw new ChoreoFailure("invalid_response");
      tokens.add(pageToken);
    } while (pageToken);
  }
  return { name: root.name.slice(0, 200), videos, folder: config.folder };
}
