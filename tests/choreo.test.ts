import { it, expect, vi, afterEach } from "vitest";
import { generateKeyPairSync, verify } from "node:crypto";
vi.mock("server-only", () => ({}));
import { parseDriveFolder, driveUrl } from "../src/features/choreo/policy";
import { fetchChoreo } from "../src/features/choreo/google";
import { choreoConfig } from "../src/features/choreo/config";
const folder = { id: "team_folder_123", resourceKey: "folder_key" };
const config = { folder, apiKey: "private_api_key" };
const root = {
  ...folder,
  name: "Choreo",
  mimeType: "application/vnd.google-apps.folder",
};
const video = (id = "video_file_123", name = "Opening") => ({
  id,
  name,
  mimeType: "video/mp4",
  resourceKey: "video_key",
  videoMediaMetadata: { durationMillis: "125000" },
});
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });
afterEach(() => vi.unstubAllEnvs());
vi.stubEnv("GOOGLE_DRIVE_CLIENT_ID", "");
vi.stubEnv("GOOGLE_DRIVE_CLIENT_SECRET", "");
vi.stubEnv("GOOGLE_DRIVE_REFRESH_TOKEN", "");
it("accepts only actual Google Drive folder links and carries resource keys to playback", () => {
  expect(
    parseDriveFolder(
      "https://drive.google.com/drive/u/0/folders/team_folder_123?resourcekey=folder_key",
    ),
  ).toEqual(folder);
  expect(
    driveUrl({ id: "video_file_123", resourceKey: "video_key" }, false, true),
  ).toBe(
    "https://drive.google.com/file/d/video_file_123/preview?resourcekey=video_key",
  );
  for (const value of [
    "https://evil.test/folders/team_folder_123",
    "https://drive.google.com.evil.test/folders/team_folder_123",
    "https://secret@drive.google.com/drive/folders/team_folder_123",
    "https://drive.google.com/file/d/video_file_123/view",
    "https://drive.google.com/drive/folders/team_folder_123?resourcekey=bad%0Akey",
    "../folder",
    "team' OR '1'='1",
  ])
    expect(() => parseDriveFolder(value)).toThrow();
});
it("keeps missing and malformed connection configuration honest", () => {
  vi.stubEnv("GOOGLE_DRIVE_CHOREO_FOLDER", "");
  expect(choreoConfig()).toBeNull();
  vi.stubEnv("GOOGLE_DRIVE_CHOREO_FOLDER", folder.id);
  vi.stubEnv("GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON", "");
  vi.stubEnv("GOOGLE_DRIVE_API_KEY", "");
  expect(choreoConfig()).toBeNull();
  vi.stubEnv("GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON", "{invalid}");
  expect(() => choreoConfig()).toThrow();
});
it("opens with folders only and never traverses or reads their videos", async () => {
  const calls: URL[] = [];
  const transport: typeof fetch = async (input) => {
    const url = new URL(String(input));
    calls.push(url);
    if (url.pathname.endsWith(folder.id)) return json(root);
    expect(url.searchParams.get("q")).toContain(
      "mimeType = 'application/vnd.google-apps.folder'",
    );
    return json({
      files: [
        {
          id: "child_folder_123",
          name: "Finale",
          mimeType: "application/vnd.google-apps.folder",
          resourceKey: "child_key",
        },
      ],
    });
  };
  const result = await fetchChoreo(config, transport);
  expect(calls).toHaveLength(2);
  expect(result.videos).toHaveLength(0);
  expect(result.folders).toEqual([
    { id: "child_folder_123", name: "Finale", resourceKey: "child_key" },
  ]);
  expect(JSON.stringify(result)).not.toContain(config.apiKey);
});
it("reads only five newest videos in a verified child and binds pagination to that folder", async () => {
  const requests: URL[] = [];
  const child = "child_folder_123";
  const transport: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    requests.push(url);
    expect(init).toMatchObject({ cache: "no-store", redirect: "error" });
    if (url.pathname.endsWith(folder.id)) return json(root);
    if (url.pathname.endsWith(child))
      return json({
        id: child,
        name: "Finale",
        mimeType: "application/vnd.google-apps.folder",
        parents: [folder.id],
        resourceKey: "child_key",
      });
    expect(init?.headers).toMatchObject({
      "X-Goog-Drive-Resource-Keys": `${child}/child_key`,
    });
    const q = url.searchParams.get("q")!;
    expect(q).toContain(`'${child}' in parents and trashed = false`);
    if (!q.includes("video/")) return json({ files: [] });
    expect(url.searchParams.get("pageSize")).toBe("5");
    expect(url.searchParams.get("orderBy")).toBe(
      "createdTime desc,name_natural",
    );
    return json({
      files: Array.from({ length: 5 }, (_, i) =>
        video(
          `video_file_${url.searchParams.has("pageToken") ? "old" : "new"}_${i}`,
        ),
      ),
      ...(url.searchParams.has("pageToken")
        ? {}
        : { nextPageToken: "older-page" }),
    });
  };
  const first = await fetchChoreo(config, transport, { path: [child] });
  expect(first.videos).toHaveLength(5);
  expect(first.videos[0]).toMatchObject({ folder: "Finale", duration: "2:05" });
  expect(first.nextCursor).toBeTruthy();
  const second = await fetchChoreo(config, transport, {
    path: [child],
    cursor: first.nextCursor,
  });
  expect(second.videos).toHaveLength(5);
  expect(second.videos[0].id).toContain("old");
  expect(second.nextCursor).toBeUndefined();
  expect(
    requests.filter((url) => url.searchParams.has("pageToken")),
  ).toHaveLength(1);
  await expect(
    fetchChoreo(config, transport, {
      cursor: first.nextCursor,
      rootVideos: true,
    }),
  ).rejects.toThrow();
  await expect(
    fetchChoreo(config, transport, {
      path: [child],
      cursor: first.nextCursor + "tampered",
    }),
  ).rejects.toThrow();
});
it("rejects unrelated, moved, trashed and shortcut folders before listing private contents", async () => {
  for (const change of [
    { parents: ["outside_folder_123"] },
    { trashed: true },
    { mimeType: "application/vnd.google-apps.shortcut" },
  ]) {
    const transport = vi.fn(async (input) =>
      json(
        String(input).includes(`files/${folder.id}`)
          ? root
          : {
              id: "child_folder_123",
              name: "Child",
              mimeType: "application/vnd.google-apps.folder",
              parents: [folder.id],
              ...change,
            },
      ),
    ) as unknown as typeof fetch;
    await expect(
      fetchChoreo(config, transport, { path: ["child_folder_123"] }),
    ).rejects.toThrow(/attention/);
    expect(vi.mocked(transport).mock.calls).toHaveLength(2);
  }
});
it("reflects removals on the next read without retaining a stale snapshot", async () => {
  let removed = false;
  const transport: typeof fetch = async (input) => {
    const url = new URL(String(input));
    return json(
      url.pathname.endsWith(folder.id)
        ? root
        : {
            files:
              url.searchParams.get("q")?.includes("video/") && !removed
                ? [video()]
                : [],
          },
    );
  };
  expect(
    (await fetchChoreo(config, transport, { rootVideos: true })).videos,
  ).toHaveLength(1);
  removed = true;
  expect(
    (await fetchChoreo(config, transport, { rootVideos: true })).videos,
  ).toHaveLength(0);
});
it("fills short/empty video pages without displaying more than five", async () => {
  let page = 0;
  const transport: typeof fetch = async (input) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith(folder.id)) return json(root);
    if (!url.searchParams.get("q")?.includes("video/"))
      return json({ files: [] });
    page++;
    if (page === 1) return json({ files: [], nextPageToken: "next" });
    return json({
      files: Array.from({ length: 5 }, (_, i) => video(`video_file_${i}_123`)),
    });
  };
  expect(
    (await fetchChoreo(config, transport, { rootVideos: true })).videos,
  ).toHaveLength(5);
  expect(page).toBe(2);
});
it.each([401, 403, 404, 429, 503])(
  "fails closed for provider status%i without exposing private response bodies",
  async (status) => {
    await expect(
      fetchChoreo(config, async () =>
        json({ private: "credential_detail" }, status),
      ),
    ).rejects.toThrow(/attention|temporarily/);
  },
);
it("rejects repeated pagination, unsafe file IDs and incomplete results", async () => {
  for (const list of [
    { files: [], nextPageToken: "repeat" },
    { files: [{ ...video(), id: "../../outside" }] },
    { files: [], incompleteSearch: true },
  ]) {
    let first = true;
    await expect(
      fetchChoreo(config, async () => {
        if (first) {
          first = false;
          return json(root);
        }
        return json(list);
      }),
    ).rejects.toThrow();
  }
});
it("uses a metadata-only signed service-account assertion with a fixed Google token endpoint", async () => {
  const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
  let calls = 0;
  const transport: typeof fetch = async (input, init) => {
    if (++calls === 1) {
      expect(String(input)).toBe("https://oauth2.googleapis.com/token");
      const assertion = new URLSearchParams(String(init?.body)).get(
        "assertion",
      )!;
      const [header, body, signature] = assertion.split(".");
      expect(
        verify(
          "RSA-SHA256",
          Buffer.from(`${header}.${body}`),
          keys.publicKey,
          Buffer.from(signature, "base64url"),
        ),
      ).toBe(true);
      expect(JSON.parse(Buffer.from(body, "base64url").toString()).scope).toBe(
        "https://www.googleapis.com/auth/drive.metadata.readonly",
      );
      return json({ access_token: "server_only_token" });
    }
    expect(init?.headers).toMatchObject({
      Authorization: "Bearer server_only_token",
    });
    return json(calls === 2 ? root : { files: [] });
  };
  const result = await fetchChoreo(
    {
      folder,
      account: {
        email: "team@project.iam.gserviceaccount.com",
        key: keys.privateKey
          .export({ type: "pkcs8", format: "pem" })
          .toString(),
      },
    },
    transport,
  );
  expect(JSON.stringify(result)).not.toContain("server_only_token");
});

it("uses an owner TAMU OAuth grant for a domain-restricted folder, without returning tokens", async () => {
  const oauth = {
    clientId: "owner-client",
    clientSecret: "server-secret",
    refreshToken: "owner-refresh",
  };
  let calls = 0;
  const transport: typeof fetch = async (url, init) => {
    if (++calls === 1) {
      expect(String(url)).toBe("https://oauth2.googleapis.com/token");
      expect(
        Object.fromEntries(new URLSearchParams(String(init?.body))),
      ).toEqual({
        client_id: oauth.clientId,
        client_secret: oauth.clientSecret,
        refresh_token: oauth.refreshToken,
        grant_type: "refresh_token",
      });
      return json({ access_token: "private-owner-token" });
    }
    expect(init?.headers).toMatchObject({
      Authorization: "Bearer private-owner-token",
    });
    return json(calls === 2 ? root : { files: [video()] });
  };
  const result = await fetchChoreo({ folder, oauth }, transport, {
    rootVideos: true,
  });
  expect(result.videos).toHaveLength(1);
  for (const secret of [
    oauth.clientSecret,
    oauth.refreshToken,
    "private-owner-token",
  ])
    expect(JSON.stringify(result)).not.toContain(secret);
});
it("configures the owner's supplied folder by default and rejects partial OAuth credentials", () => {
  vi.stubEnv("GOOGLE_DRIVE_CHOREO_FOLDER", undefined);
  vi.stubEnv("GOOGLE_DRIVE_CLIENT_ID", "owner-client");
  vi.stubEnv("GOOGLE_DRIVE_CLIENT_SECRET", "secret");
  vi.stubEnv("GOOGLE_DRIVE_REFRESH_TOKEN", "refresh");
  expect(choreoConfig()).toMatchObject({
    folder: { id: "15bcUJZX8TSnMAd3xqt2I_4RhlAQwQstZ" },
    oauth: { refreshToken: "refresh" },
  });
  vi.stubEnv("GOOGLE_DRIVE_REFRESH_TOKEN", "");
  expect(() => choreoConfig()).toThrow();
});

it("validates every ancestor for deeply nested folders without traversing siblings", async () => {
  const calls: string[] = [];
  const transport: typeof fetch = async (input) => {
    const url = new URL(String(input));
    calls.push(url.pathname);
    if (url.pathname.endsWith(folder.id)) return json(root);
    if (url.pathname.endsWith("child_folder_123"))
      return json({
        id: "child_folder_123",
        name: "Showcase",
        mimeType: "application/vnd.google-apps.folder",
        parents: [folder.id],
      });
    if (url.pathname.endsWith("deep_folder_123"))
      return json({
        id: "deep_folder_123",
        name: "Finale",
        mimeType: "application/vnd.google-apps.folder",
        parents: ["child_folder_123"],
      });
    expect(url.searchParams.get("q")).toContain("'deep_folder_123' in parents");
    return json({
      files: url.searchParams.get("q")?.includes("video/") ? [video()] : [],
    });
  };
  const result = await fetchChoreo(config, transport, {
    path: ["child_folder_123", "deep_folder_123"],
  });
  expect(result.breadcrumbs.map((item) => item.name)).toEqual([
    "Choreo",
    "Showcase",
    "Finale",
  ]);
  expect(result.videos).toHaveLength(1);
  expect(calls).toHaveLength(5);
});
