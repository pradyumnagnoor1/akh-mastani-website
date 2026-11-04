import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, beforeEach, afterAll, it, expect } from "vitest";
let db: PGlite;
const admin = "00000000-0000-4000-8000-000000000001",
  a = "00000000-0000-4000-8000-000000000002",
  b = "00000000-0000-4000-8000-000000000003";
const post = "00000000-0000-4000-8000-000000000010";
const stamp = "2026-10-12T14:00:00Z";
async function role(name = "authenticated", id = admin) {
  await db.exec(`reset role;set role ${name}`);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
}
async function q<T = unknown>(sql: string, params: unknown[] = []) {
  return (await db.query<{ value: T }>(`select ${sql} as value`, params))
    .rows[0].value;
}
async function device(id = a, suffix = "") {
  await role("authenticated", id);
  return q<string>("push_register_subscription($1,$2,$3)", [
    `https://fcm.googleapis.com/fcm/send/${id}${suffix}`,
    Buffer.concat([Buffer.from([4]), Buffer.alloc(64, 1)]).toString(
      "base64url",
    ),
    Buffer.alloc(16, 1).toString("base64url"),
  ]);
}
async function enqueue(at = stamp) {
  await role("service_role");
  return q<number>("nudge_enqueue($1::timestamptz)", [at]);
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    `create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_app_meta_data jsonb);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;create schema storage;create function storage.allow_only_operation(text) returns boolean language sql stable as $$select true$$;create function storage.allow_any_operation(text[]) returns boolean language sql stable as $$select true$$;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb);alter table storage.objects enable row level security;grant usage on schema storage to authenticated,anon;grant select,insert on storage.objects to authenticated;`,
  );
  for (const name of [
    "0001_identity",
    "0002_segments",
    "0003_communication",
    "0004_payments",
    "0005_calendar",
    "0006_calendar_connection",
    "0007_push_notifications",
    "0008_management_featured_events",
    "0009_permanent_deletion",
    "0010_announcement_images_expiration",
    "0011_private_file_metadata_reads",
    "0012_digest_nudges",
    "0013_announcement_push_preview",
    "0014_practice_announcements",
    "0015_custom_practices",
    "0016_exec_role_eligibility",
    "0017_additional_exec_roles",
    "0018_announcement_todos",
    "0019_notification_preview_labels",
    "0033_practice_reference",
    "0034_communication_priority",
  ])
    await db.exec(readFileSync(`supabase/migrations/${name}.sql`, "utf8"));
});
afterAll(async () => {
  await db?.close();
});
beforeEach(async () => {
  await db.exec(
    "reset role;truncate auth.users cascade;truncate communication_posts cascade;truncate payment_batches cascade;truncate calendar_snapshot;update nudge_control set enabled=true,pilot_members=null;",
  );
  for (const id of [admin, a, b]) {
    await db.query(
      `insert into auth.users values($1,$2,now(),'{"provider":"google"}')`,
      [id, `${id}@tamu.edu`],
    );
    await db.query(
      "insert into members(id,email,display_name,status,is_admin) values($1,$2,'Dancer','active',$3)",
      [id, `${id}@tamu.edu`, id === admin],
    );
  }
});

async function customAnnouncement(
  id = post,
  body = "Bring extra shoes",
  version = 0,
) {
  const { chicagoReminderTime } =
    await import("../src/features/notifications/reminder-policy");
  const { chicagoDay, moveDay } = await import("../src/features/calendar/day");
  const day = moveDay(chicagoDay(), 1),
    start = chicagoReminderTime(day, "13:00"),
    end = chicagoReminderTime(day, "15:00");
  const args = [
    id,
    version,
    "announcement",
    "Extra practice note",
    body,
    "individual",
    "selected",
    [a],
    null,
    null,
    null,
    null,
    "",
    null,
    null,
    "",
    null,
    null,
    null,
    null,
    id,
    version,
    "Extra team practice",
    start,
    end,
    "PEAP",
  ];
  await role();
  await q(
    `save_announcement_custom(${args.map((_, i) => `$${i + 1}`).join(",")})`,
    args,
  );
  return { start, end, day, due: chicagoReminderTime(day, "12:00"), id };
}

it("all active members see practice details while announcement text remains targeted", async () => {
  await customAnnouncement();
  await role("authenticated", a);
  expect(await q("(select count(*)::int from custom_practices)")).toBe(1);
  await role("authenticated", b);
  expect(await q("(select count(*)::int from custom_practices)")).toBe(1);
  expect(await q("(select count(*)::int from communication_posts)")).toBe(0);
  await role("postgres");
  await db.query("update members set status='inactive' where id=$1", [b]);
  await role("authenticated", b);
  expect(await q("(select count(*)::int from custom_practices)")).toBe(0);
  await role("postgres");
  expect(
    await q("(select announcement_id from custom_practices where id=$1)", [
      post,
    ]),
  ).toBe(post);
  await db.query("delete from communication_posts where id=$1", [post]);
  expect(await q("(select count(*)::int from custom_practices)")).toBe(0);
});
it("only recipients receive practice reminders and queued jobs lose eligibility after removal", async () => {
  const { due } = await customAnnouncement();
  await device(a);
  await device(b);
  await enqueue(due);
  await role("postgres");
  expect(
    await q(
      "(select count(*)::int from nudge_occurrences where source_kind='practice' and member_id=$1)",
      [a],
    ),
  ).toBe(1);
  expect(
    await q(
      "(select count(*)::int from nudge_occurrences where source_kind='practice' and member_id=$1)",
      [b],
    ),
  ).toBe(0);
  await db.query(
    "delete from communication_recipients where post_id=$1 and member_id=$2",
    [post, a],
  );
  expect(
    await q(
      "(select count(*)::int from nudge_occurrences o where source_kind='practice' and nudge_scheduled_valid(o,$1::timestamptz))",
      [due],
    ),
  ).toBe(0);
});
it("Google-only schedule entries cannot become operational practices", async () => {
  await role("postgres");
  expect(await q("practice_member_allowed('google-event',$1)", [a])).toBe(
    false,
  );
  expect(await q("(select count(*)::int from practice_schedule())")).toBe(0);
});

it("deleting an owned announcement removes practice reminders and audit records", async () => {
  const { due } = await customAnnouncement();
  await device(a);
  await enqueue(due);
  await role("postgres");
  expect(
    await q(
      "(select count(*)::int from nudge_occurrences where source_kind='practice')",
    ),
  ).toBeGreaterThan(0);
  await db.query("delete from communication_posts where id=$1", [post]);
  expect(await q("(select count(*)::int from custom_practices)")).toBe(0);
  expect(await q("(select count(*)::int from custom_practice_audit)")).toBe(0);
  expect(
    await q(
      "(select count(*)::int from nudge_occurrences where source_kind='practice')",
    ),
  ).toBe(0);
});

async function directAnnouncement(
  id: string,
  version: number,
  practice: string | null,
  source: string | null,
) {
  await role();
  return q(
    "save_announcement($1,$2,'announcement','Practice note','Updated message','individual','selected',array[$3::uuid],null,null,null,null,'',null,null,'',null,null,$4,$5)",
    [id, version, a, practice, source],
  );
}
it("rejects detaching an owned event and preserves both records", async () => {
  await customAnnouncement();
  await expect(directAnnouncement(post, 1, null, null)).rejects.toThrow(
    /cannot be detached/,
  );
  await role("postgres");
  expect(
    await q("(select practice_event_id from communication_posts where id=$1)", [
      post,
    ]),
  ).toBe(`custom:${post}`);
  expect(await q("(select count(*)::int from custom_practices)")).toBe(1);
});
it("rejects direct attachment of an existing practice to a new announcement", async () => {
  await customAnnouncement();
  const other = "00000000-0000-4000-8000-000000000011";
  await expect(
    directAnnouncement(other, 0, `custom:${post}`, "custom"),
  ).rejects.toThrow(/Create a practice event/);
  await role("postgres");
  expect(
    await q("(select count(*)::int from communication_posts where id=$1)", [
      other,
    ]),
  ).toBe(0);
});
it("allows editing an unchanged legacy custom association without claiming ownership", async () => {
  await customAnnouncement();
  await role("postgres");
  await db.query(
    "update custom_practices set announcement_id=null where id=$1",
    [post],
  );
  await directAnnouncement(post, 1, `custom:${post}`, "custom");
  await role("postgres");
  expect(
    await q("(select announcement_id from custom_practices where id=$1)", [
      post,
    ]),
  ).toBeNull();
  expect(
    await q("(select body from communication_posts where id=$1)", [post]),
  ).toBe("Updated message");
});
