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
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    `create role anon nologin;create role authenticated nologin;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_app_meta_data jsonb);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;create schema storage;create function storage.allow_only_operation(operation text) returns boolean language sql stable as $$select false$$;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb);alter table storage.objects enable row level security;grant usage on schema storage to authenticated;grant select,insert on storage.objects to authenticated;`,
  );
  for (const file of [
    "0001_identity.sql",
    "0002_segments.sql",
    "0003_communication.sql",
    "0004_payments.sql",
  ])
    await db.exec(readFileSync("supabase/migrations/" + file, "utf8"));
});
afterAll(async () => {
  await db?.close();
});
beforeEach(async () => {
  await db.exec(
    "reset role;truncate payment_audit,payment_charges,payment_batches cascade;truncate auth.users cascade;truncate public.communication_posts cascade;truncate public.communication_groups cascade;",
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

async function issue(
  ids = [admin, dancer],
  audience = "selected",
  source: string | null = null,
  amount = 1250,
) {
  return db.query(
    "select issue_payment_charges($1,$2,$3,$4,null,$5,$6::uuid[],$7)",
    [post, amount, "Costume fine", "Pay team treasurer", audience, ids, source],
  );
}
async function charge() {
  return (
    await db.query<{ id: string }>(
      "select id from payment_charges where member_id=$1",
      [dancer],
    )
  ).rows[0].id;
}
async function transition(id: string, version: number, op: string, note = "") {
  return db.query("select transition_payment($1,$2,$3,$4)", [
    id,
    version,
    op,
    note,
  ]);
}
it("keeps payments private, denies direct writes and blocks outsiders", async () => {
  await issue();
  const id = await charge();
  await user(dancer);
  expect((await db.query("select * from payment_charges")).rows).toHaveLength(
    1,
  );
  await expect(issue()).rejects.toThrow(/Admin/);
  await expect(transition(id, 1, "verify")).rejects.toThrow();
  await expect(
    db.exec("update payment_charges set amount_cents=1"),
  ).rejects.toThrow();
  await user(other);
  expect((await db.query("select * from payment_charges")).rows).toHaveLength(
    0,
  );
  await expect(transition(id, 1, "report")).rejects.toThrow();
  await user(pending);
  await expect(transition(id, 1, "report")).rejects.toThrow();
});
it("retains outstanding reports until verified and fences duplicate transitions", async () => {
  await issue();
  const id = await charge();
  await user(dancer);
  await transition(id, 1, "report", "bank reference");
  await expect(transition(id, 1, "report")).rejects.toThrow(/changed/);
  expect(
    (await db.query("select status,version from payment_charges")).rows,
  ).toEqual([{ status: "reported", version: 2 }]);
  await user(admin);
  await transition(id, 2, "verify");
  await expect(transition(id, 3, "waive", "late")).rejects.toThrow();
  expect(
    (
      await db.query(
        "select action from payment_audit where charge_id=$1 order by id",
        [id],
      )
    ).rows,
  ).toEqual([{ action: "issued" }, { action: "report" }, { action: "verify" }]);
});
it("requires rejection and waiver explanations and preserves report audit", async () => {
  await issue();
  const id = await charge();
  await user(dancer);
  await transition(id, 1, "report", "receipt");
  await user(admin);
  await expect(transition(id, 2, "reject")).rejects.toThrow();
  await transition(id, 2, "reject", "No matching receipt");
  await user(dancer);
  await transition(id, 3, "report", "corrected receipt");
  await user(admin);
  await transition(id, 4, "waive", "Team covered it");
  expect(
    (
      await db.query(
        "select status,review_note from payment_charges where id=$1",
        [id],
      )
    ).rows,
  ).toEqual([{ status: "waived", review_note: "Team covered it" }]);
});
it("issues integer cents atomically and prevents duplicate batch IDs", async () => {
  await expect(issue([pending])).rejects.toThrow();
  await expect(issue([dancer], "selected", null, 0)).rejects.toThrow();
  await issue();
  await expect(issue()).rejects.toThrow();
  expect((await db.query("select * from payment_charges")).rows).toHaveLength(
    2,
  );
});
it("snapshots groups and team, including admins as dancers", async () => {
  await db.query("select save_communication_group($1,0,$2,$3::uuid[])", [
    group,
    "Leads",
    [dancer],
  ]);
  await issue([], "group", group);
  await db.query("select save_communication_group($1,1,$2,$3::uuid[])", [
    group,
    "Leads",
    [other],
  ]);
  expect(
    (await db.query("select member_id from payment_charges")).rows,
  ).toEqual([{ member_id: dancer }]);
});
it("blocks deactivated members from payments and audits after reporting", async () => {
  await issue();
  const id = await charge();
  await user(dancer);
  await transition(id, 1, "report");
  await db.exec("reset role");
  await db.query("update members set status='inactive' where id=$1", [dancer]);
  await user(dancer);
  expect((await db.query("select * from payment_charges")).rows).toHaveLength(
    0,
  );
  expect((await db.query("select * from payment_audit")).rows).toHaveLength(0);
  await expect(transition(id, 2, "report")).rejects.toThrow();
});
it("lets admins report their own payment but never another dancer’s", async () => {
  await issue();
  const own = (
    await db.query<{ id: string }>(
      "select id from payment_charges where member_id=$1",
      [admin],
    )
  ).rows[0].id;
  await transition(own, 1, "report");
  await transition(own, 2, "verify");
  await expect(transition(await charge(), 1, "report")).rejects.toThrow(/Own/);
});
it("snapshots the full team including admins and retains charges through membership edits", async () => {
  await issue([], "team");
  expect(
    (await db.query("select member_id from payment_charges order by member_id"))
      .rows,
  ).toEqual([
    { member_id: admin },
    { member_id: dancer },
    { member_id: other },
  ]);
  await db.exec("reset role");
  await db.query("update members set status='inactive' where id=$1", [other]);
  await user(admin);
  expect((await db.query("select * from payment_charges")).rows).toHaveLength(
    3,
  );
});
it("snapshots segment lineup without following later assignments", async () => {
  await db.exec("reset role");
  await db.query(
    "insert into segments(id,name,document_path,document_label) values($1,'Finale','fixture','fixture.pdf')",
    [group],
  );
  await db.query("insert into segment_members values($1,$2)", [group, dancer]);
  await user(admin);
  await issue([], "segment", group);
  await db.exec("reset role");
  await db.query("delete from segment_members where segment_id=$1", [group]);
  await db.query("insert into segment_members values($1,$2)", [group, other]);
  await user(admin);
  expect(
    (await db.query("select member_id from payment_charges")).rows,
  ).toEqual([{ member_id: dancer }]);
});
it("fails closed on malformed or null RPC inputs and forbids anonymous access", async () => {
  for (const amount of [null, -1, 1000001, "1.5"])
    await expect(
      issue([dancer], "selected", null, amount as unknown as number),
    ).rejects.toThrow();
  await expect(issue([null as unknown as string])).rejects.toThrow();
  await expect(issue([], "invalid")).rejects.toThrow();
  await issue();
  const id = await charge();
  await expect(transition(id, 1, null as unknown as string)).rejects.toThrow();
  await expect(
    transition(id, null as unknown as number, "waive", "test"),
  ).rejects.toThrow();
  await db.exec("set role anon");
  await expect(db.query("select * from payment_charges")).rejects.toThrow();
  await expect(transition(id, 1, "report")).rejects.toThrow();
});
