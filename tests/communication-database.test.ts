import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, beforeEach, it, expect } from "vitest";
let db: PGlite;
const admin = "00000000-0000-4000-8000-000000000001",
  dancer = "00000000-0000-4000-8000-000000000002",
  other = "00000000-0000-4000-8000-000000000003",
  pending = "00000000-0000-4000-8000-000000000004",
  post = "00000000-0000-4000-8000-000000000010",
  group = "00000000-0000-4000-8000-000000000020";
async function user(id: string) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
  await db.exec("set role authenticated");
}
async function save(
  version = 0,
  mode = "individual",
  audience = "selected",
  ids = [admin, dancer],
  source: string | null = null,
) {
  return db.query(
    "select public.save_communication($1,$2,$3,$4,$5,$6,$7,$8::uuid[],$9,$10)",
    [
      post,
      version,
      "task",
      "Practice",
      "Learn the steps",
      mode,
      audience,
      ids,
      source,
      null,
    ],
  );
}
async function complete(version = 1) {
  return db.query("select public.complete_communication($1,$2)", [
    post,
    version,
  ]);
}
async function manage(
  operation: string,
  version = 1,
  recipient: string | null = null,
) {
  return db.query("select public.manage_communication($1,$2,$3,$4)", [
    post,
    version,
    operation,
    recipient,
  ]);
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    `create role anon nologin;create role authenticated nologin;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_app_meta_data jsonb);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;create schema storage;create function storage.allow_only_operation(operation text) returns boolean language sql stable as $$select false$$;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb);alter table storage.objects enable row level security;grant usage on schema storage to authenticated;grant select,insert on storage.objects to authenticated;`,
  );
  for (const file of [
    "0001_identity.sql",
    "0002_segments.sql",
    "0003_communication.sql",
  ])
    await db.exec(readFileSync("supabase/migrations/" + file, "utf8"));
});
afterAll(async () => {
  await db?.close();
});
beforeEach(async () => {
  await db.exec(
    "reset role;truncate auth.users cascade;truncate public.communication_posts cascade;truncate public.communication_groups cascade;",
  );
  for (const [i, id] of [admin, dancer, other, pending].entries()) {
    await db.query(
      `insert into auth.users values($1,$2,now(),'{"provider":"google"}')`,
      [id, `member${i}@tamu.edu`],
    );
    await user(id);
    await db.query("select public.complete_onboarding($1)", ["Dancer " + i]);
    await db.exec("reset role");
  }
  await db.query(
    "update public.members set status='active',is_admin=(id=$1) where id<>$2",
    [admin, pending],
  );
  await user(admin);
});
it("keeps targeted posts private and exposes only own recipient row", async () => {
  await save();
  await user(dancer);
  expect(
    (await db.query("select * from communication_posts")).rows,
  ).toHaveLength(1);
  expect(
    (await db.query("select member_id from communication_recipients")).rows,
  ).toEqual([{ member_id: dancer }]);
  for (const id of [other, pending]) {
    await user(id);
    expect(
      (await db.query("select * from communication_posts")).rows,
    ).toHaveLength(0);
    await expect(complete()).rejects.toThrow();
  }
});
it("denies dancer writes, group access and direct tampering", async () => {
  await save();
  await user(dancer);
  await expect(save(1)).rejects.toThrow(/Admin/);
  await expect(manage("archive")).rejects.toThrow(/Admin/);
  for (const table of [
    "communication_posts",
    "communication_recipients",
    "communication_groups",
    "communication_group_members",
    "communication_audit",
  ])
    await expect(db.exec(`delete from ${table}`)).rejects.toThrow();
  expect(
    (await db.query("select * from communication_audit")).rows,
  ).toHaveLength(0);
});
it("completes individual tasks independently and idempotently", async () => {
  await save();
  await user(dancer);
  await complete();
  await complete();
  await user(admin);
  expect(
    (
      await db.query(
        "select member_id from communication_recipients where completed_at is not null",
      )
    ).rows,
  ).toEqual([{ member_id: dancer }]);
  await complete();
  expect(
    (
      await db.query(
        "select * from communication_recipients where completed_at is not null",
      )
    ).rows,
  ).toHaveLength(2);
});
it("preserves first shared actor and fences stale completions after reopen", async () => {
  await save(0, "shared");
  await user(dancer);
  await complete();
  await user(admin);
  await complete();
  expect(
    (await db.query("select completed_by from communication_posts")).rows,
  ).toEqual([{ completed_by: dancer }]);
  await manage("reopen");
  await user(dancer);
  await expect(complete()).rejects.toThrow(/changed/);
  await complete(2);
});
it("archives, restores and selectively reopens without deleting history", async () => {
  await save();
  await user(dancer);
  await complete();
  await user(admin);
  await manage("reopen", 1, dancer);
  expect(
    (
      await db.query(
        "select * from communication_recipients where completed_at is not null",
      )
    ).rows,
  ).toHaveLength(0);
  await manage("archive", 2);
  await user(dancer);
  expect(
    (await db.query("select * from communication_posts")).rows,
  ).toHaveLength(0);
  await expect(complete(3)).rejects.toThrow();
  await user(admin);
  await manage("restore", 3);
  expect(
    (await db.query("select version from communication_posts")).rows,
  ).toEqual([{ version: 4 }]);
});
it("rejects invalid recipients, enums, stale edits and audience edits atomically", async () => {
  await expect(save(0, "wrong")).rejects.toThrow();
  await expect(save(0, "individual", "selected", [pending])).rejects.toThrow(
    /active/,
  );
  await expect(save(0, "individual", "selected", [])).rejects.toThrow();
  await save();
  await expect(save()).rejects.toThrow(/changed/);
  await expect(save(1, "individual", "selected", [other])).rejects.toThrow(
    /immutable/,
  );
  await save(1);
  expect(
    (await db.query("select version from communication_posts")).rows,
  ).toEqual([{ version: 2 }]);
});
it("snapshots groups and team without following future membership edits", async () => {
  await db.query("select save_communication_group($1,0,$2,$3::uuid[])", [
    group,
    "Leads",
    [dancer],
  ]);
  await save(0, "individual", "group", [], group);
  await db.query("select save_communication_group($1,1,$2,$3::uuid[])", [
    group,
    "Leads",
    [other],
  ]);
  expect(
    (await db.query("select member_id from communication_recipients")).rows,
  ).toEqual([{ member_id: dancer }]);
  await expect(
    db.query("select archive_communication_group($1,1)", [group]),
  ).rejects.toThrow(/changed/);
  await db.query("select archive_communication_group($1,2)", [group]);
  await db.exec("reset role;truncate communication_posts cascade");
  await user(admin);
  await save(0, "individual", "team", []);
  expect(
    (await db.query("select * from communication_recipients")).rows,
  ).toHaveLength(3);
});
it("denies deactivated recipients even with existing sessions", async () => {
  await save();
  await db.exec("reset role");
  await db.query("update members set status='inactive' where id=$1", [dancer]);
  await user(dancer);
  expect(
    (await db.query("select * from communication_posts")).rows,
  ).toHaveLength(0);
  await expect(complete()).rejects.toThrow();
});
it("snapshots segment recipients and excludes subsequently inactive source members", async () => {
  await db.exec("reset role");
  await db.query(
    "insert into segments(id,name,document_path,document_label) values($1,'Finale','fixture','fixture.pdf')",
    [group],
  );
  await db.query("insert into segment_members values($1,$2),($1,$3)", [
    group,
    admin,
    dancer,
  ]);
  await user(admin);
  await save(0, "individual", "segment", [], group);
  await db.exec("reset role");
  await db.query("delete from segment_members where member_id=$1", [dancer]);
  await db.query("insert into segment_members values($1,$2)", [group, other]);
  await user(admin);
  expect(
    (
      await db.query(
        "select member_id from communication_recipients order by member_id",
      )
    ).rows,
  ).toEqual([{ member_id: admin }, { member_id: dancer }]);
});
it("acknowledges announcements independently and audits retries once", async () => {
  await db.query(
    "select save_communication($1,0,$2,$3,$4,$5,$6,$7::uuid[],null,null)",
    [
      post,
      "announcement",
      "Notice",
      "Read me",
      "individual",
      "individual",
      [dancer],
    ],
  );
  await user(dancer);
  await complete();
  await complete();
  await user(admin);
  expect(
    (
      await db.query(
        "select * from communication_audit where action='completed'",
      )
    ).rows,
  ).toHaveLength(1);
  await manage("reopen", 1, dancer);
  await user(dancer);
  await expect(complete()).rejects.toThrow(/changed/);
  await complete(2);
});
it("fails closed on null inputs and blocks group manipulation by dancers", async () => {
  await expect(
    save(0, "individual", "selected", [null as unknown as string]),
  ).rejects.toThrow();
  await expect(
    db.query(
      "select save_communication($1,0,null,$2,$3,null,null,null,null,null)",
      [post, "Notice", "Read"],
    ),
  ).rejects.toThrow();
  await save();
  await expect(manage(null as unknown as string)).rejects.toThrow();
  await expect(manage("reopen", 1, other)).rejects.toThrow();
  await user(dancer);
  await expect(
    db.query("select save_communication_group($1,0,$2,$3::uuid[])", [
      group,
      "Leads",
      [dancer],
    ]),
  ).rejects.toThrow(/Admin/);
  await expect(
    db.query("select archive_communication_group($1,1)", [group]),
  ).rejects.toThrow(/Admin/);
  expect(
    (await db.query("select * from communication_groups")).rows,
  ).toHaveLength(0);
  await db.exec("set role anon");
  await expect(db.query("select * from communication_posts")).rejects.toThrow();
  await expect(complete()).rejects.toThrow();
});
