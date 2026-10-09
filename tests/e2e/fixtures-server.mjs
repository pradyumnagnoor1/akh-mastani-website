// Test-only Supabase HTTP contract fixture. Identity is synthetic; NOT a real OAuth verifier.
// Never imported by src/ or used by production. Database/storage policies execute in PGlite.
import { createHash, createCipheriv, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
const db = new PGlite();
const admin = "00000000-0000-4000-8000-000000000001",
  dancer = "00000000-0000-4000-8000-000000000002";
const segment = "00000000-0000-4000-8000-000000000010";
const path = `${admin}/00000000-0000-4000-8000-000000000020.pdf`;
function pdf() {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 500] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  const content = "BT /F1 20 Tf 45 440 Td (Opening - Formation A) Tj ET";
  objects.push(
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  );
  let out = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, i) => {
    offsets.push(Buffer.byteLength(out));
    out += `${i + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out);
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1))
    out += `${String(offset).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(out);
}
const files = new Map([[path, pdf()]]);
const users = new Map([
  [
    admin,
    {
      id: admin,
      email: "admin@tamu.edu",
      display_name: "Prady Admin",
      is_admin: true,
    },
  ],
  [
    dancer,
    {
      id: dancer,
      email: "dancer@tamu.edu",
      display_name: "Anika Dancer",
      is_admin: false,
    },
  ],
]);
await db.exec(`create role service_role nologin;create role anon nologin;create role authenticated nologin;create schema auth;
create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_app_meta_data jsonb);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;
create schema storage;
create function storage.allow_only_operation(operation text) returns boolean language sql stable as $$select coalesce(current_setting('fixture.storage_operation',true)=operation,false)$$;create function storage.allow_any_operation(operations text[]) returns boolean language sql stable as $$select exists(select 1 from unnest(operations) op where storage.allow_only_operation(op))$$;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb,unique(bucket_id,name));
alter table storage.objects enable row level security;grant usage on schema storage to authenticated,anon;grant select,insert,update,delete on storage.objects to authenticated;`);
await db.exec(readFileSync("supabase/migrations/0001_identity.sql", "utf8"));
await db.exec(readFileSync("supabase/migrations/0002_segments.sql", "utf8"));
await db.exec(
  readFileSync("supabase/migrations/0003_communication.sql", "utf8"),
);
await db.exec(readFileSync("supabase/migrations/0004_payments.sql", "utf8"));
await db.exec(readFileSync("supabase/migrations/0005_calendar.sql", "utf8"));
await db.exec(
  readFileSync("supabase/migrations/0006_calendar_connection.sql", "utf8"),
);
await db.exec(
  readFileSync("supabase/migrations/0007_push_notifications.sql", "utf8"),
);
await db.exec(
  readFileSync(
    "supabase/migrations/0008_management_featured_events.sql",
    "utf8",
  ),
);
await db.exec(
  readFileSync("supabase/migrations/0009_permanent_deletion.sql", "utf8"),
);
await db.exec(
  readFileSync(
    "supabase/migrations/0010_announcement_images_expiration.sql",
    "utf8",
  ),
);
await db.exec(
  readFileSync(
    "supabase/migrations/0011_private_file_metadata_reads.sql",
    "utf8",
  ),
);
for (const person of users.values()) {
  await db.query(
    `insert into auth.users values($1,$2,now(),'{"provider":"google"}')`,
    [person.id, person.email],
  );
  await db.query(
    `insert into public.members(id,email,display_name,status,is_admin) values($1,$2,$3,'active',$4)`,
    [person.id, person.email, person.display_name, person.is_admin],
  );
}
await db.query(
  `insert into storage.objects(bucket_id,name,metadata) values('formations',$1,$2)`,
  [path, { size: pdf().length, mimetype: "application/pdf" }],
);
await db.query(
  `insert into public.segments(id,name,document_path,document_label,created_by) values($1,'Opening',$2,'opening.pdf',$3)`,
  [segment, path, admin],
);
for (const id of users.keys())
  await db.query("insert into public.segment_members values($1,$2)", [
    segment,
    id,
  ]);
async function seedCalendar(stale = false) {
  await db.exec("reset role");
  const start = new Date(Date.now() + 86400000).toISOString();
  const end = new Date(Date.now() + 90000000).toISOString();
  const events = [
    {
      id: "practice-1",
      title: "Team practice",
      start,
      end,
      allDay: false,
      location: "Rec Center",
      url: null,
      recurringEventId: "weekly",
      originalStart: start,
    },
    {
      id: "camp-1",
      title: "Team workshop",
      start: start.slice(0, 10),
      end: new Date(Date.now() + 172800000).toISOString().slice(0, 10),
      allDay: true,
      location: null,
      url: null,
      recurringEventId: null,
      originalStart: null,
    },
  ];
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", Buffer.alloc(32), iv);
  cipher.setAAD(Buffer.from("calendar-token:fixture-client:fixture-calendar"));
  const encrypted = Buffer.concat([
    cipher.update("fixture-refresh"),
    cipher.final(),
  ]);
  const ciphertext = Buffer.concat([
    iv,
    cipher.getAuthTag(),
    encrypted,
  ]).toString("base64url");
  await db.query(
    "update calendar_connection set version=1,calendar_id='fixture-calendar',client_id='fixture-client',encrypted_token=$1,connected_by=$2,connected_at=now() where id",
    [ciphertext, admin],
  );
  const source = createHash("sha256")
    .update("connected:1:fixture-client:fixture-calendar")
    .digest("hex");
  await db.query(
    `insert into public.calendar_snapshot(id,source_fingerprint,events,last_success_at,last_error,next_attempt_at,window_start,window_end) values(true,$1,$2,$3,$4,now()+interval '1 hour',now()-interval '30 days',now()+interval '180 days') on conflict(id) do update set source_fingerprint=excluded.source_fingerprint,events=excluded.events,last_success_at=excluded.last_success_at,last_error=excluded.last_error,next_attempt_at=excluded.next_attempt_at,lease_until=null,lease_token=null,window_start=excluded.window_start,window_end=excluded.window_end`,
    [
      source,
      JSON.stringify(events),
      new Date(Date.now() - (stale ? 3600000 : 0)).toISOString(),
      stale ? "upstream" : null,
    ],
  );
}
await seedCalendar();
function session(person) {
  const now = Math.floor(Date.now() / 1000);
  const user = {
    id: person.id,
    aud: "authenticated",
    role: "authenticated",
    email: person.email,
    email_confirmed_at: new Date().toISOString(),
    app_metadata: { provider: "google", providers: ["google"] },
    user_metadata: {},
    created_at: new Date().toISOString(),
    identities: [],
  };
  const token = [
    { alg: "HS256", typ: "JWT" },
    {
      sub: person.id,
      iss: "http://127.0.0.1:3201/auth/v1",
      aud: "authenticated",
      exp: now + 3600,
      iat: now,
      role: "authenticated",
      email: person.email,
      app_metadata: user.app_metadata,
    },
    "fixture-signature",
  ]
    .map((x, i) =>
      i === 2
        ? Buffer.from(x).toString("base64url")
        : Buffer.from(JSON.stringify(x)).toString("base64url"),
    )
    .join(".");
  return {
    access_token: token,
    refresh_token: "fixture-refresh",
    expires_in: 3600,
    expires_at: now + 3600,
    token_type: "bearer",
    user,
  };
}
const sessions = new Map([...users.values()].map((p) => [p.id, session(p)]));
let queue = Promise.resolve();
let choreoEmpty = false;
let choreoDelay = 0;
function locked(work) {
  const result = queue.then(work);
  queue = result.catch(() => {});
  return result;
}
createServer((req, res) => {
  locked(async () => {
    const url = new URL(req.url, "http://127.0.0.1:3201");
    function json(data, status = 200, headers = {}) {
      res.writeHead(status, { "Content-Type": "application/json", ...headers });
      res.end(JSON.stringify(data));
    }
    if (url.pathname === "/health") return json({ ready: true });
    if (url.pathname === "/fixture/expire") {
      await db.exec("reset role");
      await db.query(
        "update communication_posts set expires_at=now()+interval '3 seconds' where id=$1",
        [url.searchParams.get("id")],
      );
      return json({ ready: true });
    }
    if (url.pathname === "/fixture/empty-announcements") {
      await db.exec(
        "reset role;delete from communication_posts where kind='announcement';",
      );
      return json({ ready: true });
    }
    if (url.pathname === "/fixture/choreo") {
      choreoEmpty = url.searchParams.get("state") === "empty";
      choreoDelay = Math.min(2000, Number(url.searchParams.get("delay")) || 0);
      return json({ ready: true });
    }
    if (url.pathname === "/fixture/drive/drive/v3/files/folder_fixture_123") {
      if (choreoDelay) {
        const delay = choreoDelay;
        choreoDelay = 0;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
      return json({
        id: "folder_fixture_123",
        name: "Mastani Choreo",
        mimeType: "application/vnd.google-apps.folder",
        trashed: false,
      });
    }
    if (url.pathname === "/fixture/drive/drive/v3/files/nested_fixture_123") {
      return json({
        id: "nested_fixture_123",
        name: "Finale",
        mimeType: "application/vnd.google-apps.folder",
        parents: ["folder_fixture_123"],
      });
    }
    if (url.pathname === "/fixture/drive/drive/v3/files") {
      if (choreoEmpty) return json({ files: [] });
      const query = url.searchParams.get("q") ?? "";
      const nested = query.includes("nested_fixture_123");
      if (!query.includes("video/"))
        return json({
          files: nested
            ? []
            : [
                {
                  id: "nested_fixture_123",
                  name: "Finale",
                  mimeType: "application/vnd.google-apps.folder",
                },
              ],
        });
      const videos = Array.from({ length: 7 }, (_, index) => ({
        id:
          index === 0 ? "finale_fixture_123" : `practice_fixture_${index}_123`,
        name:
          index === 0
            ? "Finale rehearsal"
            : `Practice ${index} — walkthrough with counts and transitions for the upcoming showcase`,
        mimeType: "video/mp4",
        videoMediaMetadata: { durationMillis: "145000" },
      }));
      const offset = Number(url.searchParams.get("pageToken") ?? 0);
      const size = Number(url.searchParams.get("pageSize") ?? 5);
      return json({
        files: videos.slice(offset, offset + size),
        ...(offset + size < videos.length
          ? { nextPageToken: String(offset + size) }
          : {}),
      });
    }
    // Browser test fixtures ask this isolated process for synthetic cookies, never the app.
    if (url.pathname === "/fixture/session") {
      const value = sessions.get(
        url.searchParams.get("role") === "admin" ? admin : dancer,
      );
      return json(value);
    }
    if (url.pathname === "/fixture/calendar") {
      await seedCalendar(url.searchParams.get("state") === "stale");
      return json({ ready: true });
    }
    const token = req.headers.authorization?.replace(/^Bearer /, "");
    const value = [...sessions.values()].find((s) => s.access_token === token);
    const service = token === "fixture-service-key";
    if (!value && !service) return json({ message: "Invalid test token" }, 401);
    if (url.pathname === "/auth/v1/user") return json(value?.user);
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      value?.user.id ?? "",
    ]);
    await db.exec(service ? "set role service_role" : "set role authenticated");
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks);
    try {
      if (url.pathname.startsWith("/rest/v1/rpc/")) {
        const name = url.pathname.split("/").pop();
        const args = JSON.parse(body.toString() || "{}");
        const functions = {
          push_device_registered: ["p_id"],
          push_unregister_device: ["p_id"],
          push_register_subscription: ["p_endpoint", "p_p256dh", "p_auth"],
          push_unregister_subscription: ["p_endpoint"],
          active_member: [],
          purge_expired_items: [],
          announcement_cleanup_jobs: [],
          finish_announcement_cleanup: ["p_paths"],
          reserve_announcement_image: ["target_id", "expected_version"],
          verify_announcement_image: ["object_path", "actor_id"],
          abandon_announcement_image: ["object_path"],
          save_communication_media: [
            "target_id",
            "expected_version",
            "post_kind",
            "post_title",
            "post_body",
            "task_mode",
            "audience",
            "recipient_ids",
            "source_id",
            "due_date",
            "expiration_date",
            "image_object",
            "image_alt",
          ],
          save_featured_event_expiring: [
            "target_id",
            "expected_version",
            "event_title",
            "event_description",
            "event_day",
            "event_time",
            "event_location",
            "event_url",
            "expiration_date",
          ],
          formation_cleanup_jobs: [],
          finish_formation_cleanup: ["p_paths"],
          delete_team_item: ["target_id", "expected_version", "item_kind"],
          calendar_read_connection: [],
          calendar_connection_status: [],
          begin_calendar_connection: ["p_actor", "p_state_hash"],
          consume_calendar_connection: ["p_actor", "p_state_hash"],
          save_calendar_connection: [
            "p_actor",
            "p_expected_version",
            "p_calendar_id",
            "p_client_id",
            "p_encrypted_token",
          ],
          disconnect_calendar_connection: ["p_actor", "p_expected_version"],
          calendar_claim_refresh: ["p_source", "p_actor"],
          calendar_finish_refresh: [
            "p_source",
            "p_token",
            "p_events",
            "p_window_start",
            "p_window_end",
          ],
          calendar_fail_refresh: ["p_source", "p_token", "p_error_code"],
          issue_payment_charges: [
            "batch_id",
            "amount",
            "charge_reason",
            "payment_instructions",
            "due_date",
            "audience",
            "recipient_ids",
            "source_id",
          ],
          manage_payment_charge: [
            "target_id",
            "expected_version",
            "operation",
            "amount",
            "charge_reason",
            "payment_instructions",
            "due_date",
            "note",
          ],
          save_featured_event: [
            "target_id",
            "expected_version",
            "event_title",
            "event_description",
            "event_day",
            "event_time",
            "event_location",
            "event_url",
          ],
          delete_featured_event: ["target_id", "expected_version"],
          transition_payment: [
            "target_id",
            "expected_version",
            "operation",
            "note",
          ],
          save_segment: [
            "target_id",
            "expected_version",
            "segment_name",
            "member_ids",
            "pdf_path",
            "pdf_label",
          ],
          save_communication: [
            "target_id",
            "expected_version",
            "post_kind",
            "post_title",
            "post_body",
            "task_mode",
            "audience",
            "recipient_ids",
            "source_id",
            "due_date",
          ],
          complete_communication: ["target_id", "expected_version"],
          manage_communication: [
            "target_id",
            "expected_version",
            "operation",
            "recipient_id",
          ],
          save_communication_group: [
            "target_id",
            "expected_version",
            "group_name",
            "member_ids",
          ],
          archive_communication_group: ["target_id", "expected_version"],
          archive_segment: ["target_id", "expected_version"],
        };
        if (!functions[name])
          return json({ message: "Unsupported fixture function" }, 404);
        const result = await db.query(
          `select public.${name}(${functions[name].map((_, i) => "$" + (i + 1)).join(",")})`,
          functions[name].map((key) => args[key]),
        );
        if (
          ["formation_cleanup_jobs", "announcement_cleanup_jobs"].includes(name)
        )
          return json(result.rows.map((row) => row[name]));
        return json(result.rows[0][name]);
      }
      if (url.pathname.startsWith("/rest/v1/")) {
        const table = url.pathname.split("/").pop();
        const allowed = {
          featured_events: [
            "expires_at",
            "id",
            "title",
            "description",
            "event_date",
            "start_time",
            "location",
            "event_link",
            "version",
            "deleted_at",
            "created_by",
            "created_at",
            "updated_at",
          ],
          featured_event_audit: [
            "id",
            "event_id",
            "actor_id",
            "action",
            "details",
            "created_at",
          ],
          calendar_snapshot: [
            "id",
            "source_fingerprint",
            "events",
            "last_success_at",
            "last_error",
            "lease_until",
            "window_start",
            "window_end",
          ],
          payment_audit: [
            "id",
            "charge_id",
            "actor_id",
            "action",
            "note",
            "details",
            "created_at",
          ],
          payment_charges: [
            "id",
            "batch_id",
            "member_id",
            "amount_cents",
            "reason",
            "instructions",
            "due_on",
            "status",
            "version",
            "reported_at",
            "report_note",
            "review_note",
            "verified_at",
            "created_at",
            "created_by",
          ],
          members: [
            "id",
            "email",
            "display_name",
            "status",
            "is_admin",
            "created_at",
          ],
          segments: [
            "id",
            "name",
            "document_path",
            "document_label",
            "version",
            "archived_at",
            "updated_at",
            "created_at",
          ],
          segment_members: ["segment_id", "member_id"],
          communication_posts: [
            "expires_at",
            "image_path",
            "image_description",
            "id",
            "title",
            "body",
            "kind",
            "completion_mode",
            "audience_type",
            "audience_label",
            "audience_source_id",
            "due_on",
            "version",
            "archived_at",
            "created_at",
            "created_by",
            "completed_at",
            "completed_by",
          ],
          communication_recipients: ["post_id", "member_id", "completed_at"],
          communication_groups: ["id", "name", "version", "archived_at"],
          communication_group_members: ["group_id", "member_id"],
        };
        if (!allowed[table])
          return json({ message: "Unsupported fixture table" }, 404);
        const columns = (url.searchParams.get("select") || "*").split(",");
        if (
          columns[0] !== "*" &&
          columns.some((c) => !allowed[table].includes(c))
        )
          return json({ message: "Unsupported fixture columns" }, 400);
        const values = [],
          filters = [];
        for (const [key, filter] of url.searchParams) {
          if (!allowed[table].includes(key)) continue;
          if (filter.startsWith("in.(") && filter.endsWith(")")) {
            values.push(filter.slice(4, -1).split(","));
            filters.push(`${key}=any($${values.length})`);
          }
          if (filter === "is.null") filters.push(`${key} is null`);
          if (filter.startsWith("neq.")) {
            values.push(filter.slice(4));
            filters.push(`${key}<>$${values.length}`);
          }
          if (filter.startsWith("eq.")) {
            values.push(filter.slice(3));
            filters.push(`${key}=$${values.length}`);
          }
        }
        let sql = `select ${columns.join(",")} from public.${table}`;
        if (filters.length) sql += " where " + filters.join(" and ");
        const order = url.searchParams.get("order");
        if (order) {
          const clauses = order
            .split(",")
            .map((item) => {
              const [col, direction] = item.split(".");
              return allowed[table].includes(col)
                ? `${col} ${direction === "desc" ? "desc" : "asc"}`
                : null;
            })
            .filter(Boolean);
          if (clauses.length) sql += " order by " + clauses.join(",");
        }
        const limit = Number(url.searchParams.get("limit")),
          offset = Number(url.searchParams.get("offset"));
        if (
          url.searchParams.has("limit") &&
          Number.isInteger(limit) &&
          limit >= 0
        )
          sql += ` limit ${limit}`;
        if (Number.isInteger(offset) && offset > 0) sql += ` offset ${offset}`;
        const result = await db.query(sql, values);
        // PostgREST represents DATE as YYYY-MM-DD; PGlite decodes it as Date.
        for (const field of result.fields) {
          if (field.dataTypeID === 1082)
            for (const row of result.rows) {
              if (row[field.name] instanceof Date)
                row[field.name] = row[field.name].toISOString().slice(0, 10);
            }
        }
        const headers = {
          "Content-Range": `0-${Math.max(0, result.rows.length - 1)}/${result.rows.length}`,
        };
        if (req.method === "HEAD") {
          res.writeHead(200, headers);
          return res.end();
        }
        if (req.headers.accept?.includes("vnd.pgrst.object")) {
          if (result.rows.length !== 1)
            return json({ message: "Not found", code: "PGRST116" }, 406);
          return json(result.rows[0], 200, headers);
        }
        return json(result.rows, 200, headers);
      }
      if (
        req.method === "DELETE" &&
        [
          "/storage/v1/object/formations",
          "/storage/v1/object/announcement-images",
        ].includes(url.pathname)
      ) {
        if (!service) return json({ message: "Service only" }, 403);
        const bucket = url.pathname.split("/").pop();
        const { prefixes } = JSON.parse(body.toString());
        await db.exec("reset role");
        await db.query(
          "delete from storage.objects where bucket_id=$1 and name=any($2::text[])",
          [bucket, prefixes],
        );
        for (const path of prefixes)
          files.delete(bucket === "formations" ? path : `${bucket}/${path}`);
        return json(prefixes.map((name) => ({ name })));
      }
      if (url.pathname.startsWith("/storage/v1/object/")) {
        const bucket = url.pathname
          .replace(/^\/storage\/v1\/object\/(?:authenticated\/)?/, "")
          .split("/")[0];
        const mime =
          bucket === "announcement-images" ? "image/jpeg" : "application/pdf";
        const relative = decodeURIComponent(
          url.pathname.replace(
            /^\/storage\/v1\/object\/(?:authenticated\/)?(?:formations|announcement-images)\//,
            "",
          ),
        );
        const fileKey =
          bucket === "formations" ? relative : `${bucket}/${relative}`;
        if (req.method === "POST") {
          if (service) await db.exec("reset role");
          let bytes = body;
          const contentType = req.headers["content-type"] || "";
          if (contentType.includes("multipart/form-data")) {
            const parsed = await new Request("http://fixture/upload", {
              method: "POST",
              headers: { "Content-Type": contentType },
              body,
            }).formData();
            const file = [...parsed.values()].find((v) => v instanceof File);
            if (!file) return json({ message: "Missing file" }, 400);
            bytes = Buffer.from(await file.arrayBuffer());
          }
          if (bytes.length > 4194304)
            return json({ message: "Too large" }, 413);
          await db.query(
            `insert into storage.objects(bucket_id,name,metadata) values($1,$2,$3)`,
            [bucket, relative, { size: bytes.length, mimetype: mime }],
          );
          files.set(fileKey, bytes);
          return json({
            Key: `${bucket}/${relative}`,
            Id: crypto.randomUUID(),
          });
        }
        // Hosted CDN authenticates a metadata read before retrieving bytes.
        await db.exec(
          "select set_config('fixture.storage_operation','object.get_authenticated_info',false)",
        );
        const metadata = await db.query(
          "select name from storage.objects where bucket_id=$1 and name=$2",
          [bucket, relative],
        );
        if (!metadata.rows.length)
          return json({ message: "Object not found", code: "NoSuchKey" }, 400);
        await db.exec(
          "select set_config('fixture.storage_operation','object.get_authenticated',false)",
        );
        const visible = await db.query(
          `select name from storage.objects where bucket_id=$1 and name=$2`,
          [bucket, relative],
        );
        if (!visible.rows.length || !files.has(fileKey))
          return json({ message: "Not found" }, 404);
        res.writeHead(200, { "Content-Type": mime });
        return res.end(files.get(fileKey));
      }
      return json({ message: "Unsupported fixture endpoint" }, 404);
    } catch (error) {
      process.stderr.write(
        `Fixture request failed: ${error.code}: ${error.message}\n`,
      );
      return json(
        { message: error.message, code: error.code || "fixture_error" },
        400,
      );
    } finally {
      await db.exec("reset role");
    }
  }).catch((error) => {
    res.writeHead(500);
    res.end(String(error));
  });
}).listen(3201, "127.0.0.1", () =>
  process.stdout.write("Isolated Supabase test fixture ready\n"),
);
