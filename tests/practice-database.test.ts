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

async function roles(id: string, values: string[]) {
  await role("postgres");
  await db.query("update members set is_admin=true where id=$1", [id]);
  await role();
  await q(
    "set_exec_roles($1,$2::text[],(select exec_roles from members where id=$1))",
    [id, values],
  );
  await role("postgres");
  await db.query("update members set is_admin=false where id=$1", [id]);
  await role();
}
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
it("owner alone assigns roles; captain gains full DB management and loses it on revocation", async () => {
  await roles(a, ["Captain"]);
  await expect(
    q("set_exec_roles($1,array['Social'],'{}')", [a]),
  ).rejects.toThrow(/admin/);
  expect(
    await q(
      "(select action from member_audit where member_id=$1 and action='exec_roles_changed' order by id desc limit 1)",
      [a],
    ),
  ).toBe("exec_roles_changed");
  await role("authenticated", a);
  expect(await q("admin_member()")).toBe(true);
  await expect(
    q("set_exec_roles($1,array['Captain'],'{}')", [b]),
  ).rejects.toThrow(/Owner/);
  await q("set_member_status($1,'inactive')", [b]);
  await role();
  await q("set_exec_roles($1,'{}',array['Captain'])", [a]);
  await role("authenticated", a);
  expect(await q("admin_member()")).toBe(false);
  await expect(q("set_member_status($1,'active')", [b])).rejects.toThrow(
    /Admin/,
  );
  await expect(
    db.exec("update members set exec_roles=array['Captain']"),
  ).rejects.toThrow(/permission/);
});
it("all exec groups get full management while role spoofing is blocked and legacy saves get database attribution", async () => {
  for (const group of [
    "Captain",
    "Logistics & Finance",
    "Production",
    "AO",
    "Hospitality",
    "Social",
  ]) {
    await roles(a, [group]);
    await role("authenticated", a);
    expect(await q("admin_member()")).toBe(true);
    await q("set_member_status($1,'inactive')", [b]);
    await q("set_member_status($1,'active')", [b]);
    await expect(
      q("set_exec_roles($1,array['Captain'],'{}')", [b]),
    ).rejects.toThrow(/Owner/);
  }
  await announcement(post, undefined, a, "Social");
  await announcement(post, undefined, a, "Social", 1, "Updated message");
  await expect(
    announcement(randomUUID(), undefined, a, "Captain"),
  ).rejects.toThrow(/assigned/);
  await announcement(other, undefined, admin);
  await announcement(other, undefined, a, null, 1, "Exec can edit this too");
  await role("authenticated", a);
  const legacy = randomUUID();
  await q(
    "save_communication($1,0,'announcement','Legacy post','Body','individual','team','{}')",
    [legacy],
  );
  expect(
    await q("(select author_exec_role from communication_posts where id=$1)", [
      legacy,
    ]),
  ).toBe("Social");
  expect(
    await q("(select author_name from communication_posts where id=$1)", [
      legacy,
    ]),
  ).toBe("Dancer");
  expect(
    await q("(select author_exec_role from communication_posts where id=$1)", [
      post,
    ]),
  ).toBe("Social");
  await role();
  await q("correct_member_name($1,'New name')", [a]);
  await role("authenticated", a);
  expect(
    await q("(select author_name from communication_posts where id=$1)", [
      post,
    ]),
  ).toBe("Dancer");
  await q("manage_communication($1,2,'delete')", [post]);
  expect(
    await q("(select count(*)::int from communication_posts where id=$1)", [
      post,
    ]),
  ).toBe(0);
});
it("linked notes preserve occurrence identity on reschedule, reject fake links, and share calendar reminders", async () => {
  const practice = await seedPractice();
  await announcement(post, practice);
  await role("postgres");
  expect(
    await q(
      "(select reminder_at is null and practice_event_id='weekly@2026-10-20T00:00:00Z' from communication_posts where id=$1)",
      [post],
    ),
  ).toBe(true);
  const moved = {
    ...practice,
    event: {
      ...practice.event,
      start: new Date(Date.now() + 7200000).toISOString(),
    },
  };
  await db.query("update calendar_snapshot set events=$1::jsonb", [
    JSON.stringify([moved.event]),
  ]);
  expect(
    await q("practice_event($1,$2)->>'start'", [
      practice.source,
      "weekly@2026-10-20T00:00:00Z",
    ]),
  ).toBe(moved.event.start);
  await expect(
    announcement(other, { ...practice, source: "wrong" }),
  ).rejects.toThrow(/Practice unavailable/);
  await role("postgres");
  const preview = await q<{ body: string }>(
    "practice_preview($1::jsonb,$2,$3)",
    [JSON.stringify(practice.event), practice.source, a],
  );
  expect(preview.body).toContain("Bring shoes");
  const hidden = await q<{ body: string }>(
    "practice_preview($1::jsonb,$2,$3)",
    [JSON.stringify(practice.event), practice.source, b],
  );
  expect(hidden.body).not.toContain("Bring shoes");
  await db.query(
    "update communication_posts set reminder_at=now()+interval '1 hour',reminder_mode='preparation' where id=$1",
    [post],
  );
  expect(
    await q(
      "(select reminder_at is null from communication_posts where id=$1)",
      [post],
    ),
  ).toBe(true);
  await role("authenticated", b);
  expect(
    await q("(select count(*)::int from communication_posts where id=$1)", [
      post,
    ]),
  ).toBe(0);
});
it("schema helpers and ledgers are private; expired/deleted notes leave shared previews", async () => {
  const practice = await seedPractice();
  await announcement(post, practice);
  await role("authenticated", a);
  await expect(q("practice_preview('{}','test',$1)", [a])).rejects.toThrow(
    /permission/,
  );
  await role("postgres");
  await db.query(
    "update communication_posts set expires_at=now()-interval '1 second' where id=$1",
    [post],
  );
  expect(
    (
      await q<{ body: string }>("practice_preview($1::jsonb,$2,$3)", [
        JSON.stringify(practice.event),
        practice.source,
        a,
      ])
    ).body,
  ).not.toContain("Bring shoes");
  await db.query("delete from communication_posts where id=$1", [post]);
  expect(
    (
      await q<{ body: string }>("practice_preview($1::jsonb,$2,$3)", [
        JSON.stringify(practice.event),
        practice.source,
        a,
      ])
    ).body,
  ).not.toContain("Bring shoes");
});

it("bundles one practice reminder per member with only their linked notes and no announcement occurrences", async () => {
  const { chicagoReminderTime } =
    await import("../src/features/notifications/reminder-policy");
  const { chicagoDay, moveDay } = await import("../src/features/calendar/day");
  const day = moveDay(chicagoDay(), 1);
  const due = chicagoReminderTime(day, "12:00");
  const start = chicagoReminderTime(day, "13:00");
  const practice = await seedPractice(start);
  await device(a);
  await device(b);
  await announcement(
    post,
    practice,
    admin,
    null,
    0,
    "First practice instruction",
  );
  await announcement(
    other,
    practice,
    admin,
    null,
    0,
    "Second practice instruction",
  );
  await role("postgres");
  await db.query("update calendar_snapshot set last_success_at=$1", [due]);
  await db.exec("delete from push_jobs");
  await enqueue(due);
  await enqueue(due);
  await role("postgres");
  expect(
    await q(
      "(select count(*)::int from nudge_occurrences where source_kind='announcement')",
    ),
  ).toBe(0);
  expect(await q("(select count(*)::int from push_jobs)")).toBe(2);
  const bundles = await db.query<{ id: string; member_id: string }>(
    "select id,member_id from nudge_bundles order by member_id",
  );
  const payloads = await Promise.all(
    bundles.rows.map(async (bundle) => ({
      member: bundle.member_id,
      payload: await q<{ title: string; body: string; url: string }>(
        "nudge_payload($1,$2::timestamptz)",
        [bundle.id, due],
      ),
    })),
  );
  const own = payloads.find((p) => p.member === a)!.payload,
    hidden = payloads.find((p) => p.member === b)!.payload;
  expect(own.title).toContain("1:00 PM");
  expect(own.title).toContain("Rec Center");
  expect(own.body).toContain("First practice instruction");
  expect(own.body).toContain("Second practice instruction");
  expect(hidden.body).not.toContain("instruction");
  expect(own.url).toContain("date=");
  expect(own.title).not.toContain("Captain");
  await announcement(post, practice, admin, null, 1, "Updated instruction");
  await role("postgres");
  const changed = await q<{ body: string }>(
    "nudge_payload($1,$2::timestamptz)",
    [bundles.rows.find((x) => x.member_id === a)!.id, due],
  );
  expect(changed.body).toContain("Updated instruction");
  expect(changed.body).not.toContain("First practice instruction");
  await db.exec("update calendar_snapshot set events='[]'");
  expect(
    await q("nudge_payload($1,$2::timestamptz)", [bundles.rows[0].id, due]),
  ).toBeNull();
});
it("legacy practice delivery rebuilds the same recipient-filtered preview and drops cancelled events", async () => {
  const practice = await seedPractice(
    new Date(Date.now() + 45 * 60000).toISOString(),
  );
  await device(a);
  await announcement(
    post,
    practice,
    admin,
    null,
    0,
    "Private rehearsal details",
  );
  await role("postgres");
  await db.exec("update nudge_control set enabled=false;delete from push_jobs");
  await role("service_role");
  await q("push_enqueue_reminders()");
  await role("postgres");
  const job = (
    await db.query<{ id: string }>(
      "select id from push_jobs where source_kind='practice'",
    )
  ).rows[0];
  expect(job).toBeTruthy();
  const token = randomUUID();
  await db.query(
    "update push_jobs set lease_token=$1,lease_until=now()+interval '1 minute' where id=$2",
    [token, job.id],
  );
  await role("service_role");
  const payload = await q<{ title: string; body: string }>(
    "push_prepare_delivery($1,$2)",
    [job.id, token],
  );
  expect(payload.body).toContain("Private rehearsal details");
  expect(payload.title).toContain("Practice");
  await role("postgres");
  await db.exec("update calendar_snapshot set events='[]'");
  await role("service_role");
  expect(await q("push_prepare_delivery($1,$2)", [job.id, token])).toBeNull();
});

it("keeps a new publication after a practice reminder was sent and merges only into a pending delivery", async () => {
  const practice = await seedPractice(
    new Date(Date.now() + 45 * 60000).toISOString(),
  );
  await device(a);
  await role("postgres");
  await db.exec("update nudge_control set enabled=false");
  await role("service_role");
  await q("push_enqueue_reminders()");
  await role("postgres");
  await db.exec(
    "update push_jobs set status='sent' where source_kind='practice'",
  );
  await announcement(
    post,
    practice,
    admin,
    null,
    0,
    "New information after reminder",
  );
  await role("postgres");
  const job = (
    await db.query<{ id: string }>(
      "select id from push_jobs where source_kind='communication' limit 1",
    )
  ).rows[0];
  const token = randomUUID();
  await db.query(
    "update push_jobs set lease_token=$1,lease_until=now()+interval '1 minute' where id=$2",
    [token, job.id],
  );
  await role("service_role");
  const payload = await q<{ title: string; body: string }>(
    "push_prepare_delivery($1,$2)",
    [job.id, token],
  );
  expect(payload.body).toContain("New information after reminder");
  expect(payload.title).toBe("Practice: Practice notes");
  expect(payload.body).not.toContain("Captain");
  await role("postgres");
  await db.exec(
    "update push_jobs set status='pending' where source_kind='practice'",
  );
  await role("service_role");
  expect(await q("push_prepare_delivery($1,$2)", [job.id, token])).toBeNull();
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
it("custom practice and announcement save atomically and stay canonical across changes", async () => {
  const { start, end } = await customAnnouncement();
  await role("postgres");
  expect(
    await q(
      "(select practice_source='custom' and practice_event_id='custom:'||id and reminder_at is null from communication_posts where id=$1)",
      [post],
    ),
  ).toBe(true);
  expect(await q("(select count(*)::int from custom_practices)")).toBe(1);
  await role("authenticated", a);
  await expect(
    q("save_custom_practice($1,1,'Forged',$2,$3,'PEAP')", [post, start, end]),
  ).rejects.toThrow(/Management/);
  await expect(q("practice_schedule()")).rejects.toThrow(/permission/);
  await role();
  await expect(
    q("save_custom_practice($1,0,'Stale',$2,$3,'PEAP')", [post, start, end]),
  ).rejects.toThrow(/changed/);
  await q(
    "save_custom_practice($1,1,'Moved practice',$2::timestamptz+interval '1 hour',$3::timestamptz+interval '1 hour','Rudder')",
    [post, start, end],
  );
  await role("postgres");
  const event = await q<{ title: string; location: string; start: string }>(
    "practice_event('custom',$1)",
    [`custom:${post}`],
  );
  expect(event.title).toBe("Moved practice");
  expect(event.location).toBe("Rudder");
  expect(event.start).not.toBe(start);
  await role();
  await expect(customAnnouncement(other, "", 0)).rejects.toThrow(/message/);
  await role("postgres");
  expect(
    await q("(select count(*)::int from custom_practices where id=$1)", [
      other,
    ]),
  ).toBe(0);
});
it("custom practices remind without Google, share recipient-safe notes, and deletion cleans history/jobs", async () => {
  const { due } = await customAnnouncement();
  await device(a);
  await device(b);
  await role("postgres");
  await db.exec("delete from calendar_snapshot;delete from push_jobs");
  await enqueue(due);
  await enqueue(due);
  await role("postgres");
  expect(await q("(select count(*)::int from push_jobs)")).toBe(2);
  expect(
    await q(
      "(select count(*)::int from nudge_occurrences where source_kind='announcement')",
    ),
  ).toBe(0);
  const bundle = await q<string>(
    "(select id from nudge_bundles where member_id=$1)",
    [a],
  );
  const payload = await q<{ title: string; body: string; url: string }>(
    "nudge_payload($1,$2::timestamptz)",
    [bundle, due],
  );
  expect(payload.body).toContain("Bring extra shoes");
  expect(payload.title).toContain("PEAP");
  expect(payload.url).toContain("custom:");
  const hidden = await q<{ body: string }>(
    "nudge_payload((select id from nudge_bundles where member_id=$1),$2::timestamptz)",
    [b, due],
  );
  expect(hidden.body).not.toContain("Bring extra shoes");
  await role();
  await q("delete_custom_practice($1,1)", [post]);
  await role("postgres");
  expect(await q("practice_event('custom',$1)", [`custom:${post}`])).toBeNull();
  expect(await q("(select count(*)::int from custom_practice_audit)")).toBe(0);
  expect(await q("(select count(*)::int from nudge_occurrences)")).toBe(0);
  expect(await q("(select count(*)::int from push_jobs)")).toBe(0);
  expect(
    await q(
      "(select practice_snapshot is null from communication_posts where id=$1)",
      [post],
    ),
  ).toBe(true);
});
it("legacy custom practice reminders validate and deliver through the existing worker", async () => {
  await customAnnouncement();
  await device(a);
  await role("postgres");
  await db.exec("update nudge_control set enabled=false;delete from push_jobs");
  const start = new Date(Date.now() + 45 * 60000).toISOString(),
    end = new Date(Date.now() + 105 * 60000).toISOString();
  await role();
  await q("save_custom_practice($1,1,'Extra team practice',$2,$3,'PEAP')", [
    post,
    start,
    end,
  ]);
  await role("service_role");
  await q("push_enqueue_reminders()");
  await role("postgres");
  const job = await q<string>(
    "(select id from push_jobs where source_kind='practice')",
  );
  expect(job).toBeTruthy();
  const token = randomUUID();
  await db.query(
    "update push_jobs set lease_token=$1,lease_until=now()+interval '1 minute' where id=$2",
    [token, job],
  );
  await role("service_role");
  expect(
    (await q<{ body: string }>("push_prepare_delivery($1,$2)", [job, token]))
      .body,
  ).toContain("Bring extra shoes");
});

it("deleting a custom practice scrubs mixed reminder payloads and preserves the task", async () => {
  const { due, day } = await customAnnouncement();
  await role();
  await q(
    "save_communication($1,0,'task','Finish forms','Submit forms','individual','selected',$2::uuid[],null,$3::date)",
    [other, [a], day],
  );
  await device(a);
  await role("postgres");
  await db.exec("delete from push_jobs");
  await enqueue(due);
  await role("postgres");
  const bundle = await q<string>(
    "(select id from nudge_bundles where member_id=$1)",
    [a],
  );
  expect(
    await q(
      "(select count(*)::int from nudge_occurrences where bundle_id=$1)",
      [bundle],
    ),
  ).toBeGreaterThan(1);
  expect(
    JSON.stringify(
      await q("(select payload from push_jobs where source_id=$1)", [bundle]),
    ),
  ).toContain("PEAP");
  await role();
  await q("delete_custom_practice($1,1)", [post]);
  await role("postgres");
  expect(
    await q("(select count(*)::int from push_jobs where source_id=$1)", [
      bundle,
    ]),
  ).toBe(1);
  const stored = JSON.stringify(
    await q("(select payload from push_jobs where source_id=$1)", [bundle]),
  );
  expect(stored).not.toMatch(/PEAP|extra shoes|custom:/);
  const payload = await q<{ title: string; body: string }>(
    "nudge_payload($1,$2::timestamptz)",
    [bundle, due],
  );
  expect(JSON.stringify(payload)).toContain(`/todos/${other}`);
  expect(payload.body).toContain("1 to-do");
  expect(JSON.stringify(payload)).not.toMatch(/PEAP|extra shoes|custom:/);
});

it("only existing active admins can receive exec roles and stale saves cannot overwrite", async () => {
  await role();
  await expect(
    q("set_exec_roles($1,array['Captain'],'{}')", [a]),
  ).rejects.toThrow(/existing active admin/);
  await role("postgres");
  await db.query("update members set is_admin=true where id=$1", [a]);
  await role();
  await q("set_exec_roles($1,array['Captain'],'{}')", [a]);
  await expect(
    q("set_exec_roles($1,array['Social'],'{}')", [a]),
  ).rejects.toThrow(/changed/);
  expect(await q("(select exec_roles from members where id=$1)", [a])).toEqual([
    "Captain",
  ]);
  await role("postgres");
  await db.query("update members set is_admin=false where id=$1", [a]);
  await role();
  await expect(
    q("set_exec_roles($1,array['Social'],array['Captain'])", [a]),
  ).rejects.toThrow(/existing active admin/);
  await q("set_exec_roles($1,'{}',array['Captain'])", [a]);
  await role("postgres");
  await db.query(
    "update members set is_admin=true,status='inactive' where id=$1",
    [a],
  );
  await role();
  await expect(
    q("set_exec_roles($1,array['Social'],'{}')", [a]),
  ).rejects.toThrow(/existing active admin/);
});

it("AO and Hospitality are valid attributed roles with preserved eligibility and post history", async () => {
  await roles(a, ["AO"]);
  await announcement(post, undefined, a, "AO");
  await roles(a, ["Hospitality"]);
  await announcement(other, undefined, a, "Hospitality");
  await role("postgres");
  expect(
    await q("(select author_exec_role from communication_posts where id=$1)", [
      post,
    ]),
  ).toBe("AO");
  expect(
    await q("(select author_exec_role from communication_posts where id=$1)", [
      other,
    ]),
  ).toBe("Hospitality");
  await role();
  await expect(
    q("set_exec_roles($1,array['Hospitality'],'{}')", [b]),
  ).rejects.toThrow(/existing active admin/);
  await expect(
    q("set_exec_roles($1,array['Unknown'],'{}')", [admin]),
  ).rejects.toThrow(/valid exec/);
});

it("to-do author roles are validated and remain original after edits by another exec", async () => {
  await roles(a, ["AO", "Hospitality"]);
  const save = async (
    version: number,
    postingRole: string | null,
    body = "Bring forms",
  ) =>
    q(
      "save_announcement($1,$2,'task','Hospitality checklist',$3,'individual','selected',array[$4::uuid],null,null,null,null,'',null,null,'',null,$5,null,null)",
      [post, version, body, a, postingRole],
    );
  await role("authenticated", a);
  await expect(save(0, "Captain")).rejects.toThrow(/assigned/);
  await save(0, "Hospitality");
  expect(
    await q("(select author_exec_role from communication_posts where id=$1)", [
      post,
    ]),
  ).toBe("Hospitality");
  await role();
  await save(1, "Hospitality", "Updated checklist");
  await expect(save(2, "AO")).rejects.toThrow(/Original posting role/);
  await roles(a, ["AO"]);
  await role("authenticated", a);
  await save(2, "Hospitality", "Role changed later");
  expect(
    await q("(select author_exec_role from communication_posts where id=$1)", [
      post,
    ]),
  ).toBe("Hospitality");
});

function linkedData(id = post) {
  return {
    target_id: id,
    expected_version: 0,
    post_kind: "announcement",
    post_title: "Bring forms",
    post_body: "Submit the forms",
    task_mode: "individual",
    audience: "selected",
    recipient_ids: [a],
    source_id: null,
    due_date: null,
    expiration_date: null,
    image_object: null,
    image_alt: "",
    reminder_time: null,
    reminder_type: null,
    reminder_text: "",
    linked_task: null,
    posting_role: null,
    practice_id: null,
    calendar_source: null,
  };
}
it("linked announcements create a canonical task with independent progress, private recipients and one publication", async () => {
  await device(a);
  await role();
  await q("save_announcement_with_todo($1::jsonb,$2,null,'individual')", [
    JSON.stringify(linkedData()),
    other,
  ]);
  expect(
    await q("(select linked_todo_id from communication_posts where id=$1)", [
      post,
    ]),
  ).toBe(other);
  expect(
    await q("(select title from communication_posts where id=$1)", [other]),
  ).toBe("Bring forms");
  await role("postgres");
  expect(await q("(select count(*)::int from push_jobs)")).toBe(1);
  expect(
    await q("(select count(*)::int from push_jobs where source_id=$1)", [
      other,
    ]),
  ).toBe(0);
  await role("authenticated", b);
  expect(
    await q(
      "(select count(*)::int from communication_posts where id=any($1::uuid[]))",
      [[post, other]],
    ),
  ).toBe(0);
  await expect(
    q("save_announcement_with_todo($1::jsonb,$2,null,'individual')", [
      JSON.stringify(linkedData(randomUUID())),
      randomUUID(),
    ]),
  ).rejects.toThrow(/Management/);
  await role("authenticated", a);
  await q("complete_communication($1,1)", [post]);
  expect(
    await q(
      "(select completed_at is null from communication_recipients where post_id=$1 and member_id=$2)",
      [other, a],
    ),
  ).toBe(true);
  await q("complete_communication($1,1)", [other]);
  expect(
    await q(
      "(select completed_at is not null from communication_recipients where post_id=$1 and member_id=$2)",
      [post, a],
    ),
  ).toBe(true);
});
it("linked save rolls back conflicts and deleting a task detaches the announcement with a new revision", async () => {
  await role();
  await q("save_announcement_with_todo($1::jsonb,$2,null,'shared')", [
    JSON.stringify(linkedData()),
    other,
  ]);
  const extra = randomUUID();
  await expect(
    q("save_announcement_with_todo($1::jsonb,$2,null,'individual')", [
      JSON.stringify({
        ...linkedData(),
        expected_version: 1,
        post_body: "Must roll back",
      }),
      extra,
    ]),
  ).rejects.toThrow(/already has/);
  expect(
    await q("(select body from communication_posts where id=$1)", [post]),
  ).toBe("Submit the forms");
  expect(
    await q("(select count(*)::int from communication_posts where id=$1)", [
      extra,
    ]),
  ).toBe(0);
  await q("delete_team_item($1,1,'communication')", [other]);
  expect(
    await q(
      "(select linked_todo_id is null and version=2 from communication_posts where id=$1)",
      [post],
    ),
  ).toBe(true);
  await expect(
    q("save_announcement_with_todo($1::jsonb,$2,null,'individual')", [
      JSON.stringify({ ...linkedData(), expected_version: 1 }),
      extra,
    ]),
  ).rejects.toThrow(/changed/);
});
it("deleting the announcement preserves its actionable task and task edits remain independent", async () => {
  await role();
  await q("save_announcement_with_todo($1::jsonb,$2,null,'shared')", [
    JSON.stringify(linkedData()),
    other,
  ]);
  await q(
    "save_announcement($1,1,'task','New task title','New instructions','shared','selected',array[$2::uuid],null,null,null,null,'',null,null,'',null,null,null,null)",
    [other, a],
  );
  expect(
    await q("(select body from communication_posts where id=$1)", [post]),
  ).toBe("Submit the forms");
  await q("delete_team_item($1,1,'communication')", [post]);
  expect(
    await q("(select count(*)::int from communication_posts where id=$1)", [
      other,
    ]),
  ).toBe(1);
});

it("adding a to-do to an existing unchanged announcement still notifies its recipients", async () => {
  await device(a);
  await announcement();
  await role("postgres");
  await db.exec("delete from push_jobs");
  await role();
  await q("save_announcement_with_todo($1::jsonb,$2,null,'individual')", [
    JSON.stringify({
      ...linkedData(),
      expected_version: 1,
      post_title: "Practice notes",
      post_body: "Bring shoes",
    }),
    other,
  ]);
  await role("postgres");
  expect(
    await q("(select count(*)::int from push_jobs where source_id=$1)", [
      other,
    ]),
  ).toBe(1);
});
it("a custom practice announcement can create a shared to-do in the same transaction", async () => {
  const custom = randomUUID();
  await role();
  const data = {
    ...linkedData(),
    recipient_ids: [a, b],
    practice_id: "__custom__",
    custom_id: custom,
    custom_version: 0,
    custom_title: "Extra rehearsal",
    custom_start: new Date(Date.now() + 86400000).toISOString(),
    custom_end: new Date(Date.now() + 90000000).toISOString(),
    custom_location: "PEAP",
  };
  await q("save_announcement_with_todo($1::jsonb,$2,null,'shared')", [
    JSON.stringify(data),
    other,
  ]);
  expect(
    await q("(select practice_event_id from communication_posts where id=$1)", [
      post,
    ]),
  ).toBe(`custom:${custom}`);
  expect(
    await q(
      "(select practice_event_id is null and completion_mode='shared' from communication_posts where id=$1)",
      [other],
    ),
  ).toBe(true);
  await role("authenticated", b);
  await q("complete_communication($1,1)", [other]);
  await role("authenticated", a);
  expect(
    await q(
      "(select completed_at is not null from communication_posts where id=$1)",
      [other],
    ),
  ).toBe(true);
  expect(
    await q(
      "(select completed_at is null from communication_recipients where post_id=$1 and member_id=$2)",
      [post, a],
    ),
  ).toBe(true);
});
