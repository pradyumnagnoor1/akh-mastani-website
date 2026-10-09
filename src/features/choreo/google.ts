import "server-only";
import { createHmac, timingSafeEqual, sign } from "node:crypto";
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

export type ChoreoBrowse = {
  path?: string[];
  cursor?: string;
  rootVideos?: boolean;
};

/** Browse one folder, verifying each ancestor under the configured team root. */
export async function fetchChoreo(
  config: ChoreoConfig,
  transport: typeof fetch = fetch,
  browse: ChoreoBrowse = {},
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
    resourceFolders: DriveFolder[] = [folder],
  ) {
    const url = new URL(`https://www.googleapis.com/drive/v3/${path}`);
    Object.entries(parameters).forEach(([key, value]) =>
      url.searchParams.set(key, value),
    );
    if (config.apiKey) url.searchParams.set("key", config.apiKey);
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    const resourceKeys = resourceFolders
      .filter((item) => item.resourceKey)
      .map((item) => `${item.id}/${item.resourceKey}`)
      .join(",");
    if (resourceKeys) headers["X-Goog-Drive-Resource-Keys"] = resourceKeys;
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
  const path = browse.path ?? [];
  if (
    path.length > 10 ||
    path.some((id) => !DRIVE_ID.test(id)) ||
    new Set(path).size !== path.length ||
    path.includes(config.folder.id)
  )
    throw new ChoreoFailure("authorization");
  const breadcrumbs = [{ ...config.folder, name: root.name.slice(0, 200) }];
  for (const id of path) {
    const parent = breadcrumbs[breadcrumbs.length - 1];
    const item = await drive(
      `files/${id}`,
      {
        fields: "id,name,mimeType,trashed,parents,resourceKey",
        supportsAllDrives: "true",
      },
      parent,
    );
    if (
      item.id !== id ||
      item.trashed ||
      item.mimeType !== "application/vnd.google-apps.folder" ||
      typeof item.name !== "string" ||
      !Array.isArray(item.parents) ||
      !item.parents.includes(parent.id) ||
      (item.resourceKey !== undefined &&
        (typeof item.resourceKey !== "string" ||
          !/^[A-Za-z0-9_-]{1,200}$/.test(item.resourceKey)))
    )
      throw new ChoreoFailure("authorization");
    breadcrumbs.push({
      id,
      name: item.name.slice(0, 200),
      resourceKey: item.resourceKey as string | undefined,
    });
  }
  const folder = breadcrumbs[breadcrumbs.length - 1];
  // Bind opaque Drive page tokens to this folder and connection. Client input
  // cannot substitute a token from a different private Drive query.
  const signingKey =
    config.oauth?.clientSecret ?? config.account?.key ?? config.apiKey;
  if (!signingKey) throw new ChoreoFailure("authorization");
  const scope = JSON.stringify([config.folder.id, path, !!browse.rootVideos]);
  const signature = (payload: string) =>
    createHmac("sha256", signingKey)
      .update(`choreo-page:${scope}:${payload}`)
      .digest();
  let pageToken = "";
  if (browse.cursor) {
    if (browse.cursor.length > 6000) throw new ChoreoFailure("authorization");
    const [payload, mac, extra] = browse.cursor.split(".");
    if (
      !payload ||
      !mac ||
      extra !== undefined ||
      !/^[A-Za-z0-9_-]+$/.test(payload) ||
      !/^[A-Za-z0-9_-]+$/.test(mac)
    )
      throw new ChoreoFailure("authorization");
    const supplied = Buffer.from(mac, "base64url");
    const expected = signature(payload);
    if (
      supplied.length !== expected.length ||
      !timingSafeEqual(supplied, expected)
    )
      throw new ChoreoFailure("authorization");
    pageToken = Buffer.from(payload, "base64url").toString();
    if (!pageToken || pageToken.length > 4096)
      throw new ChoreoFailure("authorization");
  }
  const valid = (item: unknown): Record<string, unknown> => {
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
    return item;
  };
  async function list(videos: boolean, token = "", size = videos ? 5 : 100) {
    const result = await drive(
      "files",
      {
        q: `'${folder.id}' in parents and trashed = false and ${videos ? "mimeType contains 'video/'" : "mimeType = 'application/vnd.google-apps.folder'"}`,
        fields:
          "nextPageToken,incompleteSearch,files(id,name,mimeType,trashed,resourceKey,videoMediaMetadata(durationMillis))",
        pageSize: String(size),
        orderBy: videos ? "createdTime desc,name_natural" : "name_natural",
        spaces: "drive",
        supportsAllDrives: "true",
        includeItemsFromAllDrives: "true",
        ...(token ? { pageToken: token } : {}),
      },
      folder,
    );
    if (
      !Array.isArray(result.files) ||
      result.incompleteSearch === true ||
      result.files.length > size ||
      (result.nextPageToken !== undefined &&
        (typeof result.nextPageToken !== "string" ||
          result.nextPageToken.length > 4096))
    )
      throw new ChoreoFailure("invalid_response");
    return {
      files: result.files.map(valid),
      next:
        typeof result.nextPageToken === "string" ? result.nextPageToken : "",
    };
  }
  async function readFolders() {
    const children: (DriveFolder & { name: string })[] = [];
    const seen = new Set<string>();
    const tokens = new Set<string>();
    let next = "";
    let pages = 0;
    do {
      if (++pages > 10) throw new ChoreoFailure("capacity");
      const result = await list(false, next);
      for (const item of result.files) {
        if (
          item.trashed ||
          item.mimeType !== "application/vnd.google-apps.folder" ||
          seen.has(item.id as string)
        )
          continue;
        seen.add(item.id as string);
        children.push({
          id: item.id as string,
          name: (item.name as string).slice(0, 200),
          resourceKey: item.resourceKey as string | undefined,
        });
      }
      next = result.next;
      if (next && tokens.has(next)) throw new ChoreoFailure("invalid_response");
      tokens.add(next);
    } while (next);
    return children;
  }
  async function readVideos() {
    if (!path.length && !browse.rootVideos) {
      if (pageToken) throw new ChoreoFailure("authorization");
      return {
        videos: [] as ChoreoVideo[],
        nextCursor: undefined as string | undefined,
      };
    }
    const videos: ChoreoVideo[] = [];
    const seen = new Set<string>();
    const tokens = new Set<string>();
    let next = pageToken;
    let pages = 0;
    do {
      if (++pages > 10) throw new ChoreoFailure("capacity");
      const result = await list(true, next, 5 - videos.length);
      for (const item of result.files) {
        if (
          item.trashed ||
          !(item.mimeType as string).startsWith("video/") ||
          seen.has(item.id as string)
        )
          continue;
        seen.add(item.id as string);
        const seconds = Math.floor(
          Number(
            object(item.videoMediaMetadata)
              ? item.videoMediaMetadata.durationMillis
              : NaN,
          ) / 1000,
        );
        videos.push({
          id: item.id as string,
          name: (item.name as string).slice(0, 200),
          folder: folder.name,
          resourceKey: item.resourceKey as string | undefined,
          ...(Number.isFinite(seconds) && seconds >= 0
            ? {
                duration: `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`,
              }
            : {}),
        });
      }
      next = result.next;
      if (next && (tokens.has(next) || next === pageToken))
        throw new ChoreoFailure("invalid_response");
      tokens.add(next);
    } while (next && videos.length < 5);
    const payload = next ? Buffer.from(next).toString("base64url") : "";
    return {
      videos,
      nextCursor: payload
        ? `${payload}.${signature(payload).toString("base64url")}`
        : undefined,
    };
  }
  const [folders, videoPage] = await Promise.all([readFolders(), readVideos()]);
  return { name: folder.name, folder, breadcrumbs, folders, ...videoPage };
}
