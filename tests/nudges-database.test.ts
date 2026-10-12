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
async function task(id = post, mode = "individual", due = "2026-10-12") {
  await role();
  await q(
    "save_communication($1,0,'task','Learn opener','Private details',$2,'selected',array[$3::uuid,$4::uuid],null,$5::date)",
    [id, mode, a, b, due],
  );
  await db.exec("reset role;delete from push_jobs");
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
it("loads the additive migration and keeps raw ledgers/settings private", async () => {
  for (const name of ["anon", "authenticated", "service_role"]) {
    await role(name);
    for (const table of [
      "nudge_control",
      "nudge_occurrences",
      "nudge_bundles",
      "nudge_quota",
    ])
      await expect(db.exec(`select * from ${table}`)).rejects.toThrow(
        /permission/,
      );
  }
  await role();
  await expect(q("nudge_enqueue()")).rejects.toThrow(/permission/);
  await expect(q("push_prepare_delivery($1,$1)", [a])).rejects.toThrow(
    /permission/,
  );
});
it("bundles two due tasks once across multiple devices and repeated runs", async () => {
  await device(a);
  await device(a, "two");
  await task();
  await task(other);
  expect(await enqueue()).toBe(2);
  expect(await enqueue()).toBe(0);
  await db.exec("reset role");
  const jobs = await db.query<{ payload: { body: string } }>(
    "select payload from push_jobs where source_kind='nudge'",
  );
  expect(jobs.rows).toHaveLength(2);
  expect(jobs.rows[0].payload.body).toContain("2 to-dos");
  expect(JSON.stringify(jobs.rows)).not.toMatch(/Learn opener|Private details/);
  expect(
    await q("(select reserved from nudge_quota where member_id=$1)", [a]),
  ).toBe(1);
});
it("rebuilds bundles after individual completion without affecting another dancer", async () => {
  await device(a);
  await device(b);
  await task();
  await task(other);
  await enqueue();
  await role("authenticated", a);
  await q("complete_communication($1,1)", [post]);
  await db.exec("reset role");
  const bundles = await db.query<{ id: string; member_id: string }>(
    "select id,member_id from nudge_bundles",
  );
  for (const bundle of bundles.rows) {
    const payload = await q<{ body: string }>(
      "nudge_payload($1,$2::timestamptz)",
      [bundle.id, stamp],
    );
    expect(payload.body).toContain(
      bundle.member_id === a ? "1 to-do" : "2 to-dos",
    );
  }
});
it("shared completion invalidates reminders for all assignees", async () => {
  await device(a);
  await device(b);
  await task(post, "shared");
  await enqueue();
  await role("authenticated", a);
  await q("complete_communication($1,1)", [post]);
  await db.exec("reset role");
  const bundles = await db.query<{ id: string }>(
    "select id from nudge_bundles",
  );
  for (const bundle of bundles.rows)
    expect(
      await q("nudge_payload($1,$2::timestamptz)", [bundle.id, stamp]),
    ).toBeNull();
});
it("allows day-before, due and one follow-up without daily repeated overdue alerts", async () => {
  await device();
  await task(post, "individual", "2026-10-13");
  expect(await enqueue("2026-10-12T22:59:00Z")).toBe(0);
  expect(await enqueue("2026-10-12T23:00:00Z")).toBe(1);
  expect(await enqueue("2026-10-13T14:00:00Z")).toBe(1);
  expect(await enqueue("2026-10-14T14:00:00Z")).toBe(1);
  expect(await enqueue("2026-10-15T14:00:00Z")).toBe(0);
});
it("enforces quiet hours and never replays yesterday's day-before window", async () => {
  await device();
  await task(post, "individual", "2026-10-13");
  expect(await enqueue("2026-10-13T03:00:00Z")).toBe(0);
  expect(await enqueue("2026-10-13T13:59:00Z")).toBe(0);
  expect(await enqueue("2026-10-13T14:00:00Z")).toBe(1);
  await db.exec("reset role");
  expect(
    (
      await db.query(
        "select stage from nudge_occurrences where state='bundled'",
      )
    ).rows,
  ).toEqual([{ stage: "due" }]);
});

it("reserves at most three member bundles per Chicago day, including overlapping scheduler runs", async () => {
  await device();
  await device(a, "second");
  for (let i = 0; i < 4; i++) {
    await task(randomUUID());
    const at = `2026-10-12T14:${String(i * 5).padStart(2, "0")}:00Z`;
    const runs = await Promise.all([enqueue(at), enqueue(at)]);
    expect(runs.reduce((x, y) => x + y, 0)).toBe(i < 3 ? 2 : 0);
  }
  await db.exec("reset role");
  expect(
    await q("(select reserved from nudge_quota where member_id=$1)", [a]),
  ).toBe(3);
  expect(
    await q("(select count(*) from nudge_bundles where member_id=$1)", [a]),
  ).toBe(3);
  expect(
    await q(
      "(select count(*) from nudge_occurrences where member_id=$1 and state='suppressed')",
      [a],
    ),
  ).toBe(1);
});
it("invalidates deadline changes, recipient removal, deletion and deactivation", async () => {
  await device();
  await task();
  await enqueue();
  await db.exec("reset role");
  const bundle = await q<string>(
    "(select id from nudge_bundles where member_id=$1)",
    [a],
  );
  await db.query(
    "update communication_posts set due_on='2026-10-13' where id=$1",
    [post],
  );
  expect(
    await q("nudge_payload($1,$2::timestamptz)", [bundle, stamp]),
  ).toBeNull();
  await db.query(
    "update communication_posts set due_on='2026-10-12' where id=$1",
    [post],
  );
  await db.query(
    "delete from communication_recipients where post_id=$1 and member_id=$2",
    [post, a],
  );
  expect(
    await q("nudge_payload($1,$2::timestamptz)", [bundle, stamp]),
  ).toBeNull();
  await db.query("delete from communication_posts where id=$1", [post]);
  expect(await q("(select count(*) from nudge_occurrences)")).toBe(0);
  expect(
    await q("(select count(*) from push_jobs where source_kind='nudge')"),
  ).toBe(0);
  await task();
  await enqueue();
  await db.exec("reset role");
  await db.query("update members set status='inactive' where id=$1", [a]);
  expect(
    await q("(select count(*) from push_subscriptions where member_id=$1)", [
      a,
    ]),
  ).toBe(0);
});
it("payment reporting suppresses demand reminders and rejection does not replay the same stage", async () => {
  await device();
  await role();
  const batch = randomUUID();
  await q(
    "issue_payment_charges($1,1000,'Private fine','Private instructions','2026-10-12','individual',array[$2::uuid],null)",
    [batch, a],
  );
  await db.exec("reset role;delete from push_jobs");
  const charge = await q<string>(
    "(select id from payment_charges where batch_id=$1)",
    [batch],
  );
  await enqueue();
  await db.exec("reset role");
  const bid = await q<string>(
    "(select id from nudge_bundles where member_id=$1)",
    [a],
  );
  await role("authenticated", a);
  await q("transition_payment($1,1,'report','Paid')", [charge]);
  await db.exec("reset role");
  expect(await q("nudge_payload($1,$2::timestamptz)", [bid, stamp])).toBeNull();
  await role();
  await q("transition_payment($1,2,'reject','Not received')", [charge]);
  expect(await enqueue("2026-10-12T15:00:00Z")).toBe(0);
});
async function announcement(
  mode = "acknowledgment",
  linked: string | null = null,
) {
  await role();
  const at =
    new Date(Date.now() + 2 * 86400_000).toISOString().slice(0, 10) +
    "T15:00:00Z";
  await q(
    "save_communication_reminder($1,0,'announcement','Bring shoes','Private message','individual','selected',array[$2::uuid,$3::uuid],null,null,null,null,'',$4::timestamptz,$5,'Bring black shoes',$6::uuid)",
    [other, a, b, at, mode, linked],
  );
  await db.exec("reset role;delete from push_jobs");
  return at;
}
it("announcement acknowledgment and preparation stop conditions differ", async () => {
  await device();
  let at = await announcement();
  await role("authenticated", a);
  await q("complete_communication($1,1)", [other]);
  expect(await enqueue(at)).toBe(0);
  await db.exec(
    "reset role;delete from communication_posts where id='00000000-0000-4000-8000-000000000011'",
  );
  at = await announcement("preparation");
  await role("authenticated", a);
  await q("complete_communication($1,1)", [other]);
  expect(await enqueue(at)).toBe(1);
});
it("linked task audience and individual completion constrain announcement reminders", async () => {
  await device(a);
  await device(b);
  await task();
  await db.exec("reset role");
  await db.query(
    "delete from communication_recipients where post_id=$1 and member_id=$2",
    [post, b],
  );
  const at = await announcement("linked-task", post);
  expect(await enqueue(at)).toBe(1);
  await role("authenticated", a);
  await q("complete_communication($1,1)", [post]);
  await db.exec("reset role");
  const bid = await q<string>(
    "(select id from nudge_bundles where member_id=$1)",
    [a],
  );
  expect(await q("nudge_payload($1,$2::timestamptz)", [bid, at])).toBeNull();
});
it("reminder-only edits bump the optimistic revision and reject stale editors atomically", async () => {
  await announcement();
  await role();
  const at = new Date(Date.now() + 2 * 3600_000).toISOString();
  await q(
    "save_communication_reminder($1,1,'announcement','Bring shoes','Private message','individual','selected',array[$2::uuid,$3::uuid],null,null,null,null,'',$4::timestamptz,'preparation','New reminder',null)",
    [other, a, b, at],
  );
  await db.exec("reset role");
  expect(
    await q("(select version from communication_posts where id=$1)", [other]),
  ).toBe(2);
  await role();
  await expect(
    q(
      "save_communication_reminder($1,1,'announcement','Stale title','Private message','individual','selected',array[$2::uuid,$3::uuid],null,null,null,null,'',$4::timestamptz,'preparation','New reminder',null)",
      [other, a, b, at],
    ),
  ).rejects.toThrow(/changed/);
  await db.exec("reset role");
  expect(
    await q("(select title from communication_posts where id=$1)", [other]),
  ).toBe("Bring shoes");
});
it("owner kill switch and pilot targeting preserve legacy behavior without overlapping delivery", async () => {
  await device();
  await task();
  await db.exec("reset role;update nudge_control set enabled=false");
  expect(await enqueue()).toBe(0);
  await db.exec(
    "reset role;update nudge_control set enabled=true,pilot_members=array['00000000-0000-4000-8000-000000000003'::uuid]",
  );
  expect(await enqueue()).toBe(0);
  await db.exec("reset role;update nudge_control set pilot_members=null");
  expect(await enqueue()).toBe(1);
  await role("service_role");
  await q("push_enqueue_reminders()");
  await db.exec("reset role");
  const legacy = await q(
    "(select count(*) from push_jobs j join push_subscriptions s on s.id=j.subscription_id where j.source_kind<>'nudge' and public.push_job_valid(j,s.member_id))",
  );
  expect(legacy).toBe(0);
  await db.exec("reset role;update nudge_control set enabled=false");
  const bid = await q<string>(
    "(select id from nudge_bundles where member_id=$1)",
    [a],
  );
  expect(await q("nudge_payload($1,$2::timestamptz)", [bid, stamp])).toBeNull();
});

async function practice(start = "2026-10-12T15:00:00Z", at = stamp) {
  await db.exec(
    "reset role;insert into calendar_connection(id) values(true) on conflict do nothing;update calendar_connection set calendar_id='team',client_id='client',encrypted_token='opaque',version=2",
  );
  await db.query(
    "insert into calendar_snapshot(id,source_fingerprint,events,last_success_at) values(true,encode(sha256(convert_to('connected:2:client:team','UTF8')),'hex'),$1::jsonb,$2::timestamptz) on conflict(id) do update set events=excluded.events,last_success_at=excluded.last_success_at",
    [
      JSON.stringify([
        {
          id: "practice",
          start,
          end: new Date(Date.parse(start) + 3600_000).toISOString(),
          allDay: false,
        },
      ]),
      at,
    ],
  );
}
it("practice reminders require fresh matching occurrences and expire at start", async () => {
  await device();
  await practice();
  expect(
    await q(
      "(select public.push_calendar_current(source_fingerprint) from calendar_snapshot)",
    ),
  ).toBe(true);
  expect(await enqueue()).toBe(1);
  await db.exec("reset role");
  const bid = await q<string>(
    "(select id from nudge_bundles where member_id=$1)",
    [a],
  );
  expect(
    Date.parse(
      (
        await q<{ expiresAt: string }>("nudge_payload($1,$2::timestamptz)", [
          bid,
          stamp,
        ])
      ).expiresAt,
    ),
  ).toBe(Date.parse("2026-10-12T15:00:00Z"));
  await db.exec("update calendar_snapshot set events='[]'");
  expect(await q("nudge_payload($1,$2::timestamptz)", [bid, stamp])).toBeNull();
  await practice("2026-10-12T16:00:00Z");
  expect(await q("nudge_payload($1,$2::timestamptz)", [bid, stamp])).toBeNull();
  await practice();
  await db.exec(
    "update calendar_snapshot set last_success_at='2026-10-12T13:44:00Z'",
  );
  expect(await q("nudge_payload($1,$2::timestamptz)", [bid, stamp])).toBeNull();
  await practice();
  expect(await q("nudge_payload($1,'2026-10-12T15:00:00Z')", [bid])).toBeNull();
});
it("moves late practice reminders before quiet hours only within a useful lead time", async () => {
  await device();
  await practice("2026-10-13T04:00:00Z", "2026-10-13T02:55:00Z");
  expect(await enqueue("2026-10-13T02:55:00Z")).toBe(1);
  await db.exec(
    "reset role;delete from nudge_occurrences;delete from push_jobs;delete from nudge_bundles",
  );
  await practice("2026-10-13T13:00:00Z", "2026-10-13T02:55:00Z");
  expect(await enqueue("2026-10-13T02:55:00Z")).toBe(0);
});
it("queues no announcement reminder after expiration and invalidates settings edits", async () => {
  await device();
  const at = await announcement();
  expect(await enqueue(at)).toBe(1);
  await db.exec("reset role");
  const bid = await q<string>(
    "(select id from nudge_bundles where member_id=$1)",
    [a],
  );
  await db.query(
    "update communication_posts set reminder_revision=reminder_revision+1 where id=$1",
    [other],
  );
  expect(await q("nudge_payload($1,$2::timestamptz)", [bid, at])).toBeNull();
  await db.query(
    "update communication_posts set expires_at=$2::timestamptz where id=$1",
    [other, at],
  );
  expect(await enqueue(at)).toBe(0);
});
it("preserves confirmed-delivery deduplication when reverting to legacy reminders", async () => {
  await device();
  await task();
  await enqueue();
  await db.exec(
    "reset role;update push_jobs set status='sent' where source_kind='nudge';update nudge_control set enabled=false",
  );
  expect(
    await q(
      "push_enqueue(array[$1::uuid],'task',$2,$3::uuid,'communication','/todos/'||$3::text)",
      [a, `reminder:task:${post}:2026-10-12`, post],
    ),
  ).toBe(0);
});
it("blocks ordinary dancers from creating reminders even through direct RPC calls", async () => {
  await role("authenticated", a);
  await expect(
    q(
      "save_communication_reminder($1,0,'announcement','Forged','Details','individual','team',null,null,null,null,null,'',null,null,'',null)",
      [post],
    ),
  ).rejects.toThrow(/Admin/);
  await db.exec("reset role");
  expect(await q("(select count(*) from communication_posts)")).toBe(0);
});
it("formation metadata changes only for the PDF or assignment content, not renames", async () => {
  const pdf = `${admin}/00000000-0000-4000-8000-000000000020.pdf`;
  await db.exec("reset role");
  await db.query(
    'insert into storage.objects(bucket_id,name,metadata) values(\'formations\',$1,\'{"mimetype":"application/pdf","size":100}\')',
    [pdf],
  );
  await role();
  await q("save_segment($1,0,'Opener',array[$2::uuid],$3,'Formation.pdf')", [
    post,
    a,
    pdf,
  ]);
  await db.exec("reset role");
  await db.query(
    "update segments set formation_updated_at='2026-10-01T12:00:00Z',assignments_updated_at='2026-10-01T12:00:00Z' where id=$1",
    [post],
  );
  await role();
  await q(
    "save_segment($1,1,'Opener renamed',array[$2::uuid],$3,'Formation.pdf')",
    [post, a, pdf],
  );
  await db.exec("reset role");
  expect(
    Date.parse(
      await q<string>(
        "(select formation_updated_at::text from segments where id=$1)",
        [post],
      ),
    ),
  ).toBe(Date.parse("2026-10-01T12:00:00Z"));
  expect(
    Date.parse(
      await q<string>(
        "(select assignments_updated_at::text from segments where id=$1)",
        [post],
      ),
    ),
  ).toBe(Date.parse("2026-10-01T12:00:00Z"));
  await role();
  await q(
    "save_segment($1,2,'Opener renamed',array[$2::uuid,$3::uuid],$4,'Formation.pdf')",
    [post, a, b, pdf],
  );
  await db.exec("reset role");
  expect(
    await q<string>(
      "(select assignments_updated_at::text from segments where id=$1)",
      [post],
    ),
  ).not.toBe("2026-10-01 12:00:00+00");
});
it("deleting a linked task removes its announcement reminder configuration and queued jobs", async () => {
  await device();
  await task();
  const at = await announcement("linked-task", post);
  await enqueue(at);
  await db.exec("reset role");
  await db.query("delete from communication_posts where id=$1", [post]);
  expect(
    await q("(select reminder_at from communication_posts where id=$1)", [
      other,
    ]),
  ).toBeNull();
  expect(await q("(select count(*) from nudge_occurrences)")).toBe(0);
  expect(
    await q("(select count(*) from push_jobs where source_kind='nudge')"),
  ).toBe(0);
  expect(
    await q(
      "(select count(*) from communication_audit where action='reminder_saved')",
    ),
  ).toBe(0);
});
it("invalidates a pre-pilot pending legacy job after confirmed nudge delivery and rollback", async () => {
  await device();
  await task();
  await db.exec("reset role;update nudge_control set enabled=false");
  await q(
    "push_enqueue(array[$1::uuid],'task',$2,$3::uuid,'communication','/todos/'||$3::text)",
    [a, `reminder:task:${post}:2026-10-12`, post],
  );
  await db.exec("update nudge_control set enabled=true");
  await enqueue();
  await db.exec(
    "reset role;update push_jobs set status='sent' where source_kind='nudge';update nudge_control set enabled=false",
  );
  expect(
    await q(
      "(select count(*) from push_jobs j join push_subscriptions s on s.id=j.subscription_id where j.source_kind='communication' and public.push_job_valid(j,s.member_id))",
    ),
  ).toBe(0);
});

it("prepares current announcement title/body for queued jobs and rejects an invalid lease", async () => {
  await device();
  await role();
  await q(
    "save_communication($1,0,'announcement','Bring shoes','Bring black shoes.  Practice\nis at 8 PM.','individual','selected',array[$2::uuid],null,null)",
    [post, a],
  );
  await role("service_role");
  const jobs = await q<{ id: string; lease_token: string }[]>(
    "push_claim_jobs(40)",
  );
  expect(jobs).toHaveLength(1);
  const job = jobs[0];
  const prepare = () =>
    q<{ title: string; body: string }>("push_prepare_delivery($1,$2)", [
      job.id,
      job.lease_token,
    ]);
  expect(await prepare()).toMatchObject({
    title: "Bring shoes",
    body: "Bring black shoes. Practice is at 8 PM.",
  });
  expect(
    await q("push_prepare_delivery($1,$2)", [job.id, randomUUID()]),
  ).toBeNull();
  await db.exec("reset role");
  await db.query(
    "update communication_posts set title='Updated shoes',body=$2 where id=$1",
    [post, "😀".repeat(300)],
  );
  await role("service_role");
  const payload = await prepare();
  expect(payload.title).toBe("Updated shoes");
  expect(Array.from(payload.body)).toHaveLength(240);
  expect(payload.body).toBe("😀".repeat(239) + "…");
  await db.exec("reset role");
  await db.query(
    "delete from communication_recipients where post_id=$1 and member_id=$2",
    [post, a],
  );
  await role("service_role");
  expect(await prepare()).toBeNull();
});
it("keeps task previews generic and falls back for an announcement with an empty body", async () => {
  await device();
  await role();
  await q(
    "save_communication($1,0,'announcement','Photo','Details','individual','selected',array[$2::uuid],null,null)",
    [post, a],
  );
  await db.exec("reset role");
  await db.query("update communication_posts set body=$2 where id=$1", [
    post,
    "\n\t",
  ]);
  await role("service_role");
  const jobs = await q<{ id: string; lease_token: string }[]>(
    "push_claim_jobs(40)",
  );
  expect(
    await q("push_prepare_delivery($1,$2)", [jobs[0].id, jobs[0].lease_token]),
  ).toMatchObject({ body: "Open the announcement to view its contents." });
  await db.exec("reset role");
  await db.query("delete from communication_posts where id=$1", [post]);
  await task();
  await role("service_role");
  const tasks = await q<{ id: string; lease_token: string }[]>(
    "push_claim_jobs(40)",
  );
  // task() deletes its creation jobs, so generate another task change normally.
  expect(tasks).toEqual([]);
  await role();
  await q(
    "save_communication($1,1,'task','Learn opener edited','Private details','individual','selected',array[$2::uuid,$3::uuid],null,'2026-10-12')",
    [post, a, b],
  );
  await role("service_role");
  const changed = await q<{ id: string; lease_token: string }[]>(
    "push_claim_jobs(40)",
  );
  expect(
    await q("push_prepare_delivery($1,$2)", [
      changed[0].id,
      changed[0].lease_token,
    ]),
  ).toMatchObject({ body: "Check your team to-dos." });
});
