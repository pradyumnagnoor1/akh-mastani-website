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
  await role();
  await q("set_exec_roles($1,$2::text[],'{}'::text[])", [id, values]);
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
  ).rejects.toThrow(/changed/);
  expect(
    await q(
      "(select action from member_audit where member_id=$1 order by id desc limit 1)",
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
    "Social",
  ]) {
    await role();
    await q(
      "set_exec_roles($1,$2::text[],(select exec_roles from members where id=$1))",
      [a, [group]],
    );
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
