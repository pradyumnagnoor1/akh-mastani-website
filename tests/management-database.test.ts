import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, beforeEach, it, expect } from "vitest";
let db: PGlite;
const admin = "00000000-0000-4000-8000-000000000001",
  dancer = "00000000-0000-4000-8000-000000000002",
  outsider = "00000000-0000-4000-8000-000000000003",
  event = "00000000-0000-4000-8000-000000000010";
async function user(id: string, role = "authenticated") {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
  await db.exec(`set role ${role}`);
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    `create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_app_meta_data jsonb);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;create schema storage;create function storage.allow_only_operation(text) returns boolean language sql stable as $$select true$$;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb);alter table storage.objects enable row level security;`,
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
  ])
    await db.exec(readFileSync(`supabase/migrations/${name}.sql`, "utf8"));
});
afterAll(async () => {
  await db?.close();
});
beforeEach(async () => {
  await db.exec(
    "reset role;truncate auth.users cascade;truncate payment_batches cascade;",
  );
  for (const id of [admin, dancer, outsider]) {
    await db.query(
      `insert into auth.users values($1,$2,now(),'{"provider":"google"}')`,
      [id, `${id}@tamu.edu`],
    );
    await db.query(
      "insert into members(id,email,display_name,status,is_admin) values($1,$2,'Dancer',$3,$4)",
      [
        id,
        `${id}@tamu.edu`,
        id === outsider ? "pending" : "active",
        id === admin,
      ],
    );
  }
  await user(admin);
});
const save = (
  version = 0,
  title = "Showcase",
  link = "https://example.com/event",
) =>
  db.query(
    "select save_featured_event($1,$2,$3,'Bring shoes','2026-12-12','18:30','Rudder',$4)",
    [event, version, title, link],
  );
async function charge() {
  await db.query(
    "select issue_payment_charges($1,1250,'Costume','Pay treasurer',null,'individual',array[$2::uuid],null)",
    [event, dancer],
  );
  return (await db.query<{ id: string }>("select id from payment_charges"))
    .rows[0].id;
}
const manage = (id: string, version: number, op = "update", amount = 2000) =>
  db.query(
    "select manage_payment_charge($1,$2,$3,$4,'Costume revised','Updated instructions','2026-12-10','Corrected costume cost')",
    [id, version, op, amount],
  );
it("featured CRUD is admin-only, versioned, private to active members and audited", async () => {
  await save();
  await expect(save()).rejects.toThrow();
  await user(dancer);
  expect((await db.query("select * from featured_events")).rows).toHaveLength(
    1,
  );
  await expect(save(1)).rejects.toThrow(/Admin/);
  await expect(
    db.query("select delete_featured_event($1,1)", [event]),
  ).rejects.toThrow(/Admin/);
  await expect(
    db.exec("update featured_events set title='forged'"),
  ).rejects.toThrow(/permission/);
  expect(
    (await db.query("select * from featured_event_audit")).rows,
  ).toHaveLength(0);
  await user(outsider);
  expect((await db.query("select * from featured_events")).rows).toHaveLength(
    0,
  );
  await user(admin);
  await save(1, "Showcase updated");
  await expect(save(1, "Stale")).rejects.toThrow(/changed/);
  await db.query("select delete_featured_event($1,2)", [event]);
  expect(
    (await db.query("select action from featured_event_audit order by id"))
      .rows,
  ).toEqual([
    { action: "created" },
    { action: "updated" },
    { action: "deleted" },
  ]);
  await user(dancer);
  expect((await db.query("select * from featured_events")).rows).toHaveLength(
    0,
  );
  await user(admin);
  expect((await db.query("select * from featured_events")).rows).toHaveLength(
    1,
  );
  await db.exec(
    "reset role;update members set status='inactive' where id='00000000-0000-4000-8000-000000000001'",
  );
  await user(admin);
  await expect(save(0)).rejects.toThrow(/Admin/);
});
it("rejects unsafe featured links and invalid details through direct RPCs", async () => {
  for (const link of [
    "javascript:alert(1)",
    "https://user:secret@example.com",
    "https://example.com\\evil",
    "https://example.com/space here",
  ])
    await expect(save(0, "Showcase", link)).rejects.toThrow(/Invalid/);
  await expect(save(0, "\n")).rejects.toThrow(/Invalid/);
  await expect(
    db.query(
      "select save_featured_event($1,0,'Event','','infinity',null,'','')",
      [event],
    ),
  ).rejects.toThrow(/Invalid/);
  await expect(
    db.query(
      "select save_featured_event($1,0,'Event','','2026-12-12','24:00','','')",
      [event],
    ),
  ).rejects.toThrow(/Invalid/);
});
it("payment edits retain identity/history and invalidate a previous report", async () => {
  const id = await charge();
  await user(dancer);
  await expect(manage(id, 1)).rejects.toThrow(/Admin/);
  await db.query(
    "select transition_payment($1,1,'report','Original receipt')",
    [id],
  );
  await user(admin);
  await manage(id, 2);
  expect(
    (
      await db.query(
        "select member_id,amount_cents,status,reported_at,report_note,version from payment_charges",
      )
    ).rows,
  ).toEqual([
    {
      member_id: dancer,
      amount_cents: 2000,
      status: "unpaid",
      reported_at: null,
      report_note: null,
      version: 3,
    },
  ]);
  await expect(
    db.query("select transition_payment($1,2,'verify','')", [id]),
  ).rejects.toThrow(/changed/);
  const audit = (
    await db.query<{
      details: {
        before: { amount_cents: number; report_note: string };
        after: { amount_cents: number };
      };
    }>("select details from payment_audit where action='update'")
  ).rows[0].details;
  expect(audit.before).toMatchObject({
    amount_cents: 1250,
    report_note: "Original receipt",
  });
  expect(audit.after.amount_cents).toBe(2000);
  await expect(manage(id, 2)).rejects.toThrow(/changed/);
  await user(dancer);
  await db.query("select transition_payment($1,3,'report','New receipt')", [
    id,
  ]);
  await user(admin);
  await db.query("select transition_payment($1,4,'verify','')", [id]);
  await expect(manage(id, 5)).rejects.toThrow(/Settled/);
});
it("payment deletion clears balances, keeps audit and rejects stale/dancer mutations", async () => {
  const id = await charge();
  await manage(id, 1, "delete");
  expect(
    (await db.query("select status,amount_cents from payment_charges")).rows,
  ).toEqual([{ status: "deleted", amount_cents: 1250 }]);
  expect((await db.query("select * from payment_audit")).rows).toHaveLength(2);
  await expect(manage(id, 2, "delete")).rejects.toThrow(/changed/);
  await user(dancer);
  await expect(manage(id, 2, "delete")).rejects.toThrow(/Admin/);
  await expect(
    db.query("select transition_payment($1,2,'report','')", [id]),
  ).rejects.toThrow(/changed/);
  expect(
    (
      await db.query(
        "select * from payment_charges where status in ('unpaid','reported')",
      )
    ).rows,
  ).toHaveLength(0);
});
it("announcement title reaches targeted push payload while body and financial details stay generic", async () => {
  await user(dancer);
  const key = Buffer.concat([Buffer.from([4]), Buffer.alloc(64, 1)]).toString(
    "base64url",
  );
  await db.query(
    "select push_register_subscription('https://fcm.googleapis.com/fcm/send/dancer',$1,$2)",
    [key, Buffer.alloc(16, 1).toString("base64url")],
  );
  await user(admin);
  await db.query(
    "select save_communication($1,0,'announcement','Showcase instructions','Private detailed message','individual','individual',array[$2::uuid],null,null)",
    [event, dancer],
  );
  await db.exec("reset role");
  const job = (
    await db.query<{ payload: { title: string; body: string } }>(
      "select payload from push_jobs",
    )
  ).rows[0];
  expect(job.payload.title).toBe("Showcase instructions");
  expect(job.payload.body).not.toContain("Private detailed message");
  await user(admin);
  await save();
  await db.exec("reset role");
  expect(
    (await db.query("select * from push_jobs where category='featured'")).rows,
  ).toHaveLength(1);
  await user(admin);
  await db.query("select delete_featured_event($1,1)", [event]);
  await user("", "service_role");
  const jobs = (
    await db.query<{ push_claim_jobs: { payload: { title: string } }[] }>(
      "select push_claim_jobs(20)",
    )
  ).rows[0].push_claim_jobs;
  expect(jobs).toHaveLength(1);
  expect(jobs[0].payload.title).toBe("Showcase instructions");
});

it("payment corrections queue generic alerts and deleted charges suppress unpaid reminders", async () => {
  await user(dancer);
  const key = Buffer.concat([Buffer.from([4]), Buffer.alloc(64, 1)]).toString(
    "base64url",
  );
  await db.query(
    "select push_register_subscription('https://fcm.googleapis.com/fcm/send/dancer',$1,$2)",
    [key, Buffer.alloc(16, 1).toString("base64url")],
  );
  await user(admin);
  const id = await charge();
  await manage(id, 1);
  await db.exec("reset role");
  const jobs = (
    await db.query<{ payload: { title: string; body: string } }>(
      "select payload from push_jobs where category='payment' order by event_key",
    )
  ).rows;
  expect(jobs).toHaveLength(2);
  for (const job of jobs) {
    expect(job.payload).toMatchObject({
      title: "AKH Mastani",
      body: "Check your payments for an update.",
    });
    expect(JSON.stringify(job.payload)).not.toMatch(/Costume|2000|treasurer/);
  }
  await db.query(
    "select push_enqueue(array[$1::uuid],'payment','reminder:payment:deleted',$2::uuid,'payment','/payments/'||$2::uuid::text)",
    [dancer, id],
  );
  await user(admin);
  await manage(id, 2, "delete");
  await user("", "service_role");
  await db.query("select push_claim_jobs(20)");
  await db.exec("reset role");
  expect(
    (
      await db.query(
        "select status from push_jobs where event_key='reminder:payment:deleted'",
      )
    ).rows,
  ).toEqual([{ status: "discarded" }]);
});
