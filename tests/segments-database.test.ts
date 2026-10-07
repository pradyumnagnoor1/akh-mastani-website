import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, beforeEach, describe, it, expect } from "vitest";
let db: PGlite;
const admin = "00000000-0000-4000-8000-000000000001",
  dancer = "00000000-0000-4000-8000-000000000002",
  pending = "00000000-0000-4000-8000-000000000003";
const segment = "00000000-0000-4000-8000-000000000010";
const pdf = `${admin}/00000000-0000-4000-8000-000000000020.pdf`;
async function asUser(id: string) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
  await db.exec("set role authenticated");
  await db.exec(
    "select set_config('fixture.storage_operation','object.get_authenticated',false)",
  );
}
async function save(
  version = 0,
  ids = [admin, dancer],
  path = pdf,
  name = "Opening",
) {
  return db.query("select public.save_segment($1,$2,$3,$4::uuid[],$5,$6)", [
    segment,
    version,
    name,
    ids,
    path,
    "formations.pdf",
  ]);
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon nologin;create role authenticated nologin;create schema auth;
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_app_meta_data jsonb);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;
 create schema storage;
create function storage.allow_only_operation(operation text) returns boolean language sql stable as $$select coalesce(current_setting('fixture.storage_operation',true)=operation,false)$$;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb,unique(bucket_id,name));
 alter table storage.objects enable row level security;
 grant usage on schema storage to authenticated,anon;
 grant select,insert,update,delete on storage.objects to authenticated;
 `);
  await db.exec(readFileSync("supabase/migrations/0001_identity.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/0002_segments.sql", "utf8"));
});
afterAll(async () => {
  await db?.close();
});
beforeEach(async () => {
  await db.exec("reset role");
  await db.exec("truncate auth.users cascade;truncate storage.objects;");
  for (const [id, email] of [
    [admin, "admin@tamu.edu"],
    [dancer, "dancer@tamu.edu"],
    [pending, "pending@tamu.edu"],
  ]) {
    await db.query(
      `insert into auth.users values($1,$2,now(),'{"provider":"google"}')`,
      [id, email],
    );
    await asUser(id);
    await db.query("select public.complete_onboarding($1)", ["Same Name"]);
    await db.exec("reset role");
  }
  await db.query(
    "update public.members set status='active',is_admin=(id=$1) where id in ($1,$2)",
    [admin, dancer],
  );
  await asUser(admin);
  await db.query(
    `insert into storage.objects(bucket_id,name,metadata) values('formations',$1,'{"size":100,"mimetype":"application/pdf"}')`,
    [pdf],
  );
});
describe("segments database permissions and atomic updates", () => {
  it.each([
    "object.sign",
    "object.sign_many",
    "object.list",
    "s3.object.get",
    "",
  ])("denies bearer signing and other operations: %s", async (operation) => {
    await save();
    for (const user of [admin, dancer]) {
      await asUser(user);
      await db.query(
        "select set_config('fixture.storage_operation',$1,false)",
        [operation],
      );
      expect(
        (await db.query("select * from storage.objects")).rows,
      ).toHaveLength(0);
    }
  });

  it("creates one segment with one source of membership including the admin dancer", async () => {
    await save();
    expect(
      (
        await db.query(
          "select member_id from public.segment_members order by member_id",
        )
      ).rows,
    ).toEqual([{ member_id: admin }, { member_id: dancer }]);
  });
  it("rejects dancer creation and direct edits", async () => {
    await save();
    await asUser(dancer);
    await expect(save(1)).rejects.toThrow(/Admin/);
    await expect(
      db.query("update public.segments set name='Hacked'"),
    ).rejects.toThrow();
    await expect(
      db.query("delete from public.segment_members"),
    ).rejects.toThrow();
  });
  it("only shows active segments to active team members", async () => {
    await save();
    await asUser(dancer);
    expect((await db.query("select id from public.segments")).rows).toEqual([
      { id: segment },
    ]);
    await asUser(pending);
    expect((await db.query("select * from public.segments")).rows).toHaveLength(
      0,
    );
    expect(
      (await db.query("select * from public.segment_members")).rows,
    ).toHaveLength(0);
  });
  it("rejects invalid assignments and keeps the prior segment intact", async () => {
    await save();
    await expect(save(1, [pending], pdf, "Changed")).rejects.toThrow(/active/);
    expect(
      (await db.query<{ name: string }>("select name from public.segments"))
        .rows[0].name,
    ).toBe("Opening");
    expect(
      (await db.query("select * from public.segment_members")).rows,
    ).toHaveLength(2);
  });
  it("rejects missing or unowned PDF references", async () => {
    await expect(save(0, [], `${dancer}/fake.pdf`)).rejects.toThrow(/PDF/);
    await expect(save(0, [], `${admin}/missing.pdf`)).rejects.toThrow(/PDF/);
  });
  it("replaces assignments atomically and updates a single segment version", async () => {
    await save();
    await save(1, [dancer], pdf, "Finale");
    expect(
      (await db.query("select member_id from public.segment_members")).rows,
    ).toEqual([{ member_id: dancer }]);
    expect(
      (
        await db.query<{ version: number }>(
          "select version from public.segments",
        )
      ).rows[0].version,
    ).toBe(2);
  });
  it("rejects stale editors and duplicate create attempts", async () => {
    await save();
    await expect(save()).rejects.toThrow(/changed/);
    await save(1, []);
    await expect(save(1)).rejects.toThrow(/changed/);
  });
  it("archives without deleting the segment and removes normal roster associations", async () => {
    await save();
    await db.query("select public.archive_segment($1,$2)", [segment, 1]);
    expect((await db.query("select * from public.segments")).rows).toHaveLength(
      1,
    );
    await asUser(dancer);
    expect((await db.query("select * from public.segments")).rows).toHaveLength(
      0,
    );
    expect(
      (await db.query("select * from public.segment_members")).rows,
    ).toHaveLength(0);
    await expect(
      db.query("select public.archive_segment($1,$2)", [segment, 2]),
    ).rejects.toThrow(/Admin/);
  });
  it("preserves admin-only audit history", async () => {
    await save();
    await save(1, []);
    expect(
      (await db.query("select * from public.segment_audit")).rows.length,
    ).toBeGreaterThanOrEqual(2);
    await expect(
      db.query("delete from public.segment_audit"),
    ).rejects.toThrow();
    await asUser(dancer);
    expect(
      (await db.query("select * from public.segment_audit")).rows,
    ).toHaveLength(0);
  });
});
describe("private formation storage policy", () => {
  it("creates a private PDF-only bucket with a size limit", async () => {
    await db.exec("reset role");
    expect(
      (
        await db.query<{ public: boolean; file_size_limit: number }>(
          "select public,file_size_limit from storage.buckets where id=$1",
          ["formations"],
        )
      ).rows[0],
    ).toMatchObject({ public: false, file_size_limit: 4194304 });
  });
  it("keeps unattached files private and shares only published current PDFs", async () => {
    await asUser(dancer);
    expect((await db.query("select * from storage.objects")).rows).toHaveLength(
      0,
    );
    await asUser(admin);
    await save();
    await asUser(dancer);
    expect((await db.query("select * from storage.objects")).rows).toHaveLength(
      1,
    );
  });
  it("denies uploads by dancers and reading by pending members", async () => {
    await save();
    await asUser(dancer);
    await expect(
      db.query(
        `insert into storage.objects(bucket_id,name) values('formations','x.pdf')`,
      ),
    ).rejects.toThrow();
    await asUser(pending);
    expect((await db.query("select * from storage.objects")).rows).toHaveLength(
      0,
    );
  });
  it("denies overwrites and deletes of attached documents", async () => {
    await save();
    expect(
      (
        await db.query(
          "update storage.objects set name='changed.pdf' returning id",
        )
      ).rows,
    ).toHaveLength(0);
    expect(
      (await db.query("delete from storage.objects returning id")).rows,
    ).toHaveLength(0);
  });
  it("removes access to archived PDFs and on membership deactivation", async () => {
    await save();
    await db.query("select public.archive_segment($1,$2)", [segment, 1]);
    await asUser(dancer);
    expect((await db.query("select * from storage.objects")).rows).toHaveLength(
      0,
    );
    await db.exec("reset role");
    await db.query("update public.members set status='inactive' where id=$1", [
      admin,
    ]);
    await asUser(admin);
    expect((await db.query("select * from storage.objects")).rows).toHaveLength(
      0,
    );
  });
});
