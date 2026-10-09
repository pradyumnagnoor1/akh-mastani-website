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
    `create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_app_meta_data jsonb);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;create schema storage;create function storage.allow_only_operation(text) returns boolean language sql stable as $$select true$$;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb);alter table storage.objects enable row level security;grant usage on schema storage to authenticated,anon,service_role;grant select,insert on storage.objects to authenticated;grant all on storage.objects to service_role;`,
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
  await db.exec(
    readFileSync(
      "supabase/migrations/0010_announcement_images_expiration.sql",
      "utf8",
    ),
  );
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
const post = "00000000-0000-4000-8000-000000000020";
const another = "00000000-0000-4000-8000-000000000021";
async function savePost(
  version = 0,
  image: string | null = null,
  expiration: string | null = null,
  kind = "announcement",
  id = post,
) {
  return db.query(
    "select save_communication_media($1,$2,$3,'Update','Details','individual','individual',array[$4::uuid],null,null,$5,$6,'Team flyer')",
    [id, version, kind, dancer, expiration, image],
  );
}
async function reserve(id = post, version = 0) {
  return (
    await db.query<{ path: string }>(
      "select reserve_announcement_image($1,$2) path",
      [id, version],
    )
  ).rows[0].path;
}
async function upload(path: string, verified = true) {
  await db.exec("reset role");
  await db.query(
    'insert into storage.objects(bucket_id,name,metadata) values(\'announcement-images\',$1,\'{"mimetype":"image/jpeg","size":100}\')',
    [path],
  );
  await user(admin);
  if (verified) {
    await user(admin, "service_role");
    await db.query("select verify_announcement_image($1,$2)", [path, admin]);
    await user(admin);
  }
}
it("publishes a private validated attachment and enforces recipient/admin/active membership", async () => {
  const path = await reserve();
  await upload(path);
  await savePost(0, path);
  await user(dancer);
  expect(
    (
      await db.query(
        "select name from storage.objects where bucket_id='announcement-images'",
      )
    ).rows,
  ).toHaveLength(1);
  await expect(
    db.query("select reserve_announcement_image($1,1)", [post]),
  ).rejects.toThrow(/Admin/);
  await expect(
    db.query("select verify_announcement_image($1,$2)", [path, admin]),
  ).rejects.toThrow(/permission/);
  await user(outsider);
  expect(
    (await db.query("select * from communication_posts")).rows,
  ).toHaveLength(0);
  expect(
    (
      await db.query(
        "select * from storage.objects where bucket_id='announcement-images'",
      )
    ).rows,
  ).toHaveLength(0);
  await db.exec("reset role");
  await db.query("update members set status='active' where id=$1", [outsider]);
  await user(outsider);
  expect(
    (
      await db.query(
        "select * from storage.objects where bucket_id='announcement-images'",
      )
    ).rows,
  ).toHaveLength(0);
});
it("rejects fake/unverified, mismatched, abandoned, expired reservations and task attachments atomically", async () => {
  const path = await reserve();
  await upload(path, false);
  await expect(savePost(0, path)).rejects.toThrow(/Image unavailable/);
  expect(
    (await db.query("select * from communication_posts")).rows,
  ).toHaveLength(0);
  await user(admin, "service_role");
  await db.query("select verify_announcement_image($1,$2)", [path, admin]);
  await user(admin);
  await expect(
    savePost(0, path, null, "announcement", another),
  ).rejects.toThrow(/Image unavailable/);
  await expect(savePost(0, path, null, "task")).rejects.toThrow(
    /Invalid image/,
  );
  await db.query("select abandon_announcement_image($1)", [path]);
  await expect(savePost(0, path)).rejects.toThrow(/Image unavailable/);
});
it("replacement and permanent deletion queue immutable bytes, revoke reads and cascade records", async () => {
  const path = await reserve();
  await upload(path);
  await savePost(0, path);
  const next = await reserve(post, 1);
  await upload(next);
  await savePost(1, next);
  expect(
    (
      await db.query("select state from announcement_uploads where path=$1", [
        path,
      ])
    ).rows[0],
  ).toMatchObject({ state: "cleanup" });
  await db.query("select delete_team_item($1,2,'communication')", [post]);
  expect(
    (await db.query("select * from communication_posts")).rows,
  ).toHaveLength(0);
  expect(
    (await db.query("select * from communication_audit")).rows,
  ).toHaveLength(0);
  await user(admin, "service_role");
  expect(
    (await db.query("select * from announcement_cleanup_jobs()")).rows,
  ).toHaveLength(2);
  await expect(
    db.query("select finish_announcement_cleanup(array[$1])", [next]),
  ).resolves.toBeDefined();
});
it("expiry hides posts/recipients/history/images even from admins before purge and blocks old mutations", async () => {
  const path = await reserve();
  await upload(path);
  await savePost(0, path);
  await db.exec("reset role");
  await db.query(
    "update communication_posts set expires_at=now()-interval '1 second' where id=$1",
    [post],
  );
  for (const id of [admin, dancer]) {
    await user(id);
    for (const table of [
      "communication_posts",
      "communication_recipients",
      "communication_audit",
    ])
      expect((await db.query(`select * from ${table}`)).rows).toHaveLength(0);
    expect(
      (
        await db.query(
          "select name from storage.objects where bucket_id='announcement-images'",
        )
      ).rows,
    ).toHaveLength(0);
    await expect(
      db.query("select complete_communication($1,1)", [post]),
    ).rejects.toThrow();
  }
  await user(admin);
  await expect(savePost(1, path)).rejects.toThrow(/expired/);
  await expect(db.query("select purge_expired_items()")).rejects.toThrow(
    /permission/,
  );
  await user(admin, "service_role");
  expect(
    (await db.query<{ n: number }>("select purge_expired_items() n")).rows[0].n,
  ).toBe(1);
  await db.exec("reset role");
  expect(
    (await db.query("select * from communication_posts")).rows,
  ).toHaveLength(0);
  expect(
    (await db.query("select * from announcement_cleanup_jobs()")).rows,
  ).toHaveLength(1);
  expect(
    (await db.query<{ n: number }>("select purge_expired_items() n")).rows[0].n,
  ).toBe(0);
});
it("Chicago cutoff handles DST and due dates remain distinct from expiration", async () => {
  await db.exec("reset role");
  const rows = (
    await db.query<{ spring: Date; fall: Date }>(
      "select expiration_cutoff('2027-03-14') spring,expiration_cutoff('2027-11-07') fall",
    )
  ).rows[0];
  expect(new Date(rows.spring).toISOString()).toBe("2027-03-15T05:00:00.000Z");
  expect(new Date(rows.fall).toISOString()).toBe("2027-11-08T06:00:00.000Z");
  await user(admin);
  await savePost(0, null, null, "task");
  expect(
    (await db.query("select expires_at,due_on from communication_posts"))
      .rows[0],
  ).toEqual({ expires_at: null, due_on: null });
  await expect(savePost(1, null, "2000-01-01", "task")).rejects.toThrow(
    /expiration/,
  );
});
it("featured expiration is hidden and permanently cascades without altering payments", async () => {
  await db.query(
    "select save_featured_event_expiring($1,0,'Showcase','Details','2027-12-12',null,'Rudder','',null)",
    [event],
  );
  await db.exec("reset role");
  await db.query(
    "update featured_events set expires_at=now()-interval '1 second' where id=$1",
    [event],
  );
  await user(admin);
  expect((await db.query("select * from featured_events")).rows).toHaveLength(
    0,
  );
  expect(
    (await db.query("select * from featured_event_audit")).rows,
  ).toHaveLength(0);
  await expect(
    db.query(
      "select save_featured_event($1,1,'Changed showcase','Details','2027-12-12',null,'Rudder','')",
      [event],
    ),
  ).rejects.toThrow(/expired/);
  await user(admin, "service_role");
  expect(
    (await db.query<{ n: number }>("select purge_expired_items() n")).rows[0].n,
  ).toBe(1);
  await db.exec("reset role");
  expect(
    (await db.query("select * from featured_event_audit")).rows,
  ).toHaveLength(0);
});
it("abandoned drafts are swept and attached files cannot be marked abandoned", async () => {
  const path = await reserve();
  await upload(path);
  await savePost(0, path);
  await db.query("select abandon_announcement_image($1)", [path]);
  expect(
    (
      await db.query("select state from announcement_uploads where path=$1", [
        path,
      ])
    ).rows[0],
  ).toMatchObject({ state: "attached" });
  const abandoned = await reserve(post, 1);
  await db.exec("reset role");
  await db.query(
    "update announcement_uploads set created_at=now()-interval '2 hours' where path=$1",
    [abandoned],
  );
  await user(admin, "service_role");
  await db.query("select purge_expired_items()");
  expect(
    (await db.query("select * from announcement_cleanup_jobs()")).rows,
  ).toHaveLength(1);
});

it("expiration-only featured edits advance revision and reject a stale editor", async () => {
  await db.query(
    "select save_featured_event_expiring($1,0,'Showcase','Details','2027-12-12',null,'Rudder','',null)",
    [event],
  );
  await db.query(
    "select save_featured_event_expiring($1,1,'Showcase','Details','2027-12-12',null,'Rudder','','2027-12-12')",
    [event],
  );
  expect(
    (await db.query("select version from featured_events")).rows[0],
  ).toMatchObject({ version: 2 });
  await expect(
    db.query(
      "select save_featured_event_expiring($1,1,'Showcase','Details','2027-12-12',null,'Rudder','','2027-12-13')",
      [event],
    ),
  ).rejects.toThrow(/changed/);
});
it("direct browser storage writes are denied and cleanup evidence survives a late response", async () => {
  const path = await reserve();
  await expect(
    db.query(
      "insert into storage.objects(bucket_id,name) values('announcement-images',$1)",
      [path],
    ),
  ).rejects.toThrow(/row-level/);
  await db.query("select abandon_announcement_image($1)", [path]);
  await db.exec("reset role");
  await db.query(
    "update announcement_uploads set cleanup_after=now()-interval '1 minute' where path=$1",
    [path],
  );
  await user(admin, "service_role");
  await db.query("select finish_announcement_cleanup(array[$1])", [path]);
  await db.exec("reset role");
  expect(
    (
      await db.query(
        "select state,cleaned_at from announcement_uploads where path=$1",
        [path],
      )
    ).rows[0],
  ).toMatchObject({ state: "cleanup" });
  await db.query(
    "update announcement_uploads set cleaned_at=now()-interval '2 hours' where path=$1",
    [path],
  );
  expect(
    (await db.query("select * from announcement_cleanup_jobs()")).rows,
  ).toHaveLength(1);
  await db.query(
    "update announcement_uploads set cleanup_after=now()-interval '2 days' where path=$1",
    [path],
  );
  await db.query("select finish_announcement_cleanup(array[$1])", [path]);
  await db.exec("reset role");
  expect(
    (await db.query("select * from announcement_uploads where path=$1", [path]))
      .rows,
  ).toHaveLength(0);
});
it("queued delivery becomes invalid at expiry, enqueue stops and purge removes jobs", async () => {
  await db.exec("reset role");
  await db.query(
    "insert into push_subscriptions(member_id,endpoint,p256dh,auth) values($1,'https://push.example/test','key','auth')",
    [dancer],
  );
  await user(admin);
  await savePost();
  await db.exec("reset role");
  expect(
    (
      await db.query<{ valid: boolean }>(
        "select push_job_valid(j,$1) valid from push_jobs j",
        [dancer],
      )
    ).rows[0].valid,
  ).toBe(true);
  await db.query(
    "update communication_posts set expires_at=now()-interval '1 second' where id=$1",
    [post],
  );
  expect(
    (
      await db.query<{ valid: boolean }>(
        "select push_job_valid(j,$1) valid from push_jobs j",
        [dancer],
      )
    ).rows[0].valid,
  ).toBe(false);
  expect(
    (
      await db.query<{ n: number }>(
        "select push_enqueue(array[$1::uuid],'announcement','late',$2,'communication','/announcements') n",
        [dancer, post],
      )
    ).rows[0].n,
  ).toBe(0);
  await db.query("select purge_expired_items()");
  expect((await db.query("select * from push_jobs")).rows).toHaveLength(0);
});
