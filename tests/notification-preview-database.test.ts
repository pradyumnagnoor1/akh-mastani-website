import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, beforeEach, afterAll, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
let db: PGlite;
const admin = "00000000-0000-4000-8000-000000000001",
  a = "00000000-0000-4000-8000-000000000002",
  b = "00000000-0000-4000-8000-000000000003";
const post = "00000000-0000-4000-8000-000000000010",
  other = "00000000-0000-4000-8000-000000000011";
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
  ])
    await db.exec(readFileSync(`supabase/migrations/${name}.sql`, "utf8"));
  expect(await q("(select enabled from nudge_fallback_control where id)")).toBe(
    false,
  );
});
afterAll(async () => {
  await db?.close();
});
beforeEach(async () => {
  await db.exec(
    "reset role;truncate auth.users cascade;truncate communication_posts cascade;truncate payment_batches cascade;truncate calendar_snapshot;update nudge_control set enabled=true,pilot_members=null;update nudge_fallback_control set enabled=true,pilot_members=null;",
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
async function makePost(
  kind = "announcement",
  id = post,
  mode = "individual",
  due: string | null = null,
) {
  await role();
  await q(
    "save_communication($1,0,$2,'Costume pickup','Bring your shoes',$3,'selected',array[$4::uuid,$5::uuid],null,$6::date)",
    [id, kind, mode, a, b, due],
  );
  await role("postgres");
  await db.query(
    "update communication_posts set created_at=$2::timestamptz-interval '2 days' where id=$1",
    [id, stamp],
  );
  await db.exec("delete from push_jobs");
}
const evening = "2026-10-12T23:00:00Z";
async function payloads(at = evening) {
  await role("postgres");
  return (
    await db.query<{ payload: { title: string; body: string; url: string } }>(
      "select nudge_payload(id,$1::timestamptz) payload from nudge_bundles order by member_id",
      [at],
    )
  ).rows.map((r) => r.payload);
}
it("nudges unread recipients without an author reminder and stops on Mark as read", async () => {
  await device(a);
  await device(b);
  await makePost();
  await role("authenticated", b);
  await q("complete_communication($1,1)", [post]);
  expect(await enqueue(evening)).toBe(1);
  expect((await payloads())[0].body).toBe(
    "Read & acknowledge this announcement.",
  );
  await role("authenticated", a);
  await q("complete_communication($1,1)", [post]);
  expect((await payloads())[0]).toBeNull();
});
it("bundles unread announcements and undated tasks with action-first counts", async () => {
  await device();
  await makePost();
  await makePost("task", other);
  expect(await enqueue(evening)).toBe(1);
  expect((await payloads())[0]).toMatchObject({
    title: "Reminder: AKH Mastani",
    body: "Acknowledge 1 announcement · Complete 1 to-do.",
    url: "/home",
  });
  expect(await enqueue(evening)).toBe(0);
  await role("authenticated", a);
  await q("complete_communication($1,1)", [other]);
  expect((await payloads())[0].body).toBe(
    "Read & acknowledge this announcement.",
  );
});
it("supports overdue followups, individual and shared completion", async () => {
  await device(a);
  await device(b);
  await makePost("task", post, "shared", "2026-10-09");
  expect(await enqueue(evening)).toBe(2);
  expect((await payloads())[0].body).toBe("Complete 1 pending to-do.");
  await role("authenticated", a);
  await q("complete_communication($1,1)", [post]);
  expect(await payloads()).toEqual([null, null]);
});
it("gates fallbacks independently and suppresses queued fallback after pause", async () => {
  await device(a);
  await device(b);
  await makePost();
  await role("postgres");
  await db.query(
    "update nudge_fallback_control set pilot_members=array[$1::uuid]",
    [a],
  );
  expect(await enqueue(evening)).toBe(1);
  await role("postgres");
  await db.exec("update nudge_fallback_control set enabled=false");
  expect((await payloads())[0]).toBeNull();
});
it("enforces age, quiet-hours and seven-day announcement cutoff", async () => {
  await device();
  await makePost();
  await role("postgres");
  await db.query(
    "update communication_posts set created_at=$1::timestamptz-interval '23 hours'",
    [evening],
  );
  expect(await enqueue(evening)).toBe(0);
  await role("postgres");
  await db.query(
    "update communication_posts set created_at=$1::timestamptz-interval '8 days'",
    [evening],
  );
  expect(await enqueue(evening)).toBe(0);
  await role("postgres");
  await db.query(
    "update communication_posts set created_at=$1::timestamptz-interval '2 days'",
    [evening],
  );
  expect(await enqueue("2026-10-12T22:59:00Z")).toBe(0);
  expect(await enqueue("2026-10-13T03:00:00Z")).toBe(0);
  expect(await enqueue(evening)).toBe(1);
});
it("retains daily quota and next-day eligibility without replaying skipped dates", async () => {
  await device();
  await makePost("task");
  await role("postgres");
  await db.query("insert into nudge_quota values($1,'2026-10-12',3)", [a]);
  expect(await enqueue(evening)).toBe(0);
  expect(await enqueue("2026-10-15T23:00:00Z")).toBe(1);
  await role("postgres");
  expect(
    await q("(select count(*) from nudge_occurrences where member_id=$1)", [a]),
  ).toBe(2);
});
async function prepare(id: string) {
  await role("postgres");
  const token = randomUUID();
  await db.query(
    "update push_jobs set lease_token=$1,lease_until=now()+interval '1 minute' where id=$2",
    [token, id],
  );
  await role("service_role");
  return q<{ title: string; body: string; url: string }>(
    "push_prepare_delivery($1,$2)",
    [id, token],
  );
}
it("labels the originating edit, including a creation still queued when the post changes", async () => {
  await device();
  await role();
  await q(
    "save_communication($1,0,'announcement','Original','Body','individual','selected',array[$2::uuid],null,null)",
    [post, a],
  );
  await role("postgres");
  const first = await q<string>("(select id from push_jobs)");
  await role();
  await q(
    "save_communication($1,1,'announcement','Edited title','Changed body','individual','selected',array[$2::uuid],null,null)",
    [post, a],
  );
  await role("postgres");
  const second = await q<string>("(select id from push_jobs where id<>$1)", [
    first,
  ]);
  expect((await prepare(first)).title).toBe("Edited title");
  expect((await prepare(second)).title).toBe(
    "Edited announcement: Edited title",
  );
  expect((await prepare(second)).title).toBe(
    "Edited announcement: Edited title",
  );
});
it("keeps fallback controls and helpers private", async () => {
  for (const name of ["anon", "authenticated", "service_role"]) {
    await role(name);
    await expect(
      db.exec("select * from nudge_fallback_control"),
    ).rejects.toThrow(/permission/);
  }
  await role();
  await expect(q("nudge_enqueue(now())")).rejects.toThrow(/permission/);
});
async function authorReminder(
  mode = "acknowledgment",
  linked: string | null = null,
) {
  await role("postgres");
  await db.query(
    "update communication_posts set reminder_at=$2::timestamptz,reminder_mode=$3,reminder_message='Bring black shoes',reminder_task_id=$4 where id=$1",
    [post, evening, mode, linked],
  );
}
it("keeps configured smart reminders working while automatic fallbacks are disabled", async () => {
  await device();
  await makePost();
  await authorReminder();
  await role("postgres");
  await db.exec("update nudge_fallback_control set enabled=false");
  expect(await enqueue(evening)).toBe(1);
  expect((await payloads())[0].body).toMatch(
    /^Read & acknowledge this announcement\./,
  );
  expect((await payloads())[0].body).toContain("Bring black shoes");
});
it("does not turn preparation reminders into acknowledgment demands", async () => {
  await device();
  await makePost();
  await authorReminder("preparation");
  await role("authenticated", a);
  await q("complete_communication($1,1)", [post]);
  expect(await enqueue(evening)).toBe(1);
  expect((await payloads())[0]).toMatchObject({
    title: "Reminder: Costume pickup",
    body: "Bring black shoes",
  });
});
it("counts a linked task once and never asks a read recipient to acknowledge again", async () => {
  await device();
  await makePost();
  await makePost("task", other, "individual", "2026-10-12");
  await authorReminder("linked-task", other);
  await role("authenticated", a);
  await q("complete_communication($1,1)", [post]);
  expect(await enqueue(evening)).toBe(1);
  expect((await payloads())[0].body).toBe("Complete 1 to-do.");
  await role("authenticated", a);
  await q("complete_communication($1,1)", [other]);
  expect((await payloads())[0]).toBeNull();
});
it("does not follow up before future deadlines and retains scheduled due stages", async () => {
  await device();
  await makePost("task", post, "individual", "2026-10-17");
  expect(await enqueue(evening)).toBe(0);
  await role("postgres");
  await db.exec("update communication_posts set due_on='2026-10-12'");
  expect(await enqueue(evening)).toBe(1);
  await role("postgres");
  expect(
    await q(
      "(select count(*) from nudge_occurrences where member_id=$1 and stage='incomplete-follow-up')",
      [a],
    ),
  ).toBe(0);
});
it("invalidates undated followups after a deadline changes and on expiry or recipient removal", async () => {
  await device();
  await makePost("task");
  expect(await enqueue(evening)).toBe(1);
  await role("postgres");
  await db.exec("update communication_posts set due_on='2026-11-01'");
  expect((await payloads())[0]).toBeNull();
  await role("postgres");
  await db.exec(
    "update communication_posts set due_on=null,expires_at='2026-10-12T22:59:00Z'",
  );
  expect((await payloads())[0]).toBeNull();
  await role("postgres");
  await db.query("delete from communication_recipients where member_id=$1", [
    a,
  ]);
  expect((await payloads())[0]).toBeNull();
});
it("does not reserve quota for an already-read configured reminder", async () => {
  await device();
  await makePost();
  await authorReminder();
  await role("authenticated", a);
  await q("complete_communication($1,1)", [post]);
  expect(await enqueue(evening)).toBe(0);
  await role("postgres");
  expect(await q("(select count(*) from nudge_quota)")).toBe(0);
});
it("prevents a same-day fallback after a configured reminder was sent", async () => {
  await device();
  await makePost();
  await authorReminder();
  await role("postgres");
  await db.exec(
    "update communication_posts set reminder_at='2026-10-12T14:00:00Z'",
  );
  expect(await enqueue(stamp)).toBe(1);
  await role("postgres");
  await db.exec("update push_jobs set status='sent'");
  expect(await enqueue(evening)).toBe(0);
});
it("does not reset daily followups on content edits", async () => {
  await device();
  await makePost();
  expect(await enqueue(evening)).toBe(1);
  await role();
  await q(
    "save_communication($1,1,'announcement','New title','Changed text','individual','selected',array[$2::uuid,$3::uuid],null,null)",
    [post, a, b],
  );
  expect(await enqueue("2026-10-13T00:00:00Z")).toBe(0);
  expect(await enqueue("2026-10-13T23:00:00Z")).toBe(1);
});
it("uses Chicago local scheduling across daylight saving boundaries", async () => {
  await device();
  await makePost("task");
  expect(await enqueue("2026-11-02T23:59:00Z")).toBe(0);
  expect(await enqueue("2026-11-03T00:00:00Z")).toBe(1);
  expect((await payloads("2026-11-03T00:00:00Z"))[0].title).toBe(
    "Reminder: AKH Mastani",
  );
});
it("rechecks inactive membership and private helper permissions", async () => {
  await device();
  await makePost();
  expect(await enqueue(evening)).toBe(1);
  await role("postgres");
  await db.query("update members set status='inactive' where id=$1", [a]);
  expect((await payloads())[0]).toBeNull();
  for (const name of ["anon", "authenticated", "service_role"]) {
    await role(name);
    await expect(q("nudge_enqueue_fallbacks(now())")).rejects.toThrow(
      /permission/,
    );
  }
});
it("labels legacy due reminders without exposing task content", async () => {
  await device();
  await makePost("task");
  await role("postgres");
  await db.exec("update nudge_control set enabled=false");
  await q(
    "push_enqueue(array[$1::uuid],'task','reminder:task:test',$2::uuid,'communication','/todos/'||$2::text)",
    [a, post],
  );
  const id = await q<string>("(select id from push_jobs)");
  expect(await prepare(id)).toMatchObject({
    title: "Reminder: AKH Mastani",
    body: "Complete your pending to-dos.",
    url: `/todos/${post}`,
  });
});

async function seedPractice(
  start = new Date(Date.now() + 3600000).toISOString(),
) {
  await role("postgres");
  await db.exec(
    "insert into calendar_connection(id) values(true) on conflict do nothing;update calendar_connection set version=1,calendar_id='test',client_id='test',encrypted_token='test'",
  );
  const source = await q<string>(
    "encode(sha256(convert_to('connected:1:test:test','UTF8')),'hex')",
  );
  const event = {
    id: "one",
    title: "Team practice",
    start,
    end: new Date(Date.parse(start) + 3600000).toISOString(),
    allDay: false,
    location: "Rec Center",
    recurringEventId: "weekly",
    originalStart: "2026-10-20T00:00:00Z",
  };
  await db.query(
    "insert into calendar_snapshot(id,source_fingerprint,events,last_success_at) values(true,$1,$2::jsonb,now()) on conflict(id) do update set events=excluded.events,last_success_at=now()",
    [source, JSON.stringify([event])],
  );
  return { source, event };
}
async function announcement(
  id = post,
  practice?: {
    source: string;
    event: { recurringEventId: string; originalStart: string };
  },
  actor = admin,
  postingRole: string | null = null,
  version = 0,
  body = "Bring shoes",
) {
  await role("authenticated", actor);
  return q(
    "save_announcement($1,$2,'announcement','Practice notes',$3,'individual','selected',array[$4::uuid],null,null,null,null,'',null,null,'',null,$5,$6,$7)",
    [
      id,
      version,
      body,
      a,
      postingRole,
      practice
        ? `${practice.event.recurringEventId}@${practice.event.originalStart}`
        : null,
      practice?.source ?? null,
    ],
  );
}
it("preserves practice reminder merging for publication but labels a subsequent edit", async () => {
  const practice = await seedPractice(
    new Date(Date.now() + 45 * 60000).toISOString(),
  );
  await device();
  await announcement(post, practice);
  await role("postgres");
  await db.exec("update nudge_control set enabled=false");
  const created = await q<string>(
    "(select id from push_jobs where source_kind='communication')",
  );
  expect(await prepare(created)).toBeNull();
  await role("postgres");
  const reminder = await q<string>(
    "(select id from push_jobs where source_kind='practice')",
  );
  expect((await prepare(reminder)).title).toMatch(/^Reminder: Practice/);
  await announcement(post, practice, admin, null, 1, "Updated instruction");
  await role("postgres");
  const edited = await q<string>(
    "(select id from push_jobs where source_kind='communication' and id<>$1)",
    [created],
  );
  const payload = await prepare(edited);
  expect(payload.title).toBe("Edited announcement: Practice: Practice notes");
  expect(payload.body).toContain("Updated instruction");
});
it("adds action prompts to mixed practice bundles without leaking another dancer's note", async () => {
  const { chicagoReminderTime } =
    await import("../src/features/notifications/reminder-policy");
  const day = new Date(Date.now() + 2 * 86400_000).toISOString().slice(0, 10);
  const due = chicagoReminderTime(day, "18:00");
  const practice = await seedPractice(chicagoReminderTime(day, "19:00"));
  await device(a);
  await device(b);
  await makePost("task", other);
  await announcement(post, practice, admin, null, 0, "Private rehearsal note");
  await role("postgres");
  await db.query(
    "update calendar_snapshot set last_success_at=$1::timestamptz",
    [due],
  );
  expect(await enqueue(due)).toBe(2);
  const [own, otherMember] = await payloads(due);
  expect(own.title).toMatch(/^Reminder: Practice/);
  expect(own.body).toMatch(/^Complete 1 to-do\./);
  expect(own.body).toContain("Private rehearsal note");
  expect(otherMember.body).not.toContain("Private rehearsal note");
  expect(own.url).toBe("/home");
});
it("suppresses no-op announcement saves and fences stale delivery leases", async () => {
  await device();
  await role();
  await q(
    "save_communication($1,0,'announcement','Same','Body','individual','selected',array[$2::uuid],null,null)",
    [post, a],
  );
  await q(
    "save_communication($1,1,'announcement','Same','Body','individual','selected',array[$2::uuid],null,null)",
    [post, a],
  );
  await role("postgres");
  expect(await q("(select count(*) from push_jobs)")).toBe(1);
  const id = await q<string>("(select id from push_jobs)");
  await role("service_role");
  expect(
    await q("push_prepare_delivery($1,$2)", [id, randomUUID()]),
  ).toBeNull();
});
it("purges automatic followups with the source, leaving unrelated tasks", async () => {
  await device();
  await makePost();
  await makePost("task", other);
  expect(await enqueue(evening)).toBe(1);
  await role("postgres");
  await db.query("delete from communication_posts where id=$1", [post]);
  expect((await payloads())[0].body).toBe("Complete 1 pending to-do.");
  expect(
    await q("(select count(*) from nudge_occurrences where source_id=$1)", [
      post,
    ]),
  ).toBe(0);
});
it("sends a single linked-task reminder directly to the authorized task", async () => {
  await device();
  await makePost();
  await makePost("task", other);
  await authorReminder("linked-task", other);
  await role("postgres");
  await db.exec("update nudge_fallback_control set enabled=false");
  expect(await enqueue(evening)).toBe(1);
  expect((await payloads())[0].url).toBe(`/todos/${other}`);
  expect((await payloads())[0].body).toMatch(/^Complete 1 pending to-do\./);
});
it("allows unread fallback when the linked-task stop condition is already satisfied", async () => {
  await device();
  await makePost();
  await makePost("task", other);
  await authorReminder("linked-task", other);
  await role("authenticated", a);
  await q("complete_communication($1,1)", [other]);
  expect(await enqueue(evening)).toBe(1);
  expect((await payloads())[0].body).toBe(
    "Read & acknowledge this announcement.",
  );
});
it("reserves a future linked-task reminder's day without an earlier automatic duplicate", async () => {
  await device();
  await makePost();
  await makePost("task", other);
  await authorReminder("linked-task", other);
  await role("postgres");
  await db.exec(
    "update communication_posts set reminder_at='2026-10-13T02:00:00Z' where kind='announcement'",
  );
  expect(await enqueue(evening)).toBe(0);
  expect(await enqueue("2026-10-13T02:00:00Z")).toBe(1);
});
it("permits fallback after a configured reminder window was missed without delivery", async () => {
  await device();
  await makePost();
  await authorReminder();
  await role("postgres");
  await db.exec(
    "update communication_posts set reminder_at='2026-10-12T14:00:00Z'",
  );
  expect(await enqueue(evening)).toBe(1);
  expect((await payloads())[0].body).toBe(
    "Read & acknowledge this announcement.",
  );
});
it("keeps preparation instructions in mixed action bundles", async () => {
  await device();
  await makePost();
  await makePost("task", other, "individual", "2026-10-12");
  await authorReminder("preparation");
  expect(await enqueue(evening)).toBe(1);
  const payload = (await payloads())[0];
  expect(payload.body).toMatch(/^Complete 1 to-do/);
  expect(payload.body).toContain("Bring black shoes");
  expect(payload.body).not.toContain("Acknowledge");
});
it("does not let impossible future reminders block actions before expiration", async () => {
  await device();
  await makePost();
  await makePost("task", other);
  await authorReminder("linked-task", other);
  await role("postgres");
  await db.exec(
    "update communication_posts set reminder_at='2026-10-13T02:00:00Z',expires_at='2026-10-13T00:00:00Z' where kind='announcement'",
  );
  expect(await enqueue(evening)).toBe(1);
  expect((await payloads())[0].body).toBe(
    "Acknowledge 1 announcement · Complete 1 to-do.",
  );
});
it("shares one quota reservation across multiple devices and rejects replay", async () => {
  await device(a);
  await device(a, "second");
  await makePost();
  const runs = await Promise.all([enqueue(evening), enqueue(evening)]);
  expect(runs.reduce((x, y) => x + y, 0)).toBe(2);
  await role("postgres");
  expect(
    await q("(select reserved from nudge_quota where member_id=$1)", [a]),
  ).toBe(1);
});
it("keeps payment reminders generic in smart and legacy previews", async () => {
  await device();
  await role();
  const batch = randomUUID();
  await q(
    "issue_payment_charges($1,1000,'Private fine','Private instructions','2026-10-12','individual',array[$2::uuid],null)",
    [batch, a],
  );
  await role("postgres");
  await db.exec("delete from push_jobs");
  expect(await enqueue(evening)).toBe(1);
  expect((await payloads())[0]).toMatchObject({
    title: "Reminder: AKH Mastani",
    body: "Review 1 payment.",
  });
  await role("postgres");
  await db.exec("update nudge_control set enabled=false;delete from push_jobs");
  const charge = await q<string>("(select id from payment_charges)");
  await q(
    "push_enqueue(array[$1::uuid],'payment','reminder:payment:test',$2::uuid,'payment','/payments/'||$2::text)",
    [a, charge],
  );
  const id = await q<string>("(select id from push_jobs)");
  expect(await prepare(id)).toMatchObject({
    title: "Reminder: AKH Mastani",
    body: "Review your pending payments.",
  });
});
