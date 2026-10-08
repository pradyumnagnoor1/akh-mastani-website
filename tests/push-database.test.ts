import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, beforeEach, it, expect } from "vitest";
let db: PGlite;
const a = "00000000-0000-4000-8000-000000000001";
const b = "00000000-0000-4000-8000-000000000002";
const pending = "00000000-0000-4000-8000-000000000003";
const post = "00000000-0000-4000-8000-000000000010";
const endpoint = "https://fcm.googleapis.com/fcm/send/device";
const key = Buffer.concat([Buffer.from([4]), Buffer.alloc(64, 1)]).toString(
  "base64url",
);
const auth = Buffer.alloc(16, 1).toString("base64url");
async function role(name = "authenticated", id = b) {
  await db.exec(`reset role;set role ${name}`);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
}
async function scalar<T = unknown>(sql: string, params: unknown[] = []) {
  return (
    await db.query<{ value: T }>(
      `select (${sql.startsWith("count(*) from") || sql.includes(" from ") ? "select " + sql : sql}) as value`,
      params,
    )
  ).rows[0].value;
}
const register = (url = endpoint) =>
  scalar<string>("push_register_subscription($1,$2,$3)", [url, key, auth]);
async function publish(kind = "task") {
  await role("authenticated", a);
  await db.query(
    "select save_communication($1,0,$2,'Private title','Private message','individual','individual',array[$3::uuid],null,(now() at time zone 'America/Chicago')::date)",
    [post, kind, b],
  );
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;create schema auth;
  create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_app_meta_data jsonb);
  create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
  grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;
  create schema storage;create function storage.allow_only_operation(text) returns boolean language sql stable as $$select true$$;
  create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
  create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb);alter table storage.objects enable row level security;`);
  for (const name of [
    "0001_identity",
    "0002_segments",
    "0003_communication",
    "0004_payments",
    "0005_calendar",
    "0006_calendar_connection",
    "0007_push_notifications",
  ])
    await db.exec(readFileSync(`supabase/migrations/${name}.sql`, "utf8"));
});
afterAll(async () => {
  await db?.close();
});
beforeEach(async () => {
  await db.exec(
    "reset role;truncate auth.users cascade;truncate calendar_snapshot;truncate payment_batches cascade;insert into calendar_connection(id) values(true) on conflict do nothing;",
  );
  for (const [id, status] of [
    [a, "active"],
    [b, "active"],
    [pending, "pending"],
  ]) {
    await db.query(
      'insert into auth.users values($1,$2,now(),\'{"provider":"google"}\')',
      [id, `${id}@tamu.edu`],
    );
    await db.query(
      "insert into members(id,email,display_name,status,is_admin) values($1,$2,'Dancer',$3,$4)",
      [id, `${id}@tamu.edu`, status, id === a],
    );
  }
  await role();
});
it("blocks raw key/job access and service RPCs for browser roles", async () => {
  for (const name of ["anon", "authenticated", "service_role"]) {
    await role(name);
    for (const table of ["push_subscriptions", "push_jobs"]) {
      await expect(db.exec(`select * from ${table}`)).rejects.toThrow(
        /permission/,
      );
      await expect(db.exec(`delete from ${table}`)).rejects.toThrow(
        /permission/,
      );
    }
  }
  for (const name of ["anon", "authenticated"]) {
    await role(name);
    await expect(scalar("push_claim_jobs(10)")).rejects.toThrow(/permission/);
    await expect(scalar("push_enqueue_reminders()")).rejects.toThrow(
      /permission/,
    );
    await expect(
      scalar(
        "push_enqueue(array[$1::uuid],'task','forged',$1,'membership','/')",
        [b],
      ),
    ).rejects.toThrow(/permission/);
  }
});
it("requires active verified identities and validates SSRF/key boundaries", async () => {
  await role("authenticated", pending);
  await expect(register()).rejects.toThrow(/Active/);
  await role();
  for (const bad of [
    "http://fcm.googleapis.com/x",
    "https://fcm.googleapis.com.evil.test/x",
    "https://fcm.googleapis.com:443/x",
    "https://user@fcm.googleapis.com/x",
    "https://127.0.0.1/x",
    "https://evil.web.push.apple.com:443/x",
    "https://fcm.googleapis.com/x\n",
  ])
    await expect(register(bad)).rejects.toThrow(/endpoint/);
  await expect(
    scalar("push_register_subscription($1,'bad',$2)", [endpoint, auth]),
  ).rejects.toThrow(/keys/);
  await db.exec("reset role");
  await db.query("update auth.users set email_confirmed_at=null where id=$1", [
    b,
  ]);
  await role();
  await expect(register()).rejects.toThrow(/Active/);
});
it("caps devices, is idempotent, and transfers shared devices with all old jobs removed", async () => {
  const original = await register();
  expect(await register()).toBe(original);
  await publish();
  await role("authenticated", a);
  expect(await register()).not.toBe(original);
  await role("service_role");
  expect(await scalar("push_claim_jobs(50)")).toEqual([]);
  await role("authenticated", a);
  for (let i = 0; i < 4; i++) await register(`${endpoint}${i}`);
  await expect(register(`${endpoint}six`)).rejects.toThrow(/five/);
  await role("authenticated", b);
  await scalar("push_unregister_subscription($1)", [endpoint]);
  await db.exec("reset role");
  expect(
    await scalar("count(*) from push_subscriptions where member_id=$1", [a]),
  ).toBe(5);
});
it("enqueues transactionally with private generic payloads and fences leases/retries", async () => {
  await register();
  await publish();
  await role("service_role");
  const jobs = await scalar<
    Array<{ id: string; lease_token: string; payload: unknown }>
  >("push_claim_jobs(50)");
  expect(jobs).toHaveLength(1);
  expect(JSON.stringify(jobs[0].payload)).not.toMatch(/Private|Dancer/);
  expect(await scalar("push_claim_jobs(50)")).toEqual([]);
  expect(await scalar("push_finish_job($1,$2,'sent')", [jobs[0].id, a])).toBe(
    false,
  );
  expect(
    await scalar("push_finish_job($1,$2,'retry')", [
      jobs[0].id,
      jobs[0].lease_token,
    ]),
  ).toBe(true);
  expect(await scalar("push_claim_jobs(50)")).toEqual([]);
  await db.exec(
    "reset role;update push_jobs set next_attempt_at=now()-interval '1 second'",
  );
  await role("service_role");
  const retry = await scalar<typeof jobs>("push_claim_jobs(50)");
  expect(retry).toHaveLength(1);
  expect(
    await scalar("push_finish_job($1,$2,'expired')", [
      retry[0].id,
      retry[0].lease_token,
    ]),
  ).toBe(true);
  await db.exec("reset role");
  expect(await scalar("count(*) from push_subscriptions")).toBe(0);
});
it("suppresses completed/archived/revoked recipients before claim and does not blast on opt-in", async () => {
  await publish();
  await role();
  await register();
  await role("service_role");
  expect(await scalar("push_claim_jobs(50)")).toEqual([]);
  await db.exec(
    "reset role;update communication_posts set title='Changed',version=2",
  );
  await db.query(
    'insert into communication_audit(post_id,action,details) values($1,\'updated\',\'{"title":"Changed","body":"Private message","due_on":null}\')',
    [post],
  );
  await role();
  await scalar("complete_communication($1,2)", [post]);
  await role("service_role");
  expect(await scalar("push_claim_jobs(50)")).toEqual([]);
  await role("authenticated", a);
  await scalar("set_member_status($1,'inactive')", [b]);
  await db.exec("reset role");
  expect(await scalar("count(*) from push_subscriptions")).toBe(0);
});
it("reminders are Chicago-day scoped and idempotent; completed work is skipped", async () => {
  await register();
  await publish();
  await role("service_role");
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Chicago",
      hour: "numeric",
      hourCycle: "h23",
    }).format(new Date()),
  );
  expect(await scalar("push_enqueue_reminders()")).toBe(hour >= 9 ? 1 : 0);
  expect(await scalar("push_enqueue_reminders()")).toBe(0);
  await role();
  await scalar("complete_communication($1,1)", [post]);
  await role("service_role");
  expect(await scalar("push_claim_jobs(50)")).toEqual([]);
});
it("payment status notifications preserve verification and contain no payment details", async () => {
  await register();
  await role("authenticated", a);
  await scalar(
    "issue_payment_charges($1,2500,'Private reason','Private instructions',null,'individual',array[$2::uuid],null)",
    [post, b],
  );
  await db.exec("reset role");
  const id = await scalar<string>("id from payment_charges limit 1");
  await role();
  await scalar("transition_payment($1,1,'report','Private note')", [id]);
  await role("service_role");
  const jobs = await scalar<unknown[]>("push_claim_jobs(50)");
  expect(jobs).toHaveLength(1);
  expect(JSON.stringify(jobs)).not.toMatch(/Private|2500/);
  await db.exec("reset role");
  expect(await scalar("status from payment_charges where id=$1", [id])).toBe(
    "reported",
  );
});
it("rechecks delivery eligibility after claim, fences stale tokens, and unregisters only owned UUIDs", async () => {
  const device = await register();
  await publish();
  await role("service_role");
  const jobs =
    await scalar<Array<{ id: string; lease_token: string }>>(
      "push_claim_jobs(1)",
    );
  expect(
    await scalar("push_can_deliver($1,$2)", [jobs[0].id, jobs[0].lease_token]),
  ).toBe(true);
  expect(await scalar("push_can_deliver($1,$2)", [jobs[0].id, a])).toBe(false);
  await role("authenticated", a);
  await scalar("push_unregister_device($1)", [device]);
  await role("service_role");
  expect(
    await scalar("push_can_deliver($1,$2)", [jobs[0].id, jobs[0].lease_token]),
  ).toBe(true);
  await role();
  await scalar("complete_communication($1,1)", [post]);
  await role("service_role");
  expect(
    await scalar("push_can_deliver($1,$2)", [jobs[0].id, jobs[0].lease_token]),
  ).toBe(false);
  await role();
  await scalar("push_unregister_device($1)", [device]);
  await db.exec("reset role");
  expect(await scalar("count(*) from push_jobs")).toBe(0);
});
it("rolls back source and outbox together and ignores no-op saves and completion audit", async () => {
  await register();
  await db.exec("begin");
  await publish();
  await db.exec("rollback;reset role");
  expect(await scalar("count(*) from push_jobs")).toBe(0);
  expect(await scalar("count(*) from communication_posts")).toBe(0);
  await publish();
  await scalar(
    "save_communication($1,1,'task','Private title','Private message','individual','individual',array[$2::uuid],null,(now() at time zone 'America/Chicago')::date)",
    [post, b],
  );
  await db.exec("reset role");
  expect(await scalar("count(*) from push_jobs")).toBe(1);
  await role();
  await scalar("complete_communication($1,2)", [post]);
  await db.exec("reset role");
  expect(await scalar("count(*) from push_jobs")).toBe(1);
});
it("practice reminders skip all-day/stale snapshots and cancel removed events", async () => {
  await register();
  await db.exec("reset role");
  const start = new Date(Date.now() + 45 * 60_000).toISOString();
  await db.exec(
    "update calendar_connection set version=1,calendar_id='calendar',client_id='client',encrypted_token='encrypted'",
  );
  await db.query(
    "insert into calendar_snapshot(source_fingerprint,last_success_at,events) values(encode(sha256(convert_to('connected:1:client:calendar','UTF8')),'hex'),now(),$1::jsonb)",
    [
      JSON.stringify([
        { id: "event", start, allDay: false, title: "Private practice" },
        { id: "all-day", start, allDay: true },
      ]),
    ],
  );
  await role("service_role");
  expect(await scalar("push_enqueue_reminders()")).toBe(1);
  expect(await scalar("push_enqueue_reminders()")).toBe(0);
  await db.exec(
    "reset role;update calendar_snapshot set last_success_at=now()-interval '16 minutes'",
  );
  await role("service_role");
  expect(await scalar("push_claim_jobs(50)")).toEqual([]);
});
it("reopen notifies only the reopened incomplete recipient and respects archives", async () => {
  await register();
  await publish();
  await role();
  await scalar("complete_communication($1,1)", [post]);
  await role("authenticated", a);
  await scalar("manage_communication($1,1,'reopen',$2)", [post, b]);
  await role("service_role");
  const jobs = await scalar<
    Array<{ id: string; lease_token: string; payload: unknown }>
  >("push_claim_jobs(50)");
  expect(jobs).toHaveLength(2);
  await db.exec("reset role;update communication_posts set archived_at=now()");
  await role("service_role");
  // In-flight jobs also become ineligible when archived.
  expect(
    await scalar("push_can_deliver($1,$2)", [jobs[0].id, jobs[0].lease_token]),
  ).toBe(false);
});
it("segment saves notify current assignments for PDF changes, suppress name-only edits and removed members", async () => {
  await register();
  await role("authenticated", a);
  const path = `${a}/00000000-0000-4000-8000-000000000020.pdf`;
  const replacement = `${a}/00000000-0000-4000-8000-000000000021.pdf`;
  await db.exec("reset role");
  for (const name of [path, replacement])
    await db.query(
      'insert into storage.objects(bucket_id,name,metadata) values(\'formations\',$1,\'{"mimetype":"application/pdf","size":100}\')',
      [name],
    );
  await role("authenticated", a);
  await scalar(
    "save_segment($1,0,'Private segment',array[$2::uuid],$3,'formation.pdf')",
    [post, b, path],
  );
  await scalar(
    "save_segment($1,1,'Renamed segment',array[$2::uuid],$3,'formation.pdf')",
    [post, b, path],
  );
  await scalar(
    "save_segment($1,2,'Renamed segment',array[$2::uuid],$3,'formation.pdf')",
    [post, b, replacement],
  );
  await db.exec("reset role");
  expect(await scalar("count(*) from push_jobs")).toBe(2);
  await role("authenticated", a);
  await scalar(
    "save_segment($1,3,'Renamed segment',array[$2::uuid],$3,'formation.pdf')",
    [post, a, replacement],
  );
  await role("service_role");
  expect(await scalar("push_claim_jobs(50)")).toEqual([]);
});
it("rejects stale calendar connection fingerprints and removed cached practices", async () => {
  await register();
  await db.exec("reset role");
  const start = new Date(Date.now() + 45 * 60_000).toISOString();
  await db.exec(
    "update calendar_connection set version=2,calendar_id='calendar',client_id='client',encrypted_token='encrypted'",
  );
  await db.query(
    "insert into calendar_snapshot(source_fingerprint,last_success_at,events) values('obsolete',now(),$1::jsonb)",
    [JSON.stringify([{ id: "event", start, allDay: false }])],
  );
  await role("service_role");
  expect(await scalar("push_enqueue_reminders()")).toBe(0);
  await db.exec(
    "reset role;update calendar_snapshot set source_fingerprint=encode(sha256(convert_to('connected:2:client:calendar','UTF8')),'hex')",
  );
  await role("service_role");
  expect(await scalar("push_enqueue_reminders()")).toBe(1);
  const jobs = await scalar<Array<{ id: string; lease_token: string }>>(
    "push_claim_jobs(50)",
  );
  expect(jobs).toHaveLength(1);
  await db.exec("reset role;update calendar_snapshot set events='[]'");
  await role("service_role");
  expect(
    await scalar("push_can_deliver($1,$2)", [jobs[0].id, jobs[0].lease_token]),
  ).toBe(false);
});
it("bounds retry attempts and rejects service endpoints from authenticated callers", async () => {
  await register();
  await publish();
  await expect(scalar("push_can_deliver($1,$2)", [a, b])).rejects.toThrow(
    /permission/,
  );
  await expect(scalar("push_calendar_actor()")).rejects.toThrow(/permission/);
  for (let attempt = 0; attempt < 5; attempt++) {
    await db.exec(
      "reset role;update push_jobs set next_attempt_at=now()-interval '1 second'",
    );
    await role("service_role");
    const jobs = await scalar<Array<{ id: string; lease_token: string }>>(
      "push_claim_jobs(50)",
    );
    expect(jobs).toHaveLength(1);
    await scalar("push_finish_job($1,$2,'retry')", [
      jobs[0].id,
      jobs[0].lease_token,
    ]);
  }
  expect(await scalar("push_claim_jobs(50)")).toEqual([]);
  await db.exec("reset role");
  expect(await scalar("status from push_jobs limit 1")).toBe("discarded");
});
it("reports only the caller's active registered device without exposing subscription data", async () => {
  const device = await register();
  expect(await scalar("push_device_registered($1)", [device])).toBe(true);
  expect(await scalar("push_device_registered($1)", [a])).toBe(false);
  await role("authenticated", a);
  expect(await scalar("push_device_registered($1)", [device])).toBe(false);
  await scalar("set_member_status($1,'inactive')", [b]);
  await role();
  expect(await scalar("push_device_registered($1)", [device])).toBe(false);
  await role("anon");
  await expect(scalar("push_device_registered($1)", [device])).rejects.toThrow(
    /permission/,
  );
});
it("notification taps deep-link to the source UUID without exposing private content", async () => {
  await register();
  await publish();
  await role("service_role");
  const jobs = await scalar<Array<{ payload: { url: string } }>>(
    "push_claim_jobs(50)",
  );
  expect(jobs[0].payload.url).toBe(`/todos/${post}`);
});
