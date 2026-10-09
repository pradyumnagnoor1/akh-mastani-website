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
async function database(includeDeletion = true, includeManagement = true) {
  const db = new PGlite();
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
    ...(includeManagement ? ["0008_management_featured_events"] : []),
    ...(includeDeletion ? ["0009_permanent_deletion"] : []),
  ])
    await db.exec(readFileSync(`supabase/migrations/${name}.sql`, "utf8"));
  return db;
}
beforeAll(async () => {
  db = await database();
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
  ).toEqual([]);
  await user(dancer);
  expect((await db.query("select * from featured_events")).rows).toHaveLength(
    0,
  );
  await user(admin);
  expect((await db.query("select * from featured_events")).rows).toHaveLength(
    0,
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
it("payment deletion hides records/audit from all app roles, preserves financial evidence and rejects stale/dancer mutations", async () => {
  const id = await charge();
  await manage(id, 1, "delete");
  expect(
    (await db.query("select status,amount_cents from payment_charges")).rows,
  ).toEqual([]);
  expect((await db.query("select * from payment_audit")).rows).toHaveLength(0);
  await db.exec("reset role");
  expect((await db.query("select * from payment_batches")).rows).toHaveLength(
    1,
  );
  expect(
    (await db.query("select status,amount_cents from payment_charges")).rows,
  ).toEqual([{ status: "deleted", amount_cents: 1250 }]);
  expect(
    (await db.query("select action from payment_audit order by id")).rows,
  ).toEqual([{ action: "issued" }, { action: "delete" }]);
  await user(admin);
  await expect(manage(id, 2, "delete")).rejects.toThrow(/changed/);
  await user(dancer);
  await expect(manage(id, 2, "delete")).rejects.toThrow(/Admin/);
  await expect(
    db.query("select transition_payment($1,2,'report','')", [id]),
  ).rejects.toThrow(/Own charge|changed/);
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
  ).toEqual([]);
});

it("permanently deletes communications and their recipients/audits/jobs, denies restore and fences stale/dancer calls", async () => {
  await db.query(
    "select save_communication($1,0,'announcement','Remove me','Private message','individual','team',array[]::uuid[],null,null)",
    [event],
  );
  await user(dancer);
  await expect(
    db.query("select delete_team_item($1,1,'communication')", [event]),
  ).rejects.toThrow(/Admin/);
  await user(admin);
  await expect(
    db.query("select delete_team_item($1,2,'communication')", [event]),
  ).rejects.toThrow(/changed/);
  await db.query("select manage_communication($1,1,'archive',null)", [event]);
  for (const table of [
    "communication_posts",
    "communication_recipients",
    "communication_audit",
  ])
    expect((await db.query(`select * from ${table}`)).rows).toHaveLength(0);
  await expect(
    db.query("select manage_communication($1,2,'restore',null)", [event]),
  ).rejects.toThrow(/cannot be restored/);
  await db.exec("reset role");
  expect(
    (await db.query("select * from push_jobs where source_id=$1", [event]))
      .rows,
  ).toHaveLength(0);
});

it("deletes groups without changing captured recipients, removing group labels/history", async () => {
  await db.query(
    "select save_communication_group($1,0,'Remove group',array[$2::uuid])",
    [event, dancer],
  );
  const post = "00000000-0000-4000-8000-000000000099";
  await db.query(
    "select save_communication($1,0,'task','Retain task','Practice','individual','group',null,$2,null)",
    [post, event],
  );
  await db.query("select archive_communication_group($1,1)", [event]);
  expect(
    (await db.query("select * from communication_groups")).rows,
  ).toHaveLength(0);
  expect(
    (await db.query("select * from communication_group_members")).rows,
  ).toHaveLength(0);
  expect(
    (
      await db.query("select * from communication_audit where group_id=$1", [
        event,
      ])
    ).rows,
  ).toHaveLength(0);
  expect(
    (
      await db.query(
        "select audience_type,audience_source_id,audience_label from communication_posts",
      )
    ).rows,
  ).toEqual([
    {
      audience_type: "selected",
      audience_source_id: null,
      audience_label: "Selected dancers",
    },
  ]);
  expect(
    (await db.query("select member_id from communication_recipients")).rows,
  ).toEqual([{ member_id: dancer }]);
  await expect(
    db.query(
      "select save_communication($1,1,'task','Stale','Practice','individual','group',null,$2,null)",
      [post, event],
    ),
  ).rejects.toThrow(/changed/);
  await db.query(
    "select save_communication($1,2,'task','Edited retained task','Practice','individual','selected',array[$2::uuid],null,null)",
    [post, dancer],
  );
  expect(
    (
      await db.query<{ title: string }>(
        "select title from communication_posts where id=$1",
        [post],
      )
    ).rows[0].title,
  ).toBe("Edited retained task");
});

it("deletes segment data and revokes PDF access while durably queuing current/historical object removal", async () => {
  const first = `${admin}/00000000-0000-4000-8000-000000000021.pdf`;
  const second = `${admin}/00000000-0000-4000-8000-000000000022.pdf`;
  await db.exec("reset role");
  for (const path of [first, second])
    await db.query(
      'insert into storage.objects(bucket_id,name,metadata) values(\'formations\',$1,\'{"size":100,"mimetype":"application/pdf"}\')',
      [path],
    );
  await user(admin);
  await db.query(
    "select save_segment($1,0,'Opening',array[$2::uuid],$3,'first.pdf')",
    [event, dancer, first],
  );
  await db.query(
    "select save_segment($1,1,'Opening',array[$2::uuid],$3,'second.pdf')",
    [event, dancer, second],
  );
  await expect(
    db.query("select archive_segment($1,1)", [event]),
  ).rejects.toThrow(/changed/);
  await user(dancer);
  await expect(
    db.query("select archive_segment($1,2)", [event]),
  ).rejects.toThrow(/Admin/);
  await user(admin);
  await db.query("select archive_segment($1,2)", [event]);
  for (const table of ["segments", "segment_members", "segment_audit"])
    expect((await db.query(`select * from ${table}`)).rows).toHaveLength(0);
  await expect(db.query("select * from formation_cleanup")).rejects.toThrow(
    /permission/,
  );
  await expect(db.query("select formation_cleanup_jobs()")).rejects.toThrow(
    /permission/,
  );
  await db.exec("reset role");
  expect(
    (await db.query("select path from formation_cleanup order by path")).rows,
  ).toEqual([{ path: first }, { path: second }]);
  // Object metadata remains until actual bytes are removed through Storage API.
  expect(
    (
      await db.query(
        "select * from storage.objects where name=any($1::text[])",
        [[first, second]],
      )
    ).rows,
  ).toHaveLength(2);
  await db.exec(
    "grant usage on schema storage to authenticated;grant select on storage.objects to authenticated",
  );
  await user(admin);
  expect(
    (
      await db.query(
        "select * from storage.objects where name=any($1::text[])",
        [[first, second]],
      )
    ).rows,
  ).toHaveLength(0);
  await expect(
    db.query(
      "select save_segment($1,0,'Reattach',array[$2::uuid],$3,'second.pdf')",
      [event, dancer, second],
    ),
  ).rejects.toThrow(/PDF deleted/);
  await user("", "service_role");
  expect((await db.query("select formation_cleanup_jobs()")).rows).toHaveLength(
    2,
  );
  await db.query("select finish_formation_cleanup($1::text[])", [
    [first, second],
  ]);
  expect((await db.query("select formation_cleanup_jobs()")).rows).toHaveLength(
    0,
  );
});

it("upgrades existing archived records by purging non-payment data while preserving deleted financial evidence", async () => {
  const upgrade = await database(false);
  const document = `${admin}/00000000-0000-4000-8000-000000000050.pdf`;
  try {
    for (const id of [admin, dancer]) {
      await upgrade.query(
        'insert into auth.users values($1,$2,now(),\'{"provider":"google"}\')',
        [id, `${id}@tamu.edu`],
      );
      await upgrade.query(
        "insert into members(id,email,display_name,status,is_admin) values($1,$2,'Dancer','active',$3)",
        [id, `${id}@tamu.edu`, id === admin],
      );
    }
    await upgrade.query("select set_config('request.jwt.claim.sub',$1,false)", [
      admin,
    ]);
    await upgrade.query(
      'insert into storage.objects(bucket_id,name,metadata) values(\'formations\',$1,\'{"mimetype":"application/pdf","size":128}\')',
      [document],
    );
    await upgrade.query(
      "select save_segment($1,0,'Old segment',array[$2::uuid],$3,'Formation.pdf')",
      [event, dancer, document],
    );
    await upgrade.query("select archive_segment($1,1)", [event]);
    await upgrade.query(
      "select save_communication_group($1,0,'Old group',array[$2::uuid])",
      [event, dancer],
    );
    await upgrade.query("select archive_communication_group($1,1)", [event]);
    await upgrade.query(
      "select save_communication($1,0,'announcement','Old post','Message','individual','team',null,null,null)",
      [event],
    );
    await upgrade.query("select manage_communication($1,1,'archive',null)", [
      event,
    ]);
    await upgrade.query(
      "select save_featured_event($1,0,'Old event','','2026-12-12',null,'','')",
      [event],
    );
    await upgrade.query("select delete_featured_event($1,1)", [event]);
    await upgrade.query(
      "select issue_payment_charges($1,1000,'Old payment','Pay treasurer',null,'individual',array[$2::uuid],null)",
      [event, dancer],
    );
    await upgrade.exec(
      "select manage_payment_charge((select id from payment_charges),1,'delete',null,'','',null,'Cancelled charge')",
    );
    await upgrade.exec(
      readFileSync("supabase/migrations/0009_permanent_deletion.sql", "utf8"),
    );
    for (const table of [
      "segments",
      "segment_members",
      "segment_audit",
      "communication_posts",
      "communication_recipients",
      "communication_groups",
      "communication_group_members",
      "communication_audit",
      "featured_events",
      "featured_event_audit",
    ])
      expect(
        (await upgrade.query(`select * from ${table}`)).rows,
        table,
      ).toHaveLength(0);
    expect(
      (await upgrade.query("select path from formation_cleanup")).rows,
    ).toEqual([{ path: document }]);
    expect(
      (await upgrade.query("select status from payment_charges")).rows,
    ).toEqual([{ status: "deleted" }]);
    expect(
      (await upgrade.query("select * from payment_audit")).rows,
    ).toHaveLength(2);
    await upgrade.exec("set role authenticated");
    expect(
      (await upgrade.query("select * from payment_charges")).rows,
    ).toHaveLength(0);
    expect(
      (await upgrade.query("select * from payment_audit")).rows,
    ).toHaveLength(0);
  } finally {
    await upgrade.close();
  }
});

async function seedRecovery(instance: PGlite) {
  for (const id of [admin, dancer]) {
    await instance.query(
      'insert into auth.users values($1,$2,now(),\'{"provider":"google"}\')',
      [id, `${id}@tamu.edu`],
    );
    await instance.query(
      "insert into members(id,email,display_name,status,is_admin) values($1,$2,'Dancer','active',$3)",
      [id, `${id}@tamu.edu`, id === admin],
    );
  }
  await instance.query("select set_config('request.jwt.claim.sub',$1,false)", [
    admin,
  ]);
}
const managementMigration = () =>
  readFileSync(
    "supabase/migrations/0008_management_featured_events.sql",
    "utf8",
  );
it("resumes0008 after only its first function was installed", async () => {
  const partial = await database(false, false);
  try {
    const sql = managementMigration();
    const split = sql.search(
      /create table(?: if not exists)? public.featured_events/,
    );
    expect(split).toBeGreaterThan(0);
    await partial.exec(sql.slice(0, split) + "\ncommit;");
    await partial.exec(sql);
    await seedRecovery(partial);
    await partial.query(
      "select save_featured_event($1,0,'Recovered','','2026-12-12',null,'','')",
      [event],
    );
    expect(
      (await partial.query("select title from featured_events")).rows,
    ).toEqual([{ title: "Recovered" }]);
  } finally {
    await partial.close();
  }
});
it("repeating0008 preserves populated business/audit data and repairs missing management objects without duplicate triggers", async () => {
  const installed = await database(false);
  try {
    await seedRecovery(installed);
    await installed.query(
      "select save_featured_event($1,0,'Existing event','','2026-12-12',null,'','')",
      [event],
    );
    await installed.query(
      "select issue_payment_charges($1,1250,'Existing charge','Pay treasurer',null,'individual',array[$2::uuid],null)",
      [event, dancer],
    );
    const tables = [
      "members",
      "featured_events",
      "featured_event_audit",
      "payment_batches",
      "payment_charges",
      "payment_audit",
      "push_jobs",
    ];
    const before = await Promise.all(
      tables.map((t) => installed.query(`select * from ${t}`)),
    );
    await installed.exec(managementMigration());
    await installed.exec(
      "drop policy featured_audit_read on featured_event_audit;drop trigger push_featured on featured_events;drop function save_featured_event(uuid,integer,text,text,date,time,text,text);",
    );
    await installed.exec(managementMigration());
    for (let i = 0; i < tables.length; i++)
      expect(
        (await installed.query(`select * from ${tables[i]}`)).rows,
        tables[i],
      ).toEqual(before[i].rows);
    expect(
      (
        await installed.query(
          "select count(*)::int n from pg_trigger where tgrelid='public.featured_events'::regclass and tgname='push_featured'",
        )
      ).rows,
    ).toEqual([{ n: 1 }]);
    await installed.exec("set role authenticated");
    expect(
      (await installed.query("select * from featured_event_audit")).rows,
    ).toHaveLength(1);
    await installed.query(
      "select save_featured_event($1,1,'Updated existing','','2026-12-12',null,'','')",
      [event],
    );
    await installed.query(
      "select set_config('request.jwt.claim.sub',$1,false)",
      [dancer],
    );
    await expect(
      installed.query(
        "select save_featured_event($1,2,'Forbidden','','2026-12-12',null,'','')",
        [event],
      ),
    ).rejects.toThrow(/Admin/);
    await installed.exec("set role anon");
    await expect(
      installed.query(
        "select save_featured_event($1,2,'Forbidden','','2026-12-12',null,'','')",
        [event],
      ),
    ).rejects.toThrow(/permission/);
  } finally {
    await installed.close();
  }
});
it("refuses0008 after0009 before changing permanent deletion or private payment behavior", async () => {
  const before = (
    await db.query(
      "select pg_get_functiondef('public.delete_featured_event(uuid,integer)'::regprocedure) definition",
    )
  ).rows;
  await db.exec("reset role");
  await expect(db.exec(managementMigration())).rejects.toThrow(
    /0009.*already|already.*0009/,
  );
  await db.exec("rollback");
  expect(
    (
      await db.query(
        "select pg_get_functiondef('public.delete_featured_event(uuid,integer)'::regprocedure) definition",
      )
    ).rows,
  ).toEqual(before);
  await user(admin);
  await save();
  await db.query("select delete_featured_event($1,1)", [event]);
  expect((await db.query("select * from featured_events")).rows).toHaveLength(
    0,
  );
  const id = await charge();
  await manage(id, 1, "delete");
  expect((await db.query("select * from payment_audit")).rows).toHaveLength(0);
});

it("rolls back the whole0008 attempt on a late failure, then permits a clean retry", async () => {
  const rollbackDb = await database(false, false);
  try {
    await seedRecovery(rollbackDb);
    await rollbackDb.query(
      "select issue_payment_charges($1,1250,'Keep this charge','Pay treasurer',null,'individual',array[$2::uuid],null)",
      [event, dancer],
    );
    const before = (await rollbackDb.query("select * from payment_charges"))
      .rows;
    const failing = managementMigration().replace(
      /commit;\s*$/,
      "select 1/0;commit;",
    );
    await expect(rollbackDb.exec(failing)).rejects.toThrow(/division by zero/);
    await rollbackDb.exec("rollback");
    expect(
      (
        await rollbackDb.query(
          "select to_regclass('public.featured_events') name,to_regprocedure('public.manage_payment_charge(uuid,integer,text,integer,text,text,date,text)') rpc",
        )
      ).rows,
    ).toEqual([{ name: null, rpc: null }]);
    expect(
      (await rollbackDb.query("select * from payment_charges")).rows,
    ).toEqual(before);
    expect(
      (
        await rollbackDb.query<{ definition: string }>(
          "select pg_get_constraintdef(oid) definition from pg_constraint where conrelid='public.payment_charges'::regclass and conname='payment_charges_status_check'",
        )
      ).rows[0].definition,
    ).not.toContain("deleted");
    await rollbackDb.exec(managementMigration());
    expect(
      (await rollbackDb.query("select * from payment_charges")).rows,
    ).toEqual(before);
  } finally {
    await rollbackDb.close();
  }
});

it.each(["dropped", "cascade"])(
  "refuses0008 after0009's earliest %s-FK prefix, before later marker objects exist",
  async (state) => {
    const early = await database(false);
    try {
      await early.exec(
        "alter table featured_event_audit drop constraint featured_event_audit_event_id_fkey;",
      );
      if (state === "cascade")
        await early.exec(
          "alter table featured_event_audit add constraint featured_event_audit_event_id_fkey foreign key(event_id) references featured_events(id) on delete cascade;",
        );
      expect(
        (
          await early.query(
            "select to_regclass('public.formation_cleanup') marker",
          )
        ).rows,
      ).toEqual([{ marker: null }]);
      const before = (
        await early.query(
          "select conname,confdeltype from pg_constraint where conrelid='public.featured_event_audit'::regclass order by conname",
        )
      ).rows;
      await expect(early.exec(managementMigration())).rejects.toThrow(
        /0009.*already|already.*0009/,
      );
      await early.exec("rollback");
      expect(
        (
          await early.query(
            "select conname,confdeltype from pg_constraint where conrelid='public.featured_event_audit'::regclass order by conname",
          )
        ).rows,
      ).toEqual(before);
    } finally {
      await early.close();
    }
  },
);

it("0009 replay preserves live records, retained payment evidence and queued file cleanup", async () => {
  await save();
  const id = await charge();
  await manage(id, 1, "delete");
  await db.exec("reset role");
  await db.query(
    "insert into formation_cleanup(path) values('admin/queued.pdf')",
  );
  const audit = (await db.query("select * from payment_audit order by id"))
    .rows;
  await db.exec(
    readFileSync("supabase/migrations/0009_permanent_deletion.sql", "utf8"),
  );
  expect(
    (await db.query("select * from payment_audit order by id")).rows,
  ).toEqual(audit);
  expect((await db.query("select path from formation_cleanup")).rows).toEqual([
    { path: "admin/queued.pdf" },
  ]);
  await user(admin);
  expect((await db.query("select id from featured_events")).rows).toEqual([
    { id: event },
  ]);
  expect((await db.query("select * from payment_charges")).rows).toHaveLength(
    0,
  );
  await db.query("select delete_team_item($1,1,'featured')", [event]);
  expect((await db.query("select * from featured_events")).rows).toHaveLength(
    0,
  );
});
it("0009 resumes the existing-table interruption and restores missing triggers/policies", async () => {
  const recovery = await database(false);
  try {
    await recovery.exec(
      "create table public.formation_cleanup(path text primary key,created_at timestamptz not null default now())",
    );
    const sql = readFileSync(
      "supabase/migrations/0009_permanent_deletion.sql",
      "utf8",
    );
    await recovery.exec(sql);
    await recovery.exec(
      "drop trigger purge_post on communication_posts;drop policy payment_read on payment_charges;",
    );
    await recovery.exec(sql);
    expect(
      (
        await recovery.query(
          "select tgname from pg_trigger where tgname='purge_post'",
        )
      ).rows,
    ).toHaveLength(1);
    expect(
      (
        await recovery.query(
          "select policyname from pg_policies where tablename='payment_charges' and policyname='payment_read'",
        )
      ).rows,
    ).toHaveLength(1);
  } finally {
    await recovery.close();
  }
});
it("0009 refuses before changing0010 expiration rules or a partial0010 column", async () => {
  const recovery = await database();
  try {
    const sql = readFileSync(
      "supabase/migrations/0009_permanent_deletion.sql",
      "utf8",
    );
    await recovery.exec(
      "alter table communication_posts add column expires_at timestamptz",
    );
    await expect(recovery.exec(sql)).rejects.toThrow(/Migration0010/);
    await recovery.exec(
      "rollback;alter table communication_posts drop column expires_at",
    );
    await recovery.exec(
      readFileSync(
        "supabase/migrations/0010_announcement_images_expiration.sql",
        "utf8",
      ),
    );
    const before = (
      await recovery.query(
        "select pg_get_functiondef('public.push_job_valid(public.push_jobs,uuid)'::regprocedure) definition",
      )
    ).rows;
    await expect(recovery.exec(sql)).rejects.toThrow(/Migration0010/);
    await recovery.exec("rollback");
    expect(
      (
        await recovery.query(
          "select pg_get_functiondef('public.push_job_valid(public.push_jobs,uuid)'::regprocedure) definition",
        )
      ).rows,
    ).toEqual(before);
  } finally {
    await recovery.close();
  }
});
it("0009 rolls back earlier policy/function/FK changes when later DDL fails", async () => {
  const recovery = await database(false);
  try {
    await recovery.exec(
      "create table formation_cleanup(path text primary key)",
    );
    const before = (
      await recovery.query(
        "select qual from pg_policies where tablename='payment_charges' and policyname='payment_read'",
      )
    ).rows;
    await expect(
      recovery.exec(
        readFileSync("supabase/migrations/0009_permanent_deletion.sql", "utf8"),
      ),
    ).rejects.toThrow(/created_at/);
    await recovery.exec("rollback");
    expect(
      (
        await recovery.query(
          "select qual from pg_policies where tablename='payment_charges' and policyname='payment_read'",
        )
      ).rows,
    ).toEqual(before);
    expect(
      (
        await recovery.query(
          "select to_regprocedure('public.delete_team_item(uuid,integer,text)') fn",
        )
      ).rows[0],
    ).toEqual({ fn: null });
    expect(
      (
        await recovery.query(
          "select confdeltype from pg_constraint where conname='featured_event_audit_event_id_fkey'",
        )
      ).rows[0],
    ).toEqual({ confdeltype: "a" });
  } finally {
    await recovery.close();
  }
});
